// ПРИБОР ПОДШАГА 143-2 — протокол закрытия: условия из фактов, ничего молча.
//
// Запуск: npx tsx scripts/probe/closing-143-2.mjs
import { decideClosing, isInteresting } from "../../lib/automations/closing"

const MARK = "===PROBE_143_2==="
console.log(MARK)
let bad = 0
const check = (name, got, want) => {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? "✓" : "✗"} ${name}: ${got}${ok ? "" : ` — ждали ${want}`}`)
}

const simple = {
  automationId: 1, messages: 2, factKeys: ["entity.note"], tools: [], fromMedia: false,
  hasNextStep: false, publicContract: null, feedbackAsked: false, missingFacts: [],
}
const rich = {
  automationId: 2, messages: 6, factKeys: ["entity.receipt", "field.money", "field.geo"],
  tools: ["ocr"], fromMedia: true, hasNextStep: true, publicContract: "excursions",
  feedbackAsked: false, missingFacts: ["field.calories"],
}

const s = decideClosing(simple, "whole")
console.log("простая автоматизация, закрыта целиком:")
for (const d of s) console.log(`  ${d.do ? "ДА " : "нет"} ${d.action} — ${d.why}`)
check("решений всегда пять", s.length, 5)
check("ни одно действие не запущено", s.filter(d => d.do).length, 0)
check("у каждого решения названа причина", s.every(d => d.why.length > 0), true)

const r = decideClosing(rich, "whole")
console.log("содержательная автоматизация, закрыта целиком:")
for (const d of r) console.log(`  ${d.do ? "ДА " : "нет"} ${d.action} — ${d.why}`)
check("отзыв запрашивается", r.find(d => d.action === "ask-feedback").do, true)
check("публичная страница обновляется", r.find(d => d.action === "refresh-public").do, true)
check("предложение признака есть", r.find(d => d.action === "propose-fact").do, true)
// 🔒 НЕГАТИВНЫЙ: инструменты сработали — значит задача решена имеющимся, заявки не надо.
check("заявка на разработку НЕ шлётся, раз инструмент сработал", r.find(d => d.action === "dev-request").do, false)
// 🔒 НЕГАТИВНЫЙ: следующая ступень — только при закрытии ШАГА.
check("ступень не ставится при закрытии целиком", r.find(d => d.action === "next-step").do, false)

const st = decideClosing(rich, "step")
console.log("та же автоматизация, закрыт ШАГ:")
for (const d of st) console.log(`  ${d.do ? "ДА " : "нет"} ${d.action} — ${d.why}`)
check("ступень ставится", st.find(d => d.action === "next-step").do, true)
check("отзыв при закрытии шага НЕ спрашивается", st.find(d => d.action === "ask-feedback").do, false)
// 🔒 НЕГАТИВНЫЙ, НАЙДЕННЫЙ ЭТИМ ЖЕ ПРИБОРОМ: причина обязана объяснять РЕШЕНИЕ.
check("причина отказа объясняет отказ, а не обратное", st.every(d => d.do || !d.why.startsWith("у автоматизации есть")), true)
check("при закрытии шага причины говорят про шаг", st.filter(d => !d.do && d.why.includes("шаг")).length, 4)

// 🔒 НЕГАТИВНЫЙ: повторное закрытие не просит второго отзыва.
const again = decideClosing({ ...rich, feedbackAsked: true }, "whole")
check("второй отзыв за тот же номер не запрашивается", again.find(d => d.action === "ask-feedback").do, false)

check("порог интереса: короткий цикл без инструментов", isInteresting(simple), false)
check("порог интереса: инструменты и медиа", isInteresting(rich), true)

console.log(bad ? `${MARK} ОТКАЗ: ${bad}` : `${MARK}DONE`)
process.exit(bad ? 1 : 0)
