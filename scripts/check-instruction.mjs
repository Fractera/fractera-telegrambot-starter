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
import { readdirSync, readFileSync } from "node:fs"

const INSTRUCTION = "CLAUDE.md"

// 🔒 ИСКЛЮЧЕНИЯ НАЗЫВАЮТСЯ ПОИМЁННО И С ПРИЧИНОЙ (закон трёх вердиктов, 64).
// Пустой список — это утверждение «исключений нет», а не отсутствие механизма.
const EXCEPTIONS = new Map([
  // ["memory_example", "почему этот метод не обязан быть в инструкции"],
])

// 🛑 ИМЕНА, СОВПАДАЮЩИЕ ПО ФОРМЕ С МЕТОДОМ, НО МЕТОДАМИ НЕ ЯВЛЯЮЩИЕСЯ.
// ✗ найдено первым же расширенным прогоном (163-1): `registry_search_misses` —
// это ТАБЛИЦА журнала промахов, и сторож объявил её несуществующим методом.
// 🔒 Список закрытый и с причиной у каждого: «оно не метод» — это утверждение,
// которое кто-то один раз проверил, а не молчаливое исключение из правила.
const NOT_METHODS = new Map([
  ["registry_search_misses", "таблица журнала промахов, а не метод (lib/registry/access.ts)"],
])

const { MEMORY_FUNCTIONS } = await import("../lib/memory/decl.mjs")
const { ACCESS_FUNCTIONS } = await import("../lib/registry/access-decl.mjs")

const declared = new Set(
  [...MEMORY_FUNCTIONS, ...(ACCESS_FUNCTIONS ?? [])].map(f => f.name),
)
const live = [...MEMORY_FUNCTIONS, ...(ACCESS_FUNCTIONS ?? [])].filter(f => f.state === "live")

// ── СЛЕПАЯ ЗОНА, НАЙДЕННАЯ ЧЕРЕЗ ЧАС ПОСЛЕ ПОСТРОЙКИ СТОРОЖА (163-1) ─────────
//
// ✗ ПЕРВАЯ РЕДАКЦИЯ ЧИТАЛА ТОЛЬКО `CLAUDE.md`. Навык `first-acquaintance` при
// этом звал `registry_recall` и `registry_list` — договор, отменённый шагом 161:
// агент, открывший навык ради знакомства, получил бы указание звать то, чем
// память больше не отвечает. Сторож против отставания инструкции сам имел
// отставание в слепой зоне.
// 🔒 НАВЫК — ЭТО ТА ЖЕ ИНСТРУКЦИЯ, ПРОСТО ЗАГРУЖАЕМАЯ ПО ТРЕБОВАНИЮ. Правило
// одно: где агенту называют имя инструмента, там имя обязано существовать.
const SKILLS_DIR = ".claude/skills"

function skillFiles() {
  const out = []
  let names = []
  try {
    names = readdirSync(SKILLS_DIR)
  } catch {
    return out
  }
  for (const name of names) {
    const file = `${SKILLS_DIR}/${name}/SKILL.md`
    try {
      out.push({ file, text: readFileSync(file, "utf8") })
    } catch {
      // Навык без SKILL.md — не наша забота: это другой сторож.
    }
  }
  return out
}

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
  if (!declared.has(name) && !NOT_METHODS.has(name)) {
    problems.push(`в ${INSTRUCTION} названо \`${name}\`, а такого метода в объявлении НЕТ`)
  }
}

// 🛑 В НАВЫКАХ ПРОВЕРЯЕТСЯ ТОЛЬКО ОДНА СТОРОНА РАВЕНСТВА — «НАЗВАННОЕ СУЩЕСТВУЕТ».
// Требовать от каждого навыка упоминания всех методов бессмысленно: навык узкий
// по устройству, и такое правило заставило бы дописывать имена ради сторожа.
for (const s of skillFiles()) {
  for (const m of s.text.matchAll(/\b(memory_[a-z_]+|registry_[a-z_]+)\b/g)) {
    if (!declared.has(m[1]) && !NOT_METHODS.has(m[1])) {
      problems.push(`в ${s.file} названо \`${m[1]}\`, а такого метода в объявлении НЕТ`)
    }
  }
}

const unique = [...new Set(problems)]
for (const d of debts) console.log(`… ${d}`)
if (unique.length > 0) {
  console.error(`✗ сторож инструкции: ${unique.length}`)
  for (const p of unique) console.error(`  · ${p}`)
  process.exit(1)
}
console.log(`✓ инструкция знает все ${live.length} живых методов; в ней и в ${skillFiles().length} навыках лишних имён нет`)
