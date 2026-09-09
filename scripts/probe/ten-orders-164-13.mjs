// ПРИБОР ПОДШАГОВ 164-12/164-13 — ДЕСЯТЬ ЗАДАЧ НА ДЕСЯТИ РАЗНЫХ ПОРЯДКАХ.
//
// 🎯 СЛОВО ВЛАДЕЛЬЦА 2026-09-09: «не то чтобы сложнее, но разнообразие на разных
// порядках; вынести условия каждой задачи на разные порядки, повторить
// тестирование».
//
// 🔒 ЧЕМ ЭТОТ ПРИБОР ОТЛИЧАЕТСЯ ОТ 164-7, И ЭТО ГЛАВНОЕ. Там у всех десяти задач
// был ОДИН вердикт — «нашёл». Такой прибор проверяет одну способность, как бы ни
// различались сюжеты, и подогнать его под успех легко: достаточно строить задачи
// той формы, которая уже проходит. Здесь у каждой задачи вердикт СВОЙ: где-то
// правильно «нашёл», где-то правильно «НЕ нашёл», где-то правильно «спросил
// человека», а где-то правильный ответ — что выразить задачу нечем.
//
// 🛑 ДВА ПОРЯДКА ПРОВЕРЯЮТСЯ НЕ ПРОГОНОМ, А ПОВЕРХНОСТЬЮ ДВЕРИ (7 и 9): если
// параметра нет в объявлении, задача не «не прошла» — она НЕ ВЫРАЗИМА, и это
// другой результат, который нельзя смешивать с отказом.
//
// 🛑 ЧТО ПИШЕТ И ЧЬЁ ЭТО: живые личные таблицы владельца, метка `probe-164-12`.
// Уборка по метке И по выдуманным значениям города — потому что `memory_mutate`
// пишет свой источник («человек поправил: …») и метку прибора НЕ несёт.
//
// Запуск:  node scripts/probe/ten-orders-164-13.mjs        — прогон и уборка
//          node scripts/probe/ten-orders-164-13.mjs keep   — прогон без уборки
//          node scripts/probe/ten-orders-164-13.mjs clean  — только уборка
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const MARK = "===PROBE_164_13==="
const MODE = process.argv[2] ?? "run"
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "../..")
const corpus = JSON.parse(readFileSync(join(root, "development-docs/instruments/164-12-ten-orders.json"), "utf8"))
const decl = readFileSync(join(root, "lib/memory/decl.mjs"), "utf8")
const SOURCE = corpus.source

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

const rows = []
const sleep = ms => new Promise(r => setTimeout(r, ms))
const call = (fn, args) => fetch(`${app}/api/agent/memory`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ fn, args }),
}).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }))
const read = async args => (await call("read", args)).answer ?? {}
const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))
const docs = () => fetch(`${dataUrl}/service/rag/documents`, { headers: { "X-Data-Secret": key } })
  .then(r => r.json()).catch(() => ({}))

const tableOf = k => `fact_${k.replace(/[.-]/g, "_")}`
const valuesOf = a => JSON.stringify((a.items ?? []).map(i => i.value ?? i.text ?? ""))
const has = (text, roots) => roots.filter(r => text.toLowerCase().includes(r.toLowerCase()))
/** Все приметы всех историй корпуса — ими ловится ложная находка. */
const allTraces = corpus.orders.flatMap(o => o.traces ?? [])
  .concat(["Урумчи", "Алматы", "Подольск", "стояк", "упрощ"])

async function clean() {
  for (const a of corpus.cleanup.anchors) await call("forget", { anchors: [a] })
  for (const k of corpus.cleanup.byMark) await sql(`DELETE FROM ${tableOf(k)} WHERE source = ?`, [SOURCE])
  for (const [k, vals] of Object.entries(corpus.cleanup.byValue)) {
    for (const v of vals) await sql(`DELETE FROM ${tableOf(k)} WHERE value_text = ?`, [v])
  }
  const left = []
  for (const k of corpus.cleanup.byMark) {
    const r = await sql(`SELECT COUNT(*) AS n FROM ${tableOf(k)}`, [])
    left.push(`${tableOf(k)}=${Number((r.rows ?? [])[0]?.n ?? -1)}`)
  }
  return left.join(", ")
}

if (MODE === "clean") {
  console.log(MARK)
  console.log(`уборка: ${await clean()}`)
  console.log(`${MARK}DONE`)
  process.exit(0)
}

/** Дождаться, пока названные документы обработаны и очередь пуста. */
async function ready(prefixes) {
  for (let i = 0; i < 240; i += 1) {
    const d = await docs()
    const processed = (d.statuses?.processed ?? []).map(x => String(x.file_path ?? ""))
    const done = prefixes.every(p => processed.some(f => f.startsWith(p)))
    const busy = Object.entries(d.statuses ?? {}).some(([st, g]) =>
      st !== "processed" && Array.isArray(g) && g.length > 0)
    if (done && !busy) return true
    await sleep(1000)
  }
  return false
}

console.log(MARK)
console.log(`корпус: ${corpus.orders.length} задач на ${corpus.orders.length} разных порядках, метка «${SOURCE}»`)

// ── ПОСЕВ ─────────────────────────────────────────────────────────────────
await clean()
const prefixes = []
for (const o of corpus.orders) {
  for (const s of o.seed ?? []) {
    if (s.kind === "fact") await call("write", { key: s.key, what: s.what, source: SOURCE })
    else { await call("write", { anchors: s.anchors, what: s.what, source: SOURCE }); prefixes.push(`memory/${s.anchors[0]}-`) }
  }
  if (o.mutate) await call("mutate", o.mutate)
}
const indexed = await ready(prefixes)
console.log(`посев: ${prefixes.length} историй, проиндексированы: ${indexed ? "да" : "НЕТ"}`)
console.log("")

const put = (order, name, ok, note, ms) =>
  rows.push({ ms: ms == null ? "—" : (ms / 1000).toFixed(2), name, note, ok, order })

// ── ПОРЯДОК 1: ОТВЕТ ЦЕЛИКОМ НА ПЕРВОМ УРОВНЕ ─────────────────────────────
// 🔒 ЭТО ПРОВЕРКА ГЛАВНОГО ЗАКОНА ВЛАДЕЛЬЦА, КОТОРОЙ В КОРПУСЕ 164-6 НЕ БЫЛО НИ
// ОДНОЙ: «возвращать необходимое количество информации запросом с первого уровня».
{
  const o = corpus.orders[0]
  const t = Date.now()
  const a = await read({ query: o.question, depth: 1, limit: 20 })
  const ms = Date.now() - t
  const levels = (a.levels ?? []).map(l => l.level)
  const ok = a.found === true && valuesOf(a).includes("EUR") && levels.join(",") === "1"
  put(1, o.name, ok, `found=${a.found}, уровни ${levels.join(",") || "—"}, значение ${valuesOf(a).slice(0, 40)}`, ms)
}

// ── ПОРЯДОК 2: ИМЯ ИЗ ТАБЛИЦЫ СТАЛО ЯКОРЕМ СВЯЗЕЙ ─────────────────────────
{
  const o = corpus.orders[1]
  const t = Date.now()
  const a = await read({ query: o.question, depth: 2, limit: 50 })
  const ms = Date.now() - t
  const text = valuesOf(a)
  const anchors = ((a.levels ?? []).find(l => l.level === 2)?.anchors) ?? []
  const byName = anchors.includes(o.entity)
  const came = has(text, o.traces)
  put(2, o.name, byName && came.length > 0,
    `якорь ${byName ? "имя" : "НЕ имя: " + JSON.stringify(anchors.slice(0, 3))}, приметы ${came.join(" ") || "—"}`, ms)
}

// ── ПОРЯДОК 3: НАХОДКА ПО СМЫСЛУ, ИМЕНИ В ВОПРОСЕ НЕТ ─────────────────────
{
  const o = corpus.orders[2]
  const t = Date.now()
  let a = await read({ query: o.question, depth: 2, limit: 50 })
  let deep = false
  if (has(valuesOf(a), o.traces).length === 0) {
    a = await read({ query: o.question, depth: 3, approved: true, limit: 50 })
    deep = true
  }
  const ms = Date.now() - t
  const came = has(valuesOf(a), o.traces)
  put(3, o.name, came.length > 0, `приметы ${came.join(" ") || "—"}${deep ? ", понадобился третий уровень" : ""}`, ms)
}

// ── ПОРЯДОК 4: ОТВЕТ ЕСТЬ ТОЛЬКО КАК ПЕРЕСЕЧЕНИЕ ДВУХ СУЩНОСТЕЙ ───────────
{
  const o = corpus.orders[3]
  const t = Date.now()
  let a = await read({ query: o.question, depth: 2, limit: 50 })
  let text = valuesOf(a)
  if (!(text.includes("Тимур") && text.includes("Сорока"))) {
    a = await read({ query: o.question, depth: 3, approved: true, limit: 50 })
    text = valuesOf(a)
  }
  const ms = Date.now() - t
  const both = text.includes("Тимур") && text.includes("Сорока")
  put(4, o.name, both,
    `человек ${text.includes("Тимур") ? "есть" : "НЕТ"}, проект ${text.includes("Сорока") ? "есть" : "НЕТ"}`, ms)
}

// ── ПОРЯДОК 5: ПРАВИЛЬНЫЙ ОТВЕТ — «НИКОГО НЕТ» ───────────────────────────
// 🔒 ЗДЕСЬ ЗЕЛЁНОЕ ОЗНАЧАЕТ «НЕ НАШЁЛ», И ЭТО НЕ ИГРА СЛОВ: система, которая
// на любой вопрос отвечает похожим, не умеет сказать «таких у тебя нет».
{
  const o = corpus.orders[4]
  const t = Date.now()
  const a = await read({ query: o.question, depth: 2, limit: 50 })
  const ms = Date.now() - t
  const leaked = has(valuesOf(a), allTraces)
  put(5, o.name, leaked.length === 0,
    leaked.length === 0 ? "чужих примет нет" : `притянуло чужое: ${JSON.stringify(leaked.slice(0, 6))}`, ms)
}

// ── ПОРЯДОК 6: СВЕЖЕЕ ПЕРВЫМ, ПРЕЖНЕЕ ИСТОРИЕЙ ───────────────────────────
{
  const o = corpus.orders[5]
  const t = Date.now()
  const a = await read({ key: "person.city", limit: 10 })
  const ms = Date.now() - t
  const vals = (a.items ?? []).map(i => String(i.value ?? ""))
  const iNew = vals.indexOf("Кадарин")
  const iOld = vals.indexOf("Пальмироль")
  const ok = iNew === 0 && (iOld === -1 || iOld > iNew)
  put(6, o.name, ok, `порядок значений: ${JSON.stringify(vals)}`, ms)
}

// ── ПОРЯДОК 7: ОХВАТ — ПРОВЕРКА ПОВЕРХНОСТИ ДВЕРИ, А НЕ ПРОГОН ────────────
// 🔒 ЕСЛИ ПАРАМЕТРА НЕТ В ОБЪЯВЛЕНИИ, ЗАДАЧА НЕ «НЕ ПРОШЛА» — ОНА НЕ ВЫРАЗИМА.
// Смешивать эти два исхода нельзя: первый чинится кодом, второй — договором.
{
  const hasScope = /name: "scope"/.test(decl)
  put(7, corpus.orders[6].name, hasScope,
    hasScope ? "параметр `scope` у двери есть" : "НЕ ВЫРАЗИМО: `scope` в объявлении ящика отсутствует, а в слое хранения колонка есть", null)
}

// ── ПОРЯДОК 8: НЕ ХВАТАЕТ СВЕДЕНИЯ — НУЖЕН ЧЕЛОВЕК ───────────────────────
// 🔒 ЭТО ТОТ САМЫЙ «ЗАПРОС К АРХИТЕКТОРУ», РАДИ КОТОРОГО ВСЁ И ЗАТЕВАЛОСЬ:
// правильный ответ здесь — не находка, а ВОПРОС с названной причиной.
{
  const o = corpus.orders[7]
  const t = Date.now()
  const a = await read({ query: o.question, depth: 1, limit: 20 })
  const ms = Date.now() - t
  const missing = (a.missing ?? []).map(m => m.key)
  const acquaint = a.acquaint ?? null
  const namesTz = missing.includes("person.timezone") || acquaint?.key === "person.timezone"
  const hasPhrase = Boolean(acquaint?.ask || acquaint?.question)
  const hasWhy = Boolean(acquaint?.why || (a.missing ?? []).some(m => m.why))
  put(8, o.name, namesTz && hasPhrase && hasWhy,
    `назван пояс: ${namesTz}; готовая фраза: ${hasPhrase ? JSON.stringify(String(acquaint.ask ?? acquaint.question).slice(0, 50)) : "НЕТ"}; причина: ${hasWhy}`, ms)
}

// ── ПОРЯДОК 9: ФАКТ О ТРЕТЬЕМ ЛИЦЕ — ПРОВЕРКА ПОВЕРХНОСТИ ────────────────
{
  const writeBlock = decl.slice(decl.indexOf('name: "memory_write"'), decl.indexOf('name: "memory_read"'))
  const hasSubject = /SUBJECT_PARAM|name: "subject"/.test(writeBlock)
  put(9, corpus.orders[8].name, hasSubject,
    hasSubject ? "параметр `subject` у записи есть" : "НЕ ВЫРАЗИМО: у `memory_write` нет `subject`; ящик пишет subject: \"self\" жёстко и отказывает признаку второго порядка", null)
}

// ── ПОРЯДОК 10: ЭТО ЗНАЕТ МИР, А НЕ ПАМЯТЬ ──────────────────────────────
{
  const o = corpus.orders[9]
  const t = Date.now()
  const a = await read({ query: o.question, depth: 2, limit: 50 })
  const ms = Date.now() - t
  const leaked = has(valuesOf(a), allTraces)
  put(10, o.name, leaked.length === 0,
    leaked.length === 0 ? "память ничего не выдумала" : `выдала своё за ответ: ${JSON.stringify(leaked.slice(0, 6))}`, ms)
}

// ── ТАБЛИЦА ──────────────────────────────────────────────────────────────
console.log("ПОР  ВЕРДИКТ  СЕК    ЧТО ЛЕЖИТ В ОСНОВЕ ЗАДАЧИ")
for (const r of rows) {
  console.log(
    String(r.order).padEnd(5) +
    (r.ok ? "  ДА   " : "  НЕТ  ").padEnd(9) +
    String(r.ms).padEnd(7) +
    r.name)
  console.log(" ".repeat(21) + r.note)
}
const ok = rows.filter(r => r.ok).length
console.log("")
console.log(`ИТОГ: ${ok} из ${rows.length} порядков пройдено`)

if (MODE !== "keep") console.log(`уборка: ${await clean()}`)
else console.log("корпус ОСТАВЛЕН (keep) — снять: … ten-orders-164-13.mjs clean")

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${ok === rows.length ? 0 : 1}`)
process.exit(ok === rows.length ? 0 : 1)
