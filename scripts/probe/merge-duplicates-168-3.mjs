// ОБСЛУЖИВАНИЕ ГРАФА 168-3 — СЛИТЬ СУЩНОСТИ, РАЗЛИЧАЮЩИЕСЯ ТОЛЬКО РЕГИСТРОМ.
//
// 🎯 ЗАДАЧА ВЛАДЕЛЬЦА 2026-09-09: «почини дубли по регистру в графе».
//
// 🔒 ЭТО ПОВТОРЯЕМАЯ ОПЕРАЦИЯ, А НЕ РАЗОВАЯ ПРАВКА, И ПРИЧИНА МЕХАНИЧЕСКАЯ:
// сущности извлекает языковая модель движка, и следующий документ снова принесёт
// «Память» рядом с «памятью». Слияние убирает накопленное; от повторения защищает
// наша сторона — `matchLabel` спрашивает ВСЕ написания имени (168-2). Нужны обе:
// только слияние — дубли вернутся; только наша сторона — собственные ответы
// движка (`/query`) останутся неполными, там мы не управляем.
//
// 🔒 ЧТО СЧИТАЕТСЯ ДУБЛЕМ: метки, совпадающие ПОСЛЕ приведения к нижнему регистру,
// и только они. ✗ измерено 168-1: поиск по «память» отдаёт четыре метки — `Память`,
// `память`, `Память Fractera`, `Личная Память`. Последние две самостоятельны;
// слив их, мы уничтожили бы знание, а не починили.
//
// 🔒 ЦЕЛЬ СЛИЯНИЯ — НАПИСАНИЕ С ЗАГЛАВНОЙ. Оно совпадает с тем, как имя стоит в
// личной таблице человека («Денис», а не «денис»), то есть мост между таблицей и
// графом остаётся сходящимся.
//
// 🛑 ОПЕРАЦИЯ ИЗМЕНЯЕТ ГРАФ И НЕОБРАТИМА: исходные сущности удаляются, их связи
// переезжают на целевую. Поэтому нужен явный `--yes`, а перед слиянием печатается
// список пар и число рёбер у каждой.
//
// Запуск:  node scripts/probe/merge-duplicates-168-3.mjs          — только показать
//          node scripts/probe/merge-duplicates-168-3.mjs --yes    — слить
import { readFileSync } from "node:fs"

const MARK = "===MERGE_168_3==="
const DO = process.argv.includes("--yes")

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

const edgesOf = async label => {
  const g = await rag(`/graphs?label=${encodeURIComponent(label)}&max_depth=2&max_nodes=100`)
  return Array.isArray(g.json.edges) ? g.json.edges.length : 0
}

console.log(MARK)
const labels = (await rag("/graph/label/list")).json
if (!Array.isArray(labels) || labels.length === 0) {
  console.log(`${MARK} ГРАФ ПУСТ — сливать нечего`)
  process.exit(2)
}

// ── НАЙТИ ПАРЫ, РАЗЛИЧАЮЩИЕСЯ ТОЛЬКО РЕГИСТРОМ ──────────────────────────
const byLower = new Map()
for (const l of labels) {
  const k = String(l).toLowerCase()
  byLower.set(k, [...(byLower.get(k) ?? []), String(l)])
}
const dups = [...byLower.values()].filter(v => v.length > 1)
console.log(`меток ${labels.length}, двойников по регистру ${dups.length}`)
if (dups.length === 0) {
  console.log(`${MARK}DONE`)
  console.log(`MERGE_RC=0`)
  process.exit(0)
}

// 🔒 «ДО» СНИМАЕТСЯ ДО ВСЯКОГО ИЗМЕНЕНИЯ: доказательство «связи собрались» есть
// СОВПАДЕНИЕ суммы, и вспомнить о нём после слияния уже нельзя.
const plan = []
console.log("")
console.log("ПАРА                                                      РЁБРА ДО   ЦЕЛЬ")
for (const pair of dups) {
  const measured = []
  for (const name of pair) measured.push({ edges: await edgesOf(name), name })
  // Цель — написание с заглавной буквы; при равенстве берём первое по алфавиту,
  // чтобы прогон был воспроизводимым, а не зависел от порядка выдачи.
  const target = [...pair].sort((a, b) => {
    const A = /^[А-ЯЁA-Z]/.test(a) ? 0 : 1
    const B = /^[А-ЯЁA-Z]/.test(b) ? 0 : 1
    return A - B || a.localeCompare(b)
  })[0]
  const sources = pair.filter(p => p !== target)
  const sum = measured.reduce((s, m) => s + m.edges, 0)
  plan.push({ measured, sources, sum, target })
  console.log(`${pair.join(" ⟷ ").slice(0, 56).padEnd(58)}${String(sum).padStart(6)}     ${target}`)
}

if (!DO) {
  console.log("")
  console.log("НИЧЕГО НЕ ИЗМЕНЕНО: операция необратима, для слияния нужен --yes")
  console.log(`${MARK}DONE`)
  process.exit(0)
}

// ── СЛИЯНИЕ ─────────────────────────────────────────────────────────────
console.log("")
let merged = 0
for (const p of plan) {
  const r = await rag("/graph/entities/merge", {
    method: "POST",
    body: JSON.stringify({ entities_to_change: p.sources, entity_to_change_into: p.target }),
  })
  const ok = r.status === 200
  if (ok) merged += 1
  else console.log(`  отказ на «${p.target}»: ${JSON.stringify(r.json).slice(0, 140)}`)
}
say(merged === plan.length, `слито пар: ${merged} из ${plan.length}`)

// ── ДОКАЗАТЕЛЬСТВО: СВЯЗИ СОБРАЛИСЬ, А НЕ ПРОПАЛИ ───────────────────────
//
// 🛑 ГЛАВНАЯ ОПАСНОСТЬ СЛИЯНИЯ — НЕ ОТКАЗ, А ТИХАЯ ПОТЕРЯ: сущности удалены,
// связи не переехали, и снаружи это выглядит как «дублей больше нет».
// Поэтому сверяем ЧИСЛО РЁБЕР: у цели должно стать не меньше суммы «до».
console.log("")
console.log("ЦЕЛЬ                                     БЫЛО (сумма)   СТАЛО")
let kept = 0
for (const p of plan) {
  const now = await edgesOf(p.target)
  const ok = now >= p.sum - 1 // -1: дубли могли быть связаны между собой
  if (ok) kept += 1
  console.log(`${p.target.slice(0, 38).padEnd(40)}${String(p.sum).padStart(8)}${String(now).padStart(12)}${ok ? "" : "  ← ПОТЕРЯ"}`)
}
say(kept === plan.length, `связи сохранены у ${kept} из ${plan.length} целей`)

const after = (await rag("/graph/label/list")).json
const lowerAfter = new Set((Array.isArray(after) ? after : []).map(x => String(x).toLowerCase()))
const dupsAfter = (Array.isArray(after) ? after : []).length - lowerAfter.size
say(dupsAfter === 0, `двойников после слияния: ${dupsAfter}; меток стало ${Array.isArray(after) ? after.length : "?"}`)

console.log(`${MARK}DONE`)
console.log(`MERGE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
