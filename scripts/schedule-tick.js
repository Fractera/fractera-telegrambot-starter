#!/usr/bin/env node
'use strict';
//
// fractera-schedule-tick — тот, кто будит сроки (157-1).
//
// ✗ ЧЕМ ОПЛАЧЕН ЭТОТ ФАЙЛ: 2026-09-07 владелец написал боту «напомни через минуту
// проверить связь». Автоматизация завелась, охват записался, срок лёг в базу
// правильно — Atlantic/Canary, due_at через минуту, состояние planned. И НИЧЕГО
// не произошло: разбудить срок было НЕКОМУ. Логика прохода была написана в
// lib/schedule/tick.ts и проверена прибором, но процесса, который её зовёт, не
// существовало.
//
// 🔒 ЗАКОН ШИРЕ СЛУЧАЯ: НАПИСАННАЯ ЛОГИКА И РАБОТАЮЩАЯ СПОСОБНОСТЬ — РАЗНЫЕ
// УТВЕРЖДЕНИЯ. Между ними стоит процесс, и его отсутствие не видно ни в типах,
// ни в сборке, ни в приборе на функции: всё зелёное, а продукт молчит.
//
// 🔒 ЗАВИСИМОСТЕЙ НЕТ, КАК У СОСЕДА channel-watch.js: обычный node, fetch из
// платформы, никакой сборки.
//
// 🛑 ТИКЕР ОБЯЗАН БЫТЬ РОВНО ОДИН — тот же закон, что у опрашивателя Telegram.
// Второй выполнит каждое задание дважды и МОЛЧА. Держится не только дисциплиной
// запуска: строка забирается условным UPDATE, и второй читатель получит отказ.

const fs = require("fs");

const MACHINE_ENV = process.env.FRACTERA_MACHINE_ENV || "/etc/fractera/secrets.env";
const CHANNEL_DIR = process.env.FRACTERA_CHANNEL_DIR || "/root/.claude/channels/telegram";
const EVERY_MS = Number(process.env.TICK_EVERY_MS || 20000);
const BATCH = 20;
const LATE_LIMIT_MS = 24 * 3600 * 1000;
const NL = String.fromCharCode(10);

function p2(n) { return String(n).padStart(2, "0"); }
function log(m) {
  const d = new Date();
  console.log("[" + p2(d.getDate()) + "." + p2(d.getMonth() + 1) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":" + p2(d.getSeconds()) + "] " + m);
}

function envValue(file, key) {
  try {
    const lines = fs.readFileSync(file, "utf8").split(NL);
    for (const line of lines) {
      const i = line.indexOf("=");
      if (i > 0 && line.slice(0, i).trim() === key) {
        return line.slice(i + 1).trim().replace(/["]/g, "");
      }
    }
  } catch (e) { /* файла нет — законное состояние на машине разработчика */ }
  return "";
}

const DATA_URL = envValue(MACHINE_ENV, "REMOTE_DATA_URL") || "http://localhost:3300";
const DATA_SECRET = envValue(MACHINE_ENV, "DATA_SECRET");

async function sql(text, params) {
  try {
    const r = await fetch(DATA_URL + "/db/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Data-Secret": DATA_SECRET },
      body: JSON.stringify({ sql: text, params: params || [] }),
    });
    if (!r.ok) return { ok: false, error: "http-" + r.status };
    return await r.json();
  } catch (e) {
    return { ok: false, error: String(e && e.message) };
  }
}

function botToken() {
  try {
    const lines = fs.readFileSync(CHANNEL_DIR + "/.env", "utf8").split(NL);
    for (const line of lines) {
      const i = line.indexOf("=");
      if (i > 0 && line.slice(0, i).trim().endsWith("TOKEN")) {
        return line.slice(i + 1).trim().replace(/["]/g, "");
      }
    }
  } catch (e) { /* канал не настроен */ }
  return "";
}

function allowedChats() {
  try {
    const raw = JSON.parse(fs.readFileSync(CHANNEL_DIR + "/access.json", "utf8"));
    return Array.isArray(raw.allowFrom) ? raw.allowFrom.map(String).filter(Boolean) : [];
  } catch (e) { return []; }
}

// 🔒 ТОЛЬКО sendMessage, НИКОГДА getUpdates — закон проекта: Telegram отдаёт
// каждое обновление одному читателю, и второй поделил бы переписку МОЛЧА.
async function send(chatId, text) {
  const token = botToken();
  if (!token) return { ok: false, error: "нет токена бота" };
  try {
    const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text }),
    });
    const d = await r.json();
    return d.ok ? { ok: true } : { ok: false, error: d.description || "отказ Telegram" };
  } catch (e) {
    return { ok: false, error: String(e && e.message) };
  }
}

/** Пометка опоздания — местным временем человека, а не серверным. */
function lateNote(dueAt, tz) {
  if (!tz) return "Должно было прийти в " + dueAt + ".";
  try {
    const local = new Date(dueAt).toLocaleString("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
    return "Должно было прийти в " + local + " (" + tz + ").";
  } catch (e) {
    return "Должно было прийти в " + dueAt + ".";
  }
}

async function tickOnce() {
  const nowIso = new Date().toISOString().replace(/[.][0-9]{3}Z$/, "Z");
  const due = await sql(
    "SELECT id, automation_id, kind, payload, tz, due_at FROM schedule_entries WHERE state = 'planned' AND due_at <= ? ORDER BY due_at ASC, id ASC LIMIT ?",
    [nowIso, BATCH]
  );
  const rows = (due && due.rows) || [];
  if (rows.length === 0) return;

  for (const row of rows) {
    const lateBy = Date.parse(nowIso) - Date.parse(row.due_at);
    const late = lateBy > 60000;

    // 🔒 ПРОПУЩЕННОЕ ВРЕМЯ — РЕШЕНИЕ ВЛАДЕЛЬЦА 2026-09-07: человеку выполнить
    // ПОЗДНО и с пометкой, машинной ступени — ПРОПУСТИТЬ с записью. «Молча»
    // отвергнуто в обеих ветках.
    if ((late && row.kind === "chain") || lateBy > LATE_LIMIT_MS) {
      const why = lateBy > LATE_LIMIT_MS ? "пропущено: опоздание больше суток" : "пропущено: срок прошёл";
      await sql("UPDATE schedule_entries SET state = 'missed', note = ? WHERE id = ? AND state = 'planned'", [why, row.id]);
      log("N" + row.id + " пропущено (" + row.kind + ")");
      continue;
    }

    // 🔒 МЕТКА СТАВИТСЯ ДО ДЕЙСТВИЯ. Падение между меткой и отправкой теряет одно
    // срабатывание; обратный порядок повторял бы рассылку при каждом падении.
    await sql("UPDATE schedule_entries SET state = 'fired', fired_at = ? WHERE id = ? AND state = 'planned'", [nowIso, row.id]);
    const changed = await sql("SELECT changes() AS n");
    const n = (changed.rows && changed.rows[0] && changed.rows[0].n) || 0;
    if (Number(n) !== 1) {
      log("N" + row.id + " уже взята кем-то, пропускаю");
      continue;
    }

    const parts = ["Напоминание: " + (row.payload || "без текста")];
    if (late) parts.push(lateNote(row.due_at, row.tz));
    if (row.automation_id) parts.push("Автоматизация N " + row.automation_id);
    const text = parts.join(NL);

    const chats = allowedChats();
    if (chats.length === 0) { log("N" + row.id + " некому доставить"); continue; }
    let delivered = false;
    for (const chat of chats) {
      const res = await send(chat, text);
      if (res.ok) delivered = true;
      else log("N" + row.id + " отказ доставки: " + res.error);
    }
    log("N" + row.id + (delivered ? " доставлено" : " НЕ доставлено") + (late ? " (поздно)" : ""));
  }
}

if (!DATA_SECRET) {
  log("нет ключа слоя данных, тикер работать не может: " + MACHINE_ENV);
  process.exit(1);
}

log("тикер сроков запущен, слой данных " + DATA_URL + ", проход раз в " + EVERY_MS / 1000 + " с");
setInterval(function () { tickOnce().catch(function (e) { log("проход упал: " + String(e && e.message)); }); }, EVERY_MS);
tickOnce().catch(function (e) { log("первый проход упал: " + String(e && e.message)); });
