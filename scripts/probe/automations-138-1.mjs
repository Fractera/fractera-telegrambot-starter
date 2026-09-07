// ПРИБОР ПОДШАГА 138-1 — счётчик номеров автоматизаций.
//
// Что проверяет: номер выдаёт база, он растёт от единицы и НИКОГДА не
// переиспользуется после удаления. Второе — главное: номер человек произносит
// вслух («отзыв 123»), и второй жизни у него быть не может.
//
// 🛑 ПРИБОР ПИШЕТ В ЖИВОЙ СЛОЙ ДАННЫХ И УБИРАЕТ ЗА СОБОЙ. Он отказывается
// работать, если в таблице уже есть строки: чужие данные не трогаются.
//
// Запуск на сервере:  node scripts/probe/automations-138-1.mjs
import { readFileSync } from "node:fs"

const MARK = "===PROBE_138_1==="

function machineEnv(key) {
  for (const p of [process.env.FRACTERA_MACHINE_ENV || "/etc/fractera/secrets.env"]) {
    try {
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const i = line.indexOf("=")
        if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, "")
      }
    } catch { /* нет файла — законное состояние */ }
  }
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

const TABLE = "automations"
const CREATE = `
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      confirm_state TEXT NOT NULL DEFAULT 'draft',
      first_message_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS ${TABLE}_created ON ${TABLE} (created_at);
    CREATE INDEX IF NOT EXISTS ${TABLE}_confirm ON ${TABLE} (confirm_state, created_at);
  `

console.log(MARK)

const before = await sql(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [TABLE])
console.log(`таблица ДО прогона: ${before.rows?.length ? "есть" : "нет"}`)

await sql(CREATE)
const after = await sql(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [TABLE])
console.log(`таблица ПОСЛЕ создания: ${after.rows?.length ? "есть" : "нет"}`)

const busy = await sql(`SELECT count(*) AS n FROM ${TABLE}`)
const rows = Number(busy.rows?.[0]?.n ?? 0)
if (rows > 0) { console.log(`ОТКАЗ: в таблице уже ${rows} строк — чужие данные не трогаю`); process.exit(3) }

async function insert(tag) {
  await sql(`INSERT INTO ${TABLE} (confirm_state, first_message_id) VALUES (?, ?)`, ["draft", tag])
  const back = await sql(`SELECT last_insert_rowid() AS id`)
  return Number(back.rows?.[0]?.id)
}

const a = await insert("probe-a")
const b = await insert("probe-b")
const c = await insert("probe-c")
console.log(`три вставки подряд: ${a}, ${b}, ${c}`)

// 🔒 УДАЛЯЕТСЯ ПОСЛЕДНЯЯ, А НЕ СРЕДНЯЯ, И ЭТО ЕДИНСТВЕННЫЙ РАЗЛИЧАЮЩИЙ СЛУЧАЙ.
// Удали мы среднюю — обычный `INTEGER PRIMARY KEY` тоже дал бы следующий номер,
// и проверка прошла бы, ничего не проверив.
await sql(`DELETE FROM ${TABLE} WHERE id = ?`, [c])
const d = await insert("probe-d")
console.log(`удалена ПОСЛЕДНЯЯ (${c}), следующая вставка: ${d}`)
console.log(d === c + 1 ? "НОМЕР НЕ ПЕРЕИСПОЛЬЗОВАН — верно" : `НОМЕР ПЕРЕИСПОЛЬЗОВАН (${d}) — ДЕФЕКТ`)

const cols = await sql(`SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`, [TABLE])
console.log(`AUTOINCREMENT в определении: ${/AUTOINCREMENT/i.test(cols.rows?.[0]?.sql ?? "") ? "есть" : "НЕТ"}`)

// Уборка: прибор не оставляет за собой ни строк, ни съеденных номеров.
await sql(`DELETE FROM ${TABLE}`)
await sql(`DELETE FROM sqlite_sequence WHERE name = ?`, [TABLE])
const left = await sql(`SELECT count(*) AS n FROM ${TABLE}`)
const seq = await sql(`SELECT seq FROM sqlite_sequence WHERE name = ?`, [TABLE])
console.log(`после уборки: строк ${Number(left.rows?.[0]?.n ?? -1)}, счётчик ${seq.rows?.length ? seq.rows[0].seq : "сброшен"}`)
console.log(`${MARK}DONE`)
