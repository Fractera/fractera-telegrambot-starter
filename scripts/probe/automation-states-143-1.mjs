// ПРИБОР ПОДШАГА 143-1 — состояния автоматизации и явное закрытие двух родов.
//
// Проверяет: переход пишется НОВОЙ строкой; текущее — последняя; закрытие шага и
// закрытие целиком различаются; повтор того же состояния не пишется; молчание
// состояния не меняет.
//
// 🛑 ПИШЕТ В ЖИВОЙ СЛОЙ ДАННЫХ И УБИРАЕТ ЗА СОБОЙ, включая счётчики номеров.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_143_1==="
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

const A = "automations"
const S = "automation_states"

console.log(MARK)

await sql(`
    CREATE TABLE IF NOT EXISTS ${A} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      confirm_state TEXT NOT NULL DEFAULT 'draft',
      first_message_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );`)
await sql(`
    CREATE TABLE IF NOT EXISTS ${S} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      automation_id INTEGER NOT NULL,
      state TEXT NOT NULL,
      closing_kind TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS ${S}_owner ON ${S} (automation_id, id);`)

const busy = await sql(`SELECT count(*) AS n FROM ${A}`)
if (Number(busy.rows?.[0]?.n ?? 0) > 0) { console.log("ОТКАЗ: в таблице автоматизаций есть строки — не трогаю"); process.exit(3) }

await sql(`INSERT INTO ${A} (confirm_state, first_message_id) VALUES ('draft','probe-143-1')`)
const id = Number((await sql(`SELECT last_insert_rowid() AS id`)).rows?.[0]?.id)
console.log(`заведена автоматизация № ${id}`)

async function current(a) {
  const r = await sql(`SELECT state, closing_kind FROM ${S} WHERE automation_id = ? ORDER BY id DESC LIMIT 1`, [a])
  return r.rows?.[0] ?? null
}
async function history(a) {
  const r = await sql(`SELECT id, state, closing_kind FROM ${S} WHERE automation_id = ? ORDER BY id ASC`, [a])
  return r.rows ?? []
}
async function put(a, state, kind) {
  const now = await current(a)
  const nowState = now?.state ?? "open"
  if (nowState === state && state !== "step-closed") return false
  await sql(`INSERT INTO ${S} (automation_id, state, closing_kind) VALUES (?, ?, ?)`, [a, state, kind ?? null])
  return true
}

// 🔒 МОЛЧАНИЕ — НЕ ЗАКРЫТИЕ: переходов нет, состояние обязано читаться как open.
console.log(`без единого перехода текущее: ${(await current(id))?.state ?? "open"}`)

await put(id, "step-closed", "step")
await put(id, "closed", "whole")
const h = await history(id)
console.log(`строк истории: ${h.length} → ${h.map(r => `${r.state}/${r.closing_kind ?? "-"}`).join(" , ")}`)
console.log(`текущее: ${(await current(id))?.state}`)
console.log(`первая строка не переписана: ${h[0]?.state === "step-closed" ? "верно" : "ДЕФЕКТ"}`)

const again = await put(id, "closed", "whole")
const h2 = await history(id)
console.log(`повтор closed записан: ${again ? "ДА — ДЕФЕКТ" : "нет — верно"}; строк ${h2.length}`)

const stepAgain = await put(id, "step-closed", "step")
console.log(`повтор step-closed записан: ${stepAgain ? "да — верно (ступеней много)" : "НЕТ — ДЕФЕКТ"}`)

await sql(`DELETE FROM ${S}`); await sql(`DELETE FROM ${A}`)
await sql(`DELETE FROM sqlite_sequence WHERE name IN (?, ?)`, [A, S])
const left = await sql(`SELECT (SELECT count(*) FROM ${A}) AS a, (SELECT count(*) FROM ${S}) AS s`)
console.log(`после уборки: автоматизаций ${left.rows?.[0]?.a}, переходов ${left.rows?.[0]?.s}`)
console.log(`${MARK}DONE`)
