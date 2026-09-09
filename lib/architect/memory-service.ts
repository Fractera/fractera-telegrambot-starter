import { readChannels } from "./channels"
import { machineEnv } from "@/lib/fractera/machine-env"

// ЭКРАН СПРАШИВАЕТ ПАМЯТЬ ТАК ЖЕ, КАК АГЕНТ — ПО HTTP, ЧЕРЕЗ ДОГОВОР.
//
// 🔒 ЭКРАН — ОБЫЧНЫЙ ПОТРЕБИТЕЛЬ ЧЁРНОГО ЯЩИКА, А НЕ ПРИВИЛЕГИРОВАННЫЙ. Соблазн
// «странице можно и в таблицы» велик и вреден: у страницы появилось бы знание
// об устройстве, и первая же перестройка формы внутри памяти сломала бы её
// молча. Здесь она видит ровно то же, что агент.
//
// ✗ ЧЕМ ОПЛАЧЕНО. До 2026-09-09 эта страница читала СТАРУЮ память напрямую —
// `allFacts()` и `recall()` из `lib/registry/access`. Память переехала в
// отдельную службу, а страница осталась смотреть в прежние таблицы: показывала
// не то, что бот на самом деле помнит.
//
// 🛑 КЛЮЧ ЧЕЛОВЕКА БЕРЁТСЯ ИЗ НАСТРОЕК КАНАЛА, А НЕ ПОДРАЗУМЕВАЕТСЯ. Старая
// память знала одного «self»; новая ключует по человеку, и «единственный
// человек» — это допущение, которое однажды окажется ложным.

const MEMORY = process.env.MEMORY_SERVICE_URL ?? "http://127.0.0.1:3700"

function secret(): string {
  return process.env.DATA_SECRET || machineEnv("DATA_SECRET") || ""
}

export type MemoryValue = {
  basis: string | null
  claim: string | null
  from_table: string
  moved_here?: boolean
  value: string
  what: string
}

export type MemoryAnswer = {
  known: MemoryValue[]
  not_yet_known: { what: string; why: string }[]
  ok: boolean
  /** Почему ответа нет — словами, а не кодом. Пусто, когда всё в порядке. */
  trouble: string | null
  who: string | null
}

const EMPTY: MemoryAnswer = { known: [], not_yet_known: [], ok: false, trouble: null, who: null }

/** Чей это человек — по настройкам канала. */
export async function personKey(): Promise<string | null> {
  try {
    const ch = await readChannels()
    return ch?.telegram?.chatId ? String(ch.telegram.chatId) : null
  } catch {
    return null
  }
}

/**
 * Что память знает о человеке. Без вопроса — всё, и это не стоит вызова модели.
 *
 * 🔒 ОТКАЗ НАЗЫВАЕТСЯ ПРИЧИНОЙ, А НЕ ПУСТЫМ СПИСКОМ. Пустой список человек
 * читает как «обо мне ничего не записано»; отказ службы — совсем другое дело, и
 * путать их значит показывать уверенную ложь.
 */
export async function askMemory(): Promise<MemoryAnswer> {
  const who = await personKey()
  if (!who) {
    return { ...EMPTY, trouble: "не настроен Telegram-канал: непонятно, о ком спрашивать" }
  }
  const key = secret()
  if (!key) return { ...EMPTY, trouble: "нет ключа машины", who }

  try {
    const res = await fetch(`${MEMORY}/v1/recall`, {
      body: JSON.stringify({ who }),
      cache: "no-store",
      headers: { "Content-Type": "application/json", "x-data-secret": key },
      method: "POST",
    })
    // 🔒 ЧИТАЕМ ТЕЛО, А НЕ КОД: служба отвечает `200` и с `ok:false`.
    const body = await res.json().catch(() => null)
    if (!body || body.ok !== true) {
      return { ...EMPTY, trouble: `память не ответила (${res.status})`, who }
    }
    return {
      known: Array.isArray(body.known) ? body.known : [],
      not_yet_known: Array.isArray(body.not_yet_known) ? body.not_yet_known : [],
      ok: true,
      trouble: null,
      who,
    }
  } catch (e) {
    return { ...EMPTY, trouble: `память недоступна: ${String((e as Error).message)}`, who }
  }
}
