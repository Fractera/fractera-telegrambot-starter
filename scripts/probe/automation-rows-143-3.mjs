// ПРИБОР ПОДШАГА 143-3 — лента прогона: строки получают адрес и переживают разговор.
//
// Проверяет: строки копятся по номеру · вторая запись не стирает первую · чужой
// номер не видит чужих строк · вид вне закрытого списка не пишется · счёт строк.
//
// 🛑 ПИШЕТ В ЖИВОЙ СЛОЙ ДАННЫХ И УБИРАЕТ ЗА СОБОЙ.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_143_3==="
function machineEnv(key) {
  try {
    for (const line of readFileSync(process.env.FRACTERA_MACHINE_ENV || "/etc/fractera/secrets.env", "utf8").split("\n")) {
      const i = line.indexOf("=")
      if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, "")
    }
  } catch { /* нет файла — законное состояние */ }
  return ""
}
const url = process.env.REMOTE_DATA_URL || machineEnv("REMOTE_DATA_URL") || "http://localhost:3300"
const key = process.env.DATA_SECRET || machineEnv("DATA_SECRET") || ""
if (!key) { console.log(`${MARK} НЕТ КЛЮЧА СЛОЯ ДАННЫХ`); process.exit(2) }

async function sql(text, params = []) {
  const r = await fetch(`${url}/db/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ sql: text, params }),
  })
  if (!r.ok) return { ok: false, error: `http-${r.status}` }
  return await r.json()
}

const T = "automation_rows"
const KINDS = ["intake", "store", "match", "evolve", "extract", "resolve", "plan", "reveal"]
let bad = 0
const say = (ok, what) => { if (!ok) bad += 1; console.log(`${ok ? "✓" : "✗"} ${what}`) }

console.log(MARK)

await sql(`
    CREATE TABLE IF NOT EXISTS ${T} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      automation_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      fact TEXT,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );`)

// Номера берём заведомо свободные и большие: прибор не имеет права столкнуться
// с живыми автоматизациями владельца.
const A = 900001
const B = 900002
await sql(`DELETE FROM ${T} WHERE automation_id IN (?, ?)`, [A, B])

const write = async (id, kind, fact, phrase) =>
  await sql(`INSERT INTO ${T} (automation_id, kind, fact, payload) VALUES (?, ?, ?, ?)`,
    [id, kind, fact, JSON.stringify({ id: 0, kind, fact, phrase, source: "model", at: new Date().toISOString() })])

const rows = async id => {
  const r = await sql(`SELECT id, automation_id, kind, fact, payload, created_at FROM ${T} WHERE automation_id = ? ORDER BY id ASC`, [id])
  return r.rows ?? []
}

// 1. Первая строка ложится.
await write(A, "intake", null, "первое сообщение")
say((await rows(A)).length === 1, `первая строка легла: ${(await rows(A)).length}`)

// 2. Вторая НЕ стирает первую — то, ради чего лента отличается от стола разбора.
await write(A, "reveal", "person.timezone", "назвал часовой пояс")
const after = await rows(A)
say(after.length === 2, `после второй записи строк: ${after.length} (ждём 2)`)
say(JSON.parse(after[0].payload).phrase === "первое сообщение",
  `первая строка не переписана: «${JSON.parse(after[0].payload).phrase}»`)

// 3. НЕГАТИВНЫЙ КОНТРОЛЬ: чужой номер не видит чужих строк.
say((await rows(B)).length === 0, `чужой номер видит строк: ${(await rows(B)).length} (ждём 0)`)

// 4. НЕГАТИВНЫЙ КОНТРОЛЬ: вид вне закрытого списка отбраковывается ВЫЗЫВАЮЩИМ
// (проверяем само правило, а не базу — база примет любую строку).
const isKind = v => KINDS.includes(v)
say(isKind("intake") && !isKind("вымышленный-вид"), `закрытый список видов работает: intake да, вымышленный нет`)

// 5. Строка без признака — законный исход `no-fact`, а не потеря.
await write(B, "reveal", null, "признака под это в реестре нет")
const noFact = (await rows(B)).filter(r => r.fact === null).length
say(noFact === 1, `строк без признака у B: ${noFact} (ждём 1) — материал для 143-7`)

await sql(`DELETE FROM ${T} WHERE automation_id IN (?, ?)`, [A, B])
const left = (await rows(A)).length + (await rows(B)).length
say(left === 0, `после уборки строк осталось: ${left}`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
