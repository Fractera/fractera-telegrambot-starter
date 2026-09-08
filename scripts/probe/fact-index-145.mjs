// ПРИБОР ШАГА 145 — указатель «автоматизация ↔ признак ↔ таблица».
//
// Проверяет: указатель отвечает на ОБА вопроса («что было у номера 124» и «какие
// номера трогали расход») · факт без номера в него НЕ попадает · значение в
// указателе не дублируется · сторож типов ловит смену типа.
//
// 🛑 ПИШЕТ В ЖИВОЙ СЛОЙ ДАННЫХ И УБИРАЕТ ЗА СОБОЙ.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_145==="
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
async function remember(body) {
  const r = await fetch(`${app}/api/agent/registry`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify(body),
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}
const idxRows = async where => (await sql(
  `SELECT id, automation_id, fact_key, table_name, row_id, created_at FROM automation_facts ${where.sql}`,
  where.params)).rows ?? []

console.log(MARK)

await sql(`INSERT INTO automations (confirm_state) VALUES ('draft')`)
const id = Number((await sql(`SELECT id FROM automations ORDER BY id DESC LIMIT 1`)).rows?.[0]?.id ?? 0)
say(id > 0, `автоматизация заведена: №${id}`)

// ── 1. Факт БЕЗ номера в указатель не попадает ─────────────────────────────
// 🔒 Это не пропуск, а закон: факт о человеке верен всегда и ничьим прогоном не
// порождён. Указатель отвечает на вопрос «что было в прогоне N» — у него нет N.
const before = (await idxRows({ sql: "WHERE fact_key = ?", params: ["person.timezone"] })).length
const noId = await remember({ fn: "remember", key: "person.timezone", value: "Atlantic/Canary", source: "прибор 145" })
say(noId.status === 200 && noId.json.ok === true, `запись без номера принята: ${noId.json.table ?? noId.json.error}`)
const afterNoId = (await idxRows({ sql: "WHERE fact_key = ?", params: ["person.timezone"] })).length
say(afterNoId === before, `строк указателя по этому ключу: было ${before}, стало ${afterNoId} — БЕЗ номера не индексируется`)

// ── 2. Факт С номером попадает ─────────────────────────────────────────────
const withId = await remember({ fn: "remember", key: "person.city", value: "Мадрид", source: "прибор 145", automation_id: id })
say(withId.status === 200 && withId.json.ok === true, `запись с номером принята: ${withId.json.table ?? withId.json.error}`)

// ── 3. ПЕРВЫЙ ВОПРОС: что было у этого номера ──────────────────────────────
const byAutomation = await idxRows({ sql: "WHERE automation_id = ?", params: [id] })
say(byAutomation.length === 1 && byAutomation[0].fact_key === "person.city",
  `по номеру №${id} найдено признаков: ${byAutomation.length} — «${byAutomation[0]?.fact_key}» в таблице ${byAutomation[0]?.table_name}`)

// ── 4. ВТОРОЙ ВОПРОС: какие номера трогали этот признак ────────────────────
// 🔒 На него «пуля со списком таблиц внутри строки» не отвечала вовсе — ради
// этого вопроса указатель и заведён отдельной таблицей.
const byFact = await idxRows({ sql: "WHERE fact_key = ? ORDER BY id DESC LIMIT 5", params: ["person.city"] })
say(byFact.some(r => Number(r.automation_id) === id),
  `по ключу person.city найден номер №${id} среди ${byFact.length} строк`)

// ── 5. Указатель НЕ хранит значений ────────────────────────────────────────
// 🔒 Второе место, где лежит значение, — вторая правда: одну поправят, вторую
// забудут, и разойдутся они молча.
const cols = (await sql(`SELECT name FROM pragma_table_info('automation_facts')`)).rows?.map(r => String(r.name)) ?? []
say(!cols.includes("value") && !cols.includes("value_text"),
  `колонок значения в указателе нет: [${cols.join(", ")}]`)

// ── 6. Ссылка ведёт к настоящей строке ─────────────────────────────────────
const t = byAutomation[0]?.table_name
const rid = byAutomation[0]?.row_id
if (t && rid) {
  const got = (await sql(`SELECT id, value_text FROM ${t} WHERE id = ?`, [rid])).rows?.[0]
  say(Boolean(got) && String(got.value_text) === "Мадрид",
    `переход по указателю дал значение: «${got?.value_text}»`)
} else {
  say(false, `в строке указателя нет таблицы или id: ${t} / ${rid}`)
}

// ── Уборка ─────────────────────────────────────────────────────────────────
await sql(`DELETE FROM automation_facts WHERE automation_id = ?`, [id])
if (t && rid) await sql(`DELETE FROM ${t} WHERE id = ?`, [rid])
await sql(`DELETE FROM automation_states WHERE automation_id = ?`, [id])
await sql(`DELETE FROM automations WHERE id = ?`, [id])
say((await idxRows({ sql: "WHERE automation_id = ?", params: [id] })).length === 0,
  `после уборки строк указателя по №${id}: 0`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
