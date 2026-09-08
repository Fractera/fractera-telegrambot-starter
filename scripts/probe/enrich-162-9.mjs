// ПРИБОР ПОДШАГА 162-9 — обогащающая запись: блок дообучения после «да» человека.
//
// ДВЕ ПЛОСКОСТИ, НАЗВАННЫЕ В ТЗ ЗАРАНЕЕ:
//   1) подтверждение как условие — глубокий ответ несёт предложение; БЕЗ «да» в
//      связях не появляется ни одного документа `research/`; с «да» появляется
//      ровно один, и в нём есть номер автоматизации и вопрос дословно;
//   2) цена повторного вопроса — после фиксации тот же вопрос отвечается дешевле,
//      и пометка «предположение» доезжает до ответа.
//
// 🛑 ЧТО ПИШЕТ И УДАЛЯЕТ: свой личный факт по метке `source`, свою историю
// (`memory/<якорь>-`) и свой блок дообучения (`research/<якорь>-`). Уборка по
// своим меткам; чужого не касается.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_162_9==="
const SOURCE = "probe-162-9"
// 🔒 СВОЁ ИМЯ, А НЕ ОБЩЕЕ С СОСЕДОМ: прибор 162-7 работает с «Денисом», и два
// прибора на одном якоре мешают друг другу — красный цвет тогда означает не
// дефект, а очередь. Измерено 2026-09-08: 162-7 краснел в пачке и был зелёным в
// одиночку.
const FRIEND = "Кремлёв"

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

async function call(fn, args) {
  const r = await fetch(`${app}/api/agent/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ fn, args }),
  })
  return r.json().catch(() => ({}))
}
const read = async args => (await call("read", args)).answer ?? {}
const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))
const docs = () => fetch(`${dataUrl}/service/rag/documents`, { headers: { "X-Data-Secret": key } })
  .then(r => r.json()).catch(() => ({}))
const countBy = async prefix => {
  const d = await docs()
  let n = 0
  for (const g of Object.values(d.statuses ?? {})) {
    if (Array.isArray(g)) n += g.filter(x => String(x.file_path ?? "").startsWith(prefix)).length
  }
  return n
}
const textOf = async prefix => {
  const d = await docs()
  for (const g of Object.values(d.statuses ?? {})) {
    if (!Array.isArray(g)) continue
    const hit = g.find(x => String(x.file_path ?? "").startsWith(prefix))
    if (hit) return String(hit.content_summary ?? "")
  }
  return ""
}
async function quiet(prefix) {
  for (let i = 0; i < 120; i += 1) {
    const d = await docs()
    const done = (d.statuses?.processed ?? []).some(x => String(x.file_path ?? "").startsWith(prefix))
    const busy = Object.entries(d.statuses ?? {}).some(([st, g]) =>
      st !== "processed" && Array.isArray(g) && g.length > 0)
    if (done && !busy) return true
    await sleep(1000)
  }
  return false
}
const cleanAll = async () => {
  await sql("DELETE FROM fact_person_important_people WHERE source = ?", [SOURCE])
  await call("forget", { anchors: [FRIEND] })
}

const QUESTION = "кто из моих друзей мог быть лично знаком с президентом"
const ANSWER =
  "Денис с высокой степенью вероятности мог быть знаком с Борисом Ельциным: он служил в Кремле " +
  "с 1994 по 1996 год, а Кремль в те годы был официальной резиденцией президента"
const BASIS = "человек сказал о службе в Кремле 1994–1996; кто был президентом в те годы — знание модели"

console.log(MARK)
await cleanAll()

// ── ПОСЕВ: ДРУГ И ЕГО ИСТОРИЯ ─────────────────────────────────────────────
await call("write", { key: "person.important-people", what: FRIEND, source: SOURCE })
await call("write", {
  anchors: [FRIEND],
  what: `${FRIEND} служил в Кремле с 1994 по 1996 год и работал почтальоном`,
})
say(await quiet(`memory/${FRIEND}-`), `история проиндексирована, очередь пуста`)

// ── ПЛОСКОСТЬ 1: ПОДТВЕРЖДЕНИЕ КАК УСЛОВИЕ ───────────────────────────────
const deep = await read({ query: QUESTION, depth: 2 })
say(!!deep.learn && typeof deep.learn.ask === "string" && deep.learn.ask.length > 0,
  `глубокий ответ несёт предложение запомнить: «${deep.learn?.ask}»`)
say(String(deep.learn?.ask ?? "").length < 120,
  `предложение компактное: ${String(deep.learn?.ask ?? "").length} знаков`)
say(deep.learn?.question === QUESTION, `в предложении лежит вопрос дословно`)

// 🔒 БЕЗ «ДА» НЕ ПИШЕТСЯ НИЧЕГО — И ЭТО ПРОВЕРЯЕТСЯ ПОПЫТКОЙ, А НЕ ДОВЕРИЕМ.
const before = await countBy("research/")
const refused = await call("write", {
  research: { anchors: [FRIEND], answer: ANSWER, basis: BASIS, question: QUESTION },
  what: "",
})
say(refused.ok === false && refused.error === "not-confirmed",
  `без подтверждения человека запись отвергнута: «${refused.hint}»`)
say((await countBy("research/")) === before,
  `и в связях не появилось ни одного блока: было ${before}, стало ${await countBy("research/")}`)

// 🔒 С «ДА» — ПИШЕТСЯ, И БЛОК НАЗЫВАЕТ СВОЁ ПРОИСХОЖДЕНИЕ.
const done = await call("write", {
  confirmed: true,
  automation_id: 124,
  research: { anchors: [FRIEND], answer: ANSWER, basis: BASIS, question: QUESTION },
  what: "",
})
say(done.ok === true, `с подтверждением блок записан: ${done.ok === true ? "да" : JSON.stringify(done)}`)
const stored = String(done.stored ?? "")
say(/автоматизации № 124/.test(stored), `блок называет номер автоматизации`)
say(stored.includes(QUESTION), `блок содержит вопрос человека ДОСЛОВНО`)
say(/Основание вывода/.test(stored), `блок называет основание`)
say(/предположение/.test(stored), `блок помечен предположением, а не фактом`)

say(await quiet(`research/${FRIEND}-`), `блок доехал до связей и обработан`)
say((await countBy("research/")) === before + 1,
  `в связях ровно один новый блок: ${await countBy("research/")}`)
// 🛑 ЧИТАЕМ ТО, ЧТО ХРАНИЛИЩЕ ОТДАЁТ, А НЕ ТО, ЧТО МЫ ПОСЛАЛИ: `content_summary`
// у движка — ОБРЕЗАННАЯ выжимка, и номер автоматизации в неё может не попасть.
// ✗ первый прогон краснел на `/124/` внутри выжимки при верно записанном блоке:
// прибор проверял чужой формат отображения, а не наше содержимое.
const inGraph = await textOf(`research/${FRIEND}-`)
say(/глубинное исследование/i.test(inGraph) && inGraph.includes(FRIEND),
  `и в самом хранилище лежит именно он: «${inGraph.slice(0, 80).replace(/\n/g, " ")}…»`)

// ── ПЛОСКОСТЬ 2: ПОВТОРНЫЙ ВОПРОС И ПОМЕТКА ──────────────────────────────
const again = await read({ query: QUESTION, depth: 2 })
const text2 = JSON.stringify(again.items ?? [])
say(/124|Ельцин|резиденц/i.test(text2), `повторный вопрос находит зафиксированное`)
// 🛑 НЕГАТИВНЫЙ КОНТРОЛЬ: ФИКСАЦИЯ НЕ ПРЕВРАЩАЕТ ДОГАДКУ В ФАКТ.
say((again.items ?? []).filter(i => /связ/i.test(String(i.from ?? ""))).every(i => i.claim === "guess"),
  `всё, пришедшее из связей, осталось предположением`)

// ── УБОРКА ЗА СОБОЙ ───────────────────────────────────────────────────────
await quiet(`research/${FRIEND}-`)
const cleaned = await call("forget", { anchors: [FRIEND] })
await sql("DELETE FROM fact_person_important_people WHERE source = ?", [SOURCE])
say((cleaned.links?.deleted ?? 0) > 0, `прибор убрал свои документы: ${cleaned.links?.deleted}`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
