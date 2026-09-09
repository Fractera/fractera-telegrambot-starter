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
// ✗ ПЕРВАЯ РЕДАКЦИЯ ОСТАНАВЛИВАЛАСЬ НА ПЕРВОЙ ЖЕ МЕТКЕ С РЁБРАМИ И ДЕЛАЛА
// `break`: утверждение «связи построены» доказывалось на ОДНОМ подграфе из 165,
// а общее число рёбер не измерялось вовсе. Найдено критическим разбором 168.
// Теперь обходятся все метки, и печатается вся картина — включая одиночек,
// которых видно только на полном обходе.
const allLabels = Array.isArray(labelsAfter) ? labelsAfter.map(String) : []
let totalEdges = 0
let lonely = 0
let richest = { edges: 0, label: "", sample: "" }
const seenEdges = new Set()
for (const label of allLabels) {
  const g = await rag(`/graphs?label=${encodeURIComponent(label)}&max_depth=1&max_nodes=100`)
  const edges = Array.isArray(g.json.edges) ? g.json.edges : []
  if (edges.length === 0) lonely += 1
  // 🔒 РЁБРА СЧИТАЮТСЯ ПО ПАРЕ КОНЦОВ, А НЕ СЛОЖЕНИЕМ ПОДГРАФОВ: одно ребро
  // видно из обоих своих узлов, и наивная сумма завысила бы счёт ровно вдвое.
  for (const e of edges) {
    const a = String(e.source ?? e.src ?? "")
    const b = String(e.target ?? e.tgt ?? "")
    seenEdges.add([a, b].sort().join("→"))
  }
  if (edges.length > richest.edges) {
    const e = edges[0] ?? {}
    richest = {
      edges: edges.length,
      label,
      sample: `${String(e.source ?? e.src ?? "")} → ${String(e.target ?? e.tgt ?? "")}`,
    }
  }
}
totalEdges = seenEdges.size
say(totalEdges > 0 && richest.edges > 0,
  `связи построены по всему графу: ${totalEdges} различных рёбер на ${allLabels.length} сущностях`)
console.log(`  самая связанная — «${richest.label}»: ${richest.edges} рёбер; пример: ${richest.sample}`)
console.log(`  сущностей без единой связи: ${lonely} из ${allLabels.length}`)

// ── ДОКАЗАТЕЛЬСТВО 4: ПО СВЯЗЯМ ОТВЕЧАЕТ ЗАПРОС ─────────────────────────
// 🔒 СПРАШИВАЕМ ЗА КОНТЕКСТ, А НЕ ЗА ПРОЗОЙ: 551 мс против 7533 мс и вшестеро
// больше данных (измерено 161-3). Сочиняет ответ человеку наш агент, не движок.
// ✗ ПЕРВАЯ РЕДАКЦИЯ ПРОВЕРЯЛА ФОРМУ, А НЕ СОДЕРЖАНИЕ: `text.length > 200 &&
// /Entity/`. Восемьдесят килобайт ЧУЖОГО текста прошли бы такую проверку, и
// «связи ответили» означало лишь «движок что-то вернул». Найдено критическим
// разбором 168.
// 🔒 ТЕПЕРЬ ПРОВЕРЯЕТСЯ ПРОИСХОЖДЕНИЕ: в ответе обязаны быть ссылки на НАШИ
// документы `docs/167-*`. Это то же правило, по которому в проекте измеряют
// доставку, а не впечатление.
console.log("")
const ourDoc = /docs\/167-/
for (const { q, about } of corpus.graphQuestions) {
  const t = Date.now()
  const r = await rag("/query", {
    method: "POST",
    body: JSON.stringify({
      enable_rerank: false,
      include_references: true,
      mode: "local",
      only_need_context: true,
      query: q,
    }),
  })
  const ms = Date.now() - t
  const whole = JSON.stringify(r.json)
  const text = String(r.json.response ?? r.json.answer ?? "")
  const refs = (whole.match(/docs\/167-[a-z-]+/g) ?? [])
  const distinct = [...new Set(refs)]
  say(ourDoc.test(whole) && text.length > 200,
    `связи ответили на «${q}» (${about}): ${text.length} знаков за ${ms} мс` +
    `; наших документов в ответе ${distinct.length}: ${distinct.join(", ") || "НЕТ НИ ОДНОГО"}`)
}

// ── МЕЖСЛОЙНЫЙ ВОПРОС: ОТВЕТ ТРЕБУЕТ ДВУХ ДОКУМЕНТОВ ИЗ РАЗНЫХ МЕСТ ──────
//
// 🔒 РАДИ ЭТОГО КОРПУС И БРАЛСЯ РЕАЛЬНЫМ (решение владельца: «реальные документы
// с реальными связями»). Одиночная метка отвечается и без рёбер — достаточно
// найти её кусок. Вопрос, ответ на который лежит в ДВУХ документах разных
// репозиториев, без связей не отвечается вовсе.
{
  const q = "как настройки гостевого приложения связаны с реестром признаков службы"
  const t = Date.now()
  const r = await rag("/query", {
    method: "POST",
    body: JSON.stringify({
      enable_rerank: false,
      include_references: true,
      mode: "mix",
      only_need_context: true,
      query: q,
    }),
  })
  const ms = Date.now() - t
  const whole = JSON.stringify(r.json)
  const distinct = [...new Set(whole.match(/docs\/167-[a-z-]+/g) ?? [])]
  say(distinct.length >= 2,
    `межслойный вопрос собрал ${distinct.length} документа за ${ms} мс: ${distinct.join(", ")}`)
}

// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ 1: ВЫДУМАННОЙ СУЩНОСТИ В ГРАФЕ БЫТЬ НЕ ДОЛЖНО.
// Без него всё выше доказывало бы лишь то, что движок отвечает на любой запрос.
{
  const g = corpus.graphControl
  const found = (await rag(`/graph/label/search?q=${encodeURIComponent(g.q)}&limit=5`)).json
  const n = Array.isArray(found) ? found.length : 0
  console.log("")
  say(n === 0, `контроль 1: выдуманной метки «${g.q}» в графе нет (найдено ${n})`)
}

// 🛑 НЕГАТИВНЫЙ КОНТРОЛЬ 2: ПОСТОРОННИЙ ВОПРОС НЕ ДОЛЖЕН ПОДНИМАТЬ НАШИ
// ДОКУМЕНТЫ. Он введён 168 и ПАДАЕТ — это известный долг, а не поломка прогона.
// ✗ измерено 2026-09-09: вопрос «рецепт борща и расписание электричек» поднял
// ТРИ наших документа. Тот же класс, что порядок 5 у памяти: система не умеет
// сказать «этого у меня нет» и вместо молчания отвечает похожим.
// 🔒 ПОЧЕМУ КОНТРОЛЬ ОСТАВЛЕН КРАСНЫМ, А НЕ УБРАН: убрав его, мы получили бы
// зелёный прогон при живом дефекте — то есть купили бы цвет. Долг назван в
// отчёте и в `MEMORY.md` §8.4.
{
  const q = "рецепт борща и расписание электричек до Сергиева Посада"
  const r = await rag("/query", {
    method: "POST",
    body: JSON.stringify({
      enable_rerank: false,
      include_references: true,
      mode: "local",
      only_need_context: true,
      query: q,
    }),
  })
  const refs = [...new Set(JSON.stringify(r.json).match(/docs\/167-[a-z-]+/g) ?? [])]
  say(refs.length === 0,
    `контроль 2: посторонний вопрос поднял ${refs.length} наших документов` +
    (refs.length > 0 ? ` — ИЗВЕСТНЫЙ ДОЛГ: «не знаю» не выражается: ${refs.join(", ")}` : ""))
}

if (MODE !== "keep") console.log(`\nуборка: осталось наших документов ${await clean()}`)
else console.log(`\nкорпус ОСТАВЛЕН (keep) — снять: … graph-rag-167-2.mjs clean`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
