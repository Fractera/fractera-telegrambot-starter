// ПРИБОР ПОДШАГА 162-2 — уровень 1 читает ВСЕ таблицы-кандидаты, а не только личные.
//
// ДВЕ ПЛОСКОСТИ, НАЗВАННЫЕ В ТЗ ЗАРАНЕЕ:
//   1) снимок «до» и «после» — значение из чужой таблицы находится вопросом
//      человека словами; «до» снят 2026-09-08 и приведён в итоге дословно;
//   2) провенанс — каждое значение называет ключ, таблицу и колонку, и значение
//      по всем записям склада не выдаётся за факт о человеке.
//
// 🔒 ЗОВЁТ ТОЛЬКО ДВЕРЬ: замок и жизнь службы проверяются тем же путём.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_162_2==="

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
  const r = await fetch(`${app}/api/agent/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ fn: "read", args }),
  })
  const j = await r.json().catch(() => ({}))
  return j.answer ?? {}
}

console.log(MARK)

// ── ПЛОСКОСТЬ 1: ЗНАЧЕНИЕ ИЗ ЧУЖОЙ ТАБЛИЦЫ НАХОДИТСЯ ВОПРОСОМ СЛОВАМИ ──────
//
// «До» (снято 2026-09-08 на коммите 5f2b945): тот же вопрос давал found:false,
// хотя `looked` называл tgdesk_entries кандидатом. Читались только личные признаки.
const memo = await read({ query: "что ты запомнил дословно" })
const memoItem = (memo.items ?? []).find(i => i.key === "entity.memo")
say(memo.found === true && !!memoItem,
  `вопрос словами достал значение из ЧУЖОЙ таблицы: ${memoItem ? memoItem.key + "=" + JSON.stringify(memoItem.value) : "НЕ НАЙДЕНО"}`)
say(memoItem?.from === "tgdesk_entries.kind",
  `названы таблица и колонка: ${memoItem?.from}`)

// 🔒 ГЛАВНЫЙ НЕГАТИВНЫЙ КОНТРОЛЬ ЭТОГО ПОДШАГА: КОЛОНКУ-ПЕРЕЧИСЛЕНИЕ ДЕЛЯТ
// ШЕСТЬ ПРИЗНАКОВ, И ВОПРОС ПРО ЧЕКИ НЕ ИМЕЕТ ПРАВА ОТВЕТИТЬ ЗАМЕТКОЙ.
// ✗ до правки `recall` читал «последнее непустое значение колонки» и на
// `entity.receipt` отдавал `memo` — уверенная ложь с безупречной формой.
const receipt = await read({ key: "entity.receipt" })
const receiptValues = (receipt.items ?? []).map(i => i.value)
say(!receiptValues.includes("memo"),
  `вопрос про чеки не отвечает заметкой: ${JSON.stringify(receiptValues)}`)
say(receipt.found === false,
  `чеков в складе нет — честное «нет»: ${JSON.stringify(receipt.hint ?? "")}`)

// Обратная сторона того же правила: заметки в складе ЕСТЬ, и они находятся.
const memoByKey = await read({ key: "entity.memo" })
say(memoByKey.found === true && (memoByKey.items ?? [])[0]?.value === "memo",
  `заметки в том же складе находятся: ${JSON.stringify((memoByKey.items ?? [])[0]?.value)}`)

// ── ПЛОСКОСТЬ 2: ПРОВЕНАНС И ЧЕСТНЫЙ ПРОМАХ ───────────────────────────────
say((memo.items ?? []).every(i => typeof i.from === "string" && i.from.length > 0),
  `у каждого значения назван адрес: ${JSON.stringify((memo.items ?? []).map(i => i.from))}`)

// 🛑 «ПО ВСЕМ ЗАПИСЯМ» НЕ ВЫДАЁТСЯ ЗА «О ЧЕЛОВЕКЕ»: у значения из чужой таблицы
// сужать по субъекту нечем, и ответ обязан это говорить.
say(memoItem?.about === "all-records",
  `значение из чужой таблицы помечено «по всем записям»: ${memoItem?.about}`)

// 🔒 КАНДИДАТ БЕЗ ЗНАЧЕНИЙ НАЗЫВАЕТСЯ ПРИЧИНОЙ, А НЕ ИСЧЕЗАЕТ МОЛЧА.
const missing = memo.missing ?? []
say(missing.length > 0, `непустой список промахов: ${missing.length}`)
say(missing.every(m => typeof m.why === "string" && m.why.length > 0),
  `у каждого промаха названа причина: ${JSON.stringify(missing.slice(0, 2).map(m => m.key + " → " + m.why))}`)

// 🔒 «НЕ ХРАНИТСЯ ПО УСТРОЙСТВУ» — ЗАКОННЫЙ ПРОМАХ, А НЕ ОТКАЗ: ветвь разбора
// значений не оставляет, и это обязано звучать иначе, чем «пусто».
const branch = await read({ query: "о чём меня спрашивали" })
const byDesign = (branch.missing ?? []).find(m => /ветвь обработки/.test(String(m.why)))
say(!!byDesign, `ветвь разбора названа отдельно: ${byDesign ? byDesign.key + " → " + byDesign.why : "НЕТ"}`)

// 🔒 ЛИЧНЫЕ ПРИЗНАКИ НЕ СЛОМАНЫ ТОЙ ЖЕ ПРАВКОЙ: у них сужение по субъекту
// работает и адрес — своя таблица.
const city = await read({ key: "person.city" })
say(city.found === false || (city.items ?? [])[0]?.about === "self",
  `личный признак остался личным: ${(city.items ?? [])[0]?.about ?? "значений нет — " + city.hint}`)

// 🔒 ЛЕСТНИЦА КОЛОНОК У ЧИТАЮЩЕГО (найдено этим же подшагом).
// ✗ ДО ПРАВКИ: шесть из девяти личных таблиц остались старой формы, потому что
// лестницу звал только писатель. `SELECT … claim, basis …` падал целиком, и
// признак отвечал «слой данных не ответил» — то есть поломкой службы.
for (const k of ["person.nationality", "person.name", "person.tone"]) {
  const r = await read({ key: k })
  const hint = String(r.hint ?? "")
  say(!/слой данных не ответил/.test(hint),
    `${k}: «${r.found === true ? "есть значение" : hint}»`)
}

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
