#!/usr/bin/env node
// ИЗМЕРЕНИЕ 146-1 — ГОДИТСЯ ЛИ ВЕКТОР ДЛЯ «НАЙДИ ПОХОЖУЮ АВТОМАТИЗАЦИЮ».
//
// 🔒 ИЗМЕРЕНИЕ ИДЁТ ПЕРЕД ПОСТРОЙКОЙ, А НЕ ПОСЛЕ, И МОЖЕТ ЕЁ ОТМЕНИТЬ. В этом
// проекте эмбеддинги уже проваливались: `recall@10 = 56%` на ИДЕАЛЬНОМ входе
// (106-4) — на коротких ключах реестра. Перенести тот вывод сюда нельзя:
// саммари — другой корпус, длиннее и связнее. Предполагать обратное — тоже.
//
// 🔒 МЕТОДИКА ВЗЯТА У 106-4 ДОСЛОВНО, ЧТОБЫ ЧИСЛА БЫЛИ СРАВНИМЫ: документ и
// запрос пишутся РАЗНЫМИ словами об одном. Одинаковые дали бы самоподтверждение
// вместо измерения.
//
// 🛑 КОРПУС ЗДЕСЬ СИНТЕТИЧЕСКИЙ, И ЭТО НАЗВАНО, А НЕ ЗАМАСКИРОВАНО. Живых саммари
// в базе почти нет: закрытий было мало, а разбор, который их наполнит, — следующий
// слой. Синтетика годится ровно для одного вывода — **различимы ли саммари между
// собой в принципе**. Если запрос, написанный про эту самую автоматизацию, её не
// находит, живая речь не найдёт тем более.
//
// Прогон: `node scripts/measure-summary-search.mjs` (нужен OPENAI_API_KEY).

import { readFileSync } from "node:fs"

function machineEnv(key) {
  try {
    for (const line of readFileSync(process.env.FRACTERA_MACHINE_ENV || "/etc/fractera/secrets.env", "utf8").split("\n")) {
      const i = line.indexOf("=")
      if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, "")
    }
  } catch { /* нет файла — законное состояние */ }
  return ""
}

const apiKey = process.env.OPENAI_API_KEY || machineEnv("OPENAI_API_KEY")
if (!apiKey) {
  console.log("НЕТ КЛЮЧА OPENAI — измерение невозможно, и это честный исход, а не ноль")
  process.exit(2)
}

// Пары: САММАРИ (как его напишет система) и ЗАПРОС (как спросит человек).
// Слова разные намеренно.
const PAIRS = [
  ["Поставил напоминание вызвать такси до аэропорта в Мадриде за два часа до вылета",
   "надо не забыть про машину в аэропорт"],
  ["Записал расход 40 евро на продукты в супермаркете, категория личные",
   "сколько я потратил на еду"],
  ["Разобрал присланное фото чека из ресторана и достал сумму и дату",
   "фотка счёта из кафе"],
  ["Завёл цепочку: сначала собрать документы, через неделю подать заявление на визу",
   "что там с визой, какие шаги"],
  ["Перевёл голосовое сообщение в текст и сохранил как заметку о встрече с юристом",
   "запись разговора с адвокатом"],
  ["Нашёл ближайшую аптеку по присланной геопозиции и прислал маршрут",
   "где тут рядом лекарства купить"],
  ["Сохранил контакт подрядчика по ремонту и его телефон",
   "телефон мастера который делал ремонт"],
  ["Посчитал, сколько дней осталось до окончания страховки автомобиля",
   "когда кончается страховка на машину"],
  ["Собрал список задач, которые человек поручил Мише на этой неделе",
   "что я просил сделать Михаила"],
  ["Отследил курс евро к доллару и записал значение на сегодня",
   "какой сейчас курс валют"],
  ["Записал вес и давление, замеренные утром, в дневник здоровья",
   "мои утренние показатели"],
  ["Составил напоминание полить цветы каждые три дня вечером",
   "чтобы растения не засохли"],
]

async function embed(texts) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
  })
  if (!r.ok) {
    // 🔒 «РАБОТАЕТ» И «ОПЛАЧЕНО» — РАЗНЫЕ ИЗМЕРЕНИЯ: 429 insufficient_quota
    // отличается от неверного ключа, и человеку это надо сказать разными словами.
    const body = await r.text()
    console.log(`ОТКАЗ OpenAI: HTTP ${r.status} — ${body.slice(0, 200)}`)
    process.exit(3)
  }
  const j = await r.json()
  return j.data.map(d => d.embedding)
}

const cos = (a, b) => {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

console.log("===MEASURE_146_1===")
console.log(`корпус: ${PAIRS.length} саммари, ${PAIRS.length} запросов, text-embedding-3-small`)

const docs = await embed(PAIRS.map(p => p[0]))
const queries = await embed(PAIRS.map(p => p[1]))

let at1 = 0, at3 = 0, at5 = 0
const misses = []
for (let i = 0; i < queries.length; i += 1) {
  const ranked = docs
    .map((d, j) => ({ j, score: cos(queries[i], d) }))
    .sort((a, b) => b.score - a.score)
  const pos = ranked.findIndex(r => r.j === i)
  if (pos === 0) at1 += 1
  if (pos < 3) at3 += 1
  if (pos < 5) at5 += 1
  if (pos !== 0) misses.push(`«${PAIRS[i][1]}» → первым встал «${PAIRS[i === ranked[0].j ? i : ranked[0].j][0].slice(0, 45)}…» (верный на месте ${pos + 1})`)
}

const pct = n => `${n}/${PAIRS.length} = ${Math.round((n / PAIRS.length) * 100)}%`
console.log(`recall@1 : ${pct(at1)}`)
console.log(`recall@3 : ${pct(at3)}`)
console.log(`recall@5 : ${pct(at5)}`)

// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ: фразы, которым НЕ должно найтись ничего близкого.
// Без него высокий recall мог бы означать, что «близко» вообще всё подряд.
const CONTROL = [
  "инструкция по замене масла в двигателе трактора",
  "правила игры в шахматы для начинающих",
  "рецепт борща с говядиной и свёклой",
]
const controls = await embed(CONTROL)
let maxControl = 0
for (const c of controls) for (const d of docs) maxControl = Math.max(maxControl, cos(c, d))
let minTrue = 1
for (let i = 0; i < queries.length; i += 1) minTrue = Math.min(minTrue, cos(queries[i], docs[i]))

console.log("")
console.log(`НЕГАТИВНЫЙ КОНТРОЛЬ:`)
console.log(`  худшая близость ВЕРНОЙ пары    : ${minTrue.toFixed(3)}`)
console.log(`  лучшая близость ПОСТОРОННЕЙ    : ${maxControl.toFixed(3)}`)
console.log(`  разделяются                    : ${minTrue > maxControl ? "ДА — порог существует" : "НЕТ — порога нет, отбор по близости лгал бы"}`)

if (misses.length > 0) {
  console.log("")
  console.log(`промахи первого места (${misses.length}):`)
  for (const m of misses.slice(0, 5)) console.log(`  ${m}`)
}

console.log("")
const verdict = at1 / PAIRS.length
console.log(
  verdict >= 0.8
    ? "ВЫВОД: вектор по саммари ГОДИТСЯ как ПРЕДЛОЖЕНИЕ «похоже на №N»."
    : verdict >= 0.5
      ? "ВЫВОД: вектор работает НЕУВЕРЕННО — только как предложение, и всегда с подтверждением человека."
      : "ВЫВОД: вектор по саммари НЕ ГОДИТСЯ. Постройку отменить, вопрос решать SQL по типизированным колонкам.",
)
console.log("===MEASURE_146_1===DONE")
