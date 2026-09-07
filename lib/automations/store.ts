import { dataFetch } from "@/lib/fractera/data-service"
import {
  AUTOMATION_STATES_TABLE,
  AUTOMATION_STATES_TABLE_COLUMNS,
  AUTOMATIONS_TABLE,
  AUTOMATIONS_TABLE_COLUMNS,
  automationStatesTableAlters,
  automationStatesTableSql,
  automationsTableAlters,
  automationsTableSql,
  isAutomationConfirmState,
  isAutomationState,
  type AutomationConfirmState,
  type AutomationState,
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

// ─────────────────────────────────────────────────────────────────────────────
// СОСТОЯНИЕ АВТОМАТИЗАЦИИ В РАБОЧЕМ ПОТОКЕ (143-1).

/** Род закрытия: закрыт шаг цепочки или автоматизация целиком (§3е). */
export const CLOSING_KINDS = ["step", "whole"] as const
export type ClosingKind = (typeof CLOSING_KINDS)[number]

export type StateRow = {
  id: number
  automationId: number
  state: AutomationState
  closingKind: ClosingKind | null
  reason: string | null
  createdAt: string
}

function toStateRow(row: Record<string, unknown>): StateRow {
  const state = row.state
  const kind = row.closing_kind
  return {
    id: Number(row.id),
    automationId: Number(row.automation_id),
    state: isAutomationState(state) ? state : "open",
    closingKind: kind === "step" || kind === "whole" ? kind : null,
    reason: typeof row.reason === "string" ? row.reason : null,
    createdAt: String(row.created_at ?? ""),
  }
}

/** Создать таблицу переходов и провести существующую по лестнице. */
export async function ensureAutomationStatesTable(): Promise<{ ok: boolean; upgraded: string[]; error?: string }> {
  const created = await sql(automationStatesTableSql())
  if (!created.ok) return { ok: false, upgraded: [], error: created.error ?? "refused" }
  const upgraded: string[] = []
  for (const statement of automationStatesTableAlters()) {
    const res = await sql(statement)
    if (res.ok) upgraded.push(statement.split("ADD COLUMN ")[1] ?? statement)
    else if (!/duplicate column/i.test(res.error ?? "")) upgraded.push(`ОТКАЗ ${res.error ?? "failed"}`)
  }
  return { ok: true, upgraded }
}

/**
 * Текущее состояние — ПОСЛЕДНЯЯ строка перехода.
 *
 * 🔒 ПУСТАЯ ИСТОРИЯ ЗНАЧИТ `open`, А НЕ «НЕИЗВЕСТНО». Автоматизация, о которой
 * ещё никто ничего не решил, идёт — это и есть её нормальное начало.
 * 🔒 ПОРЯДОК ПО `id`, А НЕ ПО ВРЕМЕНИ: два перехода внутри одной секунды получили
 * бы одинаковую метку времени, и «последним» стал бы случайный.
 */
export async function currentState(automationId: number): Promise<AutomationState> {
  const res = await sql(
    `SELECT ${AUTOMATION_STATES_TABLE_COLUMNS.join(", ")} FROM ${AUTOMATION_STATES_TABLE}
     WHERE automation_id = ? ORDER BY id DESC LIMIT 1`,
    [automationId],
  )
  const row = res.rows?.[0]
  return row ? toStateRow(row).state : "open"
}

/** Вся история переходов, от первой к последней. */
export async function stateHistory(automationId: number): Promise<StateRow[]> {
  const res = await sql(
    `SELECT ${AUTOMATION_STATES_TABLE_COLUMNS.join(", ")} FROM ${AUTOMATION_STATES_TABLE}
     WHERE automation_id = ? ORDER BY id ASC`,
    [automationId],
  )
  return (res.rows ?? []).map(toStateRow)
}

/**
 * Записать переход.
 *
 * 🔒 ПОВТОР ТОГО ЖЕ СОСТОЯНИЯ НЕ ПИШЕТСЯ — с одним названным исключением.
 * `step-closed` законно повторяется: ступеней в цепочке много, и каждая
 * закрывается своей строкой. Всё остальное, записанное дважды подряд, — шум,
 * который потом читается как две разные работы.
 *
 * 🛑 ЭТО НЕ ИДЕМПОТЕНТНОСТЬ ПРОТОКОЛА. Здесь запрещён лишний повтор СТРОКИ;
 * запрет вторых побочных действий — отзыва, заявки, публикации — живёт в 143-2.
 */
export async function setState(
  automationId: number,
  state: AutomationState,
  opts: { closingKind?: ClosingKind; reason?: string } = {},
): Promise<{ written: boolean; state: AutomationState }> {
  const now = await currentState(automationId)
  if (now === state && state !== "step-closed") return { written: false, state: now }
  const res = await sql(
    `INSERT INTO ${AUTOMATION_STATES_TABLE} (automation_id, state, closing_kind, reason) VALUES (?, ?, ?, ?)`,
    [automationId, state, opts.closingKind ?? null, opts.reason ?? null],
  )
  return { written: Boolean(res.ok), state: res.ok ? state : now }
}

/**
 * Закрыть — ЯВНО и с названным родом (§3е).
 *
 * 🔒 ЗАКРЫТИЕ ОБЪЯВЛЯЕТСЯ, А НЕ НАСТУПАЕТ. «Человек перестал писать» — это
 * отсутствие сообщений, а не решение; на нём нельзя строить ни отзыв, ни
 * следующую ступень. Поэтому закрыть может только этот вызов, и род обязателен.
 */
export async function closeAutomation(
  automationId: number,
  kind: ClosingKind,
  reason?: string,
): Promise<{ written: boolean; state: AutomationState }> {
  return setState(automationId, kind === "step" ? "step-closed" : "closed", { closingKind: kind, reason })
}
