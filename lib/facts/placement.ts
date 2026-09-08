import { factTableName } from "./table"
import type { Fact } from "./types"

// ГДЕ ЛЕЖИТ ЗНАЧЕНИЕ ПРИЗНАКА — ОДНО МЕСТО НА ВЕСЬ ПРОЕКТ (162-1).
//
// 🔒 ЭТА ЛОГИКА ЖИЛА ВНУТРИ `recall()` И ПОНАДОБИЛАСЬ ВТОРОМУ ПОТРЕБИТЕЛЮ —
// карте схемы. Скопировать её значило бы завести вторую границу белого списка;
// та, что слабее, стала бы настоящей. Поэтому вынесена, а не продублирована.
//
// 🔒 ЖИВЁТ В СЛОЕ ПРИЗНАКОВ, А НЕ В ПАМЯТИ, И ЭТО НЕ ВКУСОВЩИНА: её зовут и
// `lib/registry/access.ts`, и `lib/memory/schema-map.ts`. Положи я её в память —
// получилось бы кольцо импортов между картой и чтением реестра.

/** Где физически лежит значение признака. */
export type Placement =
  /** Своя таблица признака: `fact_<ключ>`. */
  | { kind: "own"; table: string }
  /** Колонка чужой таблицы: значение живёт вместе с сообщением, записью, файлом. */
  | { kind: "column"; table: string; column: string }
  /** Нигде: ветвь разбора, конверт графа, признак без адреса. */
  | { kind: "none"; why: string }

/**
 * 🛑 БЕЛЫЙ СПИСОК ИМЁН — ТОТ ЖЕ, ЧТО У ИМЕНИ ТАБЛИЦЫ ПРИЗНАКА, И НЕ ВТОРОЙ.
 * `storedIn` пишет в конфиг человек или агент; попав в запрос без проверки, оно
 * перестаёт быть адресом и становится SQL (закон 81-2).
 */
const NAME = /^[a-z][a-z0-9_]*$/

export function placementOf(fact: Pick<Fact, "key" | "storedIn">): Placement {
  const stored = String(fact.storedIn ?? "").trim()
  const own = factTableName(fact.key)
  if (own && stored === own) return { kind: "own", table: own }
  const dot = stored.split(".")
  if (dot.length === 2 && NAME.test(dot[0]) && NAME.test(dot[1])) {
    return { kind: "column", column: dot[1], table: dot[0] }
  }
  return {
    kind: "none",
    // 🔒 ПРИЧИНА СЛОВАМИ, А НЕ ПУСТОТА: «не хранится по устройству» и «адрес не
    // назван» — разные состояния, и второе есть недоделанная запись реестра.
    why: stored ? `значений нет по устройству: ${stored}` : "адрес хранения не назван",
  }
}
