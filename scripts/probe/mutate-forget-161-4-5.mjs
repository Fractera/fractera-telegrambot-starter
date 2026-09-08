// ПРИБОР ПОДШАГОВ 161-4 и 161-5 — правка с историей и право забыть.
//
// ПЛОСКОСТИ, НАЗВАННЫЕ В ТЗ ЗАРАНЕЕ:
//   161-4: (1) строки в базе — две, статусы разные; (2) чтение через дверь отдаёт новое.
//   161-5: (1) число строк до и после; (2) определение цело и принимает новую запись.
//
// 🛑 ПИШЕТ В ЖИВУЮ ПАМЯТЬ И УБИРАЕТ ЗА СОБОЙ ПО СВОЕЙ МЕТКЕ.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_161_4_5==="
const TAG = "прибор 161-4-5"

function machineEnv(k) {
  try {
    for (const line of readFileSync(process.env.FRACTERA_MACHINE_ENV || "/etc/fractera/secrets.env", "utf8").split("\n")) {
      const i = line.indexOf("=")
      if (i > 0 && line.slice(0, i).trim() === k) return line.slice(i + 1).trim().replace(/^["']|["']$/g, "")
    }
  } catch { /* нет файла — законное состояние */ }
  return ""
}
const key = process.env.DATA_SECRET || machineEnv("DATA_SECRET") || ""
const dataUrl = process.env.REMOTE_DATA_URL || machineEnv("REMOTE_DATA_URL") || "http://localhost:3300"
const app = process.env.PROBE_APP_URL || "http://127.0.0.1:3600"
if (!key) { console.log(`${MARK} НЕТ КЛЮЧА СЛОЯ ДАННЫХ`); process.exit(2) }

let bad = 0
const say = (ok, what) => { if (!ok) bad += 1; console.log(`${ok ? "✓" : "✗"} ${what}`) }

const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))

async function door(path, body) {
  const r = await fetch(`${app}/api/agent/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify(body),
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}
const memory = (fn, args) => door("memory", { fn, args })
const registry = (fn, args) => door("registry", { fn, args })

console.log(MARK)

// ── ЧИСТЫЙ ЛИСТ: убираем возможные хвосты прошлого прогона ────────────────
await sql("DELETE FROM fact_person_city WHERE source LIKE ?", ["%161-4-5%"])
await sql("DELETE FROM fact_person_city WHERE source LIKE ?", ["%поправил%"])

// ── 161-4: ПРАВКА СОХРАНЯЕТ ПРЕЖНЕЕ ───────────────────────────────────────
let r = await memory("mutate", { key: "person.city", value: "Мадрид" })
say(r.json.ok === false && r.json.error === "nothing-to-change",
  `правка без прежнего значения — это запись, а не правка: ${r.json.error}`)

r = await memory("write", { key: "person.city", what: "Лас-Пальмас", source: TAG })
say(r.json.ok === true, `исходное значение записано: ${r.json.where ?? r.json.error}`)

r = await memory("mutate", { key: "person.city", value: "Мадрид", why: "переехал на неделю" })
say(r.json.ok === true && r.json.was === "Лас-Пальмас" && r.json.now === "Мадрид",
  `правка назвала прежнее и новое: «${r.json.was}» → «${r.json.now}»`)

const rows = await sql(
  "SELECT id, value_text, status FROM fact_person_city ORDER BY id DESC LIMIT 5"
)
const list = rows.rows ?? []
const past = list.find(x => x.status === "past")
const now = list.find(x => x.status === "current")
say(list.length >= 2 && past?.value_text === "Лас-Пальмас" && now?.value_text === "Мадрид",
  `в базе две строки: прошедшая «${past?.value_text}» и текущая «${now?.value_text}»`)

r = await memory("read", { key: "person.city" })
const first = (r.json.answer?.items ?? [])[0]
say(first?.value === "Мадрид", `чтение отдаёт НОВОЕ значение первым: «${first?.value}»`)
// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ ИСТОРИИ: прежнее не исчезло, оно доступно ниже.
const values = (r.json.answer?.items ?? []).map(i => i.value)
say(values.includes("Лас-Пальмас"), `прежнее значение осталось в истории: ${JSON.stringify(values)}`)

// ── 161-5: ЗАБЫТЬ ─────────────────────────────────────────────────────────
r = await memory("forget", { key: "person.timezone" })
say(r.json.ok === false && r.json.error === "nothing-to-forget",
  `забывать нечего — честный отказ: ${r.json.error}`)

r = await memory("forget", { key: "material.text" })
say(r.json.ok === false && r.json.error === "not-a-person-fact",
  `чужой признак не забывается через память человека: ${r.json.error}`)

const beforeCount = (await sql("SELECT COUNT(*) AS n FROM fact_person_city")).rows?.[0]?.n
r = await memory("forget", { key: "person.city" })
const afterCount = (await sql("SELECT COUNT(*) AS n FROM fact_person_city")).rows?.[0]?.n
say(r.json.ok === true && Number(afterCount) === 0 && r.json.removed === Number(beforeCount),
  `удалено ${r.json.removed} из ${beforeCount}, осталось ${afterCount}`)

// 🔒 ГЛАВНЫЙ ЗАМЕР 161-5: ОПРЕДЕЛЕНИЕ ЦЕЛО. Забывается значение, а не то, что
// система умеет такое запоминать.
const described = await registry("describe", { corpus: "facts", key: "person.city" })
say(described.json.answer?.found === true,
  `определение признака цело после забывания: ${described.json.answer?.found === true ? "да" : "НЕТ"}`)
say(r.json.definitionKept === true, `ответ прямо говорит, что определение сохранено`)

// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ: после забывания признак ПРИНИМАЕТ новую запись —
// значит удалили данные, а не способность.
const again = await memory("write", { key: "person.city", what: "Лас-Пальмас", source: TAG })
say(again.json.ok === true, `после забывания признак снова принимает запись: ${again.json.where ?? again.json.error}`)

// ── УБОРКА ────────────────────────────────────────────────────────────────
await sql("DELETE FROM fact_person_city WHERE source LIKE ?", ["%161-4-5%"])
const left = (await sql("SELECT COUNT(*) AS n FROM fact_person_city")).rows?.[0]?.n
say(Number(left) === 0, `после уборки строк осталось: ${left}`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
