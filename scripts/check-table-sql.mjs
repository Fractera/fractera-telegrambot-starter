#!/usr/bin/env node
// СТОРОЖ ФОРМ ТАБЛИЦ: SQL создания обязан быть валидным (145, 2026-09-08).
//
// ✗ ЧЕМ ОПЛАЧЕН, И ЭТО САМАЯ ДОРОГАЯ НАХОДКА ДНЯ. Три формы таблиц потеряли
// одинарные кавычки в `strftime`. Такой `CREATE TABLE` невалиден и отвергается
// целиком; функция создания честно возвращает отказ, а вызывающий по своему
// закону («отказ оглавления не отменяет запись данных») идёт дальше.
// **Снаружи всё зелено, и никто не спрашивает.**
//
// 🛑 ПОЧЕМУ ЭТО НЕ ВСПЛЫЛО МЕСЯЦ: таблицы были созданы ПРИБОРАМИ, которые пишут
// свой SQL — с кавычками. Код создания таблиц не отработал НИ РАЗУ, а система
// выглядела исправной, потому что таблицы уже существовали.
// 🔒 ЛОМАЛОСЬ БЫ ТОЛЬКО НА ЧИСТОЙ МАШИНЕ — то есть у нового человека в его первый
// день, и никогда у нас. Ровно тот класс, ради которого заведены сторожа.
//
// Прогон: `node scripts/check-table-sql.mjs` (стоит в `npm run build`).

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOTS = ["lib", "app", "scripts"]

/** Образцы, которые в SQL быть не должны, и объяснение каждому. */
const TRAPS = [
  {
    // Ищем `strftime(` без открывающей кавычки сразу после скобки.
    re: /strftime\(\s*[^'"\s)]/g,
    why: "strftime без кавычек вокруг формата: CREATE TABLE будет отвергнут целиком",
  },
  {
    // `DEFAULT (now)` и подобное — тоже невалидно в SQLite.
    re: /DEFAULT\s*\(\s*now\s*\)/gi,
    why: "DEFAULT (now) невалиден: нужно (strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
  },
]

function* files(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const e of entries) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue
    const p = join(dir, e)
    const st = statSync(p)
    if (st.isDirectory()) yield* files(p)
    else if (/\.(ts|tsx|mjs|js)$/.test(e)) yield p
  }
}

const found = []
for (const root of ROOTS) {
  for (const file of files(root)) {
    // 🔒 СТОРОЖ НЕ ПРОВЕРЯЕТ САМ СЕБЯ, И ЭТО НЕ ПОБЛАЖКА: в нём ОБРАЗЦЫ дефекта
    // лежат по определению, и без исключения он падает всегда — то есть не
    // сообщает ничего. Сторож, который всегда красный, выключают на второй день.
    // ✗ И ЭТУ САМУЮ СТРОКУ ОБОЛОЧКА СЪЕЛА С ПЕРВОГО РАЗА — ЧЕТВЁРТЫЙ ПОТЕРЯННЫЙ
    // СЛЭШ ЗА СЕССИЮ. Правки с экранированием пишутся редактором, а не строкой.
    if (file.split("\\").join("/").endsWith("scripts/check-table-sql.mjs")) continue
    const text = readFileSync(file, "utf8")
    // Смотрим только строки, где есть SQL создания или само `strftime`.
    const lines = text.split(/\r?\n/)
    lines.forEach((line, i) => {
      // 🔒 КОММЕНТАРИИ ПРОПУСКАЕМ: объяснение дефекта не есть дефект. Иначе
      // сторож ловит собственную документацию, и его выключают через неделю.
      const bare = line.trim()
      if (bare.startsWith("//") || bare.startsWith("*") || bare.startsWith("/*")) return
      for (const trap of TRAPS) {
        trap.re.lastIndex = 0
        if (trap.re.test(line)) found.push({ file, line: i + 1, why: trap.why, text: bare.slice(0, 90) })
      }
    })
  }
}

if (found.length === 0) {
  console.log("✓ формы таблиц: SQL создания валиден везде")
  process.exit(0)
}

console.log("")
console.log("✗ НЕВАЛИДНЫЙ SQL В ФОРМЕ ТАБЛИЦЫ — СБОРКА ОСТАНОВЛЕНА:")
for (const f of found) {
  console.log(`  ${f.file}:${f.line}`)
  console.log(`    ${f.text}`)
  console.log(`    ${f.why}`)
}
console.log("")
console.log("  Такой CREATE TABLE отвергается целиком и МОЛЧА: у нас таблицы уже есть,")
console.log("  а на чистой машине их не будет — сломается только у нового человека.")
process.exit(1)
