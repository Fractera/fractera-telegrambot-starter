// ПРИБОР ПОДШАГА 161-1 — ящик памяти: четыре метода, дверь, инструмент у агента.
//
// ДВЕ ПЛОСКОСТИ, НАЗВАННЫЕ В ТЗ ЗАРАНЕЕ:
//   1) протокол MCP — агент ВИДИТ `memory_write` и не видит непостроенных;
//   2) живой граф — история с якорем НАХОДИТСЯ вопросом по имени.
//
// 🛑 ПИШЕТ В ЖИВУЮ ПАМЯТЬ И УБИРАЕТ ЗА СОБОЙ ПО СВОЕЙ МЕТКЕ.
// 🔒 УБОРКА ТОЧЕЧНАЯ, А НЕ `DELETE FROM <таблица>`: в этих таблицах лежит память
// ЖИВОГО человека. Прибор, стирающий таблицу целиком, стирает и её — и выглядит
// это как «памяти никогда не было». Метка `source` делает уборку хирургической.
import { readFileSync } from "node:fs"
import { spawn } from "node:child_process"

const MARK = "===PROBE_161_1==="
const TAG = "прибор 161-1"

function machineEnv(key) {
  try {
    for (const line of readFileSync(process.env.FRACTERA_MACHINE_ENV || "/etc/fractera/secrets.env", "utf8").split("\n")) {
      const i = line.indexOf("=")
      if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, "")
    }
  } catch { /* нет файла — законное состояние на машине разработчика */ }
  return ""
}
const key = process.env.DATA_SECRET || machineEnv("DATA_SECRET") || ""
const dataUrl = process.env.REMOTE_DATA_URL || machineEnv("REMOTE_DATA_URL") || "http://localhost:3300"
const app = process.env.PROBE_APP_URL || "http://127.0.0.1:3600"
if (!key) { console.log(`${MARK} НЕТ КЛЮЧА СЛОЯ ДАННЫХ`); process.exit(2) }

let bad = 0
const say = (ok, what) => { if (!ok) bad += 1; console.log(`${ok ? "✓" : "✗"} ${what}`) }

async function door(body) {
  const r = await fetch(`${app}/api/agent/memory`, {
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

async function ask(question) {
  const r = await fetch(`${dataUrl}/service/rag/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ query: question, mode: "hybrid" }),
  })
  const j = await r.json().catch(() => ({}))
  return String(j.response ?? j.result ?? "")
}

/**
 * Разговор с приёмником инструментов по его собственному протоколу.
 *
 * 🔒 ЭТО И ЕСТЬ ПЛОСКОСТЬ «ГЛАЗАМИ АГЕНТА»: дверь можно позвать `curl`, а
 * инструмент — только так, как его зовёт модель. ✗ ровно этой проверки не было
 * у 160-6, и потому дверь знаний сутки жила без инструмента, а прибор был зелёным.
 */
function mcp(requests) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/agent/intake-preloader.js"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    })
    const out = []
    let buf = ""
    child.stdout.on("data", d => {
      buf += d
      let i = buf.indexOf("\n")
      while (i >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        i = buf.indexOf("\n")
        if (line) { try { out.push(JSON.parse(line)) } catch { /* не наш вывод */ } }
      }
    })
    child.on("close", () => resolve(out))
    for (const r of requests) child.stdin.write(JSON.stringify(r) + "\n")
    // Ответы приходят асинхронно; закрываем вход, дождавшись их.
    setTimeout(() => child.stdin.end(), 4000)
    setTimeout(() => child.kill(), 12_000)
  })
}

console.log(MARK)

// ── ПЛОСКОСТЬ 1: ЧТО ВИДИТ АГЕНТ ───────────────────────────────────────────
const replies = await mcp([
  { id: 1, jsonrpc: "2.0", method: "initialize", params: { protocolVersion: "2024-11-05" } },
  { id: 2, jsonrpc: "2.0", method: "tools/list" },
  { id: 3, jsonrpc: "2.0", method: "tools/call", params: { name: "memory_write", arguments: { what: "x", kluch: "person.city" } } },
])
const listed = replies.find(r => r.id === 2)?.result?.tools ?? []
const names = listed.map(t => t.name)
say(names.includes("memory_write"), `агент ВИДИТ memory_write среди ${names.length} инструментов`)
// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ СОСТОЯНИЯ: непостроенное не показывается вовсе.
say(!names.includes("memory_read") && !names.includes("memory_forget"),
  `непостроенные методы агенту НЕ показаны: ${names.filter(n => n.startsWith("memory_")).join(", ")}`)
const called = replies.find(r => r.id === 3)?.result?.content?.[0]?.text ?? ""
say(/неизвестный параметр/i.test(called), `опечатка в имени параметра отвергнута словами: «${called.slice(0, 80).replace(/\n/g, " ")}»`)

// ── ПЛОСКОСТЬ 2: ЖИВАЯ ДВЕРЬ ───────────────────────────────────────────────
{
  const r = await fetch(`${app}/api/agent/memory`)
  const j = await r.json().catch(() => ({}))
  const live = (j.methods ?? []).filter(m => m.state === "live").length
  say((j.methods ?? []).length === 4 && live === 1, `дверь объявляет 4 метода, построен ${live}`)
}

// «Ещё не построено» и «такого не бывает» — разные ответы.
let r = await door({ fn: "read", args: { query: "что ты знаешь обо мне" } })
say(r.status === 501 && r.json.error === "not-built", `непостроенный метод: ${r.status} ${r.json.error}`)
r = await door({ fn: "vspomni", args: {} })
say(r.status === 400 && r.json.error === "unknown-fn", `выдуманный метод: ${r.status} ${r.json.error}`)

// Факт о человеке — ложится в личную память.
r = await door({ fn: "write", args: { key: "person.occupation", what: "Проба-занятие-161", source: TAG } })
say(r.status === 200 && r.json.ok === true && r.json.where === "personal",
  `факт о человеке лёг в личную память: where=${r.json.where}`)

// Ключ и якоря вместе — отказ, а не выбор за вызывающего.
r = await door({ fn: "write", args: { key: "person.city", what: "Мадрид", anchors: ["Денис"], source: TAG } })
say(r.status === 400 && r.json.error === "both-key-and-anchors", `ключ и якоря вместе: ${r.json.error}`)

// Глубина 2 — отказ, называющий ДОРОГУ.
r = await door({ fn: "write", args: { key: "person.important-people", what: { name: "Миша", car: { model: "Civic" } }, source: TAG } })
say(r.status === 400 && /окружени/i.test(String(r.json.hint ?? "")),
  `глубина 2 отвергнута и названа дорога: «${String(r.json.hint ?? "").slice(0, 90)}»`)

// Ни ключа, ни якорей — отказ С КАНДИДАТАМИ, а не «сделай сам».
r = await door({ fn: "write", args: { what: "я живу в Мадриде", source: TAG } })
say(r.status === 400 && r.json.error === "no-key" && Array.isArray(r.json.candidates) && r.json.candidates.length > 0,
  `без ключа: подсказаны кандидаты ${JSON.stringify(r.json.candidates)}`)

// ── ГЛАВНЫЙ ЗАМЕР: ИСТОРИЯ ОБ ОКРУЖЕНИИ ДОЕЗЖАЕТ ДО ГРАФА ──────────────────
const STORY =
  "Ратмиров держал пасеку под Суздалем с 2003 года и возил мёд на ярмарку в Юрьев-Польский."
r = await door({ fn: "write", args: { what: STORY, anchors: ["Ратмиров"], source: TAG } })
say(r.status === 200 && r.json.ok === true && r.json.where === "surroundings",
  `история с якорем принята: where=${r.json.where}`)

console.log("   ждём построения связей: 45 с")
await new Promise(res => setTimeout(res, 45_000))
const answer = await ask("Что известно о человеке по фамилии Ратмиров?")
say(/ратмиров/i.test(answer) && /(пасек|мёд|мед|ярмарк|суздал)/i.test(answer),
  `вопрос по имени нашёл историю: «${answer.slice(0, 110).replace(/\n/g, " ")}…»`)

// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ: имя, которого не клали, к нашей истории не приводит.
const alien = await ask("Что известно о человеке по фамилии Незабудкин?")
const leaked = /незабудкин.{0,40}(пасек|мёд|мед|ярмарк)/i.test(alien)
say(!leaked, `выдуманное имя не приводит к нашей истории: ${leaked ? "ПРИВОДИТ — образец слеп" : "нет"}`)

// ── УБОРКА ПО СВОЕЙ МЕТКЕ ──────────────────────────────────────────────────
await sql("DELETE FROM fact_person_occupation WHERE source = ?", [TAG])
const left = await sql("SELECT COUNT(*) AS n FROM fact_person_occupation WHERE source = ?", [TAG])
say(Number(left.rows?.[0]?.n ?? 1) === 0, `после уборки своих строк осталось: ${left.rows?.[0]?.n}`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
