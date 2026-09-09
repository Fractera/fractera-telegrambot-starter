#!/usr/bin/env node
//
// ЧТО СЕЙЧАС ЛЕЖИТ В ХРАНИЛИЩАХ, И УБОРКА СЛЕДОВ ПРИБОРОВ.
//
// 🔒 БЕЗ КЛЮЧА — ТОЛЬКО ЧИТАЕТ. `--clean-probe` убирает следы приборов из ТРЁХ
// хранилищ сразу: таблицы, вектор, граф. Уборка в одном из трёх оставляет
// систему в состоянии хуже исходного — сообщения нет, а его эмбеддинг отвечает.
//
// 🛑 ГРАНИЦА УБОРКИ — МЕТКА, А НЕ ТАБЛИЦА. Удаляется только то, у чего
// `external_id` НЕ начинается с `tg-`: настоящее сообщение из Telegram всегда
// получает `tg-<message_id>` (`intake-preloader.js`, `runIntake`). Всё прочее —
// `intake-<время>` и `probe-171-…` — рождено приборами.
// ✗ ОПЛАЧЕНО ДОРОГО В ШАГЕ 160: прибор стирал таблицы личной памяти ЦЕЛИКОМ —
// то есть живую память владельца, — и снаружи это было неотличимо от «памяти
// никогда не было». Признак, которым такое ловится заранее: спросить у прибора
// не «что он проверяет», а **«что он удаляет и чьё это»**.
//
// 🛑 ЛИЧНУЮ ПАМЯТЬ (`fact_*`) ЭТОТ ПРИБОР НЕ ТРОГАЕТ НИКОГДА. Ни при каких
// ключах: там живут слова человека, и метки прибора у них нет по устройству.

import { readFileSync } from "node:fs"

function envOf(file, key) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const i = line.indexOf("=")
      if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, "")
    }
  } catch { /* нет файла — законное состояние вне сервера */ }
  return ""
}

const MACHINE = process.env.FRACTERA_MACHINE_ENV || "/etc/fractera/secrets.env"
const dataUrl = process.env.REMOTE_DATA_URL || envOf(MACHINE, "REMOTE_DATA_URL") || "http://localhost:3300"
const key = process.env.DATA_SECRET || envOf(MACHINE, "DATA_SECRET") || ""
const RAG_URL = process.env.RAG_URL || "http://127.0.0.1:9621"
// 🛑 КЛЮЧ ГРАФА ЛЕЖИТ НЕ ТАМ, ГДЕ КАЖЕТСЯ. Измерено: `/opt/fractera/rag/.env`
// не существует вовсе; рабочие адреса — окружение слота и панели.
const RAG_KEY =
  process.env.LIGHTRAG_API_KEY ||
  envOf("/opt/fractera/app/.env.local", "LIGHTRAG_API_KEY") ||
  envOf("/opt/fractera/bridges/app/.env.local", "LIGHTRAG_API_KEY")

if (!key) { console.log("НЕТ КЛЮЧА СЛОЯ ДАННЫХ"); process.exit(2) }

async function sql(text, params = []) {
  const r = await fetch(`${dataUrl}/db/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ sql: text, params }),
  })
  if (!r.ok) return { ok: false, error: `http-${r.status}` }
  // 🔒 ЧИТАЕМ ТЕЛО, А НЕ КОД HTTP: слой данных отвечает 200 с {ok:false} на
  // отвергнутый SQL — правка «прошла бы» молча (закон 161).
  return await r.json()
}

const rowsOf = (res) => (res && (res.rows || res.result)) || []

async function one(text, params = []) {
  const res = await sql(text, params)
  if (res.ok === false) return "отказ:" + String(res.error || "?")
  const r = rowsOf(res)[0] || {}
  return r.n ?? 0
}

const PROBE = "WHERE external_id NOT LIKE 'tg-%'"
const clean = process.argv.includes("--clean-probe")

console.log("=".repeat(72))
console.log("СОСТОЯНИЕ ХРАНИЛИЩ — " + new Date().toISOString())
console.log("=".repeat(72))

console.log("")
console.log("── переписка и работа ──")
const real = await one("SELECT COUNT(*) AS n FROM tgdesk_messages WHERE external_id LIKE 'tg-%'")
const junk = await one("SELECT COUNT(*) AS n FROM tgdesk_messages " + PROBE)
console.log("  сообщений НАСТОЯЩИХ (tg-)      " + real + "   ← это трогать нельзя")
console.log("  сообщений от приборов          " + junk)
for (const t of ["automations", "automation_rows", "automation_states", "schedule_entries", "tgdesk_entries", "tgdesk_calendar"]) {
  console.log("  " + t.padEnd(30) + (await one(`SELECT COUNT(*) AS n FROM ${t}`)))
}
console.log("  " + "vectors".padEnd(30) + (await one("SELECT COUNT(*) AS n FROM vectors")))
console.log("  " + "tgdesk_artifacts".padEnd(30) + (await one("SELECT COUNT(*) AS n FROM tgdesk_artifacts")))

console.log("")
console.log("── личная память: НЕ ТРОГАЕТСЯ ЭТИМ ПРИБОРОМ ──")
const facts = rowsOf(await sql("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'fact_%' ORDER BY name"))
let total = 0
for (const { name } of facts) {
  const c = await one(`SELECT COUNT(*) AS n FROM ${name}`)
  if (typeof c === "number") total += c
  if (c) console.log("  " + name.padEnd(30) + c)
}
console.log("  " + "ИТОГО записей".padEnd(30) + total)

console.log("")
console.log("── граф знаний ──")
async function graphDocs() {
  if (!RAG_KEY) return { error: "ключ графа не найден — вывод о графе делать НЕЛЬЗЯ" }
  try {
    const r = await fetch(`${RAG_URL}/documents`, { headers: { "X-API-Key": RAG_KEY } })
    const j = await r.json()
    if (j.detail) return { error: String(j.detail) }
    const out = []
    for (const k of Object.keys(j.statuses || {})) for (const d of j.statuses[k]) out.push(d.id)
    return { ids: out }
  } catch (e) {
    return { error: String(e.message) }
  }
}
let g = await graphDocs()
// 🔒 «НОЛЬ» И «НЕ СПРОСИЛИ» — РАЗНЫЕ УТВЕРЖДЕНИЯ, и путать их нельзя: без ключа
// запрос отвергается, а наивный разбор печатает «документов: 0».
console.log("  " + (g.error ? "🛑 " + g.error : "документов: " + g.ids.length))

if (!clean) {
  console.log("")
  console.log("(только чтение. Уборка следов приборов: --clean-probe)")
  process.exit(0)
}

console.log("")
console.log("=".repeat(72))
console.log("УБОРКА СЛЕДОВ ПРИБОРОВ — по метке, в трёх хранилищах")
console.log("=".repeat(72))

if (real > 0) {
  console.log("🛑 ОСТАНОВЛЕНО: в базе есть " + real + " НАСТОЯЩИХ сообщений.")
  console.log("   Прибор убирает только там, где настоящих нет, — иначе он рискует живыми данными.")
  process.exit(3)
}

const ids = rowsOf(await sql("SELECT id FROM tgdesk_messages " + PROBE)).map((r) => r.id)
console.log("сообщений к удалению: " + ids.length)

// 1. ГРАФ — по одному. 🛑 `DELETE /documents` со списком имён стирает ВСЁ
//    хранилище целиком (измерено ранее, записано в current-steps).
// 🔒 ДВЕРЬ ВЗЯТА У ПАНЕЛИ (`bridges/app/app/api/rag/documents/delete`), А НЕ
// УГАДАНА: `DELETE /documents/delete_document` с телом `{doc_ids:[…]}`.
// ✗ первая редакция звала `DELETE /documents/<id>` — такого маршрута нет, и
// удалилось 0 из 8, а прибор при этом отработал без ошибки.
if (g.ids && g.ids.length) {
  let gone = 0
  for (const id of g.ids) {
    try {
      const r = await fetch(`${RAG_URL}/documents/delete_document`, {
        method: "DELETE",
        headers: { "X-API-Key": RAG_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ doc_ids: [id], delete_file: false }),
      })
      const j = await r.json().catch(() => ({}))
      // Движок отвечает `busy`, пока занят предыдущим удалением: это не отказ,
      // а «повтори позже».
      if (r.ok && !/busy/i.test(JSON.stringify(j))) gone += 1
      else if (/busy/i.test(JSON.stringify(j))) {
        await new Promise((s) => setTimeout(s, 3000))
        const again = await fetch(`${RAG_URL}/documents/delete_document`, {
          method: "DELETE",
          headers: { "X-API-Key": RAG_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ doc_ids: [id], delete_file: false }),
        })
        if (again.ok) gone += 1
      }
    } catch { /* удаление фоновое: отказ здесь не финальный */ }
  }
  console.log("граф: принято к удалению " + gone + " из " + g.ids.length + " (удаление ФОНОВОЕ)")
}

// 2. ВЕКТОР — по ссылке на удаляемые сообщения.
const vres = await sql("DELETE FROM vectors WHERE ref_table = 'tgdesk_messages'")
console.log("вектор: " + JSON.stringify(vres).slice(0, 90))

// 3. МЕДИАТЕКА и сами сообщения.
await sql("DELETE FROM tgdesk_artifacts")
await sql("DELETE FROM tgdesk_messages " + PROBE)
// 🔒 Кандидаты признаков рождены тем же пробным трафиком: строка «greeting»
// набрала показы на приветствиях приборов, а не человека.
await sql("DELETE FROM fact_candidates")

console.log("")
console.log("── ПОСЛЕ УБОРКИ ──")
console.log("  сообщений        " + (await one("SELECT COUNT(*) AS n FROM tgdesk_messages")))
console.log("  векторов         " + (await one("SELECT COUNT(*) AS n FROM vectors")))
console.log("  медиатека        " + (await one("SELECT COUNT(*) AS n FROM tgdesk_artifacts")))
console.log("  кандидатов       " + (await one("SELECT COUNT(*) AS n FROM fact_candidates")))
g = await graphDocs()
console.log("  граф             " + (g.error ? "🛑 " + g.error : g.ids.length + " (фоновое удаление может ещё идти)"))
let live = 0
for (const { name } of facts) { const c = await one(`SELECT COUNT(*) AS n FROM ${name}`); if (typeof c === "number") live += c }
console.log("  личная память    " + live + "   ← прибор её не трогал")
