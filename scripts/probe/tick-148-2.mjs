// ПРИБОР ПОДШАГА 148-2 — правило пропущенного времени и слова опоздания.
//
// Идёт по КОДУ ПРОДУКТА (`tickOnce`, `lateNote`) на поддельном хранилище:
// поведение при пропуске — это решение владельца, и проверять его надо на той
// самой ветке, что исполняется в проде, а не на копии в приборе.
//
// Запуск: npx tsx scripts/probe/tick-148-2.mjs
import { lateNote } from "../../lib/schedule/late-note"

const MARK = "===PROBE_148_2_UNIT==="
console.log(MARK)
let bad = 0
const check = (name, got, want) => {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? "✓" : "✗"} ${name}: ${got}${ok ? "" : ` — ждали ${want}`}`)
}

const entry = {
  id: 1, automationId: null, kind: "human", state: "planned",
  payload: "купить подарок маме", scopeKey: "geo-city=madrid",
  tz: "Europe/Madrid", saidAt: "2026-09-07T10:00:00Z",
  dueAt: "2026-09-08T17:00:00Z", firedAt: null, note: null,
}

const note = lateNote(entry)
console.log(`пометка опоздания: «${note}»`)
check("названо МЕСТНОЕ время, а не UTC", note.includes("19:00"), true)
check("названа зона", note.includes("Europe/Madrid"), true)
// 🔒 НЕГАТИВНЫЙ: пометка не должна печатать время сервера — 17:00 это UTC.
check("время сервера в пометке НЕ печатается", note.includes("17:00"), false)

const noTz = lateNote({ ...entry, tz: null })
console.log(`без зоны: «${noTz}»`)
check("без зоны показывается сырой срок, а не выдуманное местное", noTz.includes("2026-09-08T17:00:00Z"), true)

console.log(bad ? `${MARK} ОТКАЗ: ${bad}` : `${MARK}DONE`)
process.exit(bad ? 1 : 0)
