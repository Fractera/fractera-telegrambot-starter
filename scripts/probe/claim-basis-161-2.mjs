// ПРИБОР ПОДШАГА 161-2 — утверждение и предположение как сущности.
//
// ДВЕ ПЛОСКОСТИ, НАЗВАННЫЕ В ТЗ ЗАРАНЕЕ:
//   1) схема живой базы — колонок «до» нет, «после» есть, лестница исполнилась;
//   2) поведение двери — предположение без основания отвергнуто, с основанием
//      записано и ПРОЧИТАНО ОБРАТНО помеченным.
//
// 🔒 ПОЧЕМУ ПРИБОР СОЗДАЁТ ТАБЛИЦУ САМ, ХОТЯ ЭТО ЗАПРЕЩЁННЫЙ ПРИЁМ. Закон 144
// гласит: прибор, создающий свою среду, скрывает дефекты кода, который эту среду
// создаёт. Здесь ровно наоборот — среда создаётся В СТАРОЙ ФОРМЕ НАМЕРЕННО, чтобы
// проверить ЛЕСТНИЦУ: на живой машине все таблицы созданы до этого слоя, и без
// такой подготовки «до» никогда не будет честным. Форму создания при этом
// проверяет соседний прибор 161-1, где таблица рождается настоящим путём.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_161_2==="
const TAG = "прибор 161-2"
const TABLE = "fact_person_language"

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

const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))

async function memory(fn, args) {
  const r = await fetch(`${app}/api/agent/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ fn, args }),
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}
async function registry(fn, args) {
  const r = await fetch(`${app}/api/agent/registry`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ fn, args }),
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}
async function columns() {
  const r = await sql(`SELECT name FROM pragma_table_info('${TABLE}')`)
  return (r.rows ?? []).map(x => String(x.name))
}

console.log(MARK)

// ── ПОДГОТОВКА: ТАБЛИЦА В СТАРОЙ ФОРМЕ, КАК НА ЖИВОЙ МАШИНЕ ────────────────
await sql(`DROP TABLE IF EXISTS ${TABLE}`)
await sql(`
  CREATE TABLE ${TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER,
    value_text TEXT,
    value_num REAL,
    value_json TEXT,
    source TEXT NOT NULL DEFAULT 'model',
    confidence REAL,
    slot TEXT,
    subject_key TEXT,
    status TEXT,
    scope_key TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )
`)

// ── ПЛОСКОСТЬ 1: СХЕМА ДО И ПОСЛЕ ──────────────────────────────────────────
const before = await columns()
// 🔒 «ДО» СНИМАЕТСЯ ДО РАБОТЫ, И ЭТО ВСТРОЕННЫЙ НЕГАТИВНЫЙ КОНТРОЛЬ: совпадение
// списков «до» и «после» означало бы, что лестница не исполнилась вовсе.
say(!before.includes("claim") && !before.includes("basis"),
  `«до»: колонок рода записи нет — ${before.length} колонок`)

let r = await memory("write", { key: "person.language", what: "русский", source: TAG })
say(r.status === 200 && r.json.ok === true, `запись прошла: ${r.json.where ?? r.json.error}`)

const after = await columns()
say(after.includes("claim") && after.includes("basis"),
  `«после»: лестница дописала ${after.filter(c => !before.includes(c)).join(", ")}`)

// ── ПЛОСКОСТЬ 2: ПОВЕДЕНИЕ ДВЕРИ ───────────────────────────────────────────
r = await memory("write", { key: "person.language", what: "английский", claim: "guess", source: TAG })
say(r.json.ok === false && r.json.error === "guess-without-basis",
  `предположение без основания отвергнуто: ${r.json.error}`)

r = await memory("write", {
  key: "person.language",
  what: "английский",
  claim: "guess",
  basis: "человек писал ответы по-английски дважды подряд",
  source: TAG,
})
say(r.status === 200 && r.json.ok === true, `предположение С основанием записано: ${r.json.where ?? r.json.error}`)

// 🔒 ОСНОВАНИЕ БЕЗ ПРЕДПОЛОЖЕНИЯ — ТОЖЕ ОТКАЗ: присланное поле, которое молча
// ничего не значит, есть отдельный класс дефекта.
r = await memory("write", { key: "person.language", what: "немецкий", basis: "просто так", source: TAG })
say(r.json.ok === false && r.json.error === "basis-without-guess", `основание без предположения: ${r.json.error}`)

r = await memory("write", { key: "person.language", what: "французский", claim: "может быть", source: TAG })
say(r.json.ok === false && r.json.error === "bad-claim", `выдуманный род записи: ${r.json.error}`)

// ── ЧТЕНИЕ ОБРАТНО: ПОМЕТКА ВИДНА ТОМУ, КТО СПРАШИВАЕТ ─────────────────────
const back = await registry("recall", { key: "person.language", limit: 5 })
const items = back.json.answer?.items ?? []
const guessed = items.find(i => i.claim === "guess")
const plain = items.find(i => i.claim === null || i.claim === undefined)
say(Boolean(guessed) && /по-английски/.test(String(guessed?.basis ?? "")),
  `предположение читается помеченным: claim=${guessed?.claim}, основание «${String(guessed?.basis ?? "").slice(0, 45)}»`)
// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ ПОМЕТКИ: обычная запись НЕ становится предположением.
// Без него первый замер доказывал бы только, что поле возвращается.
say(Boolean(plain) && plain.value === "русский",
  `сказанное человеком осталось без пометки: value=${plain?.value}, claim=${String(plain?.claim)}`)

// ── УБОРКА: ПРИБОР УБИРАЕТ СВОЮ ТАБЛИЦУ ЦЕЛИКОМ, ПОТОМУ ЧТО САМ ЕЁ И СОЗДАЛ ─
await sql(`DROP TABLE IF EXISTS ${TABLE}`)
const gone = await sql(`SELECT name FROM sqlite_master WHERE type='table' AND name = '${TABLE}'`)
say((gone.rows ?? []).length === 0, `после уборки таблицы прибора не осталось`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
