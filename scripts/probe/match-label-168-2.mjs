// ПРИБОР 168-2 — ДОКАЗАТЬ, ЧТО ПАМЯТЬ СПРАШИВАЕТ ВСЕ НАПИСАНИЯ ИМЕНИ.
//
// 🛑 ЗАЧЕМ ОТДЕЛЬНЫЙ ПРИБОР, ЕСЛИ ДУБЛИ УЖЕ СЛИТЫ (168-3). Именно поэтому:
// после слияния двойников в графе НЕТ, и проверить починку `matchLabel` на живых
// данных стало нечем. Прибор заводит двойника САМ, проверяет и убирает — иначе
// «починено» осталось бы утверждением о коде, а не о поведении.
//
// 🔒 ПРОВЕРЯЕТСЯ ЧЕРЕЗ ЖИВУЮ ДВЕРЬ, А НЕ ЧТЕНИЕМ ФУНКЦИИ. `matchLabel` не
// экспортируется и вызывается изнутри чтения; единственный честный способ
// увидеть его работу — посмотреть, какие имена уехали в связи: ответ `memory_read`
// печатает их в `levels[2].anchors`.
//
// ✗ ЧТО БЫЛО ДО ПОЧИНКИ (измерено 168-1 на 165 метках): граф держал 11 пар,
// различающихся только регистром, у девяти пар рёбра были у обоих написаний, и
// код терял 22 ребра, беря первое. Самый наглядный случай: «Answers» — 0 рёбер,
// «answers» — 7; код брал заглавное и терял всё содержание.
//
// 🛑 ЧТО ПИШЕТ И ЧЬЁ ЭТО: две сущности графа с именем-меткой прибора и одну
// строку `fact_person_important_people` с меткой `probe-168-2`. Убирает обе.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_168_2==="
const SOURCE = "probe-168-2"
// 🔒 ИМЯ ВЫДУМАНО И НЕПРОИЗНОСИМО НАМЕРЕННО: оно не должно совпасть ни с одной
// живой сущностью графа, иначе уборка задела бы чужое.
const NAME = "Квилдрон"
const TWIN = "квилдрон"

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
const rag = (path, init = {}) => fetch(`${dataUrl}/service/rag${path}`, {
  ...init,
  headers: { "Content-Type": "application/json", "X-Data-Secret": key, ...(init.headers ?? {}) },
}).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }))
  .catch(e => ({ status: 0, json: { error: String(e) } }))
const call = (fn, args) => fetch(`${app}/api/agent/memory`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ fn, args }),
}).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }))
const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))

async function clean() {
  for (const n of [NAME, TWIN]) {
    await rag("/documents/delete_entity", { method: "DELETE", body: JSON.stringify({ entity_name: n }) })
  }
  await sql("DELETE FROM fact_person_important_people WHERE source = ?", [SOURCE])
}

console.log(MARK)
await clean()

// ── ЗАВЕСТИ ДВОЙНИКА, КАКОГО ДЕЛАЕТ САМ ДВИЖОК ──────────────────────────
for (const [n, desc] of [[NAME, "Тестовая сущность прибора 168-2"], [TWIN, "Та же сущность в нижнем регистре"]]) {
  const r = await rag("/graph/entity/create", {
    method: "POST",
    body: JSON.stringify({ entity_name: n, entity_data: { description: desc, entity_type: "probe" } }),
  })
  if (r.status !== 200) console.log(`  завести «${n}»: ${r.status} ${JSON.stringify(r.json).slice(0, 120)}`)
}
const found = (await rag(`/graph/label/search?q=${encodeURIComponent(TWIN)}&limit=10`)).json
const spellings = (Array.isArray(found) ? found : []).map(String)
say(spellings.length >= 2, `в графе два написания одного имени: ${JSON.stringify(spellings)}`)

// ── ПОЛОЖИТЬ ФАКТ С ЭТИМ ИМЕНЕМ И СПРОСИТЬ ПАМЯТЬ ───────────────────────
//
// 🔒 ИМЯ ПОПАДАЕТ В ЛИЧНУЮ ТАБЛИЦУ, ОТТУДА — В ЯКОРЯ УРОВНЯ 2. Это тот самый
// путь, на котором терялось написание: значение → `anchorsFrom` → `matchLabel`.
await call("write", { key: "person.important-people", source: SOURCE, what: NAME })
const answer = (await call("read", { depth: 2, limit: 20, query: `что известно про ${TWIN}` })).answer ?? {}
const anchors = ((answer.levels ?? []).find(l => l.level === 2)?.anchors) ?? []
console.log(`  память спросила связи по именам: ${JSON.stringify(anchors)}`)

const asked = spellings.filter(s => anchors.includes(s))
say(asked.length === spellings.length,
  `спрошены ВСЕ написания: ${asked.length} из ${spellings.length}` +
  (asked.length === spellings.length ? "" : ` — пропущены ${JSON.stringify(spellings.filter(s => !anchors.includes(s)))}`))

// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ: ПОДСТРОКА — НЕ ДУБЛЬ.
// ✗ измерено 168-1: поиск по «память» отдавал `Память`, `память`, `Память
// Fractera`, `Личная Память`. Последние две самостоятельны; взяв их все, мы
// размножили бы один якорь в четыре запроса и съели бюджет других имён.
{
  const near = (await rag(`/graph/label/search?q=${encodeURIComponent("памя")}&limit=10`)).json
  const list = (Array.isArray(near) ? near : []).map(String)
  const exactOnes = list.filter(l => l.toLowerCase() === "память")
  const others = list.filter(l => l.toLowerCase() !== "память")
  say(others.length > 0,
    `контроль: поиск по части имени находит и посторонние — ${JSON.stringify(others.slice(0, 3))}`)
  console.log(`     и только ${exactOnes.length} из ${list.length} — написания самого имени; в якоря идут они`)
}

await clean()
const left = (await rag(`/graph/label/search?q=${encodeURIComponent(TWIN)}&limit=10`)).json
say((Array.isArray(left) ? left.length : 0) === 0, `прибор убрал свои сущности из графа`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
