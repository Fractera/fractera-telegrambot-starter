import { dataFetch } from "@/lib/fractera/data-service"

// УКАЗАТЕЛЬ «АВТОМАТИЗАЦИЯ ↔ ПРИЗНАК ↔ ТАБЛИЦА» (145, 2026-09-08).
//
// 🔒 ЭТО ОТВЕТ НА «ПУЛЮ», И ОТВЕТ ОТРИЦАТЕЛЬНЫЙ. Владелец спросил: «мы не должны
// наращивать главную таблицу, а должны иметь в ней какую-то пулю, в которой
// перечисляются зависимые таблицы?» Список имён внутри строки **нельзя
// проиндексировать**, он врёт при выключении признака и отвечает на один вопрос
// из двух. Тонкая таблица отвечает на оба:
//
//   какие признаки были у автоматизации 124 → строки по номеру;
//   какие автоматизации трогали «расход»    → строки по ключу;
//   откуда взять значение                   → имя таблицы и id, одним переходом.
//
// 🔒 ГЛАВНАЯ ТАБЛИЦА ОТ НОВЫХ ПРИЗНАКОВ НЕ РАСТЁТ ВОВСЕ. Она описывает
// автоматизацию — номер, состояние, саммари, теги, охват, вердикты; признаки
// живут в своих таблицах, а мост между ними — здесь.
//
// 🔒 УКАЗАТЕЛЬ НЕ ХРАНИТ ЗНАЧЕНИЙ. Второе место, где лежит значение, — это вторая
// правда: одну из них поправят, вторую забудут, и разойдутся они молча.

export const FACT_INDEX_TABLE = "automation_facts"

export const FACT_INDEX_COLUMNS = [
  "id",
  "automation_id",
  "fact_key",
  "table_name",
  "row_id",
  "created_at",
] as const

export function factIndexTableSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS ${FACT_INDEX_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      automation_id INTEGER NOT NULL,
      -- Ключ признака реестра. Именно ключ, а не свободное слово: по нему ищут.
      fact_key TEXT NOT NULL,
      -- Куда легло значение. Имя собрано белым списком там же, где таблица.
      table_name TEXT NOT NULL,
      -- Какая именно строка. Ноль значит «строку записать не удалось».
      row_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (strftime(%Y-%m-%dT%H:%M:%SZ,now))
    );
    CREATE INDEX IF NOT EXISTS ${FACT_INDEX_TABLE}_owner ON ${FACT_INDEX_TABLE} (automation_id, id);
    CREATE INDEX IF NOT EXISTS ${FACT_INDEX_TABLE}_key ON ${FACT_INDEX_TABLE} (fact_key, id);
  `
}

export const FACT_INDEX_LATE_COLUMNS: readonly string[] = []

export function factIndexTableAlters(): string[] {
  return FACT_INDEX_LATE_COLUMNS.map(c => `ALTER TABLE ${FACT_INDEX_TABLE} ADD COLUMN ${c} TEXT`)
}

type MigrateAnswer = { ok?: boolean; error?: string; rows?: Record<string, unknown>[] }

async function sql(text: string, params: unknown[] = []): Promise<MigrateAnswer> {
  const r = await dataFetch("/db/migrate", {
    method: "POST",
    body: JSON.stringify({ sql: text, params }),
  })
  if (!r.ok) return { ok: false, error: `http-${r.status}` }
  return (await r.json()) as MigrateAnswer
}

/** Создать указатель и провести существующий по лестнице. */
export async function ensureFactIndex(): Promise<{ ok: boolean; error?: string }> {
  const created = await sql(factIndexTableSql())
  if (!created.ok) return { ok: false, error: created.error ?? "refused" }
  for (const statement of factIndexTableAlters()) await sql(statement)
  return { ok: true }
}

/**
 * Записать в указатель, что признак сработал у этой автоматизации.
 *
 * 🔒 БЕЗ НОМЕРА АВТОМАТИЗАЦИИ ЗАПИСЬ НЕ ДЕЛАЕТСЯ, И ЭТО НЕ ОТКАЗ. Факт о
 * человеке (`person.timezone`) живёт вне автоматизаций: он верен всегда и ничьим
 * прогоном не порождён. Указатель отвечает на вопрос «что было в прогоне
 * номер N» — у такого факта ответа нет, и выдумывать его нельзя.
 */
export async function indexFact(input: {
  automationId: number | null
  factKey: string
  table: string
  rowId: number | null
}): Promise<{ ok: boolean; skipped?: "no-automation" }> {
  if (!Number.isInteger(input.automationId as number) || (input.automationId as number) <= 0) {
    return { ok: true, skipped: "no-automation" }
  }
  const ready = await ensureFactIndex()
  if (!ready.ok) return { ok: false }
  const res = await sql(
    `INSERT INTO ${FACT_INDEX_TABLE} (automation_id, fact_key, table_name, row_id) VALUES (?, ?, ?, ?)`,
    [input.automationId, input.factKey, input.table, input.rowId ?? null],
  )
  return { ok: Boolean(res.ok) }
}

export type IndexRow = {
  id: number
  automationId: number
  factKey: string
  table: string
  rowId: number | null
  createdAt: string
}

function toRow(r: Record<string, unknown>): IndexRow {
  return {
    id: Number(r.id ?? 0),
    automationId: Number(r.automation_id ?? 0),
    factKey: String(r.fact_key ?? ""),
    table: String(r.table_name ?? ""),
    rowId: r.row_id === null || r.row_id === undefined ? null : Number(r.row_id),
    createdAt: String(r.created_at ?? ""),
  }
}

/**
 * Какие признаки сработали у автоматизации.
 *
 * 🔒 ЧТЕНИЕ ПЕРЕЖИВАЕТ ОТСУТСТВИЕ ТАБЛИЦЫ (правило 4 §3ж): её могли не создать,
 * если признаков ещё не писали. Ответ «пусто», а не `500`.
 */
export async function factsOfAutomation(automationId: number): Promise<IndexRow[]> {
  const res = await sql(
    `SELECT ${FACT_INDEX_COLUMNS.join(", ")} FROM ${FACT_INDEX_TABLE}
      WHERE automation_id = ? ORDER BY id ASC`,
    [automationId],
  )
  return (res.rows ?? []).map(toRow)
}

/** Какие автоматизации трогали этот признак. Второй вопрос, на который «пуля» не отвечала. */
export async function automationsOfFact(factKey: string, limit = 200): Promise<IndexRow[]> {
  const res = await sql(
    `SELECT ${FACT_INDEX_COLUMNS.join(", ")} FROM ${FACT_INDEX_TABLE}
      WHERE fact_key = ? ORDER BY id DESC LIMIT ?`,
    [factKey, limit],
  )
  return (res.rows ?? []).map(toRow)
}
