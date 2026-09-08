// ПРИБОР ПОДШАГА 163-2 — знакомство как конструкция, а не как память модели.
//
// 🎯 ВОПРОС ВЛАДЕЛЬЦА 2026-09-08: «моё первое общение запускает инструкцию
// первого знакомства — или такого нет?» Такого не было. Теперь память сама
// говорит, чего о человеке не знает и что спросить следующим.
//
// ДВЕ ПЛОСКОСТИ, НАЗВАННЫЕ В ТЗ ЗАРАНЕЕ:
//   1) очередь вопросов — при пустой памяти предлагается ПЕРВЫЙ по порядку
//      реестра; как только он назван, предлагается следующий, а не тот же;
//   2) исчезновение — когда названы все признаки знакомства, предложения нет
//      вовсе; и оно не мешает ответу, когда о человеке уже что-то известно.
//
// 🛑 ЧТО ПИШЕТ И УДАЛЯЕТ: значения пяти признаков знакомства со своей меткой
// `source`. Уборка ПО МЕТКЕ — живую память владельца прибор не трогает.
// ✗ прибор шага 160 стирал таблицы целиком и обнулил её всю.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_163_2==="
const SOURCE = "probe-163-2"

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
const read = async args => (await call("read", args)).answer ?? {}
const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))

// Пять признаков знакомства — те, у кого в реестре есть askOrder.
const TABLES = [
  "fact_person_name",
  "fact_person_timezone",
  "fact_person_address_form",
  "fact_person_city",
  "fact_person_language",
]
const clean = async () => {
  for (const t of TABLES) await sql(`DELETE FROM ${t} WHERE source = ?`, [SOURCE])
}

console.log(MARK)
await clean()

// ── ПЛОСКОСТЬ 1: ОЧЕРЕДЬ ВОПРОСОВ ────────────────────────────────────────
const first = await read({})
say(!!first.acquaint, `при пустой памяти предложено знакомство: ${JSON.stringify(first.acquaint ?? null)}`)
say(first.acquaint?.key === "person.name",
  `спрашивается ПЕРВЫЙ по порядку реестра: ${first.acquaint?.key}`)
say(typeof first.acquaint?.ask === "string" && first.acquaint.ask.length > 0 && first.acquaint.ask.length < 90,
  `вопрос готов к произнесению и короток: «${first.acquaint?.ask}»`)
say(typeof first.acquaint?.why === "string" && first.acquaint.why.length > 0,
  `и назвал ПРИЧИНУ: «${first.acquaint?.why}» — вопрос без причины читается как любопытство`)
const leftAtStart = first.acquaint?.left ?? 0
say(leftAtStart >= 5, `названо, сколько осталось: ${leftAtStart}`)

// 🔒 ГЛАВНЫЙ НЕГАТИВНЫЙ КОНТРОЛЬ ОЧЕРЕДИ: НАЗВАННОЕ БОЛЬШЕ НЕ СПРАШИВАЮТ.
// Без него прибор доказывал бы лишь то, что система умеет задать один вопрос.
await call("write", { key: "person.name", what: "Проба-имя-163", source: SOURCE })
const second = await read({})
say(second.acquaint?.key && second.acquaint.key !== "person.name",
  `после ответа спрашивается СЛЕДУЮЩИЙ, а не тот же: ${second.acquaint?.key}`)
say((second.acquaint?.left ?? 99) === leftAtStart - 1,
  `и счёт оставшегося уменьшился: ${leftAtStart} → ${second.acquaint?.left}`)

// ── ПЛОСКОСТЬ 2: ИСЧЕЗНОВЕНИЕ И НЕВМЕШАТЕЛЬСТВО ──────────────────────────
for (const [k, v] of [
  ["person.timezone", "Atlantic/Canary"],
  ["person.address-form", "на ты"],
  ["person.city", "Проба-город-163"],
  ["person.language", "ru"],
]) {
  await call("write", { key: k, what: v, source: SOURCE })
}
const done = await read({})
say(!done.acquaint, `когда названы все пять — предложения НЕТ вовсе: ${JSON.stringify(done.acquaint ?? null)}`)
say(done.found === true, `а сам ответ при этом полон: значений ${done.total}`)

// 🔒 ВТОРОЙ НЕГАТИВНЫЙ КОНТРОЛЬ: ОЧЕРЕДЬ КОНЧАЕТСЯ ДЛЯ ЛЮБОГО ВОПРОСА, А НЕ
// ТОЛЬКО ДЛЯ «ЧТО ТЫ ЗНАЕШЬ ОБО МНЕ».
// 🛑 УТВЕРЖДЕНИЕ ЗДЕСЬ ИМЕННО ТАКОЕ, А НЕ «НА ВОПРОС С ОТВЕТОМ ЗНАКОМСТВА НЕТ»:
// второе было бы верно случайно — по тому, что в этот момент известно всё.
// Предложение привязано к НЕЗАПОЛНЕННОСТИ очереди, а не к роду вопроса.
const byKey = await read({ key: "person.city" })
say(byKey.found === true && !byKey.acquaint,
  `очередь пуста — предложения нет и на вопрос по ключу`)

await clean()
const back = await read({})
say(!!back.acquaint && back.acquaint.key === "person.name",
  `после уборки очередь начинается сначала: ${back.acquaint?.key}`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
