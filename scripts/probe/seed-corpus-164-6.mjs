// ПРИБОР ПОДШАГА 164-6 — ПОСЕВ КОРПУСА: ДЕСЯТЬ ИСТОРИЙ, ДЕСЯТЬ НОВЫХ СУЩНОСТЕЙ.
//
// 🎯 СЛОВО ВЛАДЕЛЬЦА 2026-09-09: «нагенерируй 10 историй про разных людей, про
// разные ситуации… чтобы каждая из них порождала новую сущность в таблице».
//
// 🔒 КАЖДАЯ ИСТОРИЯ ЛОЖИТСЯ ДВУМЯ ЗАПИСЯМИ, И ЭТО НЕ ИЗБЫТОЧНОСТЬ, А ПРАВИЛО
// ПЕРВОГО РЕБРА (MEMORY-STANDARD §2.3): имя сущности — глубина 1 от человека,
// значит в личную таблицу; её биография — глубина 2, значит в связи, якорем на
// то же имя. Положив биографию в таблицу, мы завели бы поле без конечного числа
// значений; положив имя только в связи, потеряли бы уровень 1 — и вопрос
// «кто из знакомых…» не с чего было бы начинать.
//
// 🛑 ЧТО ЭТОТ ПРИБОР ПИШЕТ И ЧЬЁ ЭТО. Он пишет в ЖИВЫЕ личные таблицы владельца
// и в живой граф. Каждая строка помечена `source = "probe-164-6"`, и уборка идёт
// ТОЛЬКО по этой метке. `DELETE FROM fact_person_*` без условия стёр бы живую
// память владельца — оплачено прибором шага 160, после которого все девять
// таблиц оказались пусты. Уборка живёт в 164-7 (`… 164-7.mjs clean`), потому что
// между посевом и прогоном корпус обязан существовать.
//
// Решение владельца о судьбе корпуса 2026-09-09, дословно: «Убрать по своей метке».
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const MARK = "===PROBE_164_6==="
const here = dirname(fileURLToPath(import.meta.url))
const corpus = JSON.parse(readFileSync(join(here, "../../development-docs/instruments/164-6-ten-stories.json"), "utf8"))
const SOURCE = corpus.source

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
const sleep = ms => new Promise(r => setTimeout(r, ms))

const call = (fn, args) => fetch(`${app}/api/agent/memory`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ fn, args }),
}).then(r => r.json()).catch(() => ({}))

const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))

const docs = () => fetch(`${dataUrl}/service/rag/documents`, { headers: { "X-Data-Secret": key } })
  .then(r => r.json()).catch(() => ({}))

/** Имя таблицы признака — тем же правилом, что у писателя памяти. */
const tableOf = k => `fact_${k.replace(/[.-]/g, "_")}`

/** Сколько наших строк в таблице признака. Чужие не считаем и не трогаем. */
async function mine(k) {
  const r = await sql(`SELECT COUNT(*) AS n FROM ${tableOf(k)} WHERE source = ?`, [SOURCE])
  if (r.ok === false) return 0
  return Number((r.rows ?? [])[0]?.n ?? 0)
}

/** Ждать, пока ВСЕ наши документы обработаны и очередь движка пуста (162-5). */
async function ready(prefixes) {
  for (let i = 0; i < 240; i += 1) {
    const d = await docs()
    const processed = (d.statuses?.processed ?? []).map(x => String(x.file_path ?? ""))
    const done = prefixes.every(p => processed.some(f => f.startsWith(p)))
    const busy = Object.entries(d.statuses ?? {}).some(([st, g]) =>
      st !== "processed" && Array.isArray(g) && g.length > 0)
    if (done && !busy) return true
    await sleep(1000)
  }
  return false
}

console.log(MARK)
console.log(`корпус: ${corpus.cases.length} историй, метка «${SOURCE}»`)

// ── СЧЁТ ДО ПОСЕВА ────────────────────────────────────────────────────────
// 🔒 «ДО» СНИМАЕТСЯ ДО НАЧАЛА РАБОТЫ И НИКОГДА ПОСЛЕ: вспомнить о нём в конце
// нельзя, база уже другая.
const keys = [...new Set(corpus.cases.map(c => c.key))]
const before = {}
for (const k of keys) before[k] = await mine(k)
console.log(`наших строк ДО посева: ${JSON.stringify(before)}`)

// ── ПОСЕВ ─────────────────────────────────────────────────────────────────
const prefixes = []
for (const c of corpus.cases) {
  const one = await call("write", { key: c.key, what: c.entity, source: SOURCE })
  say(one.ok !== false, `${c.id}. «${c.entity}» → ${c.key}: ${one.ok === false ? JSON.stringify(one) : "записано"}`)

  const story = await call("write", { anchors: [c.entity], what: c.story, source: SOURCE })
  say(story.ok !== false, `${c.id}. история про «${c.entity}» ушла в связи: ${story.ok === false ? JSON.stringify(story) : "записано"}`)
  prefixes.push(`memory/${c.entity}-`)
}

// ── СЧЁТ ПОСЛЕ ────────────────────────────────────────────────────────────
const after = {}
for (const k of keys) after[k] = await mine(k)
const grew = keys.reduce((s, k) => s + (after[k] - before[k]), 0)
console.log(`наших строк ПОСЛЕ посева: ${JSON.stringify(after)}`)
say(grew === corpus.cases.length, `в таблицах прибавилось ровно ${corpus.cases.length}: прибавилось ${grew}`)
say(keys.length >= 2, `задето больше одной таблицы: ${keys.map(tableOf).join(", ")}`)

// ── ИНДЕКСАЦИЯ СВЯЗЕЙ ─────────────────────────────────────────────────────
// 🔒 ЖДАТЬ ПО ФАКТУ, А НЕ ТАЙМЕРОМ: проигранная гонка с движком неотличима от
// отказа двери.
const indexed = await ready(prefixes)
say(indexed, `все десять историй проиндексированы и очередь движка пуста`)

const d = await docs()
const processed = (d.statuses?.processed ?? []).map(x => String(x.file_path ?? ""))
const found = prefixes.filter(p => processed.some(f => f.startsWith(p)))
say(found.length === corpus.cases.length, `документов связей на месте: ${found.length} из ${corpus.cases.length}`)

// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ: ЯКОРЬ, КОТОРОГО МЫ НЕ СЕЯЛИ, В СПИСКЕ НЕ ПОЯВЛЯЕТСЯ.
// Без него счётчик доказывал бы лишь то, что список документов непустой.
const ghostPrefix = `memory/${corpus.controls.ghost.entity}-`
say(!processed.some(f => f.startsWith(ghostPrefix)),
  `выдуманного «${corpus.controls.ghost.entity}» среди документов нет`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
