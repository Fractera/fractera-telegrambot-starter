// СКВОЗНОЙ ТЕСТ ПАМЯТИ НА ЖИВОЙ СЛУЖБЕ — ЧЕТЫРЕ АВТОМАТИЗАЦИИ ОТ КОРОТКОЙ К ГЛУБОКОЙ.
//
// 🎯 ЗАДАЧА ВЛАДЕЛЬЦА 2026-09-08: «запусти тестирование, которое будет создавать
// автоматизации с использованием памяти: начни с коротких задач, которые ходят
// только в базу, и закончи глубокими с тремя уровнями; ответ — работает или нет,
// с отчётом по количеству секунд».
//
// 🔒 КАЖДЫЙ СЛУЧАЙ — НАСТОЯЩАЯ АВТОМАТИЗАЦИЯ: заводится через ту же дверь, что и
// сообщение человека, получает номер, читает память и закрывается. Проверяется не
// функция в отрыве, а путь целиком.
// 🛑 УБИРАЕТ ЗА СОБОЙ ПО СВОИМ МЕТКАМ: свои значения признаков и свои документы
// связей. Живой памяти архитектора не касается.
import { readFileSync } from "node:fs"

const MARK = "===E2E_164==="
const SOURCE = "e2e-164"
const WHO = "Тестов"

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
const rows = []
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function door(path, payload) {
  const r = await fetch(`${app}/api/agent/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify(payload),
  })
  return r.json().catch(() => ({}))
}
const memory = (fn, args) => door("memory", { fn, args })
const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))
const docs = () => fetch(`${dataUrl}/service/rag/documents`, { headers: { "X-Data-Secret": key } })
  .then(r => r.json()).catch(() => ({}))

async function quiet(prefix) {
  for (let i = 0; i < 120; i += 1) {
    const d = await docs()
    const done = (d.statuses?.processed ?? []).some(x => String(x.file_path ?? "").startsWith(prefix))
    const busy = Object.entries(d.statuses ?? {}).some(([st, g]) =>
      st !== "processed" && Array.isArray(g) && g.length > 0)
    if (done && !busy) return true
    await sleep(1000)
  }
  return false
}

/** Один случай: заводим автоматизацию, читаем память, закрываем, меряем. */
async function run(name, kind, readArgs, check) {
  const sep = await door("separate", { kind, lang: "ru", message_id: `${SOURCE}-${Date.now()}` })
  const id = sep.automation_id ?? sep.answer?.automation_id ?? null
  const started = Date.now()
  const got = await memory("read", readArgs)
  const ms = Date.now() - started
  const answer = got.answer ?? {}
  const verdict = check(answer)
  if (!verdict.ok) bad += 1
  if (id) await door("close", { automation_id: id, kind: "whole" })
  rows.push({ automation: id ?? "—", details: verdict.what, ms, name, ok: verdict.ok })
  return answer
}

console.log(MARK)

// ── ПОДГОТОВКА: своё, помеченное своей меткой ────────────────────────────
await sql("DELETE FROM fact_person_timezone WHERE source = ?", [SOURCE])
await sql("DELETE FROM fact_person_important_people WHERE source = ?", [SOURCE])
await memory("forget", { anchors: [WHO] })
await memory("write", { key: "person.timezone", what: "Atlantic/Canary", source: SOURCE })
await memory("write", { key: "person.important-people", what: WHO, source: SOURCE })
await memory("write", {
  anchors: [WHO],
  what: `${WHO} служил в Кремле с 1994 по 1996 год и работал почтальоном`,
})
await quiet(`memory/${WHO}-`)

// ── СЛУЧАЙ 1: КОРОТКИЙ ВОПРОС ПО КЛЮЧУ — ТОЛЬКО БАЗА ─────────────────────
await run("1. по ключу, только база", "automation-read", { key: "person.timezone" }, a => ({
  ok: a.found === true && String(JSON.stringify(a.items ?? [])).includes("Canary"),
  what: `значение: ${JSON.stringify((a.items ?? [])[0]?.value)}`,
}))

// ── СЛУЧАЙ 2: ВОПРОС СЛОВАМИ — ТОЖЕ ТОЛЬКО БАЗА ──────────────────────────
await run("2. словами, только база", "automation-read", { query: "кто такой этот человек" }, a => ({
  ok: (a.levels ?? []).length === 1 && a.found === true,
  what: `уровней: ${(a.levels ?? []).length}, значений: ${a.total ?? 0}`,
}))

// ── СЛУЧАЙ 3: ГЛУБИНА 2 — БАЗА ПЛЮС СВЯЗИ ПО ЯКОРЮ ───────────────────────
await run(
  "3. глубина 2, связи по имени",
  "automation-read",
  { query: "что известно о моих друзьях", depth: 2 },
  a => {
    const lvl2 = (a.levels ?? []).find(l => l.level === 2)
    const text = JSON.stringify(a.items ?? [])
    return {
      ok: !!lvl2 && (lvl2.anchors ?? []).includes(WHO) && /Кремл|1994/i.test(text),
      what: `якоря: ${JSON.stringify(lvl2?.anchors)}, история найдена: ${/Кремл/i.test(text)}`,
    }
  },
)

// ── СЛУЧАЙ 4: ГЛУБИНА 3 БЕЗ РАЗРЕШЕНИЯ — ОБЯЗАНА ОТКАЗАТЬ ────────────────
await run(
  "4. глубина 3 без разрешения",
  "automation-read",
  { query: "что известно о моих друзьях", depth: 3 },
  a => {
    const lvl3 = (a.levels ?? []).find(l => l.level === 3)
    return {
      ok: !!lvl3 && lvl3.added === 0 && /согласие человека/.test(String(lvl3.note ?? "")),
      what: `третий уровень не выполнен: ${/согласие/.test(String(lvl3?.note ?? ""))}`,
    }
  },
)

// ── СЛУЧАЙ 5: ГЛУБИНА 3 С РАЗРЕШЕНИЕМ — ВСЕ ТРИ УРОВНЯ ───────────────────
await run(
  "5. глубина 3 с разрешением",
  "automation-read",
  { query: "что известно о моих друзьях", depth: 3, approved: true },
  a => {
    const lv = (a.levels ?? []).map(l => l.level)
    const fromVector = (a.items ?? []).some(i => /вектор/i.test(String(i.from ?? "")))
    return {
      ok: lv.includes(1) && lv.includes(2) && lv.includes(3) && fromVector,
      what: `уровни: ${JSON.stringify(lv)}, вектор ответил: ${fromVector}`,
    }
  },
)

// ── УБОРКА ───────────────────────────────────────────────────────────────
await quiet(`memory/${WHO}-`)
await memory("forget", { anchors: [WHO] })
await sql("DELETE FROM fact_person_timezone WHERE source = ?", [SOURCE])
await sql("DELETE FROM fact_person_important_people WHERE source = ?", [SOURCE])

// ── ОТЧЁТ ────────────────────────────────────────────────────────────────
console.log("")
console.log("СЛУЧАЙ                              АВТОМАТИЗАЦИЯ   СЕКУНД   ИТОГ")
for (const r of rows) {
  const sec = (r.ms / 1000).toFixed(2)
  console.log(
    `${r.name.padEnd(36)}${String(r.automation).padEnd(16)}${sec.padStart(6)}   ${r.ok ? "РАБОТАЕТ" : "НЕ РАБОТАЕТ"}  ${r.details}`,
  )
}
console.log("")
console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
