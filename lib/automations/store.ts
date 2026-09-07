import { dataFetch } from "@/lib/fractera/data-service"
import {
  AUTOMATIONS_TABLE,
  AUTOMATIONS_TABLE_COLUMNS,
  automationsTableAlters,
  automationsTableSql,
  isAutomationConfirmState,
  type AutomationConfirmState,
} from "./table"

// ЧТЕНИЕ И ЗАПИСЬ АВТОМАТИЗАЦИЙ — ЧЕРЕЗ ЕДИНСТВЕННУЮ ДВЕРЬ (138-1).
//
// 🔒 ВТОРОЙ ДВЕРИ К ДАННЫМ НЕ ЗАВОДИТСЯ. Всё идёт через `dataFetch` — тот же
// путь, которым живут признаки и медиатека. Прямой `fetch` к слою данных рядом
// с этим файлом означал бы вторую копию адреса и секрета, и разошлись бы они в
// день, когда владелец поменяет ключ в одном месте из двух.
//
// 🔒 КОЛОНКИ НАЗЫВАЮТСЯ ПОИМЁННО ВЕЗДЕ. `SELECT *` и `INSERT` без списка колонок
// по этим таблицам запрещены: они работают на чистой машине и путают значения на
// той, где лестница `ALTER` уже дописала колонки в конец.

export type Automation = {
  /** Номер, который человек произносит вслух. */
  id: number
  confirmState: AutomationConfirmState
  firstMessageId: string | null
  createdAt: string
}

type MigrateAnswer = { ok?: boolean; error?: string; rows?: Record<string, unknown>[] }

/** Выполнить SQL через слой данных. Пустой ответ и отказ различаются. */
async function sql(text: string, params: unknown[] = []): Promise<MigrateAnswer> {
  const r = await dataFetch("/db/migrate", {
    method: "POST",
    body: JSON.stringify({ sql: text, params }),
  })
  if (!r.ok) return { ok: false, error: `http-${r.status}` }
  return (await r.json()) as MigrateAnswer
}

/**
 * Создать таблицу, если её нет, и провести существующую по лестнице колонок.
 *
 * 🔒 ЛЕСТНИЦА ИСПОЛНЯЕТСЯ ВСЕГДА, А НЕ ТОЛЬКО ПРИ СОЗДАНИИ. На машине, где
 * таблица уже есть, `CREATE TABLE IF NOT EXISTS` не делает ничего — и колонка,
 * добавленная будущим шагом, не приехала бы туда никогда.
 * 🔒 «КОЛОНКА УЖЕ ЕСТЬ» — НОРМАЛЬНЫЙ ИСХОД ВТОРОГО ПРОГОНА, а не отказ.
 */
export async function ensureAutomationsTable(): Promise<{ ok: boolean; upgraded: string[]; error?: string }> {
  const created = await sql(automationsTableSql())
  if (!created.ok) return { ok: false, upgraded: [], error: created.error ?? "refused" }

  const upgraded: string[] = []
  for (const statement of automationsTableAlters()) {
    const res = await sql(statement)
    if (res.ok) upgraded.push(statement.split("ADD COLUMN ")[1] ?? statement)
    else if (!/duplicate column/i.test(res.error ?? "")) {
      upgraded.push(`ОТКАЗ ${res.error ?? "failed"}`)
    }
  }
  return { ok: true, upgraded }
}

/**
 * Завести новую автоматизацию и вернуть её номер.
 *
 * 🔒 НОМЕР ДАЁТ БАЗА, А НЕ КОД. Два писателя, считающие «максимум плюс один»,
 * выдадут один и тот же номер в одну секунду — и человек получит два разных
 * разговора под именем 124.
 */
export async function createAutomation(firstMessageId?: string | null): Promise<number | null> {
  const res = await sql(
    `INSERT INTO ${AUTOMATIONS_TABLE} (confirm_state, first_message_id) VALUES (?, ?)`,
    ["draft", firstMessageId ?? null],
  )
  if (!res.ok) return null
  const back = await sql(`SELECT last_insert_rowid() AS id`)
  const raw = back.rows?.[0]?.id
  return typeof raw === "number" ? raw : Number(raw ?? Number.NaN) || null
}

/** Прочитать одну автоматизацию по номеру. Нет такой — `null`, а не ошибка. */
export async function readAutomation(id: number): Promise<Automation | null> {
  const res = await sql(
    `SELECT ${AUTOMATIONS_TABLE_COLUMNS.join(", ")} FROM ${AUTOMATIONS_TABLE} WHERE id = ?`,
    [id],
  )
  const row = res.rows?.[0]
  if (!row) return null
  const state = row.confirm_state
  return {
    id: Number(row.id),
    confirmState: isAutomationConfirmState(state) ? state : "draft",
    firstMessageId: typeof row.first_message_id === "string" ? row.first_message_id : null,
    createdAt: String(row.created_at ?? ""),
  }
}

/**
 * Подтвердить номер.
 *
 * 🔒 ПОДТВЕРЖДЕНИЕ — ОДНОСТОРОННЕЕ. Обратного перехода в `draft` не бывает:
 * номер, названный человеку подтверждённым, уже произнесён вслух.
 */
export async function confirmAutomation(id: number): Promise<boolean> {
  const res = await sql(
    `UPDATE ${AUTOMATIONS_TABLE} SET confirm_state = ? WHERE id = ? AND confirm_state = ?`,
    ["confirmed", id, "draft"],
  )
  return Boolean(res.ok)
}
