// ПРИБОР ПОДШАГА 164-5 — КОРПУС ПРОВЕРЯЕТСЯ ДО ПРОГОНА, СКРИПТОМ, А НЕ ГЛАЗАМИ.
//
// 🎯 ЗАЧЕМ. Тест «невозможно извлечь ответ просто так» имеет смысл ровно до тех
// пор, пока в наших данных действительно нет слова из вопроса. Проверять это
// чтением нельзя: десять историй по две фразы — это шестьсот слов, и один
// пропущенный корень превращает весь прогон в проверку подстроки.
//
// 🛑 ОПЛАЧЕНО СЛЕПЫМ ОБРАЗЦОМ 162-7: /Ден/i совпадало со словом «презиДЕНтом»
// В САМОМ ВОПРОСЕ, и проверка «якорь доехал» была зелёной, когда якоря не было
// вовсе. Поэтому первая же проверка здесь — имя сущности против её вопроса.
//
// 🔒 У ЭТОЙ ПРОВЕРКИ ЕСТЬ СВОЙ НЕГАТИВНЫЙ КОНТРОЛЬ, И БЕЗ НЕГО ОНА ЗЕЛЕНА ПО
// ПРИЧИНЕ СОБСТВЕННОЙ СЛЕПОТЫ: кейс `hintPositive` несёт слово-подсказку прямо
// в тексте истории, и счётчик пересечения обязан дать НЕ ноль. Ноль там значит,
// что сломан счётчик, а не что корпус чист.
//
// Ничего не пишет и никуда не ходит: только читает файл корпуса.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const MARK = "===PROBE_164_5==="
const here = dirname(fileURLToPath(import.meta.url))
const corpus = JSON.parse(readFileSync(join(here, "../../development-docs/instruments/164-6-ten-stories.json"), "utf8"))

let bad = 0
const say = (ok, what) => { if (!ok) bad += 1; console.log(`${ok ? "✓" : "✗"} ${what}`) }

/** Наши данные об одной сущности: то, что физически ляжет в таблицу и в связи. */
const dataOf = c => `${c.entity} ${c.role ?? ""} ${c.story}`.toLowerCase()
/** Сколько корней из списка встретилось в тексте. */
const hits = (text, roots) => roots.filter(r => text.includes(r.toLowerCase()))

console.log(MARK)
console.log(`корпус: ${corpus.cases.length} случаев, метка источника «${corpus.source}»`)

say(corpus.cases.length === 10, `в корпусе ровно десять историй: ${corpus.cases.length}`)

const tables = new Set(corpus.cases.map(c => c.key))
say(tables.size >= 2, `корпус задевает больше одной таблицы: ${[...tables].join(", ")}`)

for (const c of corpus.cases) {
  const data = dataOf(c)
  const q = c.question.toLowerCase()

  // П2 и правило слепого образца: имени сущности в её вопросе быть не должно.
  const nameInQuestion = q.includes(c.entity.toLowerCase())
  say(!nameInQuestion, `${c.id}. «${c.entity}» — имени сущности в её вопросе нет`)

  // П3: ключевого слова моста нет в наших данных вовсе.
  const leaked = hits(data, c.bridgeWords)
  say(leaked.length === 0,
    `${c.id}. слова моста нет в данных${leaked.length ? `: ПРОТЕКЛО ${JSON.stringify(leaked)}` : ` (искали ${JSON.stringify(c.bridgeWords)})`}`)

  // Приметы — то, что обязано приехать в ответе — в истории быть ОБЯЗАНЫ,
  // иначе прогон 164-7 нечем будет проверить.
  const present = hits(data, c.traces)
  say(present.length === c.traces.length,
    `${c.id}. приметы для проверки ответа на месте: ${JSON.stringify(present)}`)
}

// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ САМОГО СЧЁТЧИКА.
const hp = corpus.controls.hintPositive
const hpHits = hits(`${hp.entity} ${hp.story}`.toLowerCase(), hp.bridgeWords)
say(hpHits.length > 0,
  `контроль счётчика: в кейсе со словом-подсказкой пересечение НЕ нулевое — ${JSON.stringify(hpHits)}`)

// Выдуманная сущность не должна совпадать ни с одной настоящей.
const ghost = corpus.controls.ghost.entity.toLowerCase()
say(!corpus.cases.some(c => c.entity.toLowerCase() === ghost),
  `контроль: выдуманная сущность «${corpus.controls.ghost.entity}» в корпусе не заведена`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
