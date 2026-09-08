// ПРИБОР ПОДШАГА 143-4 — закрытие считает условия из ЛЕНТЫ, а не со слов агента.
//
// Сквозной: ходит в живую дверь службы на 3600 и в слой данных.
//
// ГЛАВНЫЙ ЗАМЕР — НЕГАТИВНЫЙ ПО УСТРОЙСТВУ: агент присылает заведомо ложные
// «десять сообщений и три инструмента» при ПУСТОЙ ленте. До 143-4 это меняло
// решение (система верила словам); после — не меняет ничего.
//
// 🛑 ПИШЕТ В ЖИВОЙ СЛОЙ ДАННЫХ И УБИРАЕТ ЗА СОБОЙ.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_143_4==="
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

async function sql(text, params = []) {
  const r = await fetch(`${dataUrl}/db/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ sql: text, params }),
  })
  if (!r.ok) return { ok: false, error: `http-${r.status}` }
  return await r.json()
}

async function close(body) {
  const r = await fetch(`${app}/api/agent/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify(body),
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

const shape = d => (d.decisions ?? []).map(x => `${x.action}:${x.do ? "да" : "нет"}`).join(" ")

console.log(MARK)

// Заводим автоматизацию напрямую: прибор проверяет закрытие, а не сепарацию.
await sql(`INSERT INTO automations (confirm_state) VALUES ('draft')`)
const got = await sql(`SELECT id FROM automations ORDER BY id DESC LIMIT 1`)
const id = Number(got.rows?.[0]?.id ?? 0)
say(id > 0, `автоматизация заведена: №${id}`)

// 1. Пустая лента + ЧЕСТНЫЕ слова агента.
const honest = await close({ automation_id: id, kind: "whole" })
say(honest.status === 200, `честное закрытие: HTTP ${honest.status}`)
const honestShape = shape(honest.json)
console.log(`   решения: ${honestShape}`)

// 2. НЕГАТИВНЫЙ КОНТРОЛЬ: та же пустая лента + ЛОЖЬ агента о своей работе.
const lying = await close({
  automation_id: id, kind: "whole",
  messages: 10, fact_keys: ["a", "b", "c"], tools: ["rag", "map", "web"],
  from_media: true, missing_facts: ["выдуманная нехватка"],
})
const lyingShape = shape(lying.json)
console.log(`   решения при лжи агента: ${lyingShape}`)
say(honestShape === lyingShape && honestShape.length > 0,
  `слова агента решение НЕ меняют — то, ради чего сделан 143-4`)

// 3. ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ: настоящие строки в ленте решение МЕНЯЮТ.
// Без него замер выше доказывал бы только, что список решений постоянен.
const row = (kind, fact, phrase, tool) => sql(
  `INSERT INTO automation_rows (automation_id, kind, fact, payload) VALUES (?, ?, ?, ?)`,
  [id, kind, fact, JSON.stringify({ id: 0, kind, fact, phrase, tool, source: "model", at: new Date().toISOString() })])
await row("intake", null, "сообщение", "separate")
await row("extract", null, "прочитано вложение", "media")
await row("resolve", "money.amount", "сумма 40", "rag")

const real = await close({ automation_id: id, kind: "whole" })
const realShape = shape(real.json)
console.log(`   решения при НАСТОЯЩЕЙ ленте: ${realShape}`)
say(realShape !== honestShape, `настоящие строки решение меняют — источник действительно лента`)

// 4. Причина есть у каждого решения, включая «нет».
const noWhy = (real.json.decisions ?? []).filter(d => !d.why || !d.why.trim()).length
say(noWhy === 0, `решений без причины: ${noWhy} (ждём 0)`)

await sql(`DELETE FROM automation_rows WHERE automation_id = ?`, [id])
await sql(`DELETE FROM automation_states WHERE automation_id = ?`, [id])
await sql(`DELETE FROM automations WHERE id = ?`, [id])
const left = await sql(`SELECT COUNT(*) AS n FROM automations WHERE id = ?`, [id])
say(Number(left.rows?.[0]?.n ?? 1) === 0, `после уборки автоматизаций с этим номером: ${left.rows?.[0]?.n}`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
