// ПРИБОР ПОДШАГА 141-3 — охват считается ОДИН раз на сообщение.
//
// Смотрит на счётчик обращений к источникам: он и есть предмет подшага.
// Источники поддельные — настоящих ещё нет (разбор сообщения не построен), и
// это названо вслух в самом модуле.
//
// Запуск:  npx tsx scripts/probe/scope-resolve-141-3.mjs
import { neededDimensions, resolveScope, applyScope } from "../../lib/facts/scope-resolve"

const MARK = "===PROBE_141_3==="
console.log(MARK)

let bad = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? "✓" : "✗"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` — ждали ${JSON.stringify(want)}`}`)
}

// Два признака, зависящие ОТ ОДНОГО измерения, плюс один независимый.
const twoScoped = [
  { key: "entity.memo", scope: ["field.geo"] },
  { key: "entity.note", scope: ["field.geo"] },
  { key: "material.text" },
]
check("нужных измерений на три признака", neededDimensions(twoScoped), ["field.geo"])

const said = { name: "сказано сейчас", lookup: () => "Мадрид" }
const neighbours = { name: "соседние сообщения", lookup: () => "Лондон" }

let r = await resolveScope(twoScoped, [said, neighbours])
console.log(`ключ: «${r.key}», ответил: ${r.answeredBy["field.geo"]}`)
check("обращений к источникам на ДВА зависимых признака", r.lookups, 1)

// 🔒 НЕГАТИВНЫЙ ПЕРВЫЙ: сообщение без зависимых признаков не спрашивает НИЧЕГО.
r = await resolveScope([{ key: "material.text" }], [said, neighbours])
check("обращений, когда зависимых признаков нет", r.lookups, 0)
check("ключ пуст, когда охват не объявлен", r.key, "")

// 🔒 НЕГАТИВНЫЙ ВТОРОЙ: первый ответивший закрывает вопрос — второго не спросят.
const silent = { name: "молчит", lookup: () => undefined }
r = await resolveScope(twoScoped, [silent, said, neighbours])
console.log(`порядок доверия: ответил «${r.answeredBy["field.geo"]}», обращений ${r.lookups}`)
check("молчащий источник не мешает следующему", r.key, "field-geo=madrid")

// 🔒 НЕГАТИВНЫЙ ТРЕТИЙ: половина охвата — это НЕ охват.
const twoDims = [{ key: "entity.memo", scope: ["field.geo", "lang"] }]
r = await resolveScope(twoDims, [{ name: "знает только город", lookup: d => (d === "field.geo" ? "Мадрид" : undefined) }])
check("ключ пуст, если известна половина", r.key, "")
check("недостающее названо поимённо", r.missing, ["lang"])

// Наследование: один ключ уходит всем фактам сообщения, включая необъявивших.
const rows = applyScope([{ key: "entity.memo" }, { key: "material.text" }], "field-geo=madrid")
check("охват унаследован всеми строками", rows.map(x => x.scopeKey), ["field-geo=madrid", "field-geo=madrid"])

console.log(bad ? `${MARK} ОТКАЗ: ${bad}` : `${MARK}DONE`)
process.exit(bad ? 1 : 0)
