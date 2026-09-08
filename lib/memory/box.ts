import { valueToCell } from "@/lib/facts/depth-guard"
import { allFacts } from "@/lib/facts/registry"
import { type FactClaim, writeFact } from "@/lib/facts/write"
import { learn } from "@/lib/fractera/knowledge"
import { find } from "@/lib/registry/access"

// ВНУТРЕННОСТИ ЧЁРНОГО ЯЩИКА ПАМЯТИ (161-1, стандарт памяти §10).
//
// 🔒 ЗДЕСЬ ЖИВЁТ ТО, ЧЕГО АГЕНТ ЗНАТЬ НЕ ДОЛЖЕН: сколько у памяти источников,
// как они называются и во что обходятся. Снаружи — четыре глагола.
//
// 🔒 ПОЧЕМУ ЭТО ВАЖНЕЕ УДОБСТВА: правило, живущее в инструкции агента, исполняется
// РОВНО НАСТОЛЬКО, насколько модель его помнит в этот ход. Правило, живущее в
// коде, исполняется всегда. §10.5 стандарта прямо велит переносить сюда всё, что
// сегодня написано словами для агента, — и называет такие правила временными лесами.

/** Куда легла запись. Наружу уезжает словами человека, а не именем хранилища. */
export type MemoryPlace = "personal" | "surroundings"

export type MemoryWriteInput = {
  what: string | Record<string, unknown>
  key?: string
  anchors?: string[]
  claim?: string
  basis?: string
  source?: string
  automationId?: number | null
}

export type MemoryWriteResult =
  | { ok: true; where: MemoryPlace; stored: string; hint?: string; unknownAnchors?: string[] }
  | { ok: false; error: string; hint: string; candidates?: string[] }

/**
 * Записать в память.
 *
 * 🔒 РЕШЕНИЕ «КУДА» ПРИНИМАЕТ ЯЩИК, А НЕ ЗОВУЩИЙ. Это и есть весь смысл: до
 * шага 161 агент обязан был сам выбрать между `registry_remember` и дверью
 * знаний, то есть знать, что хранилищ два, и не ошибиться.
 *
 * 🛑 И ИМЕННО ЗДЕСЬ ЭТО СЛОМАЛОСЬ: инструкция велела звать `mcp__intake__knowledge`,
 * а такого инструмента в `tools/list` не было НИ ОДНОГО ДНЯ (найдено 161-1).
 * Дверь знаний работала, прибор был зелёным — он звал её напрямую. Пятый случай
 * «построено и не подключено» за три дня.
 */
export async function write(input: MemoryWriteInput): Promise<MemoryWriteResult> {
  const key = String(input.key ?? "").trim().toLowerCase()
  const anchors = (Array.isArray(input.anchors) ? input.anchors : [])
    .filter(a => typeof a === "string" && a.trim())
    .map(a => a.trim())
  const cell = valueToCell(input.what)

  if (!cell) {
    return { ok: false, error: "empty", hint: "нечего запоминать: значение пустое" }
  }

  // ── РОД ЗАПИСИ (161-2) ────────────────────────────────────────────────────
  //
  // 🔒 ЯЩИК ПРОПУСКАЕТ РОД К ПИСАТЕЛЮ, А ПРОВЕРЯЕТ ЕГО ПИСАТЕЛЬ. Проверка здесь
  // означала бы вторую границу рядом с первой: обойти писателя нельзя, обойти
  // ящик — можно, и слабейшая проверка стала бы настоящей.
  const claim = String(input.claim ?? "").trim()

  // ── ОДНО ИЗ ДВУХ, А НЕ ОБА ────────────────────────────────────────────────
  //
  // 🔒 ОТКАЗ, А НЕ ВЫБОР ПО СТАРШИНСТВУ. Пришли и ключ, и якоря — вызывающий сам
  // не знает, о ком эта запись. Выбрать за него значит записать не туда молча, а
  // молчаливая ошибка памяти обнаруживается через месяц пустым ответом.
  if (key && anchors.length > 0) {
    return {
      ok: false,
      error: "both-key-and-anchors",
      hint:
        "назови одно: `key` — если это факт о самом человеке, `anchors` — если это история о ком-то из его окружения",
    }
  }

  // ── ИСТОРИЯ ОБ ОКРУЖЕНИИ: ЯКОРЯ ЕСТЬ ──────────────────────────────────────
  if (anchors.length > 0) {
    // 🔒 ГРАФ ПРИНИМАЕТ ТЕКСТ, А НЕ ОБЪЕКТ. Объект, свёрнутый в JSON, читается
    // моделью графа как строка со скобками: сущности из него не извлекутся, и
    // запись станет невидимой ровно тем способом, от которого защищает якорь.
    if (typeof input.what !== "string") {
      return {
        ok: false,
        error: "not-text",
        hint: "историю об окружении запиши словами человека, а не объектом полей",
      }
    }
    const source = `memory/${anchors[0]}-${Date.now()}`
    const done = await learn({ anchors, source, text: input.what.trim() })
    if (!done.accepted) {
      return {
        ok: false,
        error: done.refused ?? "refused",
        hint: "знание об окружении не принято хранилищем",
      }
    }
    // 🔒 НАЗЫВАЕТСЯ ВСЛУХ: связи строятся в фоне десятки секунд, и вопрос,
    // заданный сразу, этой записи может не увидеть. Молчание об этом
    // вызывающий прочтёт как «уже доступно» и пообещает человеку лишнее.
    return {
      ok: true,
      where: "surroundings",
      stored: input.what.trim(),
      hint: "записано; связи строятся в фоне — вопрос сразу после записи может этого ещё не найти",
    }
  }

  // ── ФАКТ О ЧЕЛОВЕКЕ: НУЖЕН КЛЮЧ ───────────────────────────────────────────
  //
  // 🔒 КЛЮЧ НЕ УГАДЫВАЕТСЯ, НО ПОДСКАЗЫВАЕТСЯ. Записать по угаданному ключу
  // значит положить значение туда, где его никто не найдёт, и узнать об этом
  // через месяц. Поэтому отказ, но отказ С КАНДИДАТАМИ: механический поиск
  // стоит ноль ходов модели, а вызывающему остаётся выбрать, а не гадать.
  if (!key) {
    const guess = find("facts", typeof input.what === "string" ? input.what : cell, { limit: 5 })
    const candidates = guess.found === true ? guess.items.map(i => i.key) : []
    return {
      ok: false,
      error: "no-key",
      hint:
        candidates.length > 0
          ? "не назван ключ признака; по этим словам подходят: " + candidates.join(", ")
          : "не назван ни ключ признака (факт о человеке), ни якоря (история об окружении)",
      candidates,
    }
  }

  // 🛑 ГРАНИЦУ СТЕРЕЖЁТ ЯЩИК, А НЕ ОБЪЯВЛЕНИЕ (закон 158-5а, перенесён из двери
  // реестра). Ключ приходит от модели; без этой проверки метод стал бы способом
  // дописать что угодно в любую таблицу признаков.
  const fact = allFacts().find(f => f.key === key)
  if (!fact || fact.subject !== "self") {
    return {
      ok: false,
      error: "not-a-person-fact",
      hint: "по этому ключу память о человеке не ведётся; ключ берут из поиска по его словам",
    }
  }

  const written = await writeFact({
    automationId: input.automationId ?? null,
    basis: input.basis ?? null,
    claim: (claim || null) as FactClaim | null,
    key,
    source: input.source ?? "сказано человеком в переписке",
    subject: "self",
    // 🔒 ЗНАЧЕНИЕ ПЕРЕДАЁТСЯ КАК ЕСТЬ, БЕЗ ПРИВЕДЕНИЯ К СТРОКЕ. Приведение типа
    // ПЕРЕД проверкой обезоруживает проверку — закон, оплаченный в 160 тем, что
    // объект становился строкой до сторожа глубины и проходил его насквозь.
    value: input.what,
  })

  if (!written.ok) {
    // 🔒 ОТКАЗ ГЛУБИНЫ НАЗЫВАЕТ ДОРОГУ, А НЕ ТОЛЬКО ЗАПРЕТ. «Нельзя» без «а как
    // можно» приводит к тому, что вызывающий выбрасывает сказанное человеком.
    const road =
      written.error === "nested-object" || written.error === "second-order-subject"
        ? " Перескажи это словами и назови, о ком речь, — уедет в знание об окружении."
        : ""
    return { ok: false, error: written.error, hint: written.hint + road }
  }

  return { ok: true, stored: cell, where: "personal" }
}
