// ПРИБОР 170 — ЯЗЫК ЧЕЛОВЕКА ОПРЕДЕЛЯЕТСЯ РАНЬШЕ ВСЕХ ОСТАЛЬНЫХ ВОПРОСОВ.
//
// 🎯 СЛОВО ВЛАДЕЛЬЦА 2026-09-09: «таблица первичных базовых настроек, кроме
// часового пояса, не сможет нормально работать, если не будет отвечать на том
// языке, на котором ожидает пользователь».
//
// ✗ ЧЕМ ОПЛАЧЕН ШАГ, И ЭТО БЫЛ ЗАМКНУТЫЙ КРУГ. `person.language` стоял ПЯТЫМ в
// очереди знакомства, а `nextQuestion` при неизвестном языке брал русский:
// англоязычный человек получал первый вопрос по-русски, не отвечал — и язык не
// узнавался никогда, потому что узнать его можно было только ответом.
//
// 🛑 ЧТО ПИШЕТ И ЧЬЁ ЭТО: значения `fact_person_language` с меткой `probe-170`.
// Уборка по метке и по значению — `mutate` пишет свой источник и метку прибора
// не несёт (закон, оплаченный в 164-12).
import { readFileSync } from "node:fs"

const MARK = "===PROBE_170==="
const SOURCE = "probe-170"

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
const call = (fn, args) => fetch(`${app}/api/agent/memory`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ fn, args }),
}).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }))
const read = async args => (await call("read", args)).answer ?? {}
const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))

const clean = () => sql("DELETE FROM fact_person_language", [])

console.log(MARK)
await clean()

// ── 1. ОЧЕРЕДЬ НАЧИНАЕТСЯ С ЯЗЫКА ───────────────────────────────────────
{
  const a = await read({ limit: 20 })
  const q = a.acquaint ?? null
  say(q?.key === "person.language",
    `при пустой памяти память спрашивает первым: ${q?.key ?? "НИЧЕГО"} — «${q?.ask ?? ""}»`)
  // 🛑 УМОЛЧАНИЕ БОЛЬШЕ НЕ РУССКОЕ: язык неизвестен → английский как нейтральный.
  // Русский по умолчанию был допущением о человеке, которого мы ещё не знаем.
  say(q?.ask_in === "en",
    `язык неизвестен → эталон фразы английский, а не русский: ask_in=${q?.ask_in}, say_in=${q?.say_in}`)
}

// ── 2. ЯЗЫК ЗАПИСЫВАЕТСЯ НАБЛЮДЕНИЕМ, КАК ПРЕДПОЛОЖЕНИЕ ─────────────────
{
  const w = await call("write", {
    basis: "человек написал сообщение по-украински",
    claim: "guess",
    key: "person.language",
    source: SOURCE,
    what: "uk",
  })
  say(w.ok === true, `язык записан наблюдением: ${JSON.stringify(w).slice(0, 90)}`)

  const a = await read({ key: "person.language", limit: 5 })
  const v = (a.items ?? [])[0] ?? {}
  say(v.claim === "guess" && Boolean(v.basis),
    `значение помечено предположением с основанием: claim=${v.claim}, basis=«${String(v.basis ?? "").slice(0, 50)}»`)
}

// ── 3. ОЧЕРЕДЬ ПОШЛА ДАЛЬШЕ, А ФРАЗА — НА ЯЗЫКЕ ЧЕЛОВЕКА ────────────────
{
  const a = await read({ limit: 20 })
  const q = a.acquaint ?? null
  say(q?.key === "person.name", `язык записан → следующий вопрос уже другой: ${q?.key}`)
  // 🔒 СЛОВАРЬ ДАЁТ СМЫСЛ, АГЕНТ ДАЁТ ЯЗЫК. Украинского текста в словаре нет и не
  // будет: держать сотню языков нельзя, а перевод короткой фразы модели бесплатен.
  say(q?.say_in === "uk" && q?.ask_in === "ru",
    `фраза пришла эталоном (${q?.ask_in}) с указанием произнести на «${q?.say_in}»: «${q?.ask}»`)
}

// ── 4. СМЕНА ЯЗЫКА ПО ПРОСЬБЕ ЧЕЛОВЕКА СОХРАНЯЕТ ИСТОРИЮ ────────────────
//
// 🛑 ЭТО СЛУЧАЙ ВЛАДЕЛЬЦА ЦЕЛИКОМ: человек написал на одном языке (интерфейс), а
// говорить хочет на другом. Наблюдение было догадкой — его слово её отменяет.
{
  const m = await call("mutate", {
    key: "person.language",
    value: "ru",
    why: "человек попросил перейти на русский",
  })
  say(m.ok === true, `язык изменён по просьбе: было «${m.was}», стало «${m.now}»`)

  const a = await read({ key: "person.language", limit: 5 })
  const vals = (a.items ?? []).map(i => String(i.value))
  say(vals[0] === "ru", `свежее значение первым: ${JSON.stringify(vals)}`)
  say(vals.includes("uk"), `прежнее осталось историей, а не стёрто`)
}

// ── 5. НЕГАТИВНЫЙ КОНТРОЛЬ: ДОГАДКА БЕЗ ОСНОВАНИЯ НЕ ПРИНИМАЕТСЯ ────────
//
// 🔒 БЕЗ НЕГО ВСЁ ВЫШЕ ДОКАЗЫВАЛО БЫ ЛИШЬ ТО, ЧТО ДВЕРЬ ПРИНИМАЕТ ЧТО УГОДНО.
{
  const r = await call("write", { claim: "guess", key: "person.language", source: SOURCE, what: "de" })
  say(r.ok === false && String(r.error).includes("basis"),
    `контроль: догадка без основания отвергнута — ${JSON.stringify(r).slice(0, 100)}`)
}

// ── УБОРКА ──────────────────────────────────────────────────────────────
await clean()
const left = await read({ key: "person.language", limit: 5 })
say(left.found === false, `прибор убрал за собой`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
