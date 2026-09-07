// ПРИБОР ПОДШАГА 155-1 — род сообщения как закрытый список.
// Запуск: npx tsx scripts/probe/separation-155-1.mjs
import { MESSAGE_KINDS, isMessageKind, opensAutomation, categoryLine } from "../../lib/task/separation"

const MARK = "===PROBE_155_1==="
console.log(MARK)
let bad = 0
const check = (name, got, want) => {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? "✓" : "✗"} ${name}: ${got}${ok ? "" : ` — ждали ${want}`}`)
}

check("родов пять", MESSAGE_KINDS.length, 5)
for (const k of MESSAGE_KINDS) check(`законный род «${k}»`, isMessageKind(k), true)

// 🔒 НЕГАТИВНЫЕ: незнание не имеет права молча стать категорией.
check("«automation» без уточнения отвергнут", isMessageKind("automation"), false)
check("пустая строка отвергнута", isMessageKind(""), false)
check("чужое слово отвергнуто", isMessageKind("вопрос"), false)

check("общий вопрос НЕ заводит автоматизацию", opensAutomation("general"), false)
check("заявка на разработку НЕ заводит автоматизацию", opensAutomation("dev-request"), false)
check("«не разобрано» НЕ заводит автоматизацию", opensAutomation("unparsed"), false)
check("вопрос к памяти заводит", opensAutomation("automation-read"), true)
check("запрос на запись заводит", opensAutomation("automation-write"), true)

console.log(`строка о категории: «${categoryLine("automation-write")}»`)
console.log(`та же по-английски: «${categoryLine("general", "en")}»`)
check("строка не пустая ни у одного рода", MESSAGE_KINDS.every(k => categoryLine(k).length > 30), true)

console.log(bad ? `${MARK} ОТКАЗ: ${bad}` : `${MARK}DONE`)
process.exit(bad ? 1 : 0)
