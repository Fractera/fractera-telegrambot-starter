import { valueToCell } from "@/lib/facts/depth-guard"
import { allFacts } from "@/lib/facts/registry"
import { type FactClaim, writeFact } from "@/lib/facts/write"
import { ask, learn } from "@/lib/fractera/knowledge"
import { find, recall, recallSubject } from "@/lib/registry/access"

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

// ── ЧТЕНИЕ: ЛЕСТНИЦА ВНУТРИ ЯЩИКА, БЮДЖЕТ ПАРАМЕТРОМ (161-3) ───────────────
//
// 🔒 ЭТО ВТОРОЙ ДОЛГ §8.2 СТАНДАРТА, И ОН ЗАКРЫВАЕТСЯ ЗДЕСЬ, А НЕ В ИНСТРУКЦИИ.
// Прежде порядок источников и решение «идти ли глубже» жили словами в `CLAUDE.md`
// службы — то есть исполнялись настолько, насколько модель помнила их в этот ход.
// §10.5 называет такие правила временными лесами и велит переносить их внутрь.
//
// 🔒 ЦЕНА УГЛУБЛЕНИЯ ИЗМЕРЕНА, А НЕ ПРИДУМАНА (закон 146): личная таблица — 30 мс,
// вопрос к знанию об окружении режимом `local` — 885 · 4777 · 5016 мс на трёх
// вопросах подряд, замер на сервере 2026-09-08. Отсюда «около пяти секунд»:
// берём худшее измеренное, а не среднее, — обещание должно выполняться в плохом
// случае, иначе оно не обещание.
const DEEP_SECONDS = 5

export type MemoryItem = {
  key: string
  title: string
  value: unknown
  /** Сказано человеком, выведено системой или род не назван. */
  claim: string | null
  basis: string | null
  scope: string | null
  at: string | null
}

/** Стоит ли идти глубже и во что это обойдётся. */
export type Deeper = { available: boolean; cost_seconds: number; what: string }

export type MemoryReadResult =
  | { found: true; subject: string; total: number; items: MemoryItem[]; deeper: Deeper }
  | { found: false; subject: string; searched: string[]; hint: string; deeper: Deeper }

function capLimit(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 20
  return Math.min(Math.max(n, 1), 50)
}

/**
 * Что известно.
 *
 * 🔒 СНАРУЖИ ЭТО ОДИН ВОПРОС. Внутри — ступени: значения признаков о человеке;
 * механический поиск по его словам, когда ключ неизвестен; и, если разрешено
 * бюджетом, знание об окружении. Зовущий не знает, что источников несколько, и
 * не тратит ходы модели на выбор между ними (закон 158-4).
 */
export async function read(input: {
  query?: string
  key?: string
  subject?: string
  budget?: string
  limit?: number
}): Promise<MemoryReadResult> {
  const subject = String(input.subject ?? "").trim() || "self"
  const query = String(input.query ?? "").trim()
  const key = String(input.key ?? "").trim().toLowerCase()
  const deep = String(input.budget ?? "").trim() === "deep"
  const limit = capLimit(input.limit)
  const searched: string[] = [query, key].filter(Boolean)

  // 🔒 ГЛУБЖЕ ИМЕЕТ СМЫСЛ ТОЛЬКО ПРИ СВОБОДНОМ ВОПРОСЕ. Знание об окружении
  // отвечает словами человека, а не ключами признаков: предлагать углубление
  // там, где спросили конкретный ключ, значит обещать то, чего оно не умеет.
  const canDeepen = query.length > 0
  const offer: Deeper = {
    available: canDeepen && !deep,
    cost_seconds: DEEP_SECONDS,
    what: canDeepen
      ? "поискать в знании об окружении: истории о людях и местах, которых нет в личной памяти"
      : "глубже искать нечем: для этого нужен вопрос словами, а не ключ",
  }
  const noDeeper: Deeper = { available: false, cost_seconds: 0, what: "глубже идти уже некуда" }

  const items: MemoryItem[] = []

  // ── СТУПЕНЬ 0: ТО, ЧТО ЗАПИСАНО ───────────────────────────────────────────
  if (key) {
    const got = await recall(key, { subject, limit })
    if (got.found === true) {
      const fact = allFacts().find(f => f.key === key)
      for (const v of got.items) {
        items.push({
          at: v.at,
          basis: v.basis,
          claim: v.claim,
          key,
          scope: v.scope,
          title: fact?.title ?? key,
          value: v.value,
        })
      }
    }
  } else if (query) {
    // 🔒 МЕХАНИЧЕСКИЙ ПОИСК ПО СЛОВАМ, БЕЗ ВЫЗОВА МОДЕЛИ. Ключей человек не знает
    // и знать не обязан; поиск по основам слов стоит ноль ходов рассуждения.
    const hits = find("facts", query, { limit: 5 })
    if (hits.found === true) {
      for (const hit of hits.items) {
        if (items.length >= limit) break
        const fact = allFacts().find(f => f.key === hit.key)
        if (!fact || fact.subject !== "self") continue
        const got = await recall(hit.key, { subject, limit: 1 })
        if (got.found === true && got.items.length > 0) {
          const v = got.items[0]
          items.push({
            at: v.at,
            basis: v.basis,
            claim: v.claim,
            key: hit.key,
            scope: v.scope,
            title: fact.title,
            value: v.value,
          })
        }
      }
    }
  } else {
    // 🔒 НИ КЛЮЧА, НИ ВОПРОСА — ЭТО «ЧТО ТЫ ЗНАЕШЬ ОБО МНЕ», И ЭТО ОДИН ВОПРОС.
    const all = await recallSubject(subject, { limit })
    if (all.found === true) {
      for (const v of all.items) {
        items.push({
          at: v.at,
          basis: v.basis,
          claim: v.claim,
          key: v.key,
          scope: v.scope,
          title: v.title,
          value: v.value,
        })
      }
    }
  }

  if (items.length > 0) {
    return { deeper: deep ? noDeeper : offer, found: true, items, subject, total: items.length }
  }

  // ── СТУПЕНЬ 2: ЗНАНИЕ ОБ ОКРУЖЕНИИ — ТОЛЬКО ПО РАЗРЕШЕНИЮ БЮДЖЕТА ─────────
  if (deep && query) {
    // ── КАКИМ РЕЖИМОМ СПРАШИВАТЬ — ИЗМЕРЕНО, А НЕ ВЫБРАНО ПО ВКУСУ (161-3) ──
    //
    // 🔒 ЗАМЕР 2026-09-08, ОДИН И ТОТ ЖЕ ДОКУМЕНТ, ЧЕТЫРЕ ФОРМЫ ВОПРОСА:
    //   «Ратмиров» (одно слово, по связям)              → нашёл
    //   «Что известно о человеке по фамилии Ратмиров?»  → по связям ПОВЕЗЛО
    //   «что известно о человеке по фамилии Ратмиров»   → по связям НЕ нашёл
    //   та же строчная фраза вектором (`naive`)         → нашёл
    //
    // 🔒 ОБЪЯСНЕНИЕ МЕХАНИЧЕСКОЕ: поиск по связям вынимает из вопроса ИМЕНА и
    // сверяет их с именами сущностей; регистр и лишние слова ему мешают. Вектор
    // сравнивает смысл целой фразы, и форма ему безразлична.
    // 🛑 ЧЕЛОВЕК В TELEGRAM ПИШЕТ СТРОЧНЫМИ И ЦЕЛЫМИ ФРАЗАМИ — то есть ровно в той
    // форме, на которой поиск по связям молчит. Отсюда правило: короткий вопрос
    // (похож на имя) идёт по связям, длинный — вектором.
    const words = query.split(/\s+/).filter(Boolean).length
    const mode = words <= 3 ? "local" : "naive"
    const answer = await ask(query, mode)
    const text = String(answer.answer ?? "").trim()
    if (answer.available && text) {
      // 🛑 ОТВЕТ ОТДАЁТСЯ КАК ЕСТЬ И ПОМЕЧАЕТСЯ ПРЕДПОЛОЖЕНИЕМ, А НЕ РАЗБИРАЕТСЯ
      // НА «НАШЁЛ / НЕ НАШЁЛ» ПО ФРАЗЕ. Отличить «нашёл» от «не нашёл» можно было
      // бы только чтением слов чужой службы — а её формулировка изменится молча,
      // и наш разбор станет врать, не сломавшись. Пусть решает тот, кто читает.
      // 🔒 ПОМЕТКА ЧЕСТНАЯ ПО УСТРОЙСТВУ: это собрано моделью из связей, а не
      // сказано человеком (§8.3 стандарта: чем глубже, тем больше в ответе модели).
      return {
        deeper: noDeeper,
        found: true,
        items: [
          {
            at: null,
            basis: "собрано из связей знания об окружении, а не записано человеком",
            claim: "guess",
            key: "surroundings",
            scope: null,
            title: "Знание об окружении",
            value: text,
          },
        ],
        subject,
        total: 1,
      }
    }
  }

  // 🔒 «НИЧЕГО НЕ ЗНАЮ» — ЗАКОННЫЙ ОТВЕТ, И ОН НАЗЫВАЕТ, ПО ЧЕМУ ИСКАЛИ.
  // Пустота без этого читается как поломка, и следующий шаг делать не из чего.
  return {
    deeper: deep ? noDeeper : offer,
    found: false,
    hint: key
      ? "признак есть, значений у него пока нет"
      : query
        ? "по этим словам в записанном ничего не нашлось"
        : "о человеке пока ничего не записано",
    searched,
    subject,
  }
}
