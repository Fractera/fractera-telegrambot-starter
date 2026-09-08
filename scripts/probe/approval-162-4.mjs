// ПРИБОР ПОДШАГА 162-4 — дорогой уровень не выполняется без разрешения человека.
//
// ДВЕ ПЛОСКОСТИ, НАЗВАННЫЕ В ТЗ ЗАРАНЕЕ:
//   1) поведение двери — без `approved` отказ с ценой; с `approved` ответ приходит.
//      Негативный контроль: уровни 1 и 2 разрешения НЕ требуют;
//   2) время — отказ приходит за десятки мс: дорогой путь НЕ НАЧИНАЛСЯ, а не был
//      выполнен и отброшен.
//
// 🛑 ЭТОТ ПРИБОР НИЧЕГО НЕ ПИШЕТ И НИЧЕГО НЕ УДАЛЯЕТ: он спрашивает.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_162_4==="

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
const app = process.env.PROBE_APP_URL || "http://127.0.0.1:3600"
if (!key) { console.log(`${MARK} НЕТ КЛЮЧА СЛОЯ ДАННЫХ`); process.exit(2) }

let bad = 0
const say = (ok, what) => { if (!ok) bad += 1; console.log(`${ok ? "✓" : "✗"} ${what}`) }

async function read(args) {
  const t = Date.now()
  const r = await fetch(`${app}/api/agent/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ fn: "read", args }),
  })
  const j = await r.json().catch(() => ({}))
  return { answer: j.answer ?? {}, ms: Date.now() - t }
}
const lvl = (a, n) => (a.levels ?? []).find(l => l.level === n)
const Q = "что известно о человеке по фамилии Ратмиров"

console.log(MARK)

// ── ПЛОСКОСТЬ 1: ПОВЕДЕНИЕ ДВЕРИ ──────────────────────────────────────────
const held = await read({ query: Q, depth: 3 })
const l3 = lvl(held.answer, 3)
say(!!l3 && l3.added === 0 && /нужно согласие человека/.test(String(l3.note ?? "")),
  `без разрешения третий уровень НЕ выполнен: «${String(l3?.note ?? "").slice(0, 90)}…»`)
say(/\d+ с/.test(String(l3?.note ?? "")), `отказ называет цену в секундах: «${String(l3?.note ?? "").match(/около \d+ с/) ?? "НЕ НАЗВАНА"}»`)
say(/approved/.test(String(l3?.note ?? "")), `отказ называет, чем это снять`)
say(!(held.answer.items ?? []).some(i => /вектор/i.test(String(i.from ?? ""))),
  `значений от дорогого уровня в ответе нет`)

const allowed = await read({ query: Q, depth: 3, approved: true })
const l3ok = lvl(allowed.answer, 3)
say(!!l3ok && !/нужно согласие человека/.test(String(l3ok.note ?? "")),
  `с разрешением уровень работает: «${String(l3ok?.note ?? "").slice(0, 80)}»`)
say((allowed.answer.items ?? []).some(i => /вектор/i.test(String(i.from ?? ""))),
  `с разрешением пришло значение от вектора`)

// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ: ДЕШЁВЫЕ УРОВНИ РАЗРЕШЕНИЯ НЕ ТРЕБУЮТ. Иначе «запрет
// работает» доказывалось бы тем, что мы запретили всё подряд.
const cheap = await read({ query: Q, depth: 2 })
say((cheap.answer.levels ?? []).every(l => !/нужно согласие/.test(String(l.note ?? ""))),
  `уровни 1 и 2 разрешения не требуют: ${JSON.stringify((cheap.answer.levels ?? []).map(l => l.level))}`)

// ── ПЛОСКОСТЬ 2: ВРЕМЯ — ДОРОГОЙ ПУТЬ НЕ НАЧИНАЛСЯ ────────────────────────
//
// 🔒 ОТКАЗ ОБЯЗАН БЫТЬ ДЕШЕВЛЕ РАЗРЕШЁННОГО ВЫЗОВА. Равное время означало бы,
// что уровень выполняется и результат выбрасывается — то есть человек ждёт того,
// на что не соглашался.
say(l3?.ms === 0, `отказ стоил ${l3?.ms} мс внутри уровня`)
say(held.ms < allowed.ms,
  `весь запрос с отказом дешевле разрешённого: ${held.ms} мс против ${allowed.ms} мс`)

// 🔒 И ПРЕДЛОЖЕНИЕ ГЛУБИНЫ ЧЕСТНО ПРЕДУПРЕЖДАЕТ О РАЗРЕШЕНИИ ЗАРАНЕЕ.
const two = await read({ query: Q, depth: 2 })
say(/approved/.test(String(two.answer.deeper?.what ?? "")),
  `на втором уровне предложение уже говорит про разрешение: «${String(two.answer.deeper?.what ?? "").slice(0, 90)}»`)
say(Number(two.answer.deeper?.cost_seconds) >= 3,
  `цена следующего уровня названа числом: ${two.answer.deeper?.cost_seconds} с`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
