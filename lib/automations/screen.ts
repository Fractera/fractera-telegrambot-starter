import { dataFetch } from "@/lib/fractera/data-service"
import {
  AUTOMATION_ROWS_TABLE,
  AUTOMATION_STATES_TABLE,
  AUTOMATIONS_TABLE,
  isAutomationState,
  type AutomationState,
} from "./table"
import { SCHEDULE_TABLE } from "@/lib/schedule/table"

// ЧТО ЭКРАН ЗНАЕТ О КАЖДОЙ АВТОМАТИЗАЦИИ — ОДНИМ ЗАПРОСОМ (144, 2026-09-08).
//
// ✗ ИЗМЕРЕНО ПЕРЕД ПОСТРОЙКОЙ: экран показывал три ЛЖИВЫХ поля.
//   `calendar` стоял `false` ВСЕГДА — при живых строках расписания;
//   `map` брался как `Boolean(scopeKey)` — то есть охват выдавался за геометку;
//   `status` брался из `confirm_state`, а состояние РАБОТЫ (§3е) на экран не ехало;
//   `steps` стоял `0` при существующей ленте прогона.
// 🔒 ЭТО ИМЕННО ЛОЖЬ, А НЕ НЕДОДЕЛКА: пустое поле человек читает как «пока нет»,
// а `false` — как «проверено, нет». Второе останавливает поиск.
//
// 🔒 ОДИН ЗАПРОС, А НЕ ПЯТЬ НА КАЖДУЮ СТРОКУ. Закон 158-4: дорого стоит не
// миллисекунда, а ход; здесь дорог ещё и N+1 — сто автоматизаций дали бы
// четыреста запросов к слою данных ради одного экрана.
// 🔒 И НИ ОДНОГО ВЫЗОВА МОДЕЛИ (§3ж): всё, по чему отбирают и сортируют, —
// типизированные колонки. Выборка, зовущая модель, стоит денег, отвечает
// по-разному на один вопрос и не объясняет порядок.

/** Ключи признаков, значение которых ЕСТЬ место на карте. */
const GEO_FACT_KEYS = ["material.location", "entity.place", "field.geo"] as const

export type ScreenAutomation = {
  id: number
  createdAt: string
  summary: string | null
  tags: string[]
  /** Охват прогона — где факт верен (§3г). НЕ геометка. */
  scopeKey: string | null
  /** Состояние РАБОТЫ: open · step-closed · closed · waiting-tool (§3е). */
  state: AutomationState
  /** Есть ли отложенное действие: напоминание человеку или ступень цепочки. */
  calendar: boolean
  /**
   * Есть ли МЕСТО как значение.
   *
   * 🛑 МЕСТО-ОХВАТ И МЕСТО-ЗНАЧЕНИЕ — РАЗНЫЕ ВЕЩИ, И ПУТАЮТСЯ ОНИ ЛЕГКО (§3к).
   * «Я в Мадриде» задаёт ОХВАТ разговора; присланная точка на карте — ЗНАЧЕНИЕ.
   * Прежний экран считал охват геометкой, и любой названный город зажигал
   * отметку «есть на карте» — у автоматизации, где карты не было вовсе.
   */
  geo: boolean
  /** Сколько строк разбора записано за прогон. */
  rows: number
  liked: "yes" | "no" | null
  needsWork: "yes" | "no" | null
  publicContract: string | null
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

/**
 * Перечень для экрана.
 *
 * 🔒 ЧТЕНИЕ ПЕРЕЖИВАЕТ ОТСУТСТВИЕ СОСЕДНИХ ТАБЛИЦ (правило 4 §3ж). Расписания и
 * ленты может не быть вовсе — на машине, где ими ещё не пользовались. Тогда
 * `LEFT JOIN` даёт ноль, а не отказ… но SQLite отвергает запрос к
 * НЕСУЩЕСТВУЮЩЕЙ таблице целиком, поэтому подзапросы обёрнуты в проверку
 * наличия: сперва спрашиваем, какие таблицы есть, и подставляем `0` вместо
 * подзапроса к отсутствующей.
 * ✗ БЕЗ ЭТОГО ЭКРАН ПАДАЛ БЫ У ТОГО, КТО ТОЛЬКО ЧТО РАЗВЕРНУЛ СЕРВЕР, — то есть
 * ровно у нового человека, в его первый день.
 */
export async function listForScreen(limit = 500): Promise<{ ok: boolean; rows: ScreenAutomation[] }> {
  const have = await tablesPresent()
  if (!have.has(AUTOMATIONS_TABLE)) return { ok: true, rows: [] }

  const stateSub = have.has(AUTOMATION_STATES_TABLE)
    ? `(SELECT s.state FROM ${AUTOMATION_STATES_TABLE} s
        WHERE s.automation_id = a.id ORDER BY s.id DESC LIMIT 1)`
    : `NULL`
  const calendarSub = have.has(SCHEDULE_TABLE)
    ? `(SELECT COUNT(*) FROM ${SCHEDULE_TABLE} e WHERE e.automation_id = a.id)`
    : `0`
  const rowsSub = have.has(AUTOMATION_ROWS_TABLE)
    ? `(SELECT COUNT(*) FROM ${AUTOMATION_ROWS_TABLE} r WHERE r.automation_id = a.id)`
    : `0`
  // 🔒 ГЕОМЕТКА — ЭТО СТРОКА ЛЕНТЫ С ГЕО-ПРИЗНАКОМ, А НЕ ОХВАТ. Ключи перечислены
  // константой рядом: их конечное число, и список правится вместе с реестром.
  const geoSub = have.has(AUTOMATION_ROWS_TABLE)
    ? `(SELECT COUNT(*) FROM ${AUTOMATION_ROWS_TABLE} g
        WHERE g.automation_id = a.id AND g.fact IN (${GEO_FACT_KEYS.map(() => "?").join(", ")}))`
    : `0`

  const params: unknown[] = have.has(AUTOMATION_ROWS_TABLE) ? [...GEO_FACT_KEYS, limit] : [limit]

  const res = await sql(
    `SELECT a.id AS id, a.created_at AS created_at, a.summary AS summary, a.tags AS tags,
            a.scope_key AS scope_key, a.verdict_liked AS verdict_liked,
            a.verdict_needs_work AS verdict_needs_work, a.public_contract AS public_contract,
            ${stateSub} AS state,
            ${calendarSub} AS calendar_n,
            ${geoSub} AS geo_n,
            ${rowsSub} AS rows_n
       FROM ${AUTOMATIONS_TABLE} a
      ORDER BY a.id DESC
      LIMIT ?`,
    params,
  )
  if (!res.ok) return { ok: false, rows: [] }

  return {
    ok: true,
    rows: (res.rows ?? []).map(r => ({
      id: Number(r.id ?? 0),
      createdAt: String(r.created_at ?? ""),
      summary: typeof r.summary === "string" && r.summary ? r.summary : null,
      tags: typeof r.tags === "string" && r.tags ? r.tags.split("|").filter(Boolean) : [],
      scopeKey: typeof r.scope_key === "string" && r.scope_key ? r.scope_key : null,
      // 🔒 ПУСТАЯ ИСТОРИЯ ЗНАЧИТ `open` (закон 143-1): автоматизация, о которой
      // ещё никто ничего не решил, идёт — это её нормальное начало.
      state: isAutomationState(r.state) ? r.state : "open",
      calendar: Number(r.calendar_n ?? 0) > 0,
      geo: Number(r.geo_n ?? 0) > 0,
      rows: Number(r.rows_n ?? 0),
      liked: r.verdict_liked === "yes" || r.verdict_liked === "no" ? r.verdict_liked : null,
      needsWork: r.verdict_needs_work === "yes" || r.verdict_needs_work === "no" ? r.verdict_needs_work : null,
      publicContract: typeof r.public_contract === "string" && r.public_contract ? r.public_contract : null,
    })),
  }
}

/**
 * Какие из нужных таблиц существуют.
 *
 * 🔒 СПРАШИВАЕМ У БАЗЫ, А НЕ ПРЕДПОЛАГАЕМ. Таблицы здесь рождаются в рантайме —
 * какая уже есть, зависит от того, чем человек пользовался.
 */
async function tablesPresent(): Promise<Set<string>> {
  const res = await sql(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?, ?)`,
    [AUTOMATIONS_TABLE, AUTOMATION_STATES_TABLE, AUTOMATION_ROWS_TABLE, SCHEDULE_TABLE],
  )
  return new Set((res.rows ?? []).map(r => String(r.name ?? "")))
}
