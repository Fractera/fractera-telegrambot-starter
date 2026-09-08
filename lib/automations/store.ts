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
  const history = await stateHistory(automationId)
  const now = history.length === 0 ? "open" : history[history.length - 1].state
  // 🔒 ПЕРВАЯ СТРОКА ПИШЕТСЯ ВСЕГДА, ДАЖЕ ЕСЛИ ЭТО `open`, И ЭТО НЕ
  // ПРОТИВОРЕЧИТ ЗАКОНУ «ПУСТАЯ ИСТОРИЯ ЗНАЧИТ open» (143-1). Пустая история
  // говорит, ЧТО автоматизация идёт, и молчит о том, ПОЧЕМУ она заведена;
  // первая строка несёт причину («сепарация: automation-write») и время решения.
  // ✗ НАЙДЕНО ПРИБОРОМ 155-3: дверь сепарации объявляла в комментарии, что
  // пишет первое состояние, и не писала — совпадение с «текущим» гасило запись.
  // Комментарий, разошедшийся с поведением, хуже отсутствующего: он выглядит
  // объяснением.
  if (history.length > 0 && now === state && state !== "step-closed") {
    return { written: false, state: now }
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// ПОЛЯ, ПО КОТОРЫМ ОТБИРАЮТ И СОРТИРУЮТ (144-1).

/**
 * Вердикт человека — ТРИ состояния, а не два.
 *
 * 🔒 «НЕ СПРАШИВАЛИ» ОТЛИЧАЕТСЯ ОТ «НЕ ПОНРАВИЛОСЬ», И ЭТО РЕШАЕТ СУДЬБУ ПАМЯТИ
 * РЕШЕНИЙ. Отзыв оставляют редко; приравняв молчание к одобрению, мы наполним
 * рекомендации тем, чего человек не говорил, — и первая же такая подорвёт доверие
 * ко всем остальным.
 */
export const VERDICTS = ["yes", "no"] as const
export type Verdict = (typeof VERDICTS)[number]

export type AutomationFields = {
  summary?: string | null
  /** Ключи реестра через `|`. Свободных слов здесь не бывает. */
  tags?: string[] | null
  scopeKey?: string | null
  liked?: Verdict | null
  needsWork?: Verdict | null
  reusable?: boolean | null
  publicContract?: string | null
  /** Слова человека к вердикту (143-6). Пусто — законно. */
  feedbackNote?: string | null
}

const COLUMN_OF: Record<keyof AutomationFields, string> = {
  summary: "summary",
  tags: "tags",
  scopeKey: "scope_key",
  liked: "verdict_liked",
  needsWork: "verdict_needs_work",
  reusable: "reusable",
  publicContract: "public_contract",
  feedbackNote: "feedback_note",
}

function toCell(field: keyof AutomationFields, value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (field === "tags") return Array.isArray(value) ? value.join("|") : null
  if (field === "reusable") return value ? "1" : "0"
  return String(value)
}

/**
 * Записать поля — ТОЛЬКО названные, по одной колонке на поле.
 *
 * 🔒 ЗАПЛАТА, А НЕ СНИМОК: писателей у строки несколько — закрытие пишет саммари
 * и теги, отзыв пишет вердикты, публикация пишет договор. Снимок целиком затирал
 * бы чужое при каждой правке.
 * 🔒 КОЛОНКИ НАЗЫВАЮТСЯ ПОИМЁННО И БЕРУТСЯ ИЗ КАРТЫ, а не склеиваются из
 * пришедшего имени: имя поля приходит из кода, но карта — единственное место, где
 * оно превращается в колонку.
 */
export async function setAutomationFields(id: number, fields: AutomationFields): Promise<boolean> {
  const names: string[] = []
  const values: unknown[] = []
  for (const key of Object.keys(fields) as (keyof AutomationFields)[]) {
    const column = COLUMN_OF[key]
    if (!column) continue
    names.push(`${column} = ?`)
    values.push(toCell(key, fields[key]))
  }
  if (names.length === 0) return false
  const res = await sql(`UPDATE ${AUTOMATIONS_TABLE} SET ${names.join(", ")} WHERE id = ?`, [...values, id])
  return Boolean(res.ok)
}

export type AutomationRow = Automation & {
  summary: string | null
  tags: string[]
  scopeKey: string | null
  liked: Verdict | null
  needsWork: Verdict | null
  reusable: boolean | null
  publicContract: string | null
}

const verdict = (v: unknown): Verdict | null =>
  v === "yes" || v === "no" ? v : null

/** Полная строка автоматизации — все колонки поимённо, `SELECT *` запрещён. */
export async function readAutomationRow(id: number): Promise<AutomationRow | null> {
  const res = await sql(
    `SELECT ${AUTOMATIONS_TABLE_COLUMNS.join(", ")} FROM ${AUTOMATIONS_TABLE} WHERE id = ?`,
    [id],
  )
  const row = res.rows?.[0]
  if (!row) return null
  const state = row.confirm_state
  const tags = typeof row.tags === "string" && row.tags ? row.tags.split("|").filter(Boolean) : []
  return {
    id: Number(row.id),
    confirmState: isAutomationConfirmState(state) ? state : "draft",
    firstMessageId: typeof row.first_message_id === "string" ? row.first_message_id : null,
    createdAt: String(row.created_at ?? ""),
    summary: typeof row.summary === "string" ? row.summary : null,
    tags,
    scopeKey: typeof row.scope_key === "string" ? row.scope_key : null,
    liked: verdict(row.verdict_liked),
    needsWork: verdict(row.verdict_needs_work),
    // 🔒 ПУСТО ЗНАЧИТ «НЕИЗВЕСТНО», А НЕ «НЕЛЬЗЯ»: до вывода договора (§3л)
    // ответа нет, и подставлять `false` значило бы решить за механизм, которого
    // ещё нет.
    reusable: row.reusable === null || row.reusable === undefined ? null : row.reusable === "1",
    publicContract: typeof row.public_contract === "string" ? row.public_contract : null,
  }
}

/**
 * Все автоматизации — для раздела «История автоматизаций» (147-2).
 *
 * 🔒 ПУСТОЙ СПИСОК И ОТКАЗ СЛОЯ ДАННЫХ — РАЗНЫЕ ИСХОДЫ, И ЭКРАН ОБЯЗАН ИХ
 * РАЗЛИЧАТЬ. «Автоматизаций пока нет» и «до базы не достучались» выглядят
 * одинаково пустым списком, а значат прямо противоположное: первое — норма,
 * второе — поломка. Слив их, мы показали бы человеку норму вместо аварии.
 */
export async function listAutomationRows(limit = 500): Promise<{ ok: boolean; rows: AutomationRow[] }> {
  const res = await sql(
    `SELECT ${AUTOMATIONS_TABLE_COLUMNS.join(", ")} FROM ${AUTOMATIONS_TABLE} ORDER BY id DESC LIMIT ?`,
    [limit],
  )
  if (res.ok === false) return { ok: false, rows: [] }
  const rows: AutomationRow[] = []
  for (const raw of res.rows ?? []) {
    const one = await Promise.resolve(rowToAutomation(raw))
    if (one) rows.push(one)
  }
  return { ok: true, rows }
}

/** Одна строка базы — в автоматизацию. Вынесено, чтобы читать список без запроса на строку. */
function rowToAutomation(row: Record<string, unknown>): AutomationRow | null {
  if (row.id === undefined || row.id === null) return null
  const state = row.confirm_state
  const tags = typeof row.tags === "string" && row.tags ? row.tags.split("|").filter(Boolean) : []
  return {
    id: Number(row.id),
    confirmState: isAutomationConfirmState(state) ? state : "draft",
    firstMessageId: typeof row.first_message_id === "string" ? row.first_message_id : null,
    createdAt: String(row.created_at ?? ""),
    summary: typeof row.summary === "string" ? row.summary : null,
    tags,
    scopeKey: typeof row.scope_key === "string" ? row.scope_key : null,
    liked: verdict(row.verdict_liked),
    needsWork: verdict(row.verdict_needs_work),
    reusable: row.reusable === null || row.reusable === undefined ? null : row.reusable === "1",
    publicContract: typeof row.public_contract === "string" ? row.public_contract : null,
  }
}
