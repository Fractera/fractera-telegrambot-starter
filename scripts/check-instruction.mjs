#!/usr/bin/env node
// СТОРОЖ ИНСТРУКЦИИ АГЕНТА (162-6): имена инструментов в словах и в объявлении
// обязаны совпадать.
//
// ✗ ЧЕМ ОПЛАЧЕН, И ЭТО ДВА РАЗНЫХ ДЕФЕКТА ОДНОГО КЛАССА:
//   1) инструкция ГОД звала `mcp__intake__knowledge` — инструмента с таким именем
//      не существовало НИ ОДНОГО ДНЯ (найдено 161-1). Агент честно исполнял и
//      честно не мог;
//   2) 2026-09-08 в ящик приехали `depth`, `approved`, `research`, `correction` —
//      и в инструкции не было НИ ОДНОГО упоминания. Половина построенного была
//      агенту недоступна, потому что он о ней не знал.
//
// 🔒 ЧТО ИМЕННО СТЕРЕЖЁТСЯ — ДВЕ СТОРОНЫ ОДНОГО РАВЕНСТВА:
//   · каждый ЖИВОЙ метод объявления упомянут в инструкции хотя бы раз;
//   · каждое имя вида `memory_*` / `registry_*`, встреченное в инструкции,
//     существует в объявлении.
// 🛑 ЧЕГО СТОРОЖ НЕ ДЕЛАЕТ И ДЕЛАТЬ НЕ ДОЛЖЕН: он не проверяет, ЧТО написано про
// метод. Смысл словами машине недоступен; равенство имён — доступно, и его
// достаточно, чтобы «инструкция отстала от кода» перестало быть возможным.
import { readFileSync } from "node:fs"

const INSTRUCTION = "CLAUDE.md"

// 🔒 ИСКЛЮЧЕНИЯ НАЗЫВАЮТСЯ ПОИМЁННО И С ПРИЧИНОЙ (закон трёх вердиктов, 64).
// Пустой список — это утверждение «исключений нет», а не отсутствие механизма.
const EXCEPTIONS = new Map([
  // ["memory_example", "почему этот метод не обязан быть в инструкции"],
])

const { MEMORY_FUNCTIONS } = await import("../lib/memory/decl.mjs")
const { ACCESS_FUNCTIONS } = await import("../lib/registry/access-decl.mjs")

const declared = new Set(
  [...MEMORY_FUNCTIONS, ...(ACCESS_FUNCTIONS ?? [])].map(f => f.name),
)
const live = [...MEMORY_FUNCTIONS, ...(ACCESS_FUNCTIONS ?? [])].filter(f => f.state === "live")

const text = readFileSync(INSTRUCTION, "utf8")
const problems = []
const debts = []

for (const f of live) {
  if (text.includes(f.name)) continue
  if (EXCEPTIONS.has(f.name)) {
    debts.push(`исключение: ${f.name} — ${EXCEPTIONS.get(f.name)}`)
    continue
  }
  problems.push(`метод \`${f.name}\` построен и НЕ УПОМЯНУТ в ${INSTRUCTION} — агент о нём не знает`)
}

// 🛑 ИМЯ, КОТОРОГО НЕТ В ОБЪЯВЛЕНИИ, ХУЖЕ ОТСУТСТВУЮЩЕГО: агент зовёт то, чего
// нет, получает отказ инструмента и не понимает, что виновата инструкция.
for (const m of text.matchAll(/\b(memory_[a-z_]+|registry_[a-z_]+)\b/g)) {
  const name = m[1]
  if (!declared.has(name)) {
    problems.push(`в ${INSTRUCTION} названо \`${name}\`, а такого метода в объявлении НЕТ`)
  }
}

const unique = [...new Set(problems)]
for (const d of debts) console.log(`… ${d}`)
if (unique.length > 0) {
  console.error(`✗ сторож инструкции: ${unique.length}`)
  for (const p of unique) console.error(`  · ${p}`)
  process.exit(1)
}
console.log(`✓ инструкция знает все ${live.length} живых методов, и лишних имён в ней нет`)
