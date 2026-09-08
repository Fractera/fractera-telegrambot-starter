// ПРИБОР ПОДШАГОВ 160-4 и 160-5 — сторож глубины и запись пачкой.
//
// Проверяет на живой двери: объект глубины 1 проходит · вложенный отвергается с
// причиной · массив отвергается · факт не о человеке отвергается · пачка пишется
// одним вызовом · отказ по одному факту НЕ отменяет остальные.
//
// 🛑 ПИШЕТ В ЖИВОЙ СЛОЙ ДАННЫХ И УБИРАЕТ ЗА СОБОЙ.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_160==="
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
const app = process.env.PROBE_APP_URL || "http://127.0.0.1:3600"
if (!key) { console.log(`${MARK} НЕТ КЛЮЧА СЛОЯ ДАННЫХ`); process.exit(2) }

let bad = 0
const say = (ok, what) => { if (!ok) bad += 1; console.log(`${ok ? "✓" : "✗"} ${what}`) }

async function door(body) {
  const r = await fetch(`${app}/api/agent/registry`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify(body),
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}
const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))

console.log(MARK)

// ── 1. Простое значение проходит, как и прежде ─────────────────────────────
let r = await door({ fn: "remember", args: { key: "person.name", value: "Проба160", source: "прибор" } })
say(r.status === 200 && r.json.ok === true, `простая строка записана: ${r.json.table ?? r.json.error}`)

// ── 2. ВЛОЖЕННЫЙ ОБЪЕКТ ОТВЕРГАЕТСЯ — главный замер сторожа ────────────────
// Это «машина Миши» в чистом виде: атрибут чужой сущности внутри записи о человеке.
r = await door({
  fn: "remember",
  args: { key: "person.important-people", value: { name: "Миша", car: { model: "Honda Civic" } }, source: "прибор" },
})
say(r.json.ok === false && r.json.error === "nested-object",
  `вложенный объект отвергнут: ${r.json.error} — «${String(r.json.hint ?? "").slice(0, 80)}»`)

// ── 3. НЕГАТИВНЫЙ КОНТРОЛЬ СТОРОЖА: плоский объект ПРОХОДИТ ────────────────
// Без него первый замер доказывал бы только, что объекты не принимаются вовсе.
r = await door({
  fn: "remember",
  args: { key: "person.important-people", value: { name: "Рада", role: "дочь", birthYear: 2010 }, source: "прибор" },
})
say(r.status === 200 && r.json.ok === true,
  `плоский объект ПРОШЁЛ: ${r.json.table ?? r.json.error} — сторож отвергает глубину, а не объекты`)

// ── 4. Массив отвергается: список сущностей — не одно значение ─────────────
r = await door({
  fn: "remember",
  args: { key: "person.important-people", value: ["Рада", "Миша"], source: "прибор" },
})
say(r.json.ok === false && r.json.error === "not-an-object",
  `массив отвергнут: ${r.json.error}`)

// ── 5. Пачка: три факта одним вызовом ──────────────────────────────────────
r = await door({
  fn: "remember_many",
  args: {
    facts: [
      { key: "person.city", value: "Проба-город" },
      { key: "person.address-form", value: "на ты" },
      { key: "person.tone", value: "коротко" },
    ],
    source: "прибор 160",
  },
})
say(r.status === 200 && r.json.saved === 3, `пачкой записано: ${r.json.saved} из ${r.json.total}`)

// ── 6. ОТКАЗ ПО ОДНОМУ НЕ ОТМЕНЯЕТ ОСТАЛЬНЫЕ — второй главный замер ────────
r = await door({
  fn: "remember_many",
  args: {
    facts: [
      { key: "person.currency", value: "EUR" },
      { key: "material.text", value: "это не факт о человеке" },
      { key: "person.occupation", value: "Проба-занятие" },
    ],
    source: "прибор 160",
  },
})
const refused = (r.json.results ?? []).filter(x => !x.ok)
say(r.json.saved === 2 && refused.length === 1 && refused[0].error === "not-a-person-fact",
  `из трёх записано 2, отвергнут 1 (${refused[0]?.key}: ${refused[0]?.error}) — остальные не пострадали`)

// ── 7. Пустой список — честный отказ, а не «ок, ноль записей» ──────────────
r = await door({ fn: "remember_many", args: { facts: [] } })
say(r.status === 400 && r.json.error === "no-facts", `пустой список: ${r.status} ${r.json.error}`)

// ── Уборка ─────────────────────────────────────────────────────────────────
for (const t of [
  "fact_person_name", "fact_person_important_people", "fact_person_city",
  "fact_person_address_form", "fact_person_tone", "fact_person_currency", "fact_person_occupation",
]) {
  await sql(`DELETE FROM ${t}`)
}
const left = await sql(`SELECT COUNT(*) AS n FROM fact_person_city`)
say(Number(left.rows?.[0]?.n ?? 1) === 0, `после уборки строк в fact_person_city: ${left.rows?.[0]?.n}`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
