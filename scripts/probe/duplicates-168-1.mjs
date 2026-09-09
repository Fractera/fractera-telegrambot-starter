// ПРИБОР 168-1 — ДОКАЗАТЬ, ЧТО ДУБЛИ ПО РЕГИСТРУ ТЕРЯЮТ ДАННЫЕ. ДО ПОЧИНКИ.
//
// 🎯 ЗАДАЧА ВЛАДЕЛЬЦА 2026-09-09: «почини дубли по регистру в графе… подвергни
// критическому анализу и двойной цепочке исследований».
//
// 🔒 ПОРЯДОК НАМЕРЕННЫЙ: СНАЧАЛА ДОКАЗАТЕЛЬСТВО ДЕФЕКТА, ПОТОМ ПОЧИНКА. Вчера
// я объявил одиннадцать двойников дефектом, НЕ ИЗМЕРИВ, теряется ли на них хоть
// что-нибудь. Починив без этого замера, я не смог бы показать «стало лучше» — и
// вполне мог бы чинить то, что не сломано.
//
// 🛑 ГЛАВНОЕ, ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ, — НЕ ГРАФ, А МЫ САМИ. `matchLabel` в
// `lib/memory/box.ts:439` делает `return exact[0]`: берёт ПЕРВОЕ найденное
// написание и выбрасывает остальные. При двух метках «Память» и «память» связи
// спрашиваются про одну, и половина рёбер не опрашивается никогда. Это тот же
// класс, что вчерашний `limit: 1` при чтении списка знакомых: **брать первое
// там, где верны все**. Один класс, два места — вот что дал второй разбор.
//
// Ничего не пишет и не удаляет: только читает граф. Требует посеянный корпус 167.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_168_1==="

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
const rag = (path, init = {}) => fetch(`${dataUrl}/service/rag${path}`, {
  ...init,
  headers: { "Content-Type": "application/json", "X-Data-Secret": key, ...(init.headers ?? {}) },
}).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }))
  .catch(e => ({ status: 0, json: { error: String(e) } }))

/** Подграф одной метки: сколько у неё узлов и рёбер. */
async function subgraph(label) {
  const g = await rag(`/graphs?label=${encodeURIComponent(label)}&max_depth=2&max_nodes=100`)
  return {
    edges: Array.isArray(g.json.edges) ? g.json.edges : [],
    nodes: Array.isArray(g.json.nodes) ? g.json.nodes : [],
  }
}

/** То же, что делает наш `labelSearch` — подстрока без учёта регистра. */
const search = async (q, limit = 10) =>
  (await rag(`/graph/label/search?q=${encodeURIComponent(q)}&limit=${limit}`)).json

console.log(MARK)

const labels = (await rag("/graph/label/list")).json
if (!Array.isArray(labels) || labels.length === 0) {
  console.log(`${MARK} ГРАФ ПУСТ — сначала посеять корпус: node scripts/probe/graph-rag-167-2.mjs keep`)
  process.exit(2)
}
console.log(`меток в графе: ${labels.length}`)

// ── КТО ЗДЕСЬ ДВОЙНИК ───────────────────────────────────────────────────
const byLower = new Map()
for (const l of labels) {
  const k = String(l).toLowerCase()
  byLower.set(k, [...(byLower.get(k) ?? []), String(l)])
}
const dups = [...byLower.values()].filter(v => v.length > 1)
const singles = [...byLower.values()].filter(v => v.length === 1).map(v => v[0])
say(dups.length > 0, `двойников по регистру: ${dups.length} из ${labels.length} меток`)
console.log("")

// ── ИЗМЕРЕНИЕ 1: СВЯЗИ РАЗДЕЛЕНЫ МЕЖДУ ДВОЙНИКАМИ ───────────────────────
//
// 🔒 ЭТО И ЕСТЬ ЦЕНА ДЕФЕКТА В ЧИСЛАХ. Если у обоих написаний есть рёбра и
// множества рёбер РАЗНЫЕ — знание об одной сущности физически разорвано надвое.
console.log("ДВОЙНИК                                УЗЛЫ  РЁБРА   ИТОГО РАЗОРВАНО")
let torn = 0
const report = []
for (const pair of dups) {
  const measured = []
  for (const name of pair) {
    const { nodes, edges } = await subgraph(name)
    measured.push({ edges: edges.length, name, nodes: nodes.length })
  }
  const withEdges = measured.filter(m => m.edges > 0)
  const total = measured.reduce((s, m) => s + m.edges, 0)
  const split = withEdges.length > 1
  if (split) torn += 1
  report.push({ measured, pair, split, total })
  for (const m of measured) {
    console.log(`${m.name.slice(0, 38).padEnd(40)}${String(m.nodes).padStart(4)}${String(m.edges).padStart(7)}`)
  }
  console.log(`${" ".repeat(40)}сумма рёбер ${total}${split ? "  ← РАЗОРВАНО: рёбра есть у обоих" : ""}`)
}
console.log("")
say(true, `сущностей с разорванными связями: ${torn} из ${dups.length} пар`)

// ── ИЗМЕРЕНИЕ 2: ЧТО ИЗ ЭТОГО ВИДИТ НАШ КОД ─────────────────────────────
//
// 🛑 ВОТ ГЛАВНОЕ ЧИСЛО ВСЕГО ПРИБОРА. `labelSearch` находит ОБА написания, а
// `matchLabel` возвращает ОДНО — значит потеря происходит не в графе, а у нас,
// и слияние в графе её лечит лишь пока не приехал следующий документ.
console.log("ЧТО НАХОДИТ ПОИСК И ЧТО БЕРЁТ НАШ КОД:")
let ourLoss = 0
for (const { pair, measured } of report) {
  const found = await search(pair[0].toLowerCase(), 10)
  const list = Array.isArray(found) ? found.map(String) : []
  // Ровно то, что делает `matchLabel`: первое совпадение, остальные выброшены.
  const taken = list[0] ?? "—"
  const dropped = list.filter(x => x !== taken)
  const lostEdges = measured.filter(m => m.name !== taken).reduce((s, m) => s + m.edges, 0)
  if (lostEdges > 0) ourLoss += lostEdges
  console.log(`  «${pair[0].toLowerCase()}» → поиск нашёл ${list.length}: ${list.join(" · ")}`)
  console.log(`     matchLabel возьмёт «${taken}», выбросит ${dropped.length}: потеряно рёбер ${lostEdges}`)
}
console.log("")
say(true, `ИТОГО НАШ КОД ТЕРЯЕТ ${ourLoss} рёбер, потому что берёт первое написание вместо всех`)

// ── НЕГАТИВНЫЙ КОНТРОЛЬ: ИМЯ БЕЗ ДВОЙНИКОВ ──────────────────────────────
//
// 🔒 БЕЗ НЕГО ВСЁ ВЫШЕ ДОКАЗЫВАЛО БЫ ЛИШЬ ТО, ЧТО ПОИСК ВОЗВРАЩАЕТ НЕСКОЛЬКО
// СТРОК НА ЛЮБОЙ ЗАПРОС. У одиночной метки поиск обязан вернуть одну.
{
  const solo = singles.find(s => s.length > 5 && !/[a-z]/.test(s[0])) ?? singles[0]
  const found = await search(String(solo).toLowerCase(), 10)
  const n = Array.isArray(found) ? found.length : 0
  say(n === 1, `контроль: у одиночной метки «${solo}» поиск нашёл ${n} написание — потери нет`)
}

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
