// ПРИБОР ПОДШАГА 160-6 — якорь у записей графа.
//
// Главный замер: документ, положенный С ЯКОРЕМ, НАХОДИТСЯ вопросом по имени
// сущности. Именно это делает якорь якорем — не поле в запросе, а достижимость.
//
// 🛑 ПИШЕТ В ЖИВОЙ ГРАФ. Убрать документ из LightRAG сложнее, чем строку из базы,
// поэтому имена взяты заведомо небывалые: `Пробосьев`, и это названо, а не скрыто.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_160_6==="
function machineEnv(key) {
  try {
    for (const line of readFileSync(process.env.FRACTERA_MACHINE_ENV || "/etc/fractera/secrets.env", "utf8").split("\n")) {
      const i = line.indexOf("=")
      if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, "")
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

async function door(body) {
  const r = await fetch(`${app}/api/agent/knowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify(body),
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}
async function ask(question) {
  const r = await fetch(`${dataUrl}/service/rag/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ query: question, mode: "hybrid" }),
  })
  const j = await r.json().catch(() => ({}))
  return String(j.response ?? j.result ?? "")
}

console.log(MARK)

// ── 1. Без якоря — отказ, а не тихое принятие ──────────────────────────────
let r = await door({ text: "Пробосьев служил в оркестре с 1994 по 1996 год." })
say(r.status === 400 && r.json.error === "no-anchor",
  `без якоря: ${r.status} ${r.json.error} — «${String(r.json.hint ?? "").slice(0, 70)}»`)

// ── 2. Пустой текст — тоже отказ ───────────────────────────────────────────
r = await door({ text: "   ", anchors: ["Пробосьев"] })
say(r.status === 400 && r.json.error === "empty-text", `пустой текст: ${r.status} ${r.json.error}`)

// ── 3. Без секрета — 401 ───────────────────────────────────────────────────
{
  const bare = await fetch(`${app}/api/agent/knowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": "deliberately-wrong" },
    body: JSON.stringify({ text: "x", anchors: ["y"] }),
  })
  say(bare.status === 401, `без секрета: ${bare.status}`)
}

// ── 4. С якорем — принято, и неизвестное имя названо ───────────────────────
const STORY =
  "Пробосьев играл на трубе в духовом оркестре города Зеленодольска с 1994 по 1996 год " +
  "и участвовал в первомайских парадах."
r = await door({
  text: STORY,
  anchors: ["Пробосьев"],
  source: "probe-160-6",
  origin: "прибор подшага 160-6",
})
say(r.status === 200 && r.json.ok === true, `с якорем принято: ${r.json.ok ? "да" : r.json.error}`)
say(Array.isArray(r.json.unknownAnchors) && r.json.unknownAnchors.includes("Пробосьев"),
  `неизвестный якорь НАЗВАН, а не проглочен: ${JSON.stringify(r.json.unknownAnchors)}`)

// ── 5. ГЛАВНЫЙ ЗАМЕР: находится вопросом ПО ИМЕНИ ──────────────────────────
// 🔒 Граф строится в фоне; ждём и спрашиваем. Ожидание названо, а не спрятано.
console.log("   ждём построения графа: 45 с")
await new Promise(res => setTimeout(res, 45_000))

const answer = await ask("Что известно о человеке по фамилии Пробосьев?")
const found = /пробосьев/i.test(answer) && /(оркестр|труб|парад)/i.test(answer)
say(found, `вопрос по имени нашёл историю: «${answer.slice(0, 110).replace(/\n/g, " ")}…»`)

// ── 6. НЕГАТИВНЫЙ КОНТРОЛЬ: имя, которого не клали, не находится ───────────
const alien = await ask("Что известно о человеке по фамилии Небывалов?")
const leaked = /небывалов.{0,40}(оркестр|труб|парад)/i.test(alien)
say(!leaked, `выдуманное имя не приводит к нашей истории: ${leaked ? "ПРИВОДИТ — образец слеп" : "нет"}`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
