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

/**
 * Вопрос к знанию об окружении.
 *
 * 🔒 РЕЖИМ `local`, А НЕ `hybrid`, И ЭТО ИЗМЕРЕНО, А НЕ ВЫБРАНО ПО ВКУСУ (161-1).
 * Свежий документ, обработанный минуту назад, находится режимами `local` и
 * `naive` и НЕ находится `hybrid`: тот подмешивает обобщения по всему корпусу, а
 * они пересобираются медленнее. Замер 2026-09-08, один и тот же документ в одну
 * минуту: `local` — «Ратмиров держит пасеку», `hybrid` — «недостаточно
 * информации», при том что ССЫЛКА на документ в ответе `hybrid` присутствует.
 * 🛑 ЗНАЧИТ «ССЫЛКА ЕСТЬ» И «ОТВЕТ ЕСТЬ» — РАЗНЫЕ УТВЕРЖДЕНИЯ, и первое проверку
 * не проходит: документ найден поиском и не дошёл до ответа.
 * ✗ ИМЕННО ЭТИМ ОБЪЯСНЯЕТСЯ, ПОЧЕМУ 160-6 БЫЛ ЗЕЛЁНЫМ НА `hybrid` ВЧЕРА: там
 * ждали 45 секунд и попали в тот случай, когда обобщения уже успели.
 */
async function ask(question, mode = "local") {
  const r = await fetch(`${dataUrl}/service/rag/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ query: question, mode }),
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
// 🔒 ЗАМЕР ПЕРЕНАЦЕЛЕН 161-6, И ЭТО НЕ ПОДГОНКА ПОД РЕЗУЛЬТАТ. Здесь стояло
// «непостроенные методы агенту НЕ показаны» — верное утверждение того часа, когда
// построен был один метод из четырёх. Состояние изменилось ЗАКОННО: 161-2…161-5
// построили остальные три. Закон при этом прежний — агент видит только `live`, —
// и проверяется он теперь тем, что видны ровно четыре и ни одного лишнего.
// 🛑 ПРИЗНАК, ПО КОТОРОМУ ТАКОЕ ОТЛИЧАЮТ ОТ ПОДГОНКИ: изменилось УТВЕРЖДЕНИЕ О
// СОСТОЯНИИ, а не правило. Правило, подогнанное под результат, звучало бы как
// «показываем что-нибудь из памяти».
const mem = names.filter(n => n.startsWith("memory_")).sort()
say(mem.length === 4 && mem.join(",") === "memory_forget,memory_mutate,memory_read,memory_write",
  `агенту показаны ровно четыре глагола памяти: ${mem.join(", ")}`)
// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ ЕДИНСТВЕННОГО ПУТИ (161-6): прежние примитивы записи и
// чтения памяти агенту не видны, хотя за дверью живы — их зовут приборы ниже.
const superseded = ["registry_recall", "registry_remember", "registry_remember_many"].filter(n => names.includes(n))
say(superseded.length === 0, `устаревших путей к памяти у агента нет: ${superseded.join(", ") || "ни одного"}`)
const called = replies.find(r => r.id === 3)?.result?.content?.[0]?.text ?? ""
say(/неизвестный параметр/i.test(called), `опечатка в имени параметра отвергнута словами: «${called.slice(0, 80).replace(/\n/g, " ")}»`)

// ── ПЛОСКОСТЬ 2: ЖИВАЯ ДВЕРЬ ───────────────────────────────────────────────
{
  const r = await fetch(`${app}/api/agent/memory`)
  const j = await r.json().catch(() => ({}))
  const live = (j.methods ?? []).filter(m => m.state === "live").length
  // 🔒 ТО ЖЕ ПЕРЕНАЦЕЛИВАНИЕ, ЧТО ВЫШЕ: «построен один» было состоянием часа, а
  // законом было «дверь объявляет договор ЦЕЛИКОМ». Договор — четыре метода.
  say((j.methods ?? []).length === 4 && live === 4, `дверь объявляет 4 метода, построено ${live}`)
}

// 🔒 «ТАКОГО НЕ БЫВАЕТ» ОСТАЁТСЯ ОТДЕЛЬНЫМ ОТВЕТОМ. Проверка на `not-built`
// снята вместе с последним непостроенным методом — утверждать её теперь не о чем;
// сам механизм состояния жив в объявлении и понадобится следующему методу.
let r = await door({ fn: "vspomni", args: {} })
say(r.status === 400 && r.json.error === "unknown-fn", `выдуманный метод: ${r.status} ${r.json.error}`)

// Факт о человеке — ложится в личную память.
r = await door({ fn: "write", args: { key: "person.occupation", what: "Проба-занятие-161", source: TAG } })
say(r.status === 200 && r.json.ok === true && r.json.where === "personal",
  `факт о человеке лёг в личную память: where=${r.json.where}`)

// Ключ и якоря вместе — отказ, а не выбор за вызывающего.
r = await door({ fn: "write", args: { key: "person.city", what: "Мадрид", anchors: ["Денис"], source: TAG } })
// 🪦 ПЕРЕНАЦЕЛЕНО 2026-09-08 ШАГОМ 162-6: ЗАПРЕТ ПЕРЕЕХАЛ НА ГРАНИЦУ. Раньше его
// исполнял ящик (`both-key-and-anchors`), теперь — объявление полем `oneOf`, и
// отказ приходит раньше, с перечислением допустимых родов. Правило то же:
// род записи выбирается ОДИН, и выбирать за вызывающего нельзя.
say(r.status === 400 && /назови ОДНО из|both-key-and-anchors/.test(JSON.stringify(r.json)),
  `ключ и якоря вместе: ${JSON.stringify(r.json.problems ?? r.json.error)}`)

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

// 🔒 НАБЛЮДЕНИЕ, А НЕ ПРОВЕРКА: догонит ли `hybrid`. Утверждать «не находит»
// нельзя — через час найдёт, и прибор станет красным на исправной системе.
const late = await ask("Что известно о человеке по фамилии Ратмиров?", "hybrid")
console.log(`   наблюдение: hybrid ${/пасек|мёд|мед/i.test(late) ? "уже догнал" : "ещё не догнал"}`)

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
