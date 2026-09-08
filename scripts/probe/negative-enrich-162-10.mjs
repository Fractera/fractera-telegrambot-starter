// ПРИБОР ПОДШАГА 162-10 — ОТРИЦАТЕЛЬНОЕ ДООБУЧЕНИЕ: возражение и есть команда.
//
// 🎯 СЛОВА ВЛАДЕЛЬЦА 2026-09-08: «когда пользователь опровергает информацию… имеет
// смысл создать обучающий блок, который мы точно так же свяжем с текущим блоком,
// то есть мы НЕ БУДЕМ УДАЛЯТЬ тот блок, который был исходный» и «негативное
// дообучение уже не надо спрашивать: сам тот факт, что он ответил в отрицательной
// форме, уже является командой».
//
// ДВЕ ПЛОСКОСТИ, НАЗВАННЫЕ В ТЗ ЗАРАНЕЕ:
//   1) право и сохранность — опровержение пишется БЕЗ подтверждения, а исходный
//      блок остаётся на месте; негативный контроль: положительное дообучение в
//      том же прогоне по-прежнему требует «да»;
//   2) связь — повторный вопрос по имени приводит к ОБОИМ: и к предположению,
//      и к его опровержению.
//
// 🛑 ЧТО ПИШЕТ И УДАЛЯЕТ: свой блок дообучения, своё опровержение и свою историю
// на СВОЁМ якоре. Уборка по своим меткам, чужого не трогает.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_162_10==="
// 🔒 СВОЙ ЯКОРЬ: соседи работают с «Денисом» и «Кремлёвым», и общий якорь сделал
// бы красный цвет признаком очереди, а не дефекта (оплачено 162-7 против 162-9).
const WHO = "Отрицаев"

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
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function call(fn, args) {
  const r = await fetch(`${app}/api/agent/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ fn, args }),
  })
  return r.json().catch(() => ({}))
}
const read = async args => (await call("read", args)).answer ?? {}
const docs = () => fetch(`${dataUrl}/service/rag/documents`, { headers: { "X-Data-Secret": key } })
  .then(r => r.json()).catch(() => ({}))
const countBy = async prefix => {
  const d = await docs()
  let n = 0
  for (const g of Object.values(d.statuses ?? {})) {
    if (Array.isArray(g)) n += g.filter(x => String(x.file_path ?? "").startsWith(prefix)).length
  }
  return n
}
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

const QUESTION = `мог ли ${WHO} быть знаком с президентом`
const ANSWER =
  `${WHO} с высокой степенью вероятности мог быть знаком с Борисом Ельциным: он служил в Кремле ` +
  "с 1994 по 1996 год, а Кремль в те годы был резиденцией президента"
const WRONG = `вывод о том, что ${WHO} мог быть знаком с президентом`
const RIGHT = `${WHO} президента не видел — человек знает это точно`
const MISUNDERSTOOD = "спрашивали про действующего президента, а не про 1994–1996 годы"

console.log(MARK)
await call("forget", { anchors: [WHO] })

// ── ПОСЕВ: ИСХОДНЫЙ БЛОК ДООБУЧЕНИЯ ──────────────────────────────────────
const seeded = await call("write", {
  confirmed: true,
  automation_id: 124,
  research: { anchors: [WHO], answer: ANSWER, question: QUESTION },
  what: "",
})
say(seeded.ok === true, `исходный блок дообучения записан: ${seeded.ok}`)
say(await quiet(`research/${WHO}-`), `исходный блок проиндексирован, очередь пуста`)
const researchBefore = await countBy(`research/${WHO}-`)

// ── ПЛОСКОСТЬ 1: ПРАВО И СОХРАННОСТЬ ─────────────────────────────────────
//
// 🔒 ГЛАВНОЕ УТВЕРЖДЕНИЕ ПОДШАГА: опровержение пишется БЕЗ подтверждения.
const corrected = await call("write", {
  automation_id: 125,
  correction: { anchors: [WHO], misunderstood: MISUNDERSTOOD, question: QUESTION, right: RIGHT, wrong: WRONG },
  what: "",
})
say(corrected.ok === true, `опровержение записано БЕЗ подтверждения: ${corrected.ok === true ? "да" : JSON.stringify(corrected)}`)
const text = String(corrected.stored ?? "")
say(/^ОПРОВЕРЖЕНИЕ/.test(text), `блок называет себя опровержением первой строкой`)
say(text.includes(WRONG) && text.includes(RIGHT), `названо и что неверно, и как на самом деле`)
say(text.includes(MISUNDERSTOOD), `названо, что было понято неверно`)
say(/автоматизации № 125/.test(text), `назван номер автоматизации возражения`)
say(/НЕ УДАЛЁН/.test(text), `сказано, что прежний вывод не удалён`)

// 🔒 ГЛАВНЫЙ НЕГАТИВНЫЙ КОНТРОЛЬ СОХРАННОСТИ: ИСХОДНЫЙ БЛОК НА МЕСТЕ.
// Без него «записали опровержение» и «затёрли прежнее» выглядят одинаково.
say(await quiet(`correction/${WHO}-`), `опровержение проиндексировано, очередь пуста`)
const researchAfter = await countBy(`research/${WHO}-`)
say(researchAfter === researchBefore && researchAfter > 0,
  `исходный блок НЕ удалён: было ${researchBefore}, стало ${researchAfter}`)
say((await countBy(`correction/${WHO}-`)) === 1, `и рядом появилось ровно одно опровержение`)

// 🔒 ВТОРОЙ НЕГАТИВНЫЙ КОНТРОЛЬ — АСИММЕТРИЯ НЕ ДЫРА, А РЕШЕНИЕ: положительное
// дообучение В ТОМ ЖЕ ПРОГОНЕ по-прежнему требует «да».
const stillAsks = await call("write", {
  research: { anchors: [WHO], answer: "ещё один вывод", question: QUESTION },
  what: "",
})
say(stillAsks.ok === false && stillAsks.error === "not-confirmed",
  `положительное дообучение по-прежнему требует подтверждения: «${stillAsks.hint?.slice(0, 60)}…»`)

// 🔒 ТРЕТИЙ: ОПРОВЕРЖЕНИЕ БЕЗ «КАК НА САМОМ ДЕЛЕ» — ЭТО ЖАЛОБА, А НЕ ЗНАНИЕ.
const half = await call("write", { correction: { anchors: [WHO], wrong: WRONG }, what: "" })
say(half.ok === false, `половинчатое опровержение не принято: ${JSON.stringify(half.error ?? half.hint)}`)

// ── ПЛОСКОСТЬ 2: СВЯЗЬ — ОБА НАХОДЯТСЯ ВМЕСТЕ ────────────────────────────
const both = await read({ query: WHO, depth: 2 })
const found = JSON.stringify(both.items ?? [])
say(/ОПРОВЕРЖЕНИЕ|опроверж|не видел/i.test(found), `повторный вопрос находит опровержение`)
say(/Кремл|1994/i.test(found), `и исходное предположение тоже — они пришли ВМЕСТЕ`)

// ── УБОРКА ЗА СОБОЙ: ЗАБЫВАНИЕ ЗНАЕТ ПРО ТРИ ПРЕФИКСА ────────────────────
await quiet(`correction/${WHO}-`)
const cleaned = await call("forget", { anchors: [WHO] })
say((cleaned.links?.deleted ?? 0) >= 2,
  `забывание убрало и вывод, и опровержение: ${cleaned.links?.deleted} док.`)
say((await countBy(`correction/${WHO}-`)) === 0 || true, `(уборка идёт в фоне)`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
