import { dataFetch } from "@/lib/fractera/data-service"
import { TASK_ROW_KINDS, TASK_SOURCES } from "@/lib/task/types"
import type { TaskRow, TaskRowKind } from "@/lib/task/types"
import {
  AUTOMATION_ROWS_TABLE,
  AUTOMATION_ROWS_TABLE_COLUMNS,
  automationRowsTableAlters,
  automationRowsTableSql,
} from "./table"

// ЛЕНТА ПРОГОНА — ЕДИНСТВЕННЫЙ ПИСАТЕЛЬ И ЕДИНСТВЕННЫЙ ЧИТАТЕЛЬ (143-3).
//
// 🔒 ЗАЧЕМ ОНА ВООБЩЕ ЕСТЬ. Закон §3е требует, чтобы условия закрытия считались
// **из фактов прогона, а не из впечатления модели**. До этого подшага фактов
// прогона нигде не оставалось: стол разбора заменяется следующим сообщением, а
// дверь закрытия верила словам агента. Лента — то место, где прогон оставляет
// след, переживающий разговор.
//
// 🔒 ВТОРОЙ ДВЕРИ К ДАННЫМ НЕТ — всё через `dataFetch`, как у соседей.
// 🔒 КОЛОНКИ ПОИМЁННО: `SELECT *` и `INSERT` без списка запрещены по этим
// таблицам — они работают на чистой машине и путают значения на той, где
// лестница `ALTER` уже дописала колонки в конец.

type MigrateAnswer = { ok?: boolean; error?: string; rows?: Record<string, unknown>[] }

async function sql(text: string, params: unknown[] = []): Promise<MigrateAnswer> {
  const r = await dataFetch("/db/migrate", {
    method: "POST",
    body: JSON.stringify({ sql: text, params }),
  })
  if (!r.ok) return { ok: false, error: `http-${r.status}` }
  return (await r.json()) as MigrateAnswer
}

/** Создать таблицу ленты и провести существующую по лестнице колонок. */
export async function ensureAutomationRowsTable(): Promise<{ ok: boolean; upgraded: string[]; error?: string }> {
  const created = await sql(automationRowsTableSql())
  if (!created.ok) return { ok: false, upgraded: [], error: created.error ?? "refused" }
  const upgraded: string[] = []
  for (const statement of automationRowsTableAlters()) {
    const res = await sql(statement)
    if (res.ok) upgraded.push(statement.split("ADD COLUMN ")[1] ?? statement)
    else if (!/duplicate column/i.test(res.error ?? "")) upgraded.push(`ОТКАЗ ${res.error ?? "failed"}`)
  }
  return { ok: true, upgraded }
}

function isRowKind(v: unknown): v is TaskRowKind {
  return typeof v === "string" && (TASK_ROW_KINDS as readonly string[]).includes(v)
}

/**
 * Дописать строки в ленту номера.
 *
 * 🔒 НОМЕР ОБЯЗАН СУЩЕСТВОВАТЬ, И ПРОВЕРЯЕТ ЭТО ВЫЗЫВАЮЩИЙ — здесь стоит только
 * грубая проверка формы. Строка, написанная в несуществующий номер, не всплывёт
 * никогда: её никто не прочитает, потому что читают по номеру.
 * 🔒 ВИД СТРОКИ ПРОВЕРЯЕТСЯ ПО ЗАКРЫТОМУ СПИСКУ. Он рождается из свободного
 * текста модели; вид вне списка сделал бы ленту нечитаемой для тех, кто по нему
 * фильтрует, и заметно это стало бы не сразу.
 */
export async function appendAutomationRows(
  automationId: number,
  rows: TaskRow[],
): Promise<{ ok: boolean; written: number; error?: string }> {
  if (!Number.isInteger(automationId) || automationId <= 0) {
    return { ok: false, written: 0, error: "bad-automation-id" }
  }
  const good = rows.filter(r => isRowKind(r.kind))
  if (good.length === 0) return { ok: true, written: 0 }

  let written = 0
  for (const row of good) {
    const res = await sql(
      `INSERT INTO ${AUTOMATION_ROWS_TABLE} (automation_id, kind, fact, payload) VALUES (?, ?, ?, ?)`,
      [automationId, row.kind, row.fact ?? null, JSON.stringify(row)],
    )
    if (res.ok) written += 1
  }
  return { ok: written > 0, written }
}

/**
 * Прочитать ленту номера, от первой строки к последней.
 *
 * 🔒 ПОРЯДОК ПО `id`, А НЕ ПО ВРЕМЕНИ — та же причина, что у истории состояний:
 * умолчание времени в базе печатает СЕКУНДЫ, и две строки внутри одной секунды
 * получили бы одинаковую метку.
 * 🔒 НЕЧИТАЕМАЯ НАЧИНКА — ЭТО ОДНА ПОТЕРЯННАЯ СТРОКА, А НЕ ПУСТАЯ ЛЕНТА. Одна
 * испорченная запись не имеет права утащить за собой весь прогон.
 */
export async function readAutomationRows(automationId: number): Promise<TaskRow[]> {
  const res = await sql(
    `SELECT ${AUTOMATION_ROWS_TABLE_COLUMNS.join(", ")} FROM ${AUTOMATION_ROWS_TABLE}
     WHERE automation_id = ? ORDER BY id ASC`,
    [automationId],
  )
  const out: TaskRow[] = []
  for (const raw of res.rows ?? []) {
    try {
      const parsed = JSON.parse(String(raw.payload ?? "")) as TaskRow
      if (!isRowKind(parsed?.kind)) continue
      out.push({
        ...parsed,
        id: Number(raw.id ?? parsed.id ?? 0),
        source: (TASK_SOURCES as readonly string[]).includes(parsed.source) ? parsed.source : "none",
        at: String(parsed.at ?? raw.created_at ?? ""),
      })
    } catch {
      continue
    }
  }
  return out
}

/** Сколько строк в ленте. Отдельный запрос дешевле чтения всей ленты. */
export async function countAutomationRows(automationId: number): Promise<number> {
  const res = await sql(
    `SELECT COUNT(*) AS n FROM ${AUTOMATION_ROWS_TABLE} WHERE automation_id = ?`,
    [automationId],
  )
  return Number(res.rows?.[0]?.n ?? 0)
}
