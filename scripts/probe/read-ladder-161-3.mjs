// ПРИБОР ПОДШАГА 161-3 — чтение: лестница внутри ящика, бюджет параметром.
//
// ДВЕ ПЛОСКОСТИ, НАЗВАННЫЕ В ТЗ ЗАРАНЕЕ:
//   1) время и число обращений — `fast` отвечает по записанному за десятки
//      миллисекунд и НЕ ходит в знание об окружении; `deep` ходит и стоит секунды;
//   2) форма ответа — каждое значение помечено, и ответ сам называет цену глубины.
//
// 🛑 ПИШЕТ В ЖИВУЮ ПАМЯТЬ И УБИРАЕТ ЗА СОБОЙ ПО СВОЕЙ МЕТКЕ.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_161_3==="
const TAG = "прибор 161-3"

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

const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))

async function memory(fn, args) {
  const started = Date.now()
  const r = await fetch(`${app}/api/agent/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ fn, args }),
  })
  const json = await r.json().catch(() => ({}))
  return { status: r.status, json, ms: Date.now() - started }
}

console.log(MARK)

// ── ПОДГОТОВКА: два факта о человеке, один сказанный, один выведенный ──────
await memory("write", { key: "person.occupation", what: "Проба-занятие-163", source: TAG })
await memory("write", {
  key: "person.currency",
  what: "EUR",
  claim: "guess",
  basis: "человек называл цены в евро",
  source: TAG,
})

// ── ПЛОСКОСТЬ 1: ВРЕМЯ И ГЛУБИНА ──────────────────────────────────────────
let r = await memory("read", { key: "person.occupation" })
say(r.json.answer?.found === true && r.ms < 1500,
  `по ключу ответ за ${r.ms} мс — из записанного, без обращения к связям`)

r = await memory("read", {})
const all = r.json.answer?.items ?? []
say(r.json.answer?.found === true && all.length >= 2 && r.ms < 3000,
  `«что ты знаешь обо мне» ОДНИМ вызовом: ${all.length} значений за ${r.ms} мс`)

// 🔒 ГЛАВНЫЙ ЗАМЕР БЮДЖЕТА: незнакомый вопрос при `fast` НЕ идёт в связи —
// значит и не стоит секунд. Порог 1500 мс взят с запасом к измеренным 30 мс базы;
// обращение к связям измерено в 885–5016 мс и в него не укладывается.
const unknown = "что известно о человеке по фамилии Ратмиров"
r = await memory("read", { query: unknown })
const fastMs = r.ms
// 🪦 ПЕРЕНАЦЕЛЕНО 2026-09-08 ШАГОМ 162-2, И ЭТО СМЕНА УТВЕРЖДЕНИЯ О СОСТОЯНИИ,
// А НЕ ПРАВИЛА. Здесь стояло `found === false`: до 162-2 уровень 1 читал только
// личные признаки и на этом вопросе не находил НИЧЕГО. Теперь он читает все
// таблицы-кандидаты и законно может что-то найти. Правило же — «быстрый путь НЕ
// ходит в связи» — осталось и проверяется прямо: ни одного значения оттуда.
const fastFromLinks = (r.json.answer?.items ?? []).filter(i => /связ/i.test(String(i.from ?? "")))
say(fastFromLinks.length === 0 && fastMs < 1500,
  `fast за ${fastMs} мс и в связи НЕ ходил: значений оттуда ${fastFromLinks.length}`)
say(r.json.answer?.deeper?.available === true && r.json.answer?.deeper?.cost_seconds > 0,
  `ответ сам предлагает глубину и называет цену: ${r.json.answer?.deeper?.cost_seconds} с — «${String(r.json.answer?.deeper?.what ?? "").slice(0, 60)}»`)

r = await memory("read", { query: unknown, budget: "deep" })
const deepMs = r.ms
// 🪦 ПЕРЕНАЦЕЛЕНО 2026-09-08 ШАГОМ 162-3: здесь бралось `items[0]`. Уровни стали
// КУМУЛЯТИВНЫМИ — глубина 2 содержит всё, что дал уровень 1, и найденное в связях
// стоит после записанного. Утверждение «ответ из связей ПЕРВЫЙ» перестало быть
// верным законно; правило «в связях нашлось» осталось и проверяется по любому
// значению оттуда.
// 🪦 И ВТОРОЙ РАЗ ТОГО ЖЕ ДНЯ: уровень 2 спрашивает связи НЕСКОЛЬКИМИ запросами —
// именами из уровня 1 И словами человека, — поэтому «первый ответ из связей» и
// «ответ из связей» перестали быть одним и тем же. Проверяем ЛЮБОЙ из них.
const fromLinks = (r.json.answer?.items ?? []).filter(i => /связ/i.test(String(i.from ?? "")))
const deepItem = {
  claim: fromLinks[0]?.claim,
  value: fromLinks.map(i => String(i.value ?? "")).join(" \n "),
}
// 🛑 ОБРАЗЕЦ ТЕРПИТ ОБА ЯЗЫКА, И ЭТО НЕ ПОБЛАЖКА, А ИСПРАВЛЕНИЕ СЛЕПОТЫ.
// ✗ измерено 161-3: на строчный вопрос граф отвечает ПО-АНГЛИЙСКИ («is a person
// who has been maintaining a beehive»), и русский образец объявил это отказом —
// прибор врал о живой находке. Негативный контроль сам нуждается в проверке.
say(r.json.answer?.found === true && /пасек|мёд|мед|ярмарк|beehive|honey|bee/i.test(String(deepItem?.value ?? "")),
  `deep нашёл в связях за ${deepMs} мс: «${String(deepItem?.value ?? "").slice(0, 80).replace(/\n/g, " ")}…»`)
// 🔒 РАЗНИЦА ВО ВРЕМЕНИ И ЕСТЬ ДОКАЗАТЕЛЬСТВО, ЧТО БЮДЖЕТ РАБОТАЕТ, А НЕ ЧИСЛИТСЯ.
say(deepMs > fastMs * 2, `глубина дороже быстрого пути: ${deepMs} мс против ${fastMs} мс`)
// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ ПРЕДЛОЖЕНИЯ: на ПОСЛЕДНЕМ уровне предлагать нечего.
// 🪦 ПЕРЕНАЦЕЛЕНО 2026-09-08 ШАГОМ 162-3 — И ЭТО РЕШЕНИЕ ВЛАДЕЛЬЦА, А НЕ ПОДГОНКА.
// Здесь проверялось, что `budget: "deep"` — конец лестницы: уровней было ДВА.
// Теперь их три (записанное · связи · похожее по смыслу), и `deep` равен второму,
// после которого честно предлагается третий. Правило «на дне предлагать нечего»
// не изменилось — изменилось, где дно.
say(r.json.answer?.deeper?.available === true && /вектор|похож/i.test(String(r.json.answer?.deeper?.what ?? "")),
  `после связей предлагается последний уровень: «${String(r.json.answer?.deeper?.what ?? "")}»`)
const bottom = await memory("read", { query: unknown, depth: 3 })
say(bottom.json.answer?.deeper?.available === false,
  `на последнем уровне глубже не предлагается: «${String(bottom.json.answer?.deeper?.what ?? "")}»`)

// ── ПЛОСКОСТЬ 2: ФОРМА ОТВЕТА ─────────────────────────────────────────────
say(deepItem?.claim === "guess" && Boolean(deepItem?.basis),
  `пришедшее из связей помечено предположением: claim=${deepItem?.claim}`)

r = await memory("read", {})
const items = r.json.answer?.items ?? []
const guessed = items.find(i => i.key === "person.currency")
const said = items.find(i => i.key === "person.occupation")
say(guessed?.claim === "guess" && /евро/.test(String(guessed?.basis ?? "")),
  `выведенное значение помечено: ${guessed?.key} claim=${guessed?.claim}`)
// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ ПОМЕТКИ: сказанное человеком предположением НЕ становится.
say(said?.claim === null || said?.claim === undefined,
  `сказанное человеком без пометки: ${said?.key} claim=${String(said?.claim)}`)

// 🔒 НЕИЗВЕСТНЫЙ КЛЮЧ — ЗАКОННЫЙ ПРОМАХ, А НЕ ОШИБКА СЛУЖБЫ.
r = await memory("read", { key: "person.avoid" })
say(r.status === 200 && r.json.answer?.found === false,
  `пустой признак: ${r.status}, found=false, «${String(r.json.answer?.hint ?? "").slice(0, 50)}»`)

// ── УБОРКА ПО СВОЕЙ МЕТКЕ ─────────────────────────────────────────────────
await sql("DELETE FROM fact_person_occupation WHERE source = ?", [TAG])
await sql("DELETE FROM fact_person_currency WHERE source = ?", [TAG])
const left = await sql("SELECT COUNT(*) AS n FROM fact_person_currency WHERE source = ?", [TAG])
say(Number(left.rows?.[0]?.n ?? 1) === 0, `после уборки своих строк осталось: ${left.rows?.[0]?.n}`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
