// ТИПЫ И КОНСТАНТЫ ЭКРАНА ЗНАНИЙ — БЕЗ СЕРВЕРНЫХ ЗАВИСИМОСТЕЙ.
//
// ✗ ЧЕМ ОПЛАЧЕН ЭТОТ ФАЙЛ, 2026-09-08: клиентский островок таблицы импортировал
// `KNOWN_PER_PAGE` и типы прямо из `known.ts`. Типы при сборке стираются, а
// **константа тянет весь модуль** — вместе с чтением реестра и `node:fs`.
// Сборка упала: «the chunking context does not support external modules
// (request: node:fs)», служба не поднялась, порт 3600 остался без слушателя.
//
// 🔒 ПРАВИЛО, КОТОРОЕ ОТСЮДА СЛЕДУЕТ: КЛИЕНТСКИЙ ФАЙЛ НЕ ИМПОРТИРУЕТ ИЗ
// СЕРВЕРНОГО НИЧЕГО, КРОМЕ ТИПОВ — а если нужна константа, она живёт в третьем
// файле, у которого нет серверных импортов вовсе. Проверка глазами тут не
// работает: `import type` виден, а обычный `import` рядом — нет.

export const KNOWN_PER_PAGE = [10, 25, 50] as const
export type KnownPerPage = (typeof KNOWN_PER_PAGE)[number]

export type KnownQuery = {
  /** Поиск по названию, ключу, меткам и значению. */
  q: string
  /** Только заполненные · только пустые · всё равно. */
  filled: "any" | "yes" | "no"
  page: number
  per: KnownPerPage
}

export type KnownRow = {
  key: string
  title: string
  what: string
  example: string | null
  tags: string[]
  value: string | null
  at: string | null
  /**
   * Три состояния, различимые на вид (закон 158-5):
   * `known` — значение есть · `empty` — ещё не говорили · `down` — база молчит.
   * 🛑 Слив второе с третьим, экран показал бы норму вместо аварии.
   */
  state: "known" | "empty" | "down"
  hint: string | null
}

export type KnownPage = {
  rows: KnownRow[]
  /** Сколько строк прошло отбор — всего, а не на этой странице. */
  total: number
  /** Страниц всего. Ноль строк — одна пустая страница, а не ноль страниц. */
  pages: number
  page: number
  per: KnownPerPage
  /** Сколько всего заполнено — это число человек видит как «что вы обо мне знаете». */
  filled: number
  /** Отказала ли база: тогда пустота значит поломку, а не «ещё не говорили». */
  down: boolean
}
