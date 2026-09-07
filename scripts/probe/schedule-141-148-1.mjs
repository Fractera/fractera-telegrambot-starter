// ПРИБОР ПОДШАГА 148-1 — срок с тремя временами и часовым поясом.
//
// Считает время в зонах через `localToUtcIso` — тот же код, что у продукта.
// Запуск: npx tsx scripts/probe/schedule-141-148-1.mjs
import { localToUtcIso, isKnownZone } from "../../lib/products/telegram-desk/timezone"

const MARK = "===PROBE_148_1==="
console.log(MARK)
let bad = 0
const check = (name, got, want) => {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? "✓" : "✗"} ${name}: ${got}${ok ? "" : ` — ждали ${want}`}`)
}

// «Завтра вечером» = 2026-09-08 20:00 по МЕСТНОМУ времени.
const local = "2026-09-08 20:00"
const madrid = localToUtcIso(local, "Europe/Madrid")
const london = localToUtcIso(local, "Europe/London")
console.log(`вечер в Мадриде → ${madrid}`)
console.log(`вечер в Лондоне → ${london}`)
check("вечер в Мадриде и вечер в Лондоне — РАЗНОЕ время", madrid !== london, true)
check("Мадрид раньше Лондона на час", Date.parse(london) - Date.parse(madrid), 3600000)

// 🔒 НЕГАТИВНЫЙ: неизвестная зона обязана быть отвергнута, а не молча заменена UTC.
check("выдуманная зона не проходит проверку", isKnownZone("Europe/Atlantis"), false)
check("настоящая зона проходит", isKnownZone("Europe/Madrid"), true)

console.log(bad ? `${MARK} ОТКАЗ: ${bad}` : `${MARK}DONE`)
process.exit(bad ? 1 : 0)
