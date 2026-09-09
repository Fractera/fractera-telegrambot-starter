// ПРИБОР ПОДШАГА 164-7 — ДЕСЯТЬ ВОПРОСОВ, ОТВЕТ НА КОТОРЫЕ НЕЛЬЗЯ ИЗВЛЕЧЬ ИЗ
// НАШИХ ДАННЫХ. РЕЗУЛЬТАТ ПО КАЖДОМУ: НАШЁЛ ИЛИ НЕТ.
//
// 🎯 СЛОВО ВЛАДЕЛЬЦА 2026-09-09: «проведи тесты, в каждом из которых невозможно
// извлечь ответ просто так, и дай результат — нашёл или нет».
//
// 🔒 ЧТО ЗДЕСЬ СЧИТАЕТСЯ «НАШЁЛ», И ПОЧЕМУ ИМЕННО ЭТО. Граница гарантии названа
// в 164-5 (признак П5): мы отвечаем за ДОСТАВКУ — имя сущности с уровня 1 и
// приметы её истории с уровня 2 обязаны приехать В ОДИН ОТВЕТ ЗА ОДИН ВЫЗОВ.
// Мостик «Урумчи → Китай» строит модель, и прибор его НЕ требует: требовать
// значило бы проверять чужую память нашим инструментом и получать красный цвет
// при исправной работе.
//
// 🔒 РЯДОМ С ВЕРДИКТОМ ПЕЧАТАЕТСЯ ТОЧНОСТЬ, И БЕЗ НЕЁ ВЕРДИКТ ЛЖИВ. Личная
// таблица отдаёт ВСЕ восемь знакомых на любой вопрос «кто из знакомых…», и
// доставка сама по себе стала бы зелёной всегда. Поэтому в строке стоит, сколько
// посторонних сущностей приехало вместе с нужной: это и есть измерение шума на
// уровне 2, названного долгом шага 162.
//
// 🛑 УБОРКА — ПО СВОЕЙ МЕТКЕ, И ТОЛЬКО ПО НЕЙ (решение владельца 2026-09-09:
// «убрать по своей метке»). `DELETE FROM fact_person_*` без условия стёр бы живую
// память владельца: оплачено прибором шага 160, после которого все девять таблиц
// оказались пусты, и снаружи это неотличимо от «памяти никогда не было».
//
// Запуск:  node scripts/probe/ten-hidden-answers-164-7.mjs         — прогон и уборка
//          node scripts/probe/ten-hidden-answers-164-7.mjs keep    — прогон без уборки
//          node scripts/probe/ten-hidden-answers-164-7.mjs clean   — только уборка
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const MARK = "===PROBE_164_7==="
const MODE = process.argv[2] ?? "run"
const here = dirname(fileURLToPath(import.meta.url))
const corpus = JSON.parse(readFileSync(join(here, "../../development-docs/instruments/164-6-ten-stories.json"), "utf8"))
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

let bad = 0
const say = (ok, what) => { if (!ok) bad += 1; console.log(`${ok ? "✓" : "✗"} ${what}`) }

const call = (fn, args) => fetch(`${app}/api/agent/memory`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ fn, args }),
}).then(r => r.json()).catch(() => ({}))
const read = async args => (await call("read", args)).answer ?? {}
const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))

const tableOf = k => `fact_${k.replace(/[.-]/g, "_")}`

/** Уборка по своей метке: сначала истории в связях, потом строки в таблицах. */
async function clean() {
  for (const c of corpus.cases) await call("forget", { anchors: [c.entity] })
  for (const k of [...new Set(corpus.cases.map(c => c.key))]) {
    await sql(`DELETE FROM ${tableOf(k)} WHERE source = ?`, [SOURCE])
  }
  const left = []
  for (const k of [...new Set(corpus.cases.map(c => c.key))]) {
    const r = await sql(`SELECT COUNT(*) AS n FROM ${tableOf(k)} WHERE source = ?`, [SOURCE])
    left.push(`${tableOf(k)}=${Number((r.rows ?? [])[0]?.n ?? -1)}`)
  }
  return left.join(", ")
}

if (MODE === "clean") {
  console.log(MARK)
  console.log(`уборка по метке «${SOURCE}»: ${await clean()}`)
  console.log(`${MARK}DONE`)
  process.exit(0)
}

// 🔒 ПРИМЕТА, ПО КОТОРОЙ УЗНАЮТ ИМЕННО ЭТУ ИСТОРИЮ, ОБЯЗАНА БЫТЬ УНИКАЛЬНОЙ.
// «2021» встречается у двух героинь сразу — совпадение по нему доказывало бы,
// что приехала ЧЬЯ-ТО история, а не эта. Тот же класс, что слепой /Ден/i.
const uniqueTraces = c => c.traces.filter(t =>
  !corpus.cases.some(o => o.id !== c.id && `${o.entity} ${o.story}`.toLowerCase().includes(t.toLowerCase())))

const has = (text, roots) => roots.filter(r => text.toLowerCase().includes(r.toLowerCase()))
const secs = ms => (ms / 1000).toFixed(2)

console.log(MARK)
const table = []

for (const c of corpus.cases) {
  const uniq = uniqueTraces(c)
  const started = Date.now()
  let ans = await read({ query: c.question, depth: 2, limit: 50 })
  let text = JSON.stringify(ans.items ?? [])
  let deepened = false

  // Углубляемся только если второго уровня не хватило — и говорим об этом.
  if (!(text.includes(c.entity) && has(text, uniq).length > 0)) {
    ans = await read({ query: c.question, depth: 3, approved: true, limit: 50 })
    text = JSON.stringify(ans.items ?? [])
    deepened = true
  }
  const ms = Date.now() - started

  const nameCame = text.includes(c.entity)
  const traceCame = has(text, uniq)
  const found = nameCame && traceCame.length > 0

  // Сколько ЧУЖИХ сущностей приехало вместе с нужной — точность доставки.
  const strangers = corpus.cases.filter(o => o.id !== c.id && text.includes(o.entity)).length
  // Слова моста в ответе быть не должно: если оно там, вопрос был извлекаемым.
  const bridgeLeak = has(text, c.bridgeWords)
  const levels = (ans.levels ?? []).map(l => l.level).join(",")
  const anchors = ((ans.levels ?? []).find(l => l.level === 2)?.anchors) ?? []

  table.push({
    id: c.id,
    entity: c.entity,
    verdict: found ? "НАШЁЛ" : "НЕ НАШЁЛ",
    levels: levels || "—",
    secs: secs(ms),
    trace: traceCame.join(" ") || "—",
    strangers,
    deepened,
    anchored: anchors.includes(c.entity),
    bridgeLeak,
  })

  say(found, `${c.id}. «${c.question}» → ${found ? "НАШЁЛ" : "НЕ НАШЁЛ"} ${c.entity}` +
    `${traceCame.length ? ` (приметы: ${traceCame.join(", ")})` : ""} · уровни ${levels || "—"} · ${secs(ms)} с`)
  say(anchors.includes(c.entity),
    `${c.id}. связи спрошены ИМЕНЕМ с уровня 1, а не словами вопроса: ${JSON.stringify(anchors.slice(0, 12))}`)
  say(bridgeLeak.length === 0,
    `${c.id}. слова моста в ответе нет — мост остаётся модели${bridgeLeak.length ? `: ПРОТЕКЛО ${JSON.stringify(bridgeLeak)}` : ""}`)
}

// ── РАЗМЕТКА РОДА: УТВЕРЖДЕНИЕ И ПРЕДПОЛОЖЕНИЕ ────────────────────────────
{
  const c = corpus.cases[0]
  const ans = await read({ query: c.question, depth: 2, limit: 50 })
  const items = ans.items ?? []
  say(items.some(i => i.claim === "guess" && i.basis),
    `разметка: пришедшее из связей помечено предположением с основанием`)
  say(items.some(i => i.claim !== "guess"),
    `разметка: значение из таблицы предположением НЕ помечено`)
}

// ── ДВА НЕГАТИВНЫХ КОНТРОЛЯ ───────────────────────────────────────────────
{
  const g = corpus.controls.ghost
  const ans = await read({ query: g.question, depth: 2, limit: 50 })
  const text = JSON.stringify(ans.items ?? [])
  const allTraces = corpus.cases.flatMap(c => uniqueTraces(c))
  const leaked = has(text, allTraces)
  say(leaked.length === 0,
    `контроль 1: выдуманный «${g.entity}» чужих примет НЕ получил${leaked.length ? `: ${JSON.stringify(leaked)}` : ""}`)
}
{
  const e = corpus.controls.emptyTopic
  const ans = await read({ query: e.question, depth: 2, limit: 50 })
  const text = JSON.stringify(ans.items ?? [])
  const allTraces = corpus.cases.flatMap(c => uniqueTraces(c))
  const leaked = has(text, allTraces)
  say(leaked.length === 0,
    `контроль 2: тема, которой в корпусе нет, не притянула чужих примет${leaked.length ? `: ${JSON.stringify(leaked)}` : ""}`)
}

// ── ТАБЛИЦА РЕЗУЛЬТАТА ────────────────────────────────────────────────────
console.log("")
console.log("№  СУЩНОСТЬ    ВЕРДИКТ    УРОВНИ  СЕК    ЧУЖИХ  ЯКОРЬ  ПРИМЕТА")
for (const r of table) {
  console.log(
    String(r.id).padEnd(3) +
    r.entity.padEnd(12) +
    r.verdict.padEnd(11) +
    String(r.levels).padEnd(8) +
    r.secs.padEnd(7) +
    String(r.strangers).padEnd(7) +
    (r.anchored ? "да" : "НЕТ").padEnd(7) +
    r.trace)
}
const okCount = table.filter(r => r.verdict === "НАШЁЛ").length
console.log("")
console.log(`ИТОГ: нашёл ${okCount} из ${table.length}`)

// ── УБОРКА ────────────────────────────────────────────────────────────────
if (MODE !== "keep") {
  console.log(`уборка по метке «${SOURCE}»: ${await clean()}`)
} else {
  console.log(`корпус ОСТАВЛЕН в базе по просьбе запуска (keep) — снять: … 164-7.mjs clean`)
}

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
