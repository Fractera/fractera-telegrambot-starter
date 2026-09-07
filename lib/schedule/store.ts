import { dataFetch } from "@/lib/fractera/data-service"
import {
  SCHEDULE_TABLE,
  SCHEDULE_TABLE_COLUMNS,
  isScheduleKind,
  isScheduleState,
  scheduleTableAlters,
  scheduleTableSql,
  type ScheduleKind,
  type ScheduleState,
} from "./table"

// ЗАПИСЬ И ЧТЕНИЕ СРОКОВ — ЧЕРЕЗ ЕДИНСТВЕННУЮ ДВЕРЬ.

export type ScheduleEntry = {
  id: number
  automationId: number | null
  kind: ScheduleKind
  state: ScheduleState
  payload: string | null
  scopeKey: string | null
  tz: string | null
  saidAt: string
  dueAt: string
  firedAt: string | null
  note: string | null
}

type Answer = { ok?: boolean; error?: string; rows?: Record<string, unknown>[] }

async function sql(text: string, params: unknown[] = []): Promise<Answer> {
  const r = await dataFetch("/db/migrate", { method: "POST", body: JSON.stringify({ sql: text, params }) })
  if (!r.ok) return { ok: false, error: `http-${r.status}` }
  return (await r.json()) as Answer
}

function toEntry(row: Record<string, unknown>): ScheduleEntry {
  return {
    id: Number(row.id),
    automationId:
      row.automation_id === null || row.automation_id === undefined ? null : Number(row.automation_id),
    kind: isScheduleKind(row.kind) ? row.kind : "human",
    state: isScheduleState(row.state) ? row.state : "planned",
    payload: typeof row.payload === "string" ? row.payload : null,
    scopeKey: typeof row.scope_key === "string" ? row.scope_key : null,
    tz: typeof row.tz === "string" ? row.tz : null,
    saidAt: String(row.said_at ?? ""),
    dueAt: String(row.due_at ?? ""),
    firedAt: typeof row.fired_at === "string" ? row.fired_at : null,
    note: typeof row.note === "string" ? row.note : null,
  }
}

export async function ensureScheduleTable(): Promise<{ ok: boolean; upgraded: string[]; error?: string }> {
  const created = await sql(scheduleTableSql())
  if (!created.ok) return { ok: false, upgraded: [], error: created.error ?? "refused" }
  const upgraded: string[] = []
  for (const statement of scheduleTableAlters()) {
    const res = await sql(statement)
    if (res.ok) upgraded.push(statement.split("ADD COLUMN ")[1] ?? statement)
    else if (!/duplicate column/i.test(res.error ?? "")) upgraded.push(`ОТКАЗ ${res.error ?? "failed"}`)
  }
  return { ok: true, upgraded }
}

/**
 * Завести срок.
 *
 * 🔒 БЕЗ ЧАСОВОГО ПОЯСА СРОК НЕ СОЗДАЁТСЯ ВОВСЕ, И ЭТО ОТКАЗ, А НЕ УМОЛЧАНИЕ.
 * Поставить «завтра вечером» по Гринвичу значит поставить не тогда — и человек
 * заметит это ровно один раз, проспав встречу. Недостающая зона спрашивается
 * (141-7), а не подставляется молча.
 */
export async function planSchedule(input: {
  automationId?: number | null
  kind: ScheduleKind
  payload: string
  dueAt: string
  tz: string
  scopeKey?: string | null
}): Promise<{ id: number | null; refused?: "no-tz" | "no-due" }> {
  if (!input.tz) return { id: null, refused: "no-tz" }
  if (!input.dueAt) return { id: null, refused: "no-due" }
  const res = await sql(
    `INSERT INTO ${SCHEDULE_TABLE} (automation_id, kind, state, payload, scope_key, tz, due_at)
     VALUES (?, ?, 'planned', ?, ?, ?, ?)`,
    [input.automationId ?? null, input.kind, input.payload, input.scopeKey ?? null, input.tz, input.dueAt],
  )
  if (!res.ok) return { id: null }
  const back = await sql(`SELECT last_insert_rowid() AS id`)
  const raw = back.rows?.[0]?.id
  return { id: typeof raw === "number" ? raw : Number(raw ?? Number.NaN) || null }
}

export async function readSchedule(id: number): Promise<ScheduleEntry | null> {
  const res = await sql(
    `SELECT ${SCHEDULE_TABLE_COLUMNS.join(", ")} FROM ${SCHEDULE_TABLE} WHERE id = ?`,
    [id],
  )
  const row = res.rows?.[0]
  return row ? toEntry(row) : null
}

/** Сроки, чьё время пришло. Порядок — по сроку: раннее раньше. */
export async function dueNow(nowIso: string, limit = 50): Promise<ScheduleEntry[]> {
  const res = await sql(
    `SELECT ${SCHEDULE_TABLE_COLUMNS.join(", ")} FROM ${SCHEDULE_TABLE}
     WHERE state = 'planned' AND due_at <= ? ORDER BY due_at ASC, id ASC LIMIT ?`,
    [nowIso, limit],
  )
  return (res.rows ?? []).map(toEntry)
}

/**
 * Отметить срок сработавшим — ДО того, как действие выполнено.
 *
 * 🔒 ПОРЯДОК ЗДЕСЬ И ЕСТЬ ИДЕМПОТЕНТНОСТЬ. Пометка после действия означала бы,
 * что падение процесса между ними повторит рассылку при следующем проходе.
 * 🔒 УСЛОВИЕ `state = planned` В САМОМ UPDATE — ЗАМОК ОТ ДВУХ ЧИТАТЕЛЕЙ: если
 * тикеров окажется два, второй не получит эту строку, а не выполнит её повторно.
 */
export async function claimForFiring(id: number, nowIso: string): Promise<boolean> {
  const res = await sql(
    `UPDATE ${SCHEDULE_TABLE} SET state = 'fired', fired_at = ? WHERE id = ? AND state = 'planned'`,
    [nowIso, id],
  )
  if (!res.ok) return false
  const back = await sql(`SELECT changes() AS n`)
  return Number(back.rows?.[0]?.n ?? 0) === 1
}

/** Пропустить — с записью причины: пропуск это событие, а не тишина. */
export async function markMissed(id: number, note: string): Promise<boolean> {
  const res = await sql(
    `UPDATE ${SCHEDULE_TABLE} SET state = 'missed', note = ? WHERE id = ? AND state = 'planned'`,
    [note, id],
  )
  return Boolean(res.ok)
}

export async function cancelSchedule(id: number, note = "отменено"): Promise<boolean> {
  const res = await sql(
    `UPDATE ${SCHEDULE_TABLE} SET state = 'cancelled', note = ? WHERE id = ? AND state = 'planned'`,
    [note, id],
  )
  return Boolean(res.ok)
}
