// @api read the fact registry, add a fact, edit or disable one
import { NextRequest, NextResponse } from "next/server"
import { requireRoles } from "@/lib/auth/require-roles"
import { ARCHITECT_LAYER_ROLES } from "@/lib/roles"
import { allFacts, addFact, updateFact, disableFact } from "@/lib/facts/registry"
import { ensureFactTables } from "@/lib/facts/ensure"
import { factIdentifier, factTableName } from "@/lib/facts/table"
import {
  FACT_AGGREGATE,
  FACT_LEVELS,
  FACT_MODEL,
  FACT_ON_MISSING,
  FACT_SCHEDULES,
  FACT_SUBJECT,
  FACT_VALUE_TYPES,
} from "@/lib/facts/types"
import type { FactLifecycle, FactProduces } from "@/lib/facts/types"
import { FACT_FN_KINDS } from "@/lib/facts/fn-types"
import { allowedHosts } from "@/lib/facts/run-fn"
import { checkChain } from "@/lib/facts/derived"

/** Второй слой записи, разобранный и проверенный. Ошибка — названное поле. */
type SecondLayer = {
  produces?: FactProduces[]
  derivedFrom?: string
  derivedSlot?: string
  aggregate?: (typeof FACT_AGGREGATE)[number]
  unit?: string
  subject?: (typeof FACT_SUBJECT)[number]
  lifecycle?: FactLifecycle
  schedules?: (typeof FACT_SCHEDULES)[number]
  model?: (typeof FACT_MODEL)[number]
}

const MAX_PRODUCES = 12
const MAX_STATUSES = 12
const MAX_UNIT = 16

/**
 * Разобрать восемь настроек второго слоя (83-1).
 *
 * 🔒 ЗНАЧЕНИЕ ВНЕ ЗАКРЫТОГО СПИСКА ОТКЛОНЯЕТСЯ, А НЕ ПРИВОДИТСЯ К УМОЛЧАНИЮ.
 * Настройки рождаются из свободного описания через модель, и `aggregate:
 * "суммировать"` она вернёт правдоподобно. Молча заменив это на `none`, дверь
 * ответила бы `200` — и человек остался бы уверен, что настроил накопление,
 * которого нет. Отказ с названием поля дешевле такой уверенности.
 *
 * 🔒 НЕ НАЗВАННОЕ ПОЛЕ ОСТАЁТСЯ НЕ НАЗВАННЫМ — это заплата, а не снимок:
 * `undefined` значит «не трогай», и только так `PATCH` может править одну
 * настройку, не сбивая семь остальных.
 */
function readSecondLayer(body: Record<string, unknown>): SecondLayer | { error: string } {
  const out: SecondLayer = {}

  if (body.produces !== undefined && body.produces !== null) {
    if (!Array.isArray(body.produces)) return { error: "bad-produces" }
    if (body.produces.length > MAX_PRODUCES) return { error: "too-many-produces" }
    const list: FactProduces[] = []
    for (const raw of body.produces) {
      if (!raw || typeof raw !== "object") return { error: "bad-produces" }
      const p = raw as Record<string, unknown>
      // 🛑 СЛОТ ПРОХОДИТ ТОТ ЖЕ БЕЛЫЙ СПИСОК, ЧТО ИМЯ ТАБЛИЦЫ. Он попадёт в
      // значение колонки и в условие запроса, а приезжает из слов человека.
      const slot = factIdentifier(String(p.slot ?? ""))
      if (!slot) return { error: "bad-produces-slot" }
      if (list.some(x => x.slot === slot)) return { error: "duplicate-produces-slot" }
      const valueType = String(p.valueType ?? "number")
      if (!FACT_VALUE_TYPES.includes(valueType as never)) return { error: "bad-produces-value-type" }
      const title = String(p.title ?? "").trim()
      if (!title) return { error: "no-produces-title" }
      const unit = String(p.unit ?? "").trim().slice(0, MAX_UNIT)
      list.push({ slot, title, valueType: valueType as never, unit: unit || undefined })
    }
    out.produces = list
  }

  if (body.derivedFrom !== undefined && body.derivedFrom !== null && body.derivedFrom !== "") {
    // Источник называется КЛЮЧОМ признака, и ключ обязан быть годным. Существует
    // ли такой признак — вопрос 83-4: на заведении источника может ещё не быть.
    const from = String(body.derivedFrom).trim().toLowerCase()
    if (!factTableName(from)) return { error: "bad-derived-from" }
    out.derivedFrom = from
    if (body.derivedSlot !== undefined && body.derivedSlot !== null && body.derivedSlot !== "") {
      const slot = factIdentifier(String(body.derivedSlot))
      if (!slot) return { error: "bad-derived-slot" }
      out.derivedSlot = slot
    }
  }

  if (body.aggregate !== undefined && body.aggregate !== null) {
    const v = String(body.aggregate)
    if (!FACT_AGGREGATE.includes(v as never)) return { error: "bad-aggregate" }
    out.aggregate = v as never
  }

  if (body.unit !== undefined && body.unit !== null) {
    out.unit = String(body.unit).trim().slice(0, MAX_UNIT)
  }

  if (body.subject !== undefined && body.subject !== null) {
    const v = String(body.subject)
    if (!FACT_SUBJECT.includes(v as never)) return { error: "bad-subject" }
    out.subject = v as never
  }

  if (body.lifecycle !== undefined && body.lifecycle !== null && body.lifecycle !== "") {
    const l = body.lifecycle as Record<string, unknown>
    if (typeof l !== "object" || !Array.isArray(l.statuses)) return { error: "bad-lifecycle" }
    if (l.statuses.length < 2 || l.statuses.length > MAX_STATUSES) return { error: "bad-lifecycle-statuses" }
    const statuses: string[] = []
    for (const s of l.statuses) {
      const id = factIdentifier(String(s))
      if (!id || statuses.includes(id)) return { error: "bad-lifecycle-status" }
      statuses.push(id)
    }
    // 🔒 НАЧАЛЬНОЕ СОСТОЯНИЕ ОБЯЗАНО БЫТЬ СРЕДИ ОБЪЯВЛЕННЫХ. Иначе сущность
    // рождается в состоянии, которого нет в её же списке, и первый переход
    // отклоняется навсегда — при исправном на вид описании.
    const initial = factIdentifier(String(l.initial ?? ""))
    if (!initial || !statuses.includes(initial)) return { error: "bad-lifecycle-initial" }
    out.lifecycle = { statuses, initial }
  }

  if (body.schedules !== undefined && body.schedules !== null) {
    const v = String(body.schedules)
    if (!FACT_SCHEDULES.includes(v as never)) return { error: "bad-schedules" }
    out.schedules = v as never
  }

  if (body.model !== undefined && body.model !== null) {
    const v = String(body.model)
    if (!FACT_MODEL.includes(v as never)) return { error: "bad-model" }
    out.model = v as never
  }

  return out
}

/** Хост описанной функции разрешён? Тот же список, что у исполнителя. */
function hostOfFnAllowed(url: unknown): boolean {
  try {
    const u = new URL(String(url))
    return u.protocol === "https:" && allowedHosts().includes(u.hostname)
  } catch {
    return false
  }
}

// ДВЕРЬ РЕЕСТРА ПРИЗНАКОВ (81-4).
//
// 🔒 ЗАМОК ЗДЕСЬ, А НЕ ТОЛЬКО НА СТРАНИЦЕ. Через дверь заводится описание, из
// которого рождается ТАБЛИЦА В БАЗЕ: проверку в браузере в браузере же и
// отключают, а таблица остаётся навсегда.
//
// 🔒 ТАБЛИЦА СОЗДАЁТСЯ В ТОЙ ЖЕ ОПЕРАЦИИ, ЧТО И ЗАПИСЬ РЕЕСТРА, И ЭТО НЕ
// УДОБСТВО. Признак, у которого описание есть, а таблицы нет, выглядит рабочим и
// молча теряет значения; человек узнаёт об этом по пустоте через неделю. Либо
// признак заведён целиком, либо не заведён.
//
// 🔒 ВСТРОЕННЫЙ ПРИЗНАК ДВЕРЬ ПРАВИТЬ ОТКАЗЫВАЕТСЯ — отказом, а не молчанием.
// Правка, которая никуда не доедет, хуже отсутствующей: человек уверен, что
// настроил.
// 🛑 `runtime` СНЯТ ЗДЕСЬ (137-3): несовместим с `cacheComponents` шаблона
// чата. В источнике строка стоит и верна ТАМ. Тот же запрет, что у `dynamic`
// ниже и у дверей `api/fractera/*` этого репозитория — измерено сборкой.
// 🛑 `dynamic` СНЯТ ЗДЕСЬ ПО ТОЙ ЖЕ ПРИЧИНЕ. Двери и так не кэшируются: они
// читают запрос. Сборка отвечала: «Route segment config "dynamic" is not
// compatible with nextConfig.cacheComponents».

const no = (error: string, status = 400) =>
  NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } })

export async function GET(req: NextRequest) {
  const denied = await requireRoles(req, ARCHITECT_LAYER_ROLES)
  if (denied) return denied
  const facts = await allFacts()
  return NextResponse.json({ ok: true, facts }, { headers: { "Cache-Control": "no-store" } })
}

// 🪦 ЗДЕСЬ БЫЛИ POST И PATCH — УДАЛЕНЫ 137-13 (слово владельца 2026-09-06).
// Реестр больше не правится из приложения: человек просит агента, агент строит
// и кладёт коммит, по которому правку можно откатить. Двери записи оставляли бы
// определениям ВТОРОГО хозяина, и две правды разошлись бы молча в первый же
// день, когда владелец воспользовался бы и формой, и ботом.
// 🔒 ЧТЕНИЕ (GET) ОСТАЁТСЯ: экран показывает реестр и обязан его получать.
// Прежние обработчики восстанавливаются из git.
