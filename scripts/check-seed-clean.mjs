#!/usr/bin/env node
//
// СТОРОЖ ПОСЕВНОГО: в репозиторий, который клонируется каждому новому боту, не
// должны уезжать личные подробности владельца и наши внутренние имена.
//
// 🔒 ЗАЧЕМ ОН НУЖЕН, И ЭТО ИЗМЕРЕНИЕ, А НЕ ОПАСЕНИЕ. 2026-09-09 владелец открыл
// экран «Что я знаю о вас» на чистой базе и увидел там своё имя, свой город,
// свой часовой пояс, наш продукт и имя человека из команды. Значения оказались
// полем `example` реестра признаков — то есть **нашим досье в посевном**.
// Его слова: «каждый бот должен получать чистые репозитории».
//
// 🔒 СТОРОЖ СТЕРЕЖЁТ ВЕСЬ ФАЙЛ, А НЕ ОДНО ПОЛЕ. Первая правка чинила `example`;
// те же подробности нашлись в `howToFind` — тексте, который читает модель.
// Проверять надо предмет («есть ли здесь личное»), а не место, где его нашли
// прошлый раз.
//
// 🔒 ТРИ ВЕРДИКТА, А НЕ ДВА (закон шага 64): законно · исключение · долг.
// Исключения названы поимённо с причиной; долг печатается и сборку не роняет.

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

// Подробности владельца и наши внутренние имена. Слово ищется как подстрока,
// поэтому список короткий и конкретный: широкое слово даст ложные срабатывания
// и приучит читать вывод сторожа как шум.
const PRIVATE = [
  "Рома",
  "Роман Армстронг",
  "roma_armstrong",
  "Санта-Крус",
  "Тенерифе",
  "Atlantic/Canary",
  "Канарах",
  "aifa.dev",
  "213.199.61.7",
  "r672442251",
]

// 🔒 ИСКЛЮЧЕНИЯ — С ПРИЧИНОЙ, А НЕ СПИСКОМ ИМЁН. Файл попадает сюда, только
// если личное в нём законно; «часто срабатывает» причиной не является.
const EXCEPT = [
  { path: "development-docs", why: "учёт разработки: он наш и клиенту не уезжает как продукт" },
  { path: "scripts/check-seed-clean.mjs", why: "сам сторож — здесь эти слова и обязаны лежать" },
  { path: "CLAUDE.md", why: "инструкция агента описывает нашу же машину поимённо" },
  { path: "SOUL.md", why: "то же самое" },
  { path: ".git", why: "история, не поставка" },
  { path: "node_modules", why: "чужой код" },
  { path: ".next", why: "сборка" },
]

// Файлы посевного, которые клиент получает как содержимое своего бота.
const WATCH = ["REGISTRY-CONFIG", "MEMORY-CONFIG", "app", "lib", "scripts/agent"]

const root = process.cwd()
const hits = []

function excused(rel) {
  return EXCEPT.find((e) => rel.split("\\").join("/").startsWith(e.path))
}

function walk(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const name of entries) {
    const full = join(dir, name)
    const rel = full.slice(root.length + 1)
    if (excused(rel)) continue
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) { walk(full); continue }
    if (!/\.(json|ts|tsx|js|mjs|md)$/.test(name)) continue
    let text
    try { text = readFileSync(full, "utf8") } catch { continue }
    // 🔒 ВСЕ ВХОЖДЕНИЯ, А НЕ ПЕРВОЕ. ✗ первая редакция печатала одну строку на
    // пару «файл + слово»: чинишь её, прогоняешь снова — сторож показывает
    // следующую в том же файле. Работа превращается в круги, а сколько осталось,
    // не видно ни разу. **Сторож, показывающий часть, врёт о размере долга.**
    const lines = text.split("\n")
    for (const word of PRIVATE) {
      if (!text.includes(word)) continue
      lines.forEach((l, i) => { if (l.includes(word)) hits.push({ rel, word, line: i + 1 }) })
    }
  }
}

for (const w of WATCH) walk(join(root, w))

if (hits.length === 0) {
  console.log("✓ посевное чисто: личных подробностей владельца в " + WATCH.length + " наблюдаемых местах нет")
  process.exit(0)
}

console.log("🛑 ЛИЧНОЕ В ПОСЕВНОМ — это уедет каждому новому боту:")
for (const h of hits) console.log("   " + h.rel + ":" + h.line + "  «" + h.word + "»")
console.log("")
console.log("Лечение: заменить безличным примером. Личное место — не только `example`:")
console.log("те же подробности прячутся в `howToFind`, описаниях и подсказках.")
process.exit(1)
