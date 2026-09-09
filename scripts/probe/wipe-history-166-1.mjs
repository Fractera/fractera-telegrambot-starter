// ОЧИСТКА ВСЕЙ ИСТОРИИ ПЕРЕД СОВМЕСТНЫМ ИСПЫТАНИЕМ (166-1).
//
// 🎯 РЕШЕНИЕ АРХИТЕКТОРА 2026-09-09, ДОСЛОВНО: «очищаем всю историю».
//
// 🛑 ЭТО ЕДИНСТВЕННЫЙ ФАЙЛ В ПРОЕКТЕ, КОТОРОМУ РАЗРЕШЕНО СТИРАТЬ ЖИВЫЕ ДАННЫЕ
// ЧЕЛОВЕКА ЦЕЛИКОМ, И ПОТОМУ ОН НАЗЫВАЕТ СПИСОК ВСЛУХ, А НЕ ДЕЙСТВУЕТ МОЛЧА.
// ✗ оплачено прибором шага 160: он стирал таблицы личной памяти как побочное
// действие проверки, и к вечеру девять таблиц оказались пусты — снаружи это
// неотличимо от «памяти никогда не было». Разница между тем прибором и этим не
// в команде, а в том, что здесь стирание ЕСТЬ ЗАДАЧА, объявленная человеком.
//
// 🔒 ЧТО СТИРАЕТСЯ — И ЭТО ВЕСЬ СПИСОК:
//   · значения личных признаков — все таблицы `fact_*`;
//   · рассказы в связях: `memory/`, `research/`, `correction/`;
//   · автоматизации и их лента, указатель признаков, сроки;
//   · журнал промахов поиска.
// 🔒 ЧТО НЕ ТРОГАЕТСЯ: реестр определений (это не данные, а описание умений),
// настройки, ключи, переписка в самом Telegram.
//
// Запуск: node scripts/probe/wipe-history-166-1.mjs --yes
import { readFileSync } from "node:fs"

const MARK = "===WIPE_166_1==="
if (!process.argv.includes("--yes")) {
  console.log(`${MARK} НЕ ЗАПУЩЕНО: нужен явный --yes. Операция необратима.`)
  process.exit(2)
}

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
if (!key) { console.log(`${MARK} НЕТ КЛЮЧА СЛОЯ ДАННЫХ`); process.exit(2) }

const sleep = ms => new Promise(r => setTimeout(r, ms))
const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))
const docs = () => fetch(`${dataUrl}/service/rag/documents`, { headers: { "X-Data-Secret": key } })
  .then(r => r.json()).catch(() => ({}))

console.log(MARK)

// ── 1. ЗНАЧЕНИЯ ПРИЗНАКОВ ────────────────────────────────────────────────
// 🔒 СПИСОК ТАБЛИЦ БЕРЁТСЯ У БАЗЫ, А НЕ ПЕРЕЧИСЛЯЕТСЯ: рукописный разошёлся бы
// с реестром молча, и признак, заведённый вчера, пережил бы очистку.
const all = await sql("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
const tables = (all.rows ?? []).map(r => String(r.name ?? "")).filter(Boolean)
const factTables = tables.filter(t => t.startsWith("fact_"))
let wiped = 0
for (const t of factTables) {
  const before = await sql(`SELECT COUNT(*) AS n FROM ${t}`)
  const n = Number((before.rows ?? [])[0]?.n ?? 0)
  if (n > 0) { await sql(`DELETE FROM ${t}`); wiped += n }
  console.log(`  ${t}: было ${n}`)
}
console.log(`значений признаков стёрто: ${wiped} в ${factTables.length} таблицах`)

// ── 2. АВТОМАТИЗАЦИИ, ЛЕНТА, УКАЗАТЕЛЬ, СРОКИ, ПРОМАХИ ───────────────────
const work = [
  "automation_rows",
  "automation_facts",
  "automation_states",
  "automations",
  "schedule_entries",
  "registry_search_misses",
]
for (const t of work) {
  if (!tables.includes(t)) { console.log(`  ${t}: таблицы нет — законное состояние`); continue }
  const before = await sql(`SELECT COUNT(*) AS n FROM ${t}`)
  const n = Number((before.rows ?? [])[0]?.n ?? 0)
  if (n > 0) await sql(`DELETE FROM ${t}`)
  console.log(`  ${t}: было ${n}`)
}

// ── 3. РАССКАЗЫ В СВЯЗЯХ ─────────────────────────────────────────────────
// 🛑 УДАЛЕНИЕ В ГРАФЕ ФОНОВОЕ (`deletion_started`), И ПОКА ДВИЖОК ЗАНЯТ, ОНО
// ОТВЕРГАЕТСЯ. Ждать по факту и повторять, а не считать удалённым.
//
// 🛑 И ГЛАВНОЕ, ИЗМЕРЕННОЕ ПЕРВЫМ ЖЕ ПРОГОНОМ 2026-09-09: ЭТА ДВЕРЬ НЕ УМЕЕТ
// УДАЛЯТЬ ВЫБОРОЧНО. Мы передали три имени документов; служба ответила
// «All documents cleared successfully. Deleted 0 files» и очистила ВСЕ
// двенадцать. Для очистки истории целиком это то, что нужно, — но никогда не
// зовите это отсюда, чтобы «убрать за собой»: удаляйте по одному, как
// `memory_forget`. 🔒 Правду сказал ТЕКСТ ответа, а не код HTTP.
const before = await docs()
const ours = Object.values(before.statuses ?? {}).flat()
  .map(x => String(x.file_path ?? ""))
  .filter(f => /^(memory|research|correction)\//.test(f))
console.log(`рассказов в связях: ${ours.length}`)
if (ours.length > 0) {
  const del = await fetch(`${dataUrl}/service/rag/documents`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ file_paths: ours }),
  }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }))
  console.log(`  запрос на удаление: ${JSON.stringify(del).slice(0, 160)}`)
  for (let i = 0; i < 120; i += 1) {
    const d = await docs()
    const left = Object.values(d.statuses ?? {}).flat()
      .map(x => String(x.file_path ?? ""))
      .filter(f => /^(memory|research|correction)\//.test(f))
    if (left.length === 0) { console.log("  связи очищены"); break }
    await sleep(1000)
  }
}

// ── 4. ДОКАЗАТЕЛЬСТВО ПУСТОТЫ ────────────────────────────────────────────
let left = 0
for (const t of factTables.concat(work.filter(w => tables.includes(w)))) {
  const r = await sql(`SELECT COUNT(*) AS n FROM ${t}`)
  left += Number((r.rows ?? [])[0]?.n ?? 0)
}
const d = await docs()
const stillOurs = Object.values(d.statuses ?? {}).flat()
  .map(x => String(x.file_path ?? ""))
  .filter(f => /^(memory|research|correction)\//.test(f))
console.log("")
console.log(`ПОСЛЕ ОЧИСТКИ: строк в таблицах ${left}, наших документов в связях ${stillOurs.length}`)
console.log(`${MARK}DONE`)
console.log(`WIPE_RC=${left === 0 && stillOurs.length === 0 ? 0 : 1}`)
process.exit(left === 0 && stillOurs.length === 0 ? 0 : 1)
