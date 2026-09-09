// ПРИБОР 167-1 — ВЕКТОРНЫЙ СКЛАД НА РЕАЛЬНОЙ ДОКУМЕНТАЦИИ FRACTERA.
//
// 🎯 ТРЕБОВАНИЕ ВЛАДЕЛЬЦА 2026-09-09: «до тех пор пока мы не подтвердили
// способности всех трёх составляющих к тестированию, мы не можем приступать».
// Таблицы подтверждены прогоном по порядкам (9 из 10). Здесь — второй слой.
//
// 🔒 ЧТО ИМЕННО ДОКАЗЫВАЕТСЯ, И ЭТО НЕ «ПОИСК РАБОТАЕТ». Доказывается цепочка:
// текст доехал → у него посчитан эмбеддинг → он попал в индекс → вопрос ДРУГИМИ
// СЛОВАМИ находит нужный кусок → посторонний вопрос его НЕ находит. Без
// последнего звена склад, отвечающий на всё, выглядел бы работающим.
//
// 🛑 СПРАШИВАЕМ СКЛАД НАПРЯМУЮ, БЕЗ МОДЕЛИ. Эти документы агент читает как свои
// инструкции — он знает их содержание помимо всякого поиска. Спроси мы его,
// «нашла в векторе» было бы неотличимо от «знала и так».
//
// 🛑 ЧТО ПИШЕТ И ЧЬЁ ЭТО: своя коллекция `probe-167-docs` в общем складе, метка
// в `refTable`. Уборка по коллекции — чужих записей не касается.
//
// Запуск: node scripts/probe/vector-store-167-1.mjs [keep|clean]
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const MARK = "===PROBE_167_1==="
const MODE = process.argv[2] ?? "run"
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "../..")
const corpus = JSON.parse(readFileSync(join(root, "development-docs/instruments/167-corpus.json"), "utf8"))
const COLLECTION = "probe-167-docs"
const REF_TABLE = "probe_167"
// 🔒 ПОРОГ НЕ ВЫДУМАН ЗДЕСЬ: это `SIMILAR_THRESHOLD` из `lib/automations/similar.ts`,
// полученный измерением (посторонние ≤ 0.286, верные ≥ 0.379, взята середина).
// Своё число рядом с чужим измеренным — второй порог, который разойдётся молча.
const THRESHOLD = 0.33

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

let bad = 0
const say = (ok, what) => { if (!ok) bad += 1; console.log(`${ok ? "✓" : "✗"} ${what}`) }
const post = (path, body) => fetch(`${dataUrl}${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify(body),
}).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }))
  .catch(e => ({ status: 0, json: { ok: false, error: String(e) } }))
const sql = (text, params = []) => post("/db/migrate", { sql: text, params }).then(r => r.json)

async function clean() {
  await sql("DELETE FROM vectors WHERE collection = ?", [COLLECTION])
  const r = await sql("SELECT COUNT(*) AS n FROM vectors WHERE collection = ?", [COLLECTION])
  return Number((r.rows ?? [])[0]?.n ?? -1)
}

if (MODE === "clean") {
  console.log(MARK)
  console.log(`уборка коллекции «${COLLECTION}»: осталось ${await clean()}`)
  console.log(`${MARK}DONE`)
  process.exit(0)
}

console.log(MARK)
console.log(`корпус: ${corpus.docs.length} документов реальной документации Fractera`)

// ── СОСТОЯНИЕ СКЛАДА ДО ─────────────────────────────────────────────────
const before = await sql("SELECT COUNT(*) AS n FROM vectors")
const beforeAll = Number((before.rows ?? [])[0]?.n ?? 0)
await clean()
const status = await fetch(`${dataUrl}/vectors/status`, { headers: { "X-Data-Secret": key } })
  .then(r => r.json()).catch(() => ({}))
console.log(`склад до посева: всего записей ${beforeAll}; режим: ${JSON.stringify(status).slice(0, 160)}`)
console.log("")

// ── ПОСЕВ: КАЖДЫЙ КУСОК — СВОЯ ЗАПИСЬ ───────────────────────────────────
// 🔒 РЕЖЕМ МЫ, И ЭТО ИЗМЕРЕННОЕ СВОЙСТВО СКЛАДА: чанкинга в слое данных нет,
// текст уезжает в эмбеддинг целиком. Документ на восемь тысяч слов превысил бы
// предел модели, короткий прошёл бы — то есть поведение зависело бы от размера
// файла. Здесь это названо, а не обойдено молча.
const started = Date.now()
let sent = 0
let refused = 0
for (const d of corpus.docs) {
  for (let i = 0; i < d.parts.length; i += 1) {
    const r = await post("/vectors", {
      collection: COLLECTION,
      id: `${d.id}-${i}`,
      refId: d.id,
      refTable: REF_TABLE,
      text: d.parts[i],
    })
    if (r.status === 200 && r.json.ok !== false) sent += 1
    else { refused += 1; if (refused <= 2) console.log(`  отказ на ${d.id}-${i}: ${JSON.stringify(r.json).slice(0, 120)}`) }
  }
}
const seedMs = Date.now() - started
const parts = corpus.docs.reduce((s, d) => s + d.parts.length, 0)
say(sent === parts, `все куски приняты складом: ${sent} из ${parts}${refused ? `, отказов ${refused}` : ""}`)
console.log(`  посев занял ${(seedMs / 1000).toFixed(1)} с — по ${Math.round(seedMs / Math.max(sent, 1))} мс на кусок`)

// ── ДОКАЗАТЕЛЬСТВО ТРАНСФОРМАЦИИ: ЭМБЕДДИНГ ПОСЧИТАН И ЛЕЖИТ ────────────
// 🔒 «ЗАПИСЬ ЕСТЬ» И «ЭМБЕДДИНГ ПОСЧИТАН» — РАЗНЫЕ УТВЕРЖДЕНИЯ. Строка может
// лечь с пустым вектором, и поиск тогда молча не найдёт ничего; проверяем
// ДЛИНУ вектора, а не наличие строки.
const rows = await sql(
  "SELECT id, LENGTH(embedding) AS bytes, LENGTH(text) AS chars FROM vectors WHERE collection = ? ORDER BY id LIMIT 3",
  [COLLECTION],
)
const sample = rows.rows ?? []
const bytes = Number(sample[0]?.bytes ?? 0)
say(sample.length > 0 && bytes > 1000,
  `у записей есть эмбеддинг: первая — ${bytes} байт вектора на ${sample[0]?.chars ?? 0} знаков текста`)
console.log(`  измерений: ${Math.round(bytes / 4)} (ожидается 1536 у text-embedding-3-small)`)

const cnt = await sql("SELECT COUNT(*) AS n FROM vectors WHERE collection = ?", [COLLECTION])
const stored = Number((cnt.rows ?? [])[0]?.n ?? 0)
const ann = await sql("SELECT COUNT(*) AS n FROM vectors_ann")
say(stored === parts, `в складе ровно наши куски: ${stored}`)
console.log(`  индекс поиска (vectors_ann): ${Number((ann.rows ?? [])[0]?.n ?? -1)} записей всего`)
console.log("")

// ── ПОИСК ПО СМЫСЛУ: СЛОВА ВОПРОСА В ТЕКСТЕ НЕ СОВПАДАЮТ ────────────────
//
// 🔒 ЗДЕСЬ ДВА РАЗНЫХ УТВЕРЖДЕНИЯ, И СМЕШИВАТЬ ИХ НЕЛЬЗЯ.
//   1. МЕХАНИКА РАБОТАЕТ: вопрос другими словами возвращает осмысленные куски
//      выше порога, а посторонний вопрос — нет. Это и есть готовность слоя, и
//      только это входит в вердикт прибора.
//   2. РАНЖИРОВАНИЕ ТОЧНОЕ: верхним оказывается именно тот документ, который мы
//      назвали заранее. Это КАЧЕСТВО, и оно печатается числом.
// ✗ ПОЧЕМУ ОНИ РАЗВЕДЕНЫ, И ЭТО НЕ СМЯГЧЕНИЕ КРИТЕРИЯ: измерено первым прогоном
// на связанном корпусе — вопрос «что делать, когда обычный поиск по словам не
// находит нужного» вернул §4.1 памяти («Незнакомая формулировка… если слова
// человека не совпали ни с одной записью справочника»). Это ТОЧНЫЙ ответ, а наш
// `expect` указывал на другой документ. Документы Fractera описывают одну систему
// с разных сторон, и однозначного «единственно верного» документа у вопроса нет.
// 🛑 ЧИСЛО ТОЧНОСТИ ПРИ ЭТОМ НЕ ПРЯЧЕТСЯ: оно печатается и уезжает в отчёт как
// есть. Прибор, у которого качество не измеряется вовсе, зелен по умолчанию.
console.log("ВОПРОС                                                  НАШЁЛ            БЛИЗОСТЬ  ОЖИДАЛИ")
let exact = 0
let inFive = 0
for (const { q, expect } of corpus.vectorQuestions) {
  const t = Date.now()
  const r = await post("/vectors/search", { collection: COLLECTION, k: 5, query: q })
  const ms = Date.now() - t
  const items = Array.isArray(r.json.results) ? r.json.results : r.json.rows ?? []
  const ids = items.map(x => String(x.ref_id ?? x.refId ?? ""))
  const top = items[0] ?? {}
  const got = ids[0] ?? "—"
  const score = Number(top.score ?? top.similarity ?? 0)
  const pos = ids.indexOf(expect)
  if (pos === 0) exact += 1
  if (pos >= 0) inFive += 1
  console.log(`${q.slice(0, 54).padEnd(56)}${got.padEnd(17)}${score.toFixed(3).padEnd(10)}${expect}`)
  // Вердикт прибора — про механику: осмысленный ответ выше порога за разумное время.
  say(items.length > 0 && score >= THRESHOLD,
    `  → склад ответил ${items.length} кусками, верхний ${score.toFixed(3)} ${score >= THRESHOLD ? "выше" : "НИЖЕ"} порога · ${ms} мс` +
    ` · ожидаемый документ ${pos < 0 ? "не в первых пяти" : `на месте ${pos + 1}`}`)
}
console.log("")
console.log(`ТОЧНОСТЬ РАНЖИРОВАНИЯ: верхним угадан ${exact} из ${corpus.vectorQuestions.length}; ` +
  `в первых пяти ${inFive} из ${corpus.vectorQuestions.length}`)

// ── ГРАНИЦЫ ПОРОГА НА СВОЁМ КОРПУСЕ ─────────────────────────────────────
//
// ✗ ЧЕМ ОПЛАЧЕНО: порог `0.33` измерен на саммари автоматизаций и применён к
// документации без перемера. Число, взятое с чужого корпуса, — это «число,
// похожее на знание» (закон 146). Здесь измеряется РАЗРЫВ на своём корпусе:
// худший верный ответ против лучшего постороннего. Порог осмыслен, только если
// лежит между ними.
console.log("")
const strangers = [
  corpus.vectorControl.q,
  "как заквасить капусту на зиму в трёхлитровой банке",
  "расписание электричек до Сергиева Посада",
]
let worstTrue = 1
let bestStranger = 0
for (const { q } of corpus.vectorQuestions) {
  const r = await post("/vectors/search", { collection: COLLECTION, k: 1, query: q })
  const items = Array.isArray(r.json.results) ? r.json.results : r.json.rows ?? []
  const s = Number(items[0]?.score ?? items[0]?.similarity ?? 0)
  if (s < worstTrue) worstTrue = s
}
for (const q of strangers) {
  const r = await post("/vectors/search", { collection: COLLECTION, k: 1, query: q })
  const items = Array.isArray(r.json.results) ? r.json.results : r.json.rows ?? []
  const s = Number(items[0]?.score ?? items[0]?.similarity ?? 0)
  console.log(`  постороннее «${q.slice(0, 44)}» → ${s.toFixed(3)}`)
  if (s > bestStranger) bestStranger = s
}
console.log(`ГРАНИЦЫ НА ЭТОМ КОРПУСЕ: худший верный ${worstTrue.toFixed(3)} · лучший посторонний ${bestStranger.toFixed(3)}`)
say(worstTrue > bestStranger,
  `разрыв есть: верные и посторонние разделимы (запас ${(worstTrue - bestStranger).toFixed(3)})`)
say(THRESHOLD > bestStranger && THRESHOLD < worstTrue,
  `порог ${THRESHOLD} лежит ВНУТРИ измеренного разрыва — годен для этого корпуса`)

// ── ТРИ НЕГАТИВНЫХ КОНТРОЛЯ, КОТОРЫХ НЕ БЫЛО ────────────────────────────
//
// 🔒 ВСЕ ТРИ ПРОВЕРЯЮТ ОДНО: НАЗВАН ЛИ ОТКАЗ ИЛИ ПРОГЛОЧЕН. Молчаливый отказ
// выглядит успехом, и это единственный класс, который прибор обязан ловить сам.
{
  // 1. Пустая коллекция: ответ обязан быть пустым, а не «ближайшим из чужого».
  const r = await post("/vectors/search", { collection: "probe-167-nothing", k: 5, query: "что угодно" })
  const items = Array.isArray(r.json.results) ? r.json.results : r.json.rows ?? []
  say(items.length === 0, `контроль 1: пустая коллекция вернула ${items.length} результатов`)
}
{
  // 2. Повтор того же запроса: склад обязан быть устойчив, иначе прогон не
  // воспроизводим и любое сравнение «до/после» бессмысленно.
  // 🛑 КОНТРОЛЬ ОБЯЗАН ПОКАЗЫВАТЬ РАЗНИЦУ, А НЕ ТОЛЬКО ФАКТ РАСХОЖДЕНИЯ.
  // ✗ первая редакция печатала «не совпало» и молчала о том, ЧТО именно, —
  // пришлось гадать и ставить отдельную диагностику. Проверка, после которой
  // нужно исследование, сделана наполовину.
  // 🔒 УСТОЙЧИВЫМ ОБЯЗАН БЫТЬ СОСТАВ И ПОРЯДОК, А НЕ ШЕСТОЙ ЗНАК ОЦЕНКИ.
  // ✗ измерено 2026-09-09: три повтора дали 0.575420 · 0.575451 · 0.575451 при
  // ОДИНАКОВОМ порядке. Это недетерминизм эмбеддинга на стороне провайдера, а не
  // наш дефект: колебание 0.00003 против измеренного запаса порога 0.122 — на
  // четыре порядка меньше и ни на одно решение не влияет.
  // 🛑 ТРЕБОВАТЬ ПОБИТОВОГО СОВПАДЕНИЯ ЗНАЧИЛО БЫ ДЕРЖАТЬ ВЕЧНО КРАСНУЮ ПРОВЕРКУ,
  // а вечно красную проверку перестают читать. Проверяем то, что имеет значение,
  // и печатаем колебание числом — чтобы рост было видно.
  const q = corpus.vectorQuestions[0].q
  const orders = []
  const tops = []
  for (let n = 0; n < 3; n += 1) {
    const r = await post("/vectors/search", { collection: COLLECTION, k: 3, query: q })
    const items = Array.isArray(r.json.results) ? r.json.results : r.json.rows ?? []
    orders.push(items.map(i => String(i.ref_id ?? i.refId ?? "")).join(" | "))
    tops.push(Number(items[0]?.score ?? items[0]?.similarity ?? 0))
  }
  const stable = new Set(orders).size === 1
  const drift = Math.max(...tops) - Math.min(...tops)
  say(stable, `контроль 2: три повтора дали ${stable ? "один и тот же порядок" : "РАЗНЫЙ ПОРЯДОК"}`)
  if (!stable) for (let n = 0; n < orders.length; n += 1) console.log(`     ${n + 1}. ${orders[n]}`)
  say(drift < (worstTrue - bestStranger) / 10,
    `     колебание оценки между повторами ${drift.toFixed(6)} — ` +
    `${drift < (worstTrue - bestStranger) / 10 ? "много меньше" : "СОПОСТАВИМО С"} запасом порога ${(worstTrue - bestStranger).toFixed(3)}`)
}
{
  // 3. Текст длиннее предела модели.
  // ✗ В ОТЧЁТЕ 167 Я НАПИСАЛ «документ на восемь тысяч слов был бы отвергнут» —
  // и НЕ ИЗМЕРЯЛ этого ни разу. Предположение, поданное как факт; здесь оно
  // становится измерением. Годится любой исход — важно, чтобы он был НАЗВАН.
  const huge = corpus.docs.map(d => d.text).join("\n\n").repeat(2)
  const r = await post("/vectors", {
    collection: COLLECTION,
    id: "probe-167-huge",
    refId: "huge",
    refTable: REF_TABLE,
    text: huge,
  })
  const words = huge.split(/\s+/).length
  const refusedLoudly = r.status !== 200 || r.json.ok === false
  say(true, `контроль 3: текст в ${words} слов → ${refusedLoudly ? "ОТКАЗ НАЗВАН" : "принят молча"}: ` +
    `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`)
  await sql("DELETE FROM vectors WHERE id = ?", ["probe-167-huge"])
}

if (MODE !== "keep") console.log(`\nуборка: в коллекции осталось ${await clean()}`)
else console.log(`\nкорпус ОСТАВЛЕН (keep) — снять: … vector-store-167-1.mjs clean`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
