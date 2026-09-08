import { readAutomationRow } from "./store"
import { planSchedule } from "@/lib/schedule/store"
import { recall } from "@/lib/registry/access"

// СЛЕДУЮЩАЯ СТУПЕНЬ ЦЕПОЧКИ — ПЕРВЫЙ ПИСАТЕЛЬ РОДА `chain` (143-5).
//
// 🔒 РОД `chain` БЫЛ ОБЪЯВЛЕН И НЕ ПИСАЛСЯ НИКЕМ. `SCHEDULE_KINDS` знает его с
// 155-5, `tick.ts` умеет обращаться с опоздавшей ступенью — а завести такую
// запись было некому. Способность, написанная и запертая, снаружи неотличима от
// отсутствующей.
//
// ✅ КАЛЕНДАРЬ БОЛЬШЕ НЕ ПУСТ. План 143 от 2026-09-07 называл ограничением
// «ступень уедет в мёртвый календарь»: тикер `fractera-schedule-tick` живёт с
// 157-1, и ограничение снято ИЗМЕРЕНИЕМ, а не забыто.
//
// 🔒 ЗОНА БЕРЁТСЯ ИЗ ПАМЯТИ О ЧЕЛОВЕКЕ, А ПОТОМ УЖЕ СПРАШИВАЕТСЯ. Факт
// `person.timezone` записывается сепарацией с 158-5; спросить второй раз то, что
// уже записано, — ровно тот дефект, на который владелец сказал: «неужели я буду
// каждый раз отвечать на вопрос, где я нахожусь?»
// 🔒 И ОТКАЗ ОСТАЁТСЯ ОТКАЗОМ: зоны нет нигде — ступень не заводится, причина
// возвращается словами. Поставить срок по Гринвичу значит поставить не тогда.

export type NextStepInput = {
  automationId: number
  /** Что должно случиться на следующей ступени — словами человека. */
  what: string
  /** Когда, ISO. Называет человек: система не знает, когда ему удобно. */
  dueAt: string
  /** Зона. Пусто — попробуем вспомнить, и только потом откажем. */
  tz?: string
}

export type NextStepResult = {
  id: number | null
  refused?: "no-tz" | "no-due" | "no-what" | "not-found"
  /** Причина словами — она уезжает агенту, а он произносит её человеку. */
  why: string
  /** Откуда взялась зона: сказал человек, вспомнили, или её нет. */
  tzFrom: "said" | "remembered" | "none"
}

/**
 * Завести следующую ступень цепочки.
 *
 * 🔒 ЭТО НЕ «ПРАВИЛО ЦЕПОЧКИ» — оно живёт в §3л (шаг 150). Здесь механика: чем
 * ступень записывается и что происходит, когда её записать нечем.
 */
export async function planNextStep(input: NextStepInput): Promise<NextStepResult> {
  const what = (input.what ?? "").trim()
  if (!what) {
    return { id: null, refused: "no-what", tzFrom: "none", why: "не сказано, что должно случиться на следующей ступени" }
  }
  const row = await readAutomationRow(input.automationId)
  if (!row) {
    return { id: null, refused: "not-found", tzFrom: "none", why: `автоматизации №${input.automationId} нет` }
  }
  if (!input.dueAt) {
    return { id: null, refused: "no-due", tzFrom: "none", why: "не назван срок следующей ступени" }
  }

  let tz = (input.tz ?? "").trim()
  let tzFrom: NextStepResult["tzFrom"] = tz ? "said" : "none"
  if (!tz) {
    // 🔒 ЧТЕНИЕ — ТЕМ ЖЕ ПРИМИТИВОМ, ЧТО У ВСЕХ (`recall`, §3о). Свой запрос к
    // таблице признака был бы вторым входом в реестр, а закон 157-4 требует
    // одного: четыре примитива на оба корпуса, и корпус у них параметр.
    const got = await recall("person.timezone", { subject: "self", limit: 1 })
    const value = got.found === true && got.items.length > 0 ? String(got.items[0].value ?? "") : ""
    if (value) {
      tz = value
      tzFrom = "remembered"
    }
  }
  if (!tz) {
    return {
      id: null,
      refused: "no-tz",
      tzFrom: "none",
      // 🔒 ВОПРОС НАЗЫВАЕТ ПРИЧИНУ (закон 141): вопрос без причины читается как
      // любопытство, получает отказ — и второй раз его уже не задать.
      why: "не знаю часового пояса: без него срок встанет не на то время. Спросить, где человек находится",
    }
  }

  const planned = await planSchedule({
    automationId: input.automationId,
    kind: "chain",
    payload: what,
    dueAt: input.dueAt,
    tz,
    // 🔒 ОХВАТ НАСЛЕДУЕТСЯ ОТ АВТОМАТИЗАЦИИ (§3г): ступень происходит там же, где
    // и её родитель. Пустой охват значит «не знаю где», а не «везде».
    scopeKey: row.scopeKey ?? null,
  })
  if (planned.id === null) {
    return { id: null, refused: planned.refused, tzFrom, why: `срок не заведён: ${planned.refused ?? "отказ базы"}` }
  }
  return {
    id: planned.id,
    tzFrom,
    why: `следующая ступень заведена на ${input.dueAt} (${tz}${tzFrom === "remembered" ? ", зона вспомнена" : ""})`,
  }
}
