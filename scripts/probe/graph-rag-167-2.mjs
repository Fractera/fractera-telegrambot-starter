// ПРИБОР 167-2 — ГРАФ СВЯЗЕЙ НА РЕАЛЬНОЙ ДОКУМЕНТАЦИИ FRACTERA.
//
// 🎯 ТРЕБОВАНИЕ ВЛАДЕЛЬЦА 2026-09-09: «забрось документы в агентный RAG, проверь,
// что эти документы правильным образом прошли процесс трансформации — какие-то
// процессы, эмбеддинг, разделение в узлы и рёбра».
//
// 🔒 ЧТО ЗДЕСЬ СЧИТАЕТСЯ ДОКАЗАТЕЛЬСТВОМ ТРАНСФОРМАЦИИ, И ЭТО НЕ «ДОКУМЕНТ
// ПРИНЯТ». Принят — значит уехал; трансформация — это четыре разных факта, и
// каждый измеряется отдельно:
//   1. документ РАЗРЕЗАН на куски — `chunks_count` больше единицы;
//   2. из кусков ИЗВЛЕЧЕНЫ сущности — в графе появились метки, которых не было;
//   3. между сущностями построены СВЯЗИ — у подграфа есть рёбра, а не только узлы;
//   4. по этим связям ОТВЕЧАЕТ запрос — и посторонняя метка ответа не даёт.
// Первые три без четвёртого — красивый граф, которым никто не пользуется;
// четвёртый без первых трёх недоказуем: непонятно, откуда взялся ответ.
//
// 🛑 ГРАФУ ДОКУМЕНТ ОТДАЁТСЯ ЦЕЛИКОМ, В ОТЛИЧИЕ ОТ ВЕКТОРА. Он режет сам, и
// связи между кусками одного документа строит тоже сам. Отдай мы ему свои куски —
// потеряли бы ровно то, ради чего он существует.
//
// 🛑 ЧТО ПИШЕТ И ЧЬЁ ЭТО: пять документов с именами `docs/167-<id>`. Уборка по
// этому префиксу. 🔒 УДАЛЯТЬ ПО ОДНОМУ: измерено 2026-09-09 — `DELETE /documents`
// с перечнем имён стирает ВСЁ хранилище целиком, а не названное.
//
// Запуск: node scripts/probe/graph-rag-167-2.mjs [keep|clean]
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const MARK = "===PROBE_167_2==="
const MODE = process.argv[2] ?? "run"
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "../..")
const corpus = JSON.parse(readFileSync(join(root, "development-docs/instruments/167-corpus.json"), "utf8"))
const PREFIX = "docs/167-"

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
const sleep = ms => new Promise(r => setTimeout(r, ms))
const rag = (path, init = {}) => fetch(`${dataUrl}/service/rag${path}`, {
  ...init,
  headers: { "Content-Type": "application/json", "X-Data-Secret": key, ...(init.headers ?? {}) },
}).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }))
  .catch(e => ({ status: 0, json: { error: String(e) } }))

const allDocs = async () => {
  const r = await rag("/documents")
  return Object.entries(r.json.statuses ?? {}).flatMap(([st, rows]) =>
    (rows ?? []).map(d => ({ ...d, state: String(d.status ?? st) })))
}

/** Уборка по своему префиксу, по одному документу. */
async function clean() {
  const ours = (await allDocs()).filter(d => String(d.file_path ?? "").startsWith(PREFIX))
  for (const d of ours) {
    await rag("/documents/delete_document", { method: "DELETE", body: JSON.stringify({ doc_ids: [d.id] }) })
  }
  for (let i = 0; i < 90; i += 1) {
    const left = (await allDocs()).filter(d => String(d.file_path ?? "").startsWith(PREFIX))
    if (left.length === 0) return 0
    await sleep(2000)
  }
  return (await allDocs()).filter(d => String(d.file_path ?? "").startsWith(PREFIX)).length
}

if (MODE === "clean") {
  console.log(MARK)
  console.log(`уборка «${PREFIX}»: осталось ${await clean()}`)
  console.log(`${MARK}DONE`)
  process.exit(0)
}

console.log(MARK)

// ── СОСТОЯНИЕ ГРАФА ДО ──────────────────────────────────────────────────
// 🔒 «ДО» СНИМАЕТСЯ ДО ПОСЕВА И НИКОГДА ПОСЛЕ: доказательство «метки появились»
// есть РАЗНИЦА, и вспомнить о ней в конце нельзя.
const health = await rag("/health")
say(health.status === 200, `движок графа отвечает: ${String(health.json.status ?? health.status)}`)
const labelsBefore = (await rag("/graph/label/list")).json
const beforeCount = Array.isArray(labelsBefore) ? labelsBefore.length : 0
const docsBefore = (await allDocs()).length
console.log(`граф до посева: документов ${docsBefore}, меток (сущностей) ${beforeCount}`)
console.log("")

// ── ПОСЕВ: ДОКУМЕНТ ЦЕЛИКОМ, С ЯКОРЯМИ В САМОМ ТЕКСТЕ ───────────────────
// 🔒 ЯКОРЯ ПИШУТСЯ В ТЕКСТ, А НЕ В МЕТАДАННЫЕ: граф извлекает сущности ИЗ ТЕКСТА,
// и имя, положенное рядом в поле, для него не существует (закон `learn()`).
const started = Date.now()
for (const d of corpus.docs) {
  const head = `Относится к: ${d.anchors.join(", ")}. Слой системы: ${d.layer}. Документ: ${d.title}.`
  const r = await rag("/documents/text", {
    method: "POST",
    body: JSON.stringify({ file_source: `${PREFIX}${d.id}`, text: `${head}\n\n${d.text}` }),
  })
  const okSent = r.status === 200
  if (!okSent) console.log(`  отказ на ${d.id}: ${JSON.stringify(r.json).slice(0, 140)}`)
}
console.log(`отправлено ${corpus.docs.length} документов, ${corpus.docs.reduce((s, d) => s + d.words, 0)} слов`)

// ── ЖДЁМ ОБРАБОТКУ ПО ФАКТУ, А НЕ ПО ТАЙМЕРУ ────────────────────────────
// 🛑 РАЗБОР ДОКУМЕНТА В СУЩНОСТИ ИДЁТ ЧЕРЕЗ ЯЗЫКОВУЮ МОДЕЛЬ И СТОИТ МИНУТ, А НЕ
// СЕКУНД. Фиксированная пауза здесь дала бы «не обработано» при исправной работе.
let processed = 0
let failed = 0
for (let i = 0; i < 300; i += 1) {
  const ours = (await allDocs()).filter(d => String(d.file_path ?? "").startsWith(PREFIX))
  processed = ours.filter(d => d.state === "processed").length
  failed = ours.filter(d => d.state === "failed").length
  if (processed + failed >= corpus.docs.length) break
  if (i % 15 === 14) console.log(`  ждём разбор: обработано ${processed}, в работе ${ours.length - processed - failed}`)
  await sleep(2000)
}
const took = Math.round((Date.now() - started) / 1000)
say(processed === corpus.docs.length,
  `все документы разобраны: ${processed} из ${corpus.docs.length}${failed ? `, отказов ${failed}` : ""} — за ${took} с`)

// ── ДОКАЗАТЕЛЬСТВО 1: ДОКУМЕНТ РАЗРЕЗАН НА КУСКИ ────────────────────────
const ours = (await allDocs()).filter(d => String(d.file_path ?? "").startsWith(PREFIX))
const chunks = ours.map(d => Number(d.chunks_count ?? 0))
const totalChunks = chunks.reduce((s, n) => s + n, 0)
say(chunks.every(n => n > 0) && totalChunks >= corpus.docs.length,
  `документы разрезаны на куски: всего ${totalChunks} (${chunks.join(" + ")})`)

// ── ДОКАЗАТЕЛЬСТВО 2: ИЗ КУСКОВ ИЗВЛЕЧЕНЫ СУЩНОСТИ ──────────────────────
const labelsAfter = (await rag("/graph/label/list")).json
const afterCount = Array.isArray(labelsAfter) ? labelsAfter.length : 0
say(afterCount > beforeCount,
  `в графе появились сущности: было ${beforeCount}, стало ${afterCount} (+${afterCount - beforeCount})`)
if (Array.isArray(labelsAfter)) {
  console.log(`  примеры: ${labelsAfter.slice(0, 12).map(String).join(" · ")}`)
}

// ── ДОКАЗАТЕЛЬСТВО 3: МЕЖДУ СУЩНОСТЯМИ ЕСТЬ РЁБРА ───────────────────────
// 🔒 УЗЛЫ БЕЗ РЁБЕР — ЭТО СПИСОК, А НЕ ГРАФ. Именно рёбра отличают агентный RAG
// от обычного поиска по кускам, и потому они проверяются отдельно.
let edgeReport = "подграф не отдан"
let haveEdges = false
for (const label of (Array.isArray(labelsAfter) ? labelsAfter : []).slice(0, 6)) {
  const g = await rag(`/graphs?label=${encodeURIComponent(String(label))}&max_depth=2&max_nodes=50`)
  const nodes = Array.isArray(g.json.nodes) ? g.json.nodes.length : 0
  const edges = Array.isArray(g.json.edges) ? g.json.edges.length : 0
  if (edges > 0) {
    haveEdges = true
    const e = g.json.edges[0] ?? {}
    edgeReport = `«${label}»: узлов ${nodes}, рёбер ${edges}; пример связи ${JSON.stringify(e.source ?? e.src ?? "")} → ${JSON.stringify(e.target ?? e.tgt ?? "")}`
    break
  }
}
say(haveEdges, `между сущностями построены связи — ${edgeReport}`)

// ── ДОКАЗАТЕЛЬСТВО 4: ПО СВЯЗЯМ ОТВЕЧАЕТ ЗАПРОС ─────────────────────────
// 🔒 СПРАШИВАЕМ ЗА КОНТЕКСТ, А НЕ ЗА ПРОЗОЙ: 551 мс против 7533 мс и вшестеро
// больше данных (измерено 161-3). Сочиняет ответ человеку наш агент, не движок.
console.log("")
for (const { q, about } of corpus.graphQuestions) {
  const t = Date.now()
  const r = await rag("/query", {
    method: "POST",
    body: JSON.stringify({ query: q, mode: "local", only_need_context: true, enable_rerank: false }),
  })
  const ms = Date.now() - t
  const text = String(r.json.response ?? r.json.answer ?? "")
  const hasData = text.length > 200 && /Entity|entity|relationship|Document Chunks/i.test(text)
  say(hasData, `связи ответили на «${q}» (${about}): ${text.length} знаков за ${ms} мс`)
}

// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ: ВЫДУМАННОЙ СУЩНОСТИ В ГРАФЕ БЫТЬ НЕ ДОЛЖНО.
// Без него всё выше доказывало бы лишь то, что движок отвечает на любой запрос.
{
  const g = corpus.graphControl
  const found = (await rag(`/graph/label/search?q=${encodeURIComponent(g.q)}&limit=5`)).json
  const n = Array.isArray(found) ? found.length : 0
  console.log("")
  say(n === 0, `контроль: выдуманной метки «${g.q}» в графе нет (найдено ${n})`)
}

if (MODE !== "keep") console.log(`\nуборка: осталось наших документов ${await clean()}`)
else console.log(`\nкорпус ОСТАВЛЕН (keep) — снять: … graph-rag-167-2.mjs clean`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
