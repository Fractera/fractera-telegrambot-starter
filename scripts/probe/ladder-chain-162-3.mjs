// ПРИБОР ПОДШАГА 162-3 — цепочка: уровень N спрашивает тем, что нашёл уровень N−1.
//
// ДВЕ ПЛОСКОСТИ, НАЗВАННЫЕ В ТЗ ЗАРАНЕЕ:
//   1) передача якоря — `levels` показывает имя, взятое из уровня 1; при пустой
//      личной памяти якорей нет, и это СКАЗАНО, а не подменено фразой человека;
//   2) вложенность и время — уровень 2 содержит всё, что дал уровень 1, время
//      растёт по уровням.
//
// 🛑 ЧТО ЭТОТ ПРИБОР ПИШЕТ И УДАЛЯЕТ: ОДНУ строку личного признака `person.city`
// со своей меткой `source`. Уборка идёт ПО МЕТКЕ, а не `DELETE FROM <таблица>`.
// ✗ прибор шага 160 стирал таблицы целиком и обнулил живую память владельца.
// 🔒 В ГРАФ НЕ ПИШЕТ ВОВСЕ: якорь берётся из того, что там уже лежит.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_162_3==="
const SOURCE = "probe-162-3"

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
const read = async args => (await call("read", args)).answer ?? {}
const sql = (text, params = []) => fetch(`${dataUrl}/db/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Data-Secret": key },
  body: JSON.stringify({ sql: text, params }),
}).then(r => r.json()).catch(() => ({ ok: false }))

// 🔒 УБОРКА ПО СВОЕЙ МЕТКЕ — И ДО, И ПОСЛЕ: прошлый прогон мог оборваться.
const clean = () => sql("DELETE FROM fact_person_city WHERE source = ?", [SOURCE])

console.log(MARK)
await clean()

// ── ПОСЕВ: ОДИН ЛИЧНЫЙ ФАКТ, ИМЯ КОТОРОГО ГРАФ УЖЕ ЗНАЕТ ──────────────────
// «Зеленодольск» лежит меткой в графе (замер 162-1). Значит уровень 1 отдаст
// это имя, а уровень 2 обязан спросить связи ИМЕННО ИМ.
const seeded = await call("write", { key: "person.city", what: "Зеленодольск", source: SOURCE })
say(seeded.ok === true, `посеян личный факт: ${JSON.stringify(seeded.answer ?? seeded.error ?? seeded)}`)

// ── ПЛОСКОСТЬ 1: ПЕРЕДАЧА ЯКОРЯ ──────────────────────────────────────────
const one = await read({ query: "где я живу" })
say(Array.isArray(one.levels) && one.levels.length === 1,
  `глубина 1 идёт одним уровнем: ${JSON.stringify((one.levels ?? []).map(l => l.level))}`)
say((one.levels ?? [])[0]?.ms < 1500, `уровень 1 быстрый: ${(one.levels ?? [])[0]?.ms} мс`)

const two = await read({ query: "где я живу", depth: 2 })
const lvl2 = (two.levels ?? []).find(l => l.level === 2)
say(!!lvl2, `глубина 2 отчитывается уровнем 2: ${JSON.stringify((two.levels ?? []).map(l => l.level))}`)
say(Array.isArray(lvl2?.anchors) && lvl2.anchors.includes("Зеленодольск"),
  `связи спрошены ИМЕНЕМ ИЗ УРОВНЯ 1: ${JSON.stringify(lvl2?.anchors)}`)
say(/уровн[ея] 1/.test(String(lvl2?.note ?? "")),
  `сказано, чем спрашивали: «${lvl2?.note}»`)

// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ ПЛОСКОСТИ 1: якорей нет — это СКАЗАНО.
// Вопрос, на который уровень 1 не отвечает ничем, обязан честно признать, что
// связи спрошены словами человека, а не притвориться обогащением.
await clean()
const noAnchor = await read({ query: "какой у меня рост", depth: 2 })
const noLvl2 = (noAnchor.levels ?? []).find(l => l.level === 2)
say(/имён на уровне 1 не нашлось/.test(String(noLvl2?.note ?? "")),
  `без якорей это названо словами: «${noLvl2?.note}»`)

// ── ПЛОСКОСТЬ 2: ВЛОЖЕННОСТЬ И ВРЕМЯ ─────────────────────────────────────
await call("write", { key: "person.city", what: "Зеленодольск", source: SOURCE })
const a = await read({ query: "где я живу" })
const b = await read({ query: "где я живу", depth: 2 })
const keysA = (a.items ?? []).map(i => i.key)
const keysB = (b.items ?? []).map(i => i.key)
say(keysA.every(k => keysB.includes(k)),
  `уровень 2 содержит всё, что дал уровень 1: ${JSON.stringify(keysA)} ⊆ ${JSON.stringify(keysB)}`)
// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ ВЛОЖЕННОСТИ: второй уровень обязан ДОБАВИТЬ своё,
// иначе «кумулятивность» доказывала бы лишь то, что он ничего не делает.
say((lvl2?.added ?? 0) > 0 || keysB.length > keysA.length,
  `уровень 2 добавил своё: +${lvl2?.added ?? 0}`)
const msA = (a.levels ?? [])[0]?.ms ?? 0
const msB = ((b.levels ?? []).find(l => l.level === 2)?.ms) ?? 0
say(msB > msA, `время растёт по уровням: уровень 1 ${msA} мс → уровень 2 ${msB} мс`)

// 🔒 ГЛУБИНА ЧИСЛОМ ПРИНИМАЕТСЯ ДВЕРЬЮ, А ПРЕЖНЕЕ ИМЯ ЖИВО.
const byBudget = await read({ query: "где я живу", budget: "deep" })
say((byBudget.levels ?? []).some(l => l.level === 2),
  `прежнее имя budget:deep осталось рабочим псевдонимом глубины 2`)
const tooDeep = await read({ query: "где я живу", depth: 99 })
say((tooDeep.levels ?? []).length <= 3,
  `глубина зажата потолком: уровней ${(tooDeep.levels ?? []).length}`)

await clean()
const gone = await read({ key: "person.city" })
say(gone.found === false, `посев убран по своей метке: ${JSON.stringify(gone.hint ?? "")}`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
