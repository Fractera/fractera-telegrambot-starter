import { readFileSync } from "node:fs"
import { lateNote } from "./late-note"
import type { ScheduleEntry } from "./store"

// ДОСТАВКА НАПОМИНАНИЯ ЧЕЛОВЕКУ (148-3).
//
// 🔒 НАПОМИНАНИЕ ПРИХОДИТ ОТ ТОГО ЖЕ БОТА, С КОТОРЫМ ЧЕЛОВЕК РАЗГОВАРИВАЕТ.
// Второй бот прислал бы его от незнакомца: человек не связал бы сообщение со
// своей просьбой и в лучшем случае не понял бы, в худшем — заблокировал.
//
// 🔒 ТОЛЬКО `sendMessage`, НИКОГДА `getUpdates` — закон проекта. Telegram отдаёт
// каждое обновление ровно одному читателю; второй опрашиватель поделил бы
// переписку владельца пополам и МОЛЧА.
//
// 🛑 ЦЕНА ЗАВИСИМОСТИ НАЗВАНА, А НЕ СПРЯТАНА. Токен бота лежит в складе плагина
// каналов Anthropic (`/root/.claude/channels/telegram/.env`), потому что бот
// принадлежит ему, а не нам. Плагин — research preview: раскладка его файлов
// может измениться, и тогда доставка умрёт. Поэтому путь назван одной
// константой, отсутствие токена — законный исход с причиной, а не исключение.

const CHANNEL_DIR = process.env.FRACTERA_CHANNEL_DIR ?? "/root/.claude/channels/telegram"

/** Токен бота — из склада плагина. Пусто значит «канал не настроен». */
export function botToken(): string {
  try {
    for (const line of readFileSync(`${CHANNEL_DIR}/.env`, "utf8").split("\n")) {
      const i = line.indexOf("=")
      if (i > 0 && line.slice(0, i).trim().endsWith("TOKEN")) {
        return line.slice(i + 1).trim().replace(/^["']|["']$/g, "")
      }
    }
  } catch {
    // Файла нет — законное состояние на машине разработчика.
  }
  return ""
}

/**
 * Кому писать.
 *
 * 🔒 СПИСОК БЕРЁТСЯ У ПЛАГИНА, А НЕ ВЕДЁТСЯ НАМИ. Он уже решает, кто допущен к
 * боту; второй список разошёлся бы с первым, и напоминания поехали бы тому, кого
 * владелец из допуска убрал.
 */
export function allowedChats(): string[] {
  try {
    const raw = JSON.parse(readFileSync(`${CHANNEL_DIR}/access.json`, "utf8")) as {
      allowFrom?: unknown
    }
    return Array.isArray(raw.allowFrom) ? raw.allowFrom.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

/**
 * Текст напоминания.
 *
 * 🔒 СЛОВА ЧЕЛОВЕКА ИДУТ ПЕРВЫМИ И БЕЗ ПЕРЕСКАЗА. Он узнаёт своё дело по своей
 * же формулировке; наш пересказ через сутки значит другое.
 * 🔒 НОМЕР АВТОМАТИЗАЦИИ НАЗЫВАЕТСЯ, потому что по нему человек отвечает
 * («отзыв 123») — без номера обратный путь ему неизвестен.
 * 🔒 `format` НЕ ПЕРЕДАЁТСЯ И РАЗМЕТКА НЕ СТАВИТСЯ: в `markdownv2` точка
 * служебная, и сообщение со ссылкой не доходит целиком.
 */
export function reminderText(entry: ScheduleEntry, late: boolean): string {
  const head = entry.payload ?? "Напоминание"
  const parts = [`⏰ ${head}`]
  if (late) parts.push(lateNote(entry))
  if (entry.automationId) parts.push(`Автоматизация № ${entry.automationId}`)
  return parts.join("\n")
}

/**
 * Отправить одно сообщение.
 *
 * 🔒 ОТКАЗ ВОЗВРАЩАЕТСЯ, А НЕ ГЛОТАЕТСЯ. Тикер уже пометил строку сработавшей;
 * если доставка не удалась, это обязано быть видно в отчёте прохода, иначе
 * «сработало» будет означать «мы попробовали».
 */
export async function sendToTelegram(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const token = botToken()
  if (!token) return { ok: false, error: "нет токена бота: канал не настроен" }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    if (!r.ok) return { ok: false, error: `telegram-${r.status}` }
    const d = (await r.json()) as { ok?: boolean; description?: string }
    return d.ok ? { ok: true } : { ok: false, error: d.description ?? "telegram-refused" }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.name : "failed" }
  }
}

/** Доставка для тикера: всем допущенным собеседникам этого бота. */
export async function deliverReminder(entry: ScheduleEntry, late: boolean): Promise<boolean> {
  const chats = allowedChats()
  if (chats.length === 0) return false
  const text = reminderText(entry, late)
  let delivered = false
  for (const chat of chats) {
    const res = await sendToTelegram(chat, text)
    if (res.ok) delivered = true
  }
  return delivered
}
