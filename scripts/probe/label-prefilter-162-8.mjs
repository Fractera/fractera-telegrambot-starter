// ПРИБОР ПОДШАГА 162-8 — облако меток: дешёвый предфильтр вместо веерного обхода.
//
// ДВЕ ПЛОСКОСТИ, НАЗВАННЫЕ В ТЗ ЗАРАНЕЕ:
//   1) цена — о незнакомом графу имени дорогой вопрос НЕ задаётся, и это видно
//      по времени; знакомое имя вопрос по-прежнему получает;
//   2) нестрогость — «Денис» находит метку «Дений Парадоксу» (искажённое
//      распознаванием голоса), а выдуманное имя не находит ничего, и это сказано.
//
// 🛑 ЧТО ПИШЕТ И УДАЛЯЕТ: по одной строке в `fact_person_important_people` и
// `fact_person_city` со своей меткой `source`. Уборка ПО МЕТКЕ, а не по таблице.
// 🔒 В ГРАФ НЕ ПИШЕТ: метки берутся те, что там уже есть.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_162_8==="
const SOURCE = "probe-162-8"

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

async function call(fn, args) {
  const r = await fetch(`${app}/api/agent/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ fn, args }),
  })
  return r.json().catch(() => ({}))
}
async function timedRead(args) {
  const t = Date.now()
  const answer = (await call("read", args)).answer ?? {}
  return { answer, ms: Date.now() - t }
}
const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))

const clean = async () => {
  await sql("DELETE FROM fact_person_important_people WHERE source = ?", [SOURCE])
  await sql("DELETE FROM fact_person_city WHERE source = ?", [SOURCE])
}
const lvl = (a, n) => (a.levels ?? []).find(l => l.level === n)

console.log(MARK)
await clean()

// ── ПЛОСКОСТЬ 2: НЕСТРОГОСТЬ ИМЕНИ ────────────────────────────────────────
//
// В живом графе лежит метка «Дений Парадоксу» — имя, искалеченное распознаванием
// голоса. Движок ищет подстроку: «Денис» ему не находит НИЧЕГО (измерено).
// Наша нестрогость обязана свести их по общему началу.
await call("write", { key: "person.important-people", what: "Денис", source: SOURCE })
const near = await timedRead({ query: "что известно о моих друзьях", depth: 2 })
const nearAnchors = lvl(near.answer, 2)?.anchors ?? []
say(nearAnchors.some(a => /Дени/i.test(String(a))),
  `«Денис» свёлся с меткой графа: ${JSON.stringify(nearAnchors)}`)
say(nearAnchors.some(a => String(a) !== "Денис"),
  `спрошено НАПИСАНИЕМ ГРАФА, а не человека: ${JSON.stringify(nearAnchors)}`)
await clean()

// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ: выдуманное имя не находит ничего, и это СКАЗАНО.
await call("write", { key: "person.important-people", what: "Аркадий", source: SOURCE })
const ghost = await timedRead({ query: "что известно о моих друзьях", depth: 2 })
const ghostNote = String(lvl(ghost.answer, 2)?.note ?? "")
say(/не знают ни одного имени|отсеяны как незнакомые/.test(ghostNote),
  `незнакомое имя названо отсеянным: «${ghostNote}»`)
say(/Аркадий/.test(ghostNote), `отсеянное имя названо ПОИМЁННО: «${ghostNote}»`)
say(!(lvl(ghost.answer, 2)?.anchors ?? []).includes("Аркадий"),
  `о незнакомом имени связи НЕ спрашивали: ${JSON.stringify(lvl(ghost.answer, 2)?.anchors)}`)
await clean()

// ── ПЛОСКОСТЬ 1: ЦЕНА ─────────────────────────────────────────────────────
//
// Знакомое графу имя стоит своего запроса; незнакомое — не стоит ничего, кроме
// проверки метки (41 мс). Разница обязана быть видна во времени.
await call("write", { key: "person.city", what: "Зеленодольск", source: SOURCE })
const known = await timedRead({ query: "что известно о моих местах", depth: 2 })
await clean()
await call("write", { key: "person.city", what: "Урюпинсквиль", source: SOURCE })
const unknown = await timedRead({ query: "что известно о моих местах", depth: 2 })
await clean()

const knownAnchors = lvl(known.answer, 2)?.anchors ?? []
say(knownAnchors.includes("Зеленодольск"),
  `знакомое имя ВОШЛО в запрос: ${JSON.stringify(knownAnchors)}`)
say(!(lvl(unknown.answer, 2)?.anchors ?? []).includes("Урюпинсквиль"),
  `незнакомое имя в запрос НЕ вошло: ${JSON.stringify(lvl(unknown.answer, 2)?.anchors)}`)
// 🔒 ЭКОНОМИЯ ИЗМЕРЯЕТСЯ, А НЕ ОБЪЯВЛЯЕТСЯ: отсев обязан быть дешевле вопроса.
say(unknown.ms < known.ms,
  `отсев дешевле вопроса: незнакомое ${unknown.ms} мс против знакомого ${known.ms} мс`)
// 🛑 НЕГАТИВНЫЙ КОНТРОЛЬ ЭКОНОМИИ: «быстрее» не должно значить «перестали искать».
// Вопрос человека идёт вектором в обоих случаях, и находки обязаны быть.
say((unknown.answer.items ?? []).some(i => /связ/i.test(String(i.from ?? ""))),
  `при отсеве вопрос человека всё равно спрошен: значений из связей ${(unknown.answer.items ?? []).filter(i => /связ/i.test(String(i.from ?? ""))).length}`)

// ── ОБЛАКО МЕТОК КАК ЗАПРОС ТРЕТЬЕГО УРОВНЯ ───────────────────────────────
await call("write", { key: "person.city", what: "Зеленодольск", source: SOURCE })
const deep3 = await timedRead({ query: "что известно о моих местах", depth: 3 })
const lvl3 = lvl(deep3.answer, 3)
say(!!lvl3 && Array.isArray(lvl3.anchors) && lvl3.anchors.length > 0,
  `у третьего уровня есть облако меток: ${JSON.stringify(lvl3?.anchors)}`)
say(/облаком меток/.test(String(lvl3?.note ?? "")),
  `сказано, чем спрашивали вектор: «${lvl3?.note}»`)
await clean()

const gone = await call("read", { key: "person.city" })
say((gone.answer ?? {}).found === false, `посев убран по своей метке`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
