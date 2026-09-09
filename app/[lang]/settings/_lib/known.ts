import { askMemory } from "@/lib/architect/memory-service"

// ЧТО СИСТЕМА ЗНАЕТ О ЧЕЛОВЕКЕ — ОТБОР, СОРТИРОВКА И СТРАНИЦЫ НА СЕРВЕРЕ.
//
// 🎯 РЕШЕНИЕ ВЛАДЕЛЬЦА 2026-09-08: «представь формат в виде таблицы с
// горизонтальной прокруткой и используй в этой таблице дизайн пагинации и
// запросах серверу такой же как ты используешь на странице история
// автоматизации… наращивание данных в этой таблице будет происходить линейно
// практически при каждом обращении».
//
// 🔒 ИМЕННО ПОЭТОМУ ОТБОР ПЕРЕЕХАЛ НА СЕРВЕР. Пока признаков полтора десятка,
// клиентский островок мог грузить всё разом; при линейном росте это превращается
// в страницу, которая тем медленнее, чем дольше человек пользуется системой, —
// то есть наказывает за использование.
//
// 🔒 УСТРОЙСТВО ВЗЯТО У «ИСТОРИИ АВТОМАТИЗАЦИЙ» ДОСЛОВНО (`_lib/automations.ts`):
// запрос живёт в адресе страницы, отбор и страницы считаются здесь, островок
// получает готовое. Второй способ листать в том же разделе разошёлся бы с первым
// на первой правке.
//
// 🛑 ПАРАМЕТРЫ АДРЕСА СВОИ, С ПРЕФИКСОМ `k`. На этой же странице живёт запрос
// автоматизаций (`q`, `page`, `per`); возьми мы те же имена — поиск по знаниям
// листал бы автоматизации, и наоборот. Столкновение было бы молчаливым.

// 🔒 ТИПЫ И КОНСТАНТЫ — В ОБЩЕМ ФАЙЛЕ БЕЗ СЕРВЕРНЫХ ЗАВИСИМОСТЕЙ.
// ✗ оплачено падением сборки 2026-09-08: клиентский островок импортировал
// константу отсюда и утащил в браузерный бандл `node:fs`.
export {
  KNOWN_PER_PAGE,
  type KnownPage,
  type KnownPerPage,
  type KnownQuery,
  type KnownRow,
} from "./known-shared"

import { KNOWN_PER_PAGE, type KnownPage, type KnownPerPage, type KnownQuery, type KnownRow } from "./known-shared"

export function readKnownQuery(raw: Record<string, string | undefined>): KnownQuery {
  const per = Number(raw.kper)
  const page = Number(raw.kpage)
  return {
    q: (raw.kq ?? "").trim(),
    filled: raw.kfilled === "yes" || raw.kfilled === "no" ? raw.kfilled : "any",
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
    per: (KNOWN_PER_PAGE as readonly number[]).includes(per) ? (per as KnownPerPage) : KNOWN_PER_PAGE[0],
  }
}

/**
 * Какие признаки вообще показывать.
 *
 * 🔒 ТОЛЬКО ФАКТЫ О ЧЕЛОВЕКЕ (`subject: "self"`), И ЭТО ГРАНИЦА СТРАНИЦЫ, А НЕ
 * ФИЛЬТР УДОБСТВА. Признаки прогона — «пришло текстом», «есть вложение» — это
 * про сообщение, а не про него; смешав их, страница перестала бы отвечать на
 * свой единственный вопрос: что система знает ОБО МНЕ.
 */
/**
 * Прочитать из СЛУЖБЫ ПАМЯТИ и собрать страницу.
 *
 * 🔒 ОДИН ВЫЗОВ НА ВСЮ СТРАНИЦУ, А НЕ ПО ВЫЗОВУ НА ПРИЗНАК. Прежде здесь шло
 * чтение по каждому признаку отдельно — тринадцать ожиданий подряд. Новая
 * память отдаёт всё известное одним ответом и без вызова модели.
 *
 * 🛑 ОТКАЗ СЛУЖБЫ И ПУСТАЯ ПАМЯТЬ — РАЗНЫЕ СОСТОЯНИЯ, И ПУТАТЬ ИХ НЕЛЬЗЯ.
 * Пустой список человек читает как «обо мне ничего не записано»; молчание
 * службы он прочтёт так же — и это была бы уверенная ложь.
 */
export async function queryKnown(query: KnownQuery): Promise<KnownPage> {
  const answer = await askMemory()

  // 🔒 ИМЯ РОДА — ЭТО УЖЕ ФРАЗА, И ОНА ЖЕ НАЗВАНИЕ СТРОКИ. Второго словаря
  // названий здесь нет намеренно: он разошёлся бы с памятью на первой правке.
  const readable = (k: string) => k.split("_").join(" ")

  const got: KnownRow[] = [
    ...answer.known.map(v => ({
      key: v.what,
      title: readable(v.what),
      // Догадка помечается словами, а не молча выдаётся за свидетельство.
      what: v.claim === "guess"
        ? `это вывод системы, а не ваши слова${v.basis ? `: ${v.basis}` : ""}`
        : "вы сказали это сами",
      example: null,
      tags: v.claim === "guess" ? ["догадка"] : [],
      value: v.value,
      at: null,
      state: "known" as const,
      hint: null,
    })),
    ...answer.not_yet_known.map(m => ({
      key: m.what,
      title: readable(m.what),
      what: m.why,
      example: null,
      tags: [],
      value: null,
      at: null,
      state: (answer.ok ? "empty" : "down") as "empty" | "down",
      hint: answer.trouble,
    })),
  ]

  const down = !answer.ok
  const filledCount = answer.known.length

  const needle = query.q.toLowerCase()
  const found = got.filter(row => {
    if (query.filled === "yes" && row.state !== "known") return false
    if (query.filled === "no" && row.state === "known") return false
    if (!needle) return true
    // 🔒 ИЩЕМ ПО НАЗВАНИЮ, КЛЮЧУ, МЕТКАМ И ЗНАЧЕНИЮ. Слово владельца: «поиск по
    // названию или метки». Значение добавлено сверх просьбы намеренно: человек
    // ищет «Канары», а не «часовой пояс», — и не найдя, решит, что мы забыли.
    return (
      row.title.toLowerCase().includes(needle) ||
      row.key.toLowerCase().includes(needle) ||
      row.tags.some(t => t.toLowerCase().includes(needle)) ||
      (row.value ?? "").toLowerCase().includes(needle)
    )
  })

  // 🔒 ЗАПОЛНЕННЫЕ СВЕРХУ, ПОТОМ ПО НАЗВАНИЮ. Человек приходит смотреть, что
  // система знает; пустые строки — это приглашение рассказать, и им место ниже.
  found.sort((a, b) => {
    if ((a.state === "known") !== (b.state === "known")) return a.state === "known" ? -1 : 1
    return a.title.localeCompare(b.title, "ru")
  })

  const pages = Math.max(1, Math.ceil(found.length / query.per))
  const page = Math.min(query.page, pages)
  const from = (page - 1) * query.per

  return {
    rows: found.slice(from, from + query.per),
    total: found.length,
    pages,
    page,
    per: query.per,
    filled: filledCount,
    down,
  }
}
