#!/usr/bin/env node
//
// СТОРОЖ ГРАНИЦЫ ПАМЯТИ: новая память живёт в СВОЁМ репозитории и зовётся
// ТОЛЬКО по HTTP. Импорт её внутренностей отсюда роняет сборку.
//
// 🔒 ЗАЧЕМ ОН СТОИТ РАНЬШЕ, ЧЕМ ПОСТРОЕНА САМА ПАМЯТЬ. Владелец спросил прямо,
// дам ли я гарантию, что не начну снова «лепить решения снаружи». Честный
// ответ: моё слово ничего не стоит — закон 161 написан мной, и я дважды за час
// спроектировал против него. **Удержит только то, что физически не даёт сделать
// иначе.** Сторож, заведённый после первого нарушения, приходит поздно: к тому
// времени нарушение уже называется «как у нас принято».
//
// ✗ ЧЕМ ОПЛАЧЕНО, ИЗМЕРЕНО 2026-09-09. `scripts/agent/intake-preloader.js:721`
// делал `import(path.join(__dirname,"..","..","lib","memory","decl.mjs"))` —
// сервер инструментов агента импортировал исходники памяти ПО ФАЙЛОВОМУ ПУТИ.
// Это не вызов службы, а линковка: наш внутренний псевдотип уехал через неё в
// схему инструмента, API её отверг, и запись в память была недостижима СУТКИ.
//
// 🔒 ЧТО ИМЕННО ЗАПРЕЩЕНО — НОВЫЙ КОД, А НЕ СТАРЫЙ. Старая память (`lib/memory`)
// пока жива и работает: бот не должен молчать, пока новая не заменит её
// целиком. Поэтому существующие места перечислены ДОЛГОМ с датой, печатаются
// при каждом прогоне и исчезнут вместе с `lib/memory`.
// 🛑 НО ДОЛГ НЕ РАСТЁТ: файл, которого нет в списке, роняет сборку.
// Три вердикта, а не два (закон шага 64): законно · исключение · долг.

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

// Признаки того, что кто-то тянет внутренности памяти файлами.
const FORBIDDEN = [
  /from\s+["'][^"']*lib\/memory/,
  /import\s*\(\s*[^)]*lib["'\s,]+memory/,
  /require\s*\(\s*["'][^"']*lib\/memory/,
  /join\s*\([^)]*["']lib["']\s*,\s*["']memory["']/,
]

// 🔒 ДОЛГ — С ДАТОЙ И ПРИЧИНОЙ, а не молчаливое исключение. Каждая строка
// исчезнет вместе со старой памятью; до тех пор она видна при каждом прогоне.
const DEBT = new Map([
  ["scripts/agent/intake-preloader.js", "2026-09-09 · шов, которым оплачен весь шаг 175; уходит в 175-4 вместе с переключением на службу"],
  ["app/api/agent/memory/route.ts", "2026-09-09 · дверь старой памяти; исчезает вместе с lib/memory"],
  ["scripts/check-instruction.mjs", "2026-09-09 · сторож читает объявление старой памяти; перейдёт на договор службы"],
  ["scripts/check-mcp-schema.mjs", "2026-09-09 · сторож схем проверяет ТУ ЖЕ старую память; уйдёт вместе с ней. Найден этим сторожем в первый же прогон — то есть он работает"],
])

// Приборы читают старую память намеренно — они её и проверяют.
const EXCEPT = [
  { path: "scripts/probe/", why: "приборы измеряют старую память; они уйдут вместе с ней" },
  { path: "lib/memory/", why: "сама старая память" },
  { path: "scripts/check-memory-boundary.mjs", why: "сторож — здесь эти образцы и обязаны лежать" },
  { path: "node_modules", why: "чужой код" },
  { path: ".next", why: "сборка" },
  { path: "development-docs", why: "учёт, а не код" },
]

const root = process.cwd()
const WATCH = ["app", "lib", "scripts", "components"]
const found = []

const excused = (rel) => EXCEPT.find((e) => rel.split("\\").join("/").startsWith(e.path))

function walk(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const name of entries) {
    const full = join(dir, name)
    const rel = full.slice(root.length + 1).split("\\").join("/")
    if (excused(rel)) continue
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) { walk(full); continue }
    if (!/\.(ts|tsx|js|mjs)$/.test(name)) continue
    let text
    try { text = readFileSync(full, "utf8") } catch { continue }
    const lines = text.split("\n")
    lines.forEach((line, i) => {
      if (FORBIDDEN.some((re) => re.test(line))) found.push({ line: i + 1, rel, text: line.trim().slice(0, 90) })
    })
  }
}

for (const w of WATCH) walk(join(root, w))

const debts = found.filter((f) => DEBT.has(f.rel))
const fresh = found.filter((f) => !DEBT.has(f.rel))

if (debts.length) {
  console.log("🗒 ДОЛГ — старая память ещё жива, и это названо, а не прощено:")
  const shown = new Set()
  for (const d of debts) {
    if (shown.has(d.rel)) continue
    shown.add(d.rel)
    console.log(`   ${d.rel}  — ${DEBT.get(d.rel)}`)
  }
  console.log("")
}

if (fresh.length === 0) {
  console.log(`✓ граница памяти цела: новых импортов внутренностей нет (долгов: ${new Set(debts.map((d) => d.rel)).size})`)
  process.exit(0)
}

console.log("🛑 ГРАНИЦА ПАМЯТИ НАРУШЕНА — это линковка, а не вызов службы:")
for (const f of fresh) console.log(`   ${f.rel}:${f.line}  ${f.text}`)
console.log("")
console.log("Память зовётся ТОЛЬКО по HTTP: POST http://127.0.0.1:3700/v1/<метод>,")
console.log("а схемы инструментов берутся из GET /v1/contract, а не импортом файла.")
process.exit(1)
