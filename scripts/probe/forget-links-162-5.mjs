// ПРИБОР ПОДШАГА 162-5 — глубина у забывания: история уходит из связей.
//
// ДВЕ ПЛОСКОСТИ, НАЗВАННЫЕ В ТЗ ЗАРАНЕЕ:
//   1) чтение после удаления — вопрос по имени до удаления даёт историю, после
//      не даёт; НЕГАТИВНЫЙ КОНТРОЛЬ: соседняя история с другим якорем цела;
//   2) личная память не тронута — значения признаков того же человека на месте.
//
// 🛑 ЧТО ПИШЕТ И УДАЛЯЕТ: две СВОИ истории в связях (якоря — выдуманные имена,
// каких в графе нет) и одну строку `fact_person_city` со своей меткой `source`.
// Уборка по своей метке; чужих документов прибор не касается — удаление идёт по
// префиксу `memory/<якорь>-`, а якоря придуманы этим прибором.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_162_5==="
const SOURCE = "probe-162-5"
// 🔒 ИМЕНА ВЫДУМАННЫЕ И РЕДКИЕ НАМЕРЕННО: прибор обязан удалять только своё.
const MINE = "Тестовин"
const NEIGHBOUR = "Соседов"

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

async function call(fn, args) {
  const r = await fetch(`${app}/api/agent/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ fn, args }),
  })
  return r.json().catch(() => ({}))
}
const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))
const docs = () => fetch(`${dataUrl}/service/rag/documents`, { headers: { "X-Data-Secret": key } })
  .then(r => r.json()).catch(() => ({}))
const mineCount = async prefix => {
  const d = await docs()
  let n = 0
  for (const group of Object.values(d.statuses ?? {})) {
    if (Array.isArray(group)) n += group.filter(x => String(x.file_path ?? "").startsWith(prefix)).length
  }
  return n
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

console.log(MARK)
await sql("DELETE FROM fact_person_city WHERE source = ?", [SOURCE])

// ── ПОСЕВ: ДВЕ ИСТОРИИ И ОДИН ЛИЧНЫЙ ФАКТ ────────────────────────────────
const one = await call("write", { anchors: [MINE], what: `${MINE} служил в оркестре и играл на трубе` })
const two = await call("write", { anchors: [NEIGHBOUR], what: `${NEIGHBOUR} держит пасеку и возит мёд на ярмарку` })
say(one.ok === true && two.ok === true, `посеяны две истории: ${one.ok} / ${two.ok}`)
await call("write", { key: "person.city", what: "Зеленодольск", source: SOURCE })

// 🔒 ЖДЁМ СВОИ ДОКУМЕНТЫ ПОИМЁННО, А НЕ «ДВА ЛЮБЫХ».
// ✗ ОПЛАЧЕНО КРАСНЫМ ПРОГОНОМ 2026-09-08: ожидание «в `memory/` стало ≥ 2»
// выполнялось чужими документами — историей соседнего прибора и посевом прошлого
// прогона, — и забывание звалось РАНЬШЕ, чем движок успевал завести наш файл.
// Снаружи это выглядело как «удаление не работает»: `deleted: 0` при живой
// способности. **Ожидание по числу чужого — это не ожидание.**
let mine = 0
let neighbour0 = 0
for (let i = 0; i < 90; i += 1) {
  mine = await mineCount(`memory/${MINE}-`)
  neighbour0 = await mineCount(`memory/${NEIGHBOUR}-`)
  if (mine > 0 && neighbour0 > 0) break
  await sleep(1000)
}
say(mine > 0 && neighbour0 > 0, `оба наших документа появились: ${MINE}=${mine}, ${NEIGHBOUR}=${neighbour0}`)

// ── ПЛОСКОСТЬ 1: ЧТЕНИЕ ПОСЛЕ УДАЛЕНИЯ ───────────────────────────────────
const before = await mineCount(`memory/${MINE}-`)
say(before > 0, `до удаления история про «${MINE}» в связях есть: ${before} док.`)

const gone = await call("forget", { anchors: [MINE] })
say(gone.ok === true && (gone.links?.deleted ?? 0) > 0,
  `забывание убрало документы: ${JSON.stringify(gone.links ?? gone)}`)

// 🔒 УДАЛЕНИЕ У ДВИЖКА ФОНОВОЕ — ЖДЁМ ПО ФАКТУ, А НЕ ПРОВЕРЯЕМ СРАЗУ.
// ✗ ИЗМЕРЕНО 2026-09-08: ответ `{"status":"deletion_started"}`, документ уходит
// из списка за секунды. Проверка в тот же миг показывала его на месте и
// выглядела как отказ удаления — тот же класс, что «связи строятся в фоне».
let after = await mineCount(`memory/${MINE}-`)
for (let i = 0; i < 30 && after > 0; i += 1) {
  await sleep(1000)
  after = await mineCount(`memory/${MINE}-`)
}
say(after === 0, `после удаления историй про «${MINE}» не осталось: ${after}`)

// 🔒 ГЛАВНЫЙ НЕГАТИВНЫЙ КОНТРОЛЬ: СОСЕДНЯЯ ИСТОРИЯ ЦЕЛА. Без него «удалил» и
// «снёс всё» выглядят одинаково — ровно та ошибка, которой прибор 160 обнулил
// живую память владельца.
const neighbour = await mineCount(`memory/${NEIGHBOUR}-`)
say(neighbour > 0, `соседняя история про «${NEIGHBOUR}» цела: ${neighbour} док.`)

// ── ПЛОСКОСТЬ 2: ЛИЧНАЯ ПАМЯТЬ НЕ ТРОНУТА ────────────────────────────────
const city = await call("read", { key: "person.city" })
say((city.answer ?? {}).found === true,
  `личный признак на месте: ${JSON.stringify((city.answer?.items ?? [])[0]?.value)}`)

// 🔒 ЗАБЫВАНИЕ ПО КЛЮЧУ С ГЛУБИНОЙ 2 УБИРАЕТ И ИСТОРИИ ПО ЭТОМУ ЗНАЧЕНИЮ,
// И НАЗЫВАЕТ ИМЕНА, ПО КОТОРЫМ ИСКАЛО.
const deepForget = await call("forget", { key: "person.city", depth: 2 })
say(deepForget.ok === true && Array.isArray(deepForget.links?.anchors) &&
  deepForget.links.anchors.includes("Зеленодольск"),
  `глубина 2 назвала имена поимённо: ${JSON.stringify(deepForget.links?.anchors)}`)

// 🛑 НЕГАТИВНЫЙ КОНТРОЛЬ ОТКАЗА: без ключа и без имён забывать нечего.
const empty = await call("forget", {})
say(empty.ok === false && /не назван/.test(String(empty.hint ?? "")),
  `пустая просьба отвергнута словами: «${empty.hint}»`)

// ── УБОРКА ЗА СОБОЙ: СОСЕДНЯЯ ИСТОРИЯ ТОЖЕ НАША ──────────────────────────
const cleaned = await call("forget", { anchors: [NEIGHBOUR] })
await sql("DELETE FROM fact_person_city WHERE source = ?", [SOURCE])
say((cleaned.links?.deleted ?? 0) > 0, `прибор убрал за собой и вторую историю: ${cleaned.links?.deleted}`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
