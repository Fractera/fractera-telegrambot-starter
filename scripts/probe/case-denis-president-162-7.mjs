// ПРИБОР ПОДШАГА 162-7 — КЕЙС ВЛАДЕЛЬЦА «ДЕНИС И ПРЕЗИДЕНТ», ЦЕЛИКОМ ЧЕРЕЗ ДВЕРЬ.
//
// 🎯 ВОПРОС ВЛАДЕЛЬЦА 2026-09-08: «Ты можешь мне гарантировать, что кейс с
// Денисом и президентом, а также аналогично ему, будут работать?» Ответ «да» был
// бы обещанием, а обещание проверяется в худший день. Здесь оно стало прибором.
//
// 🔒 ГРАНИЦА ГАРАНТИИ НАЗВАНА ДО ПОСТРОЙКИ И ПРОВЕРЯЕТСЯ ИМЕННО ТАК: мы отвечаем
// за ДОСТАВКУ — имя друга из таблицы и его история из связей обязаны приехать в
// один ответ за один вызов. Мостик «1994–1996 → Борис Ельцин» строит модель, и
// имени Ельцина прибор НЕ требует: требовать его значило бы проверять чужую
// память нашим инструментом и получать красный цвет при исправной работе.
//
// ДВА СЦЕНАРИЯ, И РАЗНИЦА МЕЖДУ НИМИ — ОТВЕТ НА ВОПРОС «МЫ НАШЛИ ИЛИ МОДЕЛЬ
// ДОГАДАЛАСЬ»:
//   1) со словом-подсказкой: «служил в ПРЕЗИДЕНТСКОМ полку» — слово «президент»
//      лежит в наших данных, связь нашлась бы и механикой;
//   2) без подсказки: «служил в Кремле с 1994 по 1996» — слова «президент» в
//      наших данных НЕТ вовсе, и мостик остаётся за моделью.
//
// 🛑 ЧТО ПИШЕТ И УДАЛЯЕТ: одну строку `fact_person_important_people` со своей
// меткой `source` и свои истории в связях (`memory/<якорь>-`). Уборка по метке.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_162_7==="
const SOURCE = "probe-162-7"
const FRIEND = "Денис"
const GHOST = "Аркадий"

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

/** Дождаться, пока наш документ обработан И очередь движка пуста (162-5). */
async function ready(prefix) {
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

console.log(MARK)
await cleanAll()

// ── СЦЕНАРИЙ 1: СО СЛОВОМ-ПОДСКАЗКОЙ ──────────────────────────────────────
await call("write", { key: "person.important-people", what: FRIEND, source: SOURCE })
const friends = await read({ query: "кто такой этот человек" })
say(friends.found === true && JSON.stringify(friends.items ?? []).includes(FRIEND),
  `уровень 1 отдал друга из таблицы: ${JSON.stringify((friends.items ?? []).map(i => i.value))}`)
say(((friends.levels ?? [])[0]?.ms ?? 9999) < 1500,
  `и отдал мгновенно: ${(friends.levels ?? [])[0]?.ms} мс`)

const seeded1 = await call("write", {
  anchors: [FRIEND],
  what: `${FRIEND} служил в президентском полку с 1994 по 1996 год, стоял на Спасской башне`,
})
say(seeded1.ok === true, `история со словом-подсказкой записана: ${seeded1.ok}`)
say(await ready(`memory/${FRIEND}-`), `история проиндексирована, очередь пуста`)

const case1 = await read({ query: QUESTION, depth: 2 })
const text1 = JSON.stringify(case1.items ?? [])
const lvl2 = (case1.levels ?? []).find(l => l.level === 2)
say(text1.includes(FRIEND), `в ответе есть имя друга`)
say(/1994|1996|полк|башн|Кремл/i.test(text1), `в ответе есть его история: ${/1994/.test(text1) ? "годы" : ""}${/полк/i.test(text1) ? " полк" : ""}${/башн/i.test(text1) ? " башня" : ""}`)
// 🛑 СЛЕПОЙ ОБРАЗЕЦ, НАЙДЕННЫЙ ПЕРВЫМ ЖЕ ПРОГОНОМ: /Ден/i совпадало со словом
// «презиДЕНтом» В САМОМ ВОПРОСЕ — проверка «якорь доехал» была зелёной, когда
// якоря не было вовсе. Негативный контроль сам нуждается в негативном контроле.
say(Array.isArray(lvl2?.anchors) && lvl2.anchors.includes(FRIEND),
  `связи спрошены ИМЕНЕМ ДРУГА, взятым с уровня 1: ${JSON.stringify(lvl2?.anchors)}`)
say((case1.items ?? []).some(i => i.claim === "guess" && i.basis),
  `пришедшее из связей помечено предположением с основанием`)
say((case1.items ?? []).some(i => i.about === "self" && i.claim !== "guess"),
  `а факт из таблицы предположением НЕ помечен`)

// ── СЦЕНАРИЙ 2: БЕЗ СЛОВА-ПОДСКАЗКИ ───────────────────────────────────────
//
// 🔒 ЗДЕСЬ СЛОВА «ПРЕЗИДЕНТ» В НАШИХ ДАННЫХ НЕТ ВОВСЕ. Зелёным считается
// доставка: Кремль и годы приезжают вместе с именем. Мостик до Ельцина — работа
// модели, и прибор его не требует.
await cleanAll()
await call("write", { key: "person.important-people", what: FRIEND, source: SOURCE })
const seeded2 = await call("write", {
  anchors: [FRIEND],
  what: `${FRIEND} служил в Кремле с 1994 по 1996 год, покупал спортивное питание и работал почтальоном`,
})
say(seeded2.ok === true, `история без подсказки записана: ${seeded2.ok}`)
say(await ready(`memory/${FRIEND}-`), `вторая история проиндексирована, очередь пуста`)

const case2 = await read({ query: QUESTION, depth: 2 })
const text2 = JSON.stringify(case2.items ?? [])
say(text2.includes(FRIEND), `без подсказки имя друга в ответе есть`)
say(/Кремл/i.test(text2), `и место службы приехало: Кремль`)
say(/1994|1996/.test(text2), `и годы приехали: ${(text2.match(/199[46]/g) ?? []).join(", ")}`)
say(!/президент/i.test(JSON.stringify(seeded2)), `в наших данных слова «президент» нет — мостик остаётся модели`)

// 🔒 ГЛАВНЫЙ НЕГАТИВНЫЙ КОНТРОЛЬ: ВЫДУМАННЫЙ ДРУГ НЕ ПОЛУЧАЕТ ЧУЖОЙ ИСТОРИИ.
// Без него прибор доказывал бы лишь то, что модель умеет говорить связно.
const ghost = await read({ query: `что известно о моём друге по имени ${GHOST}`, depth: 2 })
const ghostText = JSON.stringify(ghost.items ?? [])
say(!/Кремл|1994|полк/i.test(ghostText),
  `выдуманный друг чужой истории НЕ получил: ${ghostText.slice(0, 90)}…`)

// ── УБОРКА ЗА СОБОЙ ───────────────────────────────────────────────────────
await ready(`memory/${FRIEND}-`)
const cleaned = await call("forget", { anchors: [FRIEND] })
await sql("DELETE FROM fact_person_important_people WHERE source = ?", [SOURCE])
say(cleaned.ok === true, `прибор убрал свою историю: ${JSON.stringify(cleaned.links ?? cleaned.hint)}`)
const left = await read({ key: "person.important-people" })
say(left.found === false, `и свой посев в таблице`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
