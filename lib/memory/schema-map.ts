import { allFacts } from "@/lib/facts/registry"
import { type Placement, placementOf } from "@/lib/facts/placement"
import { dataFetch } from "@/lib/fractera/data-service"
import { find } from "@/lib/registry/access"

// КАРТА СХЕМЫ: ГДЕ ЖИВЁТ КАЖДЫЙ ПРИЗНАК И ЧТО ИЗ ЭТОГО СУЩЕСТВУЕТ (162-1).
//
// 🎯 ТРЕБОВАНИЕ ВЛАДЕЛЬЦА 2026-09-08, ДОСЛОВНО: «ты первым делом извлекаешь в
// себя схему всех существующих таблиц базы данных, чтобы сопоставить, с какими
// таблицами теоретически может быть связан этот запрос, и делаешь извлечение
// данных из соответствующих таблиц».
//
// ✗ ЧЕМ ОПЛАЧЕНА ЭТА КАРТА. Измерено 2026-09-08: `memory_read` смотрел **только
// личные признаки** — 14 записей реестра из 49 и 9 таблиц из 40. Значения,
// лежащие в `tgdesk_messages` (17 признаков), `tgdesk_entries` (6) и
// `tgdesk_artifacts` (3), не находились вопросом человека НИКОГДА.
//
// 🔒 ОБЪЯВЛЕННОЕ И СУЩЕСТВУЮЩЕЕ — РАЗНЫЕ ВЕЩИ, И КАРТА ИХ РАЗЛИЧАЕТ. Признак
// описан в реестре, а таблицы под него ещё нет — это законное состояние («значений
// не было»), и оно обязано выглядеть иначе, чем «слой данных не ответил».
// Тот же закон, которым в 157-5 оплачено «уверенная ложь вместо честного нечего».

// 🔒 РАЗМЕЩЕНИЕ ПРИХОДИТ ИЗ СЛОЯ ПРИЗНАКОВ (`lib/facts/placement.ts`), А НЕ
// ПИШЕТСЯ ЗДЕСЬ: ту же логику зовёт `recall()`, и вторая копия разошлась бы с
// первой на первом ужесточении белого списка.
export type { Placement }

export type MapEntry = {
  key: string
  title: string
  level: string
  tags: string[]
  subject: string | null
  placement: Placement
  /**
   * Существует ли адрес на самом деле.
   *
   * 🔒 У `kind: "none"` это `false` НЕ КАК ОШИБКА, а как факт: хранить негде по
   * устройству признака.
   */
  exists: boolean
}

export type Candidate = MapEntry & { why: string[] }

/**
 * Какие таблицы существуют в базе.
 *
 * 🔒 ЗАПРАШИВАЕТСЯ ВСЯ СХЕМА, А НЕ ТОЛЬКО `fact_*`. Соседка `existingFactTables()`
 * отвечает на более узкий вопрос — «созданы ли таблицы признаков», — и остаётся
 * как есть: у неё свой потребитель (`ensure`, `recall`), и сужать её нельзя.
 * 🛑 ОТКАЗ ВОЗВРАЩАЕТ ПУСТОЕ МНОЖЕСТВО, И ЭТО НАЗЫВАЕТСЯ ВЫШЕ ПО ТЕКСТУ:
 * «таблиц не видно» и «таблиц нет» — разные вещи, и карта не имеет права
 * выдавать первое за второе молча.
 */
export async function existingTables(): Promise<Set<string>> {
  try {
    const r = await dataFetch("/db/migrate", {
      method: "POST",
      body: JSON.stringify({
        sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      }),
    })
    if (!r.ok) return new Set()
    const d = (await r.json()) as { ok?: boolean; rows?: { name?: unknown }[] }
    if (d.ok === false) return new Set()
    return new Set((d.rows ?? []).map(x => String(x.name ?? "")).filter(Boolean))
  } catch {
    return new Set()
  }
}

/**
 * Карта целиком: каждая запись реестра со своим адресом и признаком существования.
 *
 * 🔒 ПОРОЖДАЕТСЯ ИЗ РЕЕСТРА И ЖИВОЙ СХЕМЫ, А НЕ ПЕРЕЧИСЛЯЕТСЯ. Рукописный список
 * таблиц разошёлся бы с базой молча — тот же закон, что у чисел в инструкциях,
 * оплаченный в проекте пять раз.
 */
export async function schemaMap(): Promise<MapEntry[]> {
  const have = await existingTables()
  return allFacts().map(fact => {
    const placement = placementOf(fact)
    return {
      exists: placement.kind === "none" ? false : have.has(placement.table),
      key: fact.key,
      level: String(fact.level ?? ""),
      placement,
      subject: fact.subject ?? null,
      tags: Array.isArray(fact.tags) ? fact.tags : [],
      title: fact.title,
    }
  })
}

/**
 * Кандидаты по словам человека: какие признаки МОГУТ относиться к запросу.
 *
 * 🔒 МЕХАНИЧЕСКИ, БЕЗ ВЫЗОВА МОДЕЛИ. Сопоставление идёт основами слов по
 * триггерам, вопросам, имени и описанию записи — это `find()` реестра, и второй
 * поиск рядом с ним заводить нельзя (закон 157-5: порядок «механика → промах →
 * модель», а промахнувшаяся фраза дописывается в триггеры).
 *
 * 🛑 ПУСТОЙ ОТВЕТ НА БЕССМЫСЛЕННЫЙ ЗАПРОС — ЭТО ПРАВИЛЬНО. Карта, возвращающая
 * «все таблицы, вдруг пригодится», превращает первый уровень в полный обход базы
 * и делает глубину бессмысленной: дешёвый уровень станет самым дорогим.
 */
export function candidates(query: string, opts: { limit?: number } = {}): {
  hits: Candidate[]
  searched: string[]
} {
  const q = String(query ?? "").trim()
  if (!q) return { hits: [], searched: [] }
  const found = find("facts", q, { limit: opts.limit ?? 12 })
  if (found.found !== true) {
    return { hits: [], searched: found.searched ?? [] }
  }
  const byKey = new Map(allFacts().map(f => [f.key, f]))
  const hits: Candidate[] = []
  for (const hit of found.items) {
    const fact = byKey.get(hit.key)
    if (!fact) continue
    const placement = placementOf(fact)
    hits.push({
      // 🔒 СУЩЕСТВОВАНИЕ ЗДЕСЬ НЕ ПРОВЕРЯЕТСЯ ЗАПРОСОМ К БАЗЕ: кандидаты
      // считаются в чистой функции, потому что их зовут на каждом вопросе.
      // Живую проверку делает `schemaMap()` там, где она нужна.
      exists: placement.kind !== "none",
      key: fact.key,
      level: String(fact.level ?? ""),
      placement,
      subject: fact.subject ?? null,
      tags: Array.isArray(fact.tags) ? fact.tags : [],
      title: fact.title,
      why: hit.why,
    })
  }
  return { hits, searched: [q] }
}
