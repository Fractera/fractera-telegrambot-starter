#!/usr/bin/env node
//
// ПРИБОР 171-1 — СКОЛЬКО ХОДОВ И СЕКУНД СТОИТ ОДНО СООБЩЕНИЕ ЧЕЛОВЕКА.
//
// 🔒 ИСТОЧНИК МАШИННО-ЧИТАЕМЫЙ, А НЕ ЭКРАН. Claude Code сам пишет журнал сессии
// в `/root/.claude/projects/<путь>/<sid>.jsonl`: каждый ход — строка JSON с
// временем и содержимым. Тот же источник, на котором стоит сторож лимита
// подписки (шаг 115-3).
// 🛑 РАЗБИРАТЬ ANSI-ЛОГ pm2 ЗАПРЕЩЕНО: фраза там разорвана управляющими
// последовательностями, и наивный поиск не найдёт ничего.
//
// 🔒 ЧТО ИМЕННО МЕРЯЕТСЯ. Не «сколько работал сервер», а СКОЛЬКО ХОДОВ СДЕЛАЛА
// МОДЕЛЬ — закон 158-4: дорого стоит ход модели, а не запрос к базе. Ход стоит
// 8–12 секунд независимо от того, за чем он ходил.
//
// Запуск:
//   node scripts/probe/turns-171-1.mjs            — последний журнал канала
//   node scripts/probe/turns-171-1.mjs <файл>     — названный журнал
//   node scripts/probe/turns-171-1.mjs --all      — все журналы за сегодня

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const PROJECTS = "/root/.claude/projects"

function journals() {
  const dirs = readdirSync(PROJECTS).filter((d) => d.includes("telegrambot"))
  const out = []
  for (const d of dirs) {
    const full = join(PROJECTS, d)
    for (const f of readdirSync(full)) {
      if (!f.endsWith(".jsonl")) continue
      const p = join(full, f)
      out.push({ path: p, mtime: statSync(p).mtimeMs })
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime).map((x) => x.path)
}

function lines(path) {
  const out = []
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    if (!raw.trim()) continue
    try {
      out.push(JSON.parse(raw))
    } catch {
      // строка журнала может быть оборвана записью на лету — это не отказ прибора
    }
  }
  return out
}

/** Текст пользовательского хода, в какой бы форме он ни лежал. */
function userText(entry) {
  const c = entry.message && entry.message.content
  if (typeof c === "string") return c
  if (Array.isArray(c)) {
    return c
      .filter((b) => b && b.type === "text")
      .map((b) => b.text)
      .join(" ")
  }
  return ""
}

/** Сообщение пришло из Telegram, а не набрано в терминале. */
function fromChannel(text) {
  return text.includes("<channel ") && text.includes("plugin:telegram")
}

/** Слова человека внутри тега канала — то, что он на самом деле написал. */
function spoken(text) {
  const open = text.indexOf(">")
  const close = text.lastIndexOf("</channel>")
  if (open < 0 || close < 0 || close <= open) return text.trim()
  return text.slice(open + 1, close).trim().replace(/\s+/g, " ")
}

function toolsOf(entry) {
  const c = entry.message && entry.message.content
  if (!Array.isArray(c)) return []
  return c.filter((b) => b && b.type === "tool_use").map((b) => b.name)
}

function hasText(entry) {
  const c = entry.message && entry.message.content
  if (!Array.isArray(c)) return typeof c === "string" && c.trim().length > 0
  return c.some((b) => b && b.type === "text" && String(b.text).trim().length > 0)
}

/**
 * Один обмен: от сообщения человека до последнего хода перед следующим.
 *
 * 🔒 КОНЕЦ ОБМЕНА — СЛЕДУЮЩЕЕ СООБЩЕНИЕ ЧЕЛОВЕКА, А НЕ «ПЕРВЫЙ ОТВЕТ БЕЗ
 * ИНСТРУМЕНТА». Агент вправе ответить, а потом ещё что-то дописать; обрезав по
 * первому тексту, прибор занизил бы цену — то есть солгал бы в нашу пользу.
 *
 * 🔒 ХОД СЧИТАЕТСЯ ПО `requestId`, А НЕ ПО СТРОКАМ ЖУРНАЛА (исправлено 2026-09-09).
 * ✗ ПЕРВАЯ РЕДАКЦИЯ ЗАВЫШАЛА ВТРОЕ: одно обращение к модели пишет несколько строк
 * `assistant` — отдельно размышление, отдельно текст, отдельно вызов инструмента.
 * Прибор печатал «7 ходов» там, где обращений было **два**, — и диагноз выходил
 * «лишние ходы» вместо верного «модель думает девять секунд в одном ходе».
 * 🔒 Правило шире случая: **прежде чем объяснять число, спроси, что именно оно
 * считает.** Прибор, считающий не то, ошибается уверенно и в понятную сторону.
 */
function exchanges(entries) {
  const out = []
  let cur = null
  for (const e of entries) {
    if (e.type === "user") {
      const t = userText(e)
      if (fromChannel(t)) {
        if (cur) out.push(cur)
        cur = {
          said: spoken(t),
          startedAt: Date.parse(e.timestamp),
          endedAt: Date.parse(e.timestamp),
          requests: new Set(),
          rows: 0,
          tools: [],
          replied: false,
          думал: 0,
        }
        continue
      }
      // Ответ инструмента — не ход модели: он приходит строкой type "user",
      // но модель его не сочиняла. Считать его ходом значило бы удвоить счёт.
      continue
    }
    if (e.type !== "assistant" || !cur) continue
    cur.rows += 1
    cur.requests.add(e.requestId || "(без requestId)")
    cur.endedAt = Math.max(cur.endedAt, Date.parse(e.timestamp) || cur.endedAt)
    for (const name of toolsOf(e)) cur.tools.push(name)
    if (hasText(e)) cur.replied = true
    const c = e.message && e.message.content
    if (Array.isArray(c) && c.some((b) => b && b.type === "thinking")) cur.думал += 1
  }
  if (cur) out.push(cur)
  return out
}

function seconds(ms) {
  return (ms / 1000).toFixed(1)
}

const args = process.argv.slice(2)
const all = args.includes("--all")
const named = args.find((a) => !a.startsWith("--"))
const files = named ? [named] : all ? journals() : journals().slice(0, 1)

if (files.length === 0) {
  console.log("НЕТ ЖУРНАЛОВ: каталог", PROJECTS, "не содержит сессий канала")
  process.exit(1)
}

let total = 0
for (const f of files) {
  const ex = exchanges(lines(f))
  if (ex.length === 0) continue
  console.log("=".repeat(78))
  console.log("журнал:", f)
  console.log("=".repeat(78))
  for (const x of ex) {
    total += 1
    const said = x.said.length > 64 ? x.said.slice(0, 61) + "..." : x.said
    const short = x.tools.map((t) => t.replace(/^mcp__[a-z_]+__/, ""))
    console.log("")
    console.log("человек сказал : " + said)
    console.log("время          : " + new Date(x.startedAt).toISOString())
    console.log("ОБРАЩЕНИЙ К МОДЕЛИ : " + x.requests.size + "   (строк журнала: " + x.rows + ", с размышлением: " + x.думал + ")")
    console.log("ВЫЗОВОВ ИНСТР. : " + short.length + (short.length ? "  — " + short.join(" → ") : ""))
    console.log("СЕКУНД         : " + seconds(x.endedAt - x.startedAt))
    console.log("ответ дошёл    : " + (x.replied ? "да" : "НЕТ"))
  }
}

console.log("")
console.log("-".repeat(78))
console.log("обменов найдено:", total)
// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ ПРИБОРА: ноль обменов означает, что разбор сломался,
// а не что бот молчал. Пустой вывод обязан быть отличим от честного нуля.
if (total === 0) {
  console.log("🛑 НОЛЬ ОБМЕНОВ — это отказ разбора, а не тишина бота.")
  process.exit(2)
}
