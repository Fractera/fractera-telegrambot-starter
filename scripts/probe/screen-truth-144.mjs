// ПРИБОР ШАГА 144 — экран показывает ПРАВДУ, а не уверенные умолчания.
//
// Проверяет на живом слое данных: состояние работы доезжает · календарь зажигается
// от настоящей строки расписания · геометка отличается от охвата · число строк
// ленты настоящее · отбор идёт чистым SQL, без единого вызова модели.
//
// ✗ ЧТО БЫЛО ДО: `calendar` всегда false, `map` = Boolean(scopeKey), `status` из
// confirm_state, `steps` всегда 0. Экран отвечал уверенно и неверно.
//
// 🛑 ПИШЕТ В ЖИВОЙ СЛОЙ ДАННЫХ И УБИРАЕТ ЗА СОБОЙ.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_144==="
function machineEnv(key) {
  try {
    for (const line of readFileSync(process.env.FRACTERA_MACHINE_ENV || "/etc/fractera/secrets.env", "utf8").split("\n")) {
      const i = line.indexOf("=")
      if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, "")
    }
  } catch { /* нет файла — законное состояние */ }
  return ""
}
const dataUrl = process.env.REMOTE_DATA_URL || machineEnv("REMOTE_DATA_URL") || "http://localhost:3300"
const key = process.env.DATA_SECRET || machineEnv("DATA_SECRET") || ""
if (!key) { console.log(`${MARK} НЕТ КЛЮЧА СЛОЯ ДАННЫХ`); process.exit(2) }

let bad = 0
const say = (ok, what) => { if (!ok) bad += 1; console.log(`${ok ? "✓" : "✗"} ${what}`) }

async function sql(text, params = []) {
  const r = await fetch(`${dataUrl}/db/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ sql: text, params }),
  })
  if (!r.ok) return { ok: false, error: `http-${r.status}` }
  return await r.json()
}

// Повторяем ТОТ ЖЕ запрос, что делает `lib/automations/screen.ts`. Прибор на .mjs
// не может импортировать TypeScript; поэтому проверяется поведение запроса, а
// **форма ответа двери** — приборами 143. Граница названа, а не замаскирована.
const GEO = ["material.location", "entity.place", "field.geo"]
async function screenRow(id) {
  const res = await sql(
    `SELECT a.id AS id, a.scope_key AS scope_key,
            (SELECT s.state FROM automation_states s WHERE s.automation_id = a.id ORDER BY s.id DESC LIMIT 1) AS state,
            (SELECT COUNT(*) FROM schedule_entries e WHERE e.automation_id = a.id) AS calendar_n,
            (SELECT COUNT(*) FROM automation_rows g WHERE g.automation_id = a.id AND g.fact IN (?, ?, ?)) AS geo_n,
            (SELECT COUNT(*) FROM automation_rows r WHERE r.automation_id = a.id) AS rows_n
       FROM automations a WHERE a.id = ?`,
    [...GEO, id],
  )
  return res.rows?.[0] ?? null
}
const row = (id, kind, fact, phrase) => sql(
  `INSERT INTO automation_rows (automation_id, kind, fact, payload) VALUES (?, ?, ?, ?)`,
  [id, kind, fact, JSON.stringify({ id: 0, kind, fact, phrase, source: "model", at: new Date().toISOString() })])

console.log(MARK)

await sql(`INSERT INTO automations (confirm_state) VALUES ('draft')`)
const id = Number((await sql(`SELECT id FROM automations ORDER BY id DESC LIMIT 1`)).rows?.[0]?.id ?? 0)
say(id > 0, `автоматизация заведена: №${id}`)

// ── 1. Пустая: всё честно по нулям, состояние open ─────────────────────────
let r = await screenRow(id)
say(Number(r.rows_n) === 0 && Number(r.calendar_n) === 0 && Number(r.geo_n) === 0,
  `пустая: строк ${r.rows_n}, календарь ${r.calendar_n}, гео ${r.geo_n}`)

// ── 2. ОХВАТ БЕЗ ГЕОМЕТКИ — главный замер шага ─────────────────────────────
// «Я в Мадриде» задаёт охват. Метки на карте при этом НЕТ.
await sql(`UPDATE automations SET scope_key = ? WHERE id = ?`, ["geo.city=madrid", id])
await row(id, "intake", null, "я в мадриде, напомни про такси")
r = await screenRow(id)
say(String(r.scope_key) === "geo.city=madrid" && Number(r.geo_n) === 0,
  `ОХВАТ ЕСТЬ («${r.scope_key}»), ГЕОМЕТКИ НЕТ (${r.geo_n}) — прежний экран показал бы «на карте»`)
say(Number(r.rows_n) === 1, `строк ленты: ${r.rows_n} (ждём 1) — раньше показывался ноль`)

// ── 3. Настоящая геометка зажигает отметку ─────────────────────────────────
await row(id, "reveal", "material.location", "точка на карте")
r = await screenRow(id)
say(Number(r.geo_n) === 1, `после присланного МЕСТА гео: ${r.geo_n} (ждём 1)`)

// ── 4. Календарь зажигается от настоящей строки расписания ────────────────
await sql(
  `INSERT INTO schedule_entries (automation_id, kind, state, payload, tz, due_at) VALUES (?, 'human', 'planned', ?, ?, ?)`,
  [id, "проверить такси", "Atlantic/Canary", "2027-01-01T10:00:00Z"])
r = await screenRow(id)
say(Number(r.calendar_n) === 1, `календарь: ${r.calendar_n} (ждём 1) — раньше стояло false ВСЕГДА`)

// ── 5. Состояние работы, а не подтверждённость номера ─────────────────────
await sql(`INSERT INTO automation_states (automation_id, state, reason) VALUES (?, 'open', 'прибор')`, [id])
r = await screenRow(id)
say(String(r.state) === "open", `состояние: ${r.state}`)
await sql(`INSERT INTO automation_states (automation_id, state, closing_kind, reason) VALUES (?, 'closed', 'whole', 'прибор')`, [id])
r = await screenRow(id)
say(String(r.state) === "closed", `после закрытия состояние: ${r.state} — берётся ПОСЛЕДНЯЯ строка`)

// НЕГАТИВНЫЙ КОНТРОЛЬ: `confirm_state` при этом не менялся ни разу.
const cs = (await sql(`SELECT confirm_state FROM automations WHERE id = ?`, [id])).rows?.[0]?.confirm_state
say(String(cs) === "draft",
  `confirm_state остался «${cs}» — экран берёт состояние РАБОТЫ, а не подтверждённость номера`)

// ── 6. Отбор идёт SQL, а не моделью ────────────────────────────────────────
const withCal = await sql(
  `SELECT COUNT(*) AS n FROM automations a
    WHERE (SELECT COUNT(*) FROM schedule_entries e WHERE e.automation_id = a.id) > 0`)
say(Number(withCal.rows?.[0]?.n ?? 0) >= 1, `отбор «с календарём» нашёл: ${withCal.rows?.[0]?.n}`)

// ── Уборка ─────────────────────────────────────────────────────────────────
await sql(`DELETE FROM schedule_entries WHERE automation_id = ?`, [id])
await sql(`DELETE FROM automation_rows WHERE automation_id = ?`, [id])
await sql(`DELETE FROM automation_states WHERE automation_id = ?`, [id])
await sql(`DELETE FROM automations WHERE id = ?`, [id])
say(Number((await sql(`SELECT COUNT(*) AS n FROM automations WHERE id = ?`, [id])).rows?.[0]?.n ?? 1) === 0,
  `после уборки автоматизаций с номером ${id}: 0`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
