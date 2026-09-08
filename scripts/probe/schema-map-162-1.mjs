// ПРИБОР ПОДШАГА 162-1 — карта схемы и кандидаты по словам человека.
//
// ДВЕ ПЛОСКОСТИ, НАЗВАННЫЕ В ТЗ ЗАРАНЕЕ:
//   1) карта против живой базы — у каждого признака назван адрес, объявленное
//      отличается от существующего;
//   2) кандидаты по словам — вопрос даёт таблицы-кандидаты с причиной совпадения,
//      а бессмысленный набор букв даёт ПУСТО, а не всю базу.
//
// 🔒 ЗОВЁТ ЧЕРЕЗ ДВЕРЬ, А НЕ ФУНКЦИЮ: запрет и жизнь проверяются одним путём.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_162_1==="

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

async function read(args) {
  const r = await fetch(`${app}/api/agent/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ fn: "read", args }),
  })
  const j = await r.json().catch(() => ({}))
  return j.answer ?? {}
}
const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))

console.log(MARK)

// ── ПЛОСКОСТЬ 1: КАРТА ПРОТИВ ЖИВОЙ БАЗЫ ───────────────────────────────────
const tables = new Set(((await sql("SELECT name FROM sqlite_master WHERE type='table'")).rows ?? []).map(r => String(r.name)))
say(tables.size > 20, `в базе таблиц: ${tables.size}`)

// Вопрос про деньги обязан привести к признакам, живущим в ЧУЖИХ таблицах —
// именно их прежнее чтение не видело вовсе.
const money = await read({ query: "сколько я потратил на такси" })
const lookedMoney = money.looked ?? []
const foreign = lookedMoney.filter(l => l.where && l.where !== "адрес хранения не назван" && !l.where.startsWith("fact_") && !l.where.startsWith("значений нет"))
say(lookedMoney.length > 0, `вопрос про деньги дал кандидатов: ${lookedMoney.length}`)
say(foreign.length > 0,
  `среди них признаки из ЧУЖИХ таблиц: ${foreign.map(l => l.key + "→" + l.where).slice(0, 3).join(" · ") || "НЕТ"}`)
// 🔒 Адрес кандидата обязан быть настоящим именем таблицы, а не выдумкой.
const realTable = foreign.every(l => tables.has(l.where))
say(foreign.length === 0 || realTable, `названные таблицы существуют в базе: ${realTable ? "все" : "НЕ ВСЕ"}`)

// ── ПЛОСКОСТЬ 2: КАНДИДАТЫ ПО СЛОВАМ ───────────────────────────────────────
const city = await read({ query: "я живу в мадриде" })
const cityKeys = (city.looked ?? []).map(l => l.key)
say(cityKeys.includes("person.city"), `«я живу в мадриде» → кандидаты: ${cityKeys.slice(0, 4).join(", ")}`)
const withWhy = (city.looked ?? []).find(l => l.key === "person.city")
say(Array.isArray(withWhy?.why) && withWhy.why.length > 0,
  `у кандидата названа ПРИЧИНА совпадения: ${JSON.stringify(withWhy?.why?.slice(0, 2))}`)

// 🔒 ГЛАВНЫЙ НЕГАТИВНЫЙ КОНТРОЛЬ: бессмысленный запрос НЕ тянет всю базу.
// Без него первый замер доказывал бы лишь то, что список непуст всегда.
const nonsense = await read({ query: "щщщ ыыы фывапр" })
say((nonsense.looked ?? []).length === 0,
  `бессмысленный запрос дал кандидатов: ${(nonsense.looked ?? []).length} (ожидалось 0)`)

// 🔒 ВТОРОЙ НЕГАТИВНЫЙ КОНТРОЛЬ: вопрос по ключу карту не строит — там искать
// нечего, ключ уже назван.
const byKey = await read({ key: "person.city" })
say(Array.isArray(byKey.looked) && byKey.looked.length === 0,
  `вопрос по ключу карту не строит: ${JSON.stringify(byKey.looked)}`)

// 🔒 КАРТА ЕСТЬ И ПРИ ПРОМАХЕ — иначе пустой ответ неотличим от «искали не там».
say(Array.isArray(city.looked), `карта возвращается независимо от того, нашлось ли значение`)

// 🔒 ТРЕТИЙ НЕГАТИВНЫЙ КОНТРОЛЬ, ДОБАВЛЕН ПО НАХОДКЕ ПРИ ЗАКРЫТИИ 162-1:
// выдуманный ключ обязан получить «такого признака нет», а не «значений пока
// нет». Второе — уверенное умолчание: спросивший решает, что спросил верно, и
// прекращает искать. Закон 144.
const ghost = await read({ key: "person.nosuchkey_zzz" })
say(/в реестре нет/.test(String(ghost.hint ?? "")),
  `выдуманный ключ: «${ghost.hint}»`)
const realEmpty = await read({ key: "person.occupation" })
say(realEmpty.found === true || /значений/.test(String(realEmpty.hint ?? "")),
  `существующий ключ отвечает иначе: «${realEmpty.hint ?? "нашлось значение"}»`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
