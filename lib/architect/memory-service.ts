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
// 🛑 КЛЮЧ ЧЕЛОВЕКА СПРАШИВАЕТСЯ У САМОЙ ПАМЯТИ, А НЕ ВЫВОДИТСЯ.
// ✗ ОПЛАЧЕНО ЖИВЬЁМ 2026-09-09: первая редакция брала его из настроек канала
// (`readChannels().telegram.chatId`) — и получала `null` ВСЕГДА. Путь к агенту
// идёт через плагин Anthropic, мимо службы :3500, и ключ живёт только в теге
// сообщения Telegram. Экран показал «отказ» на живой и работающей памяти.
// 🔒 ПРАВИЛО ШИРЕ СЛУЧАЯ: спрашивай о факте ТОГО, КТО ИМ ВЛАДЕЕТ. Ключ человека
// принадлежит памяти — она одна знает, о ком у неё записи.

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

/** Общий вызов метода памяти. Тело читаем целиком: служба отвечает 200 и с ok:false. */
async function call(method: string, body: unknown): Promise<Record<string, unknown> | null> {
  const key = secret()
  if (!key) return null
  try {
    const res = await fetch(`${MEMORY}/v1/${method}`, {
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
      headers: { "Content-Type": "application/json", "x-data-secret": key },
      method: "POST",
    })
    const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return parsed && parsed.ok === true ? parsed : null
  } catch {
    return null
  }
}

// ── СТЕНД (176-1): ТО ЖЕ САМОЕ, НО БЕЗ ПРИГЛАЖИВАНИЯ ─────────────────────────
//
// 🔒 ЗДЕСЬ ОТВЕТ ВОЗВРАЩАЕТСЯ ЦЕЛИКОМ, ВКЛЮЧАЯ `ok:false`, И ЭТО НЕ ДУБЛЬ
// `call()`, А ДРУГОЙ ДОГОВОР. `call()` служит ЭКРАНУ: ему нужен готовый ответ
// или ничего. Стенду нужно ровно обратное — увидеть, как память отвечает НА
// САМОМ ДЕЛЕ, отказ включительно. Свести их в одну функцию значило бы отнять у
// стенда его единственный смысл.
// 🛑 И КОД HTTP ЧИТАЕТСЯ ТОЖЕ: память отвечает `200` с `ok:false`, а `501` — на
// непостроенный метод. Стенд обязан показывать разницу, а не сливать её в «нет».

export type BenchAnswer = {
  /** Код HTTP службы; `0`, если до неё не дошли вовсе. */
  status: number
  /** Тело ответа как есть. `null`, когда пришло не-JSON. */
  body: unknown
  /** Сколько заняло, в миллисекундах: разбор фразы идёт 6–10 секунд. */
  ms: number
  /** Почему ответа нет вовсе — словами. Пусто, когда служба ответила хоть чем-то. */
  trouble: string | null
}

/** Позвать метод памяти и вернуть ВСЁ, что она сказала. */
export async function bench(method: string, body: unknown): Promise<BenchAnswer> {
  const key = secret()
  const started = Date.now()
  if (!key) {
    return { body: null, ms: 0, status: 0, trouble: "нет ключа машины (DATA_SECRET)" }
  }
  try {
    const res = await fetch(`${MEMORY}/v1/${method}`, {
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
      headers: { "Content-Type": "application/json", "x-data-secret": key },
      method: "POST",
    })
    const text = await res.text()
    let parsed: unknown = null
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { raw: text.slice(0, 2000) }
    }
    return { body: parsed, ms: Date.now() - started, status: res.status, trouble: null }
  } catch (e) {
    return {
      body: null,
      ms: Date.now() - started,
      status: 0,
      trouble: `служба памяти недоступна: ${String((e as Error).message)}`,
    }
  }
}

/** Тот же приём для чтения: договор и каталог таблиц живут на GET. */
export async function benchGet(path: string): Promise<BenchAnswer> {
  const key = secret()
  const started = Date.now()
  if (!key) {
    return { body: null, ms: 0, status: 0, trouble: "нет ключа машины (DATA_SECRET)" }
  }
  try {
    const res = await fetch(`${MEMORY}/v1/${path}`, {
      cache: "no-store",
      headers: { "x-data-secret": key },
    })
    const text = await res.text()
    let parsed: unknown = null
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { raw: text.slice(0, 2000) }
    }
    return { body: parsed, ms: Date.now() - started, status: res.status, trouble: null }
  } catch (e) {
    return {
      body: null,
      ms: Date.now() - started,
      status: 0,
      trouble: `служба памяти недоступна: ${String((e as Error).message)}`,
    }
  }
}

/**
 * Чей это человек — спрашиваем у памяти.
 *
 * 🔒 ОДИН ЧЕЛОВЕК — ПОКАЗЫВАЕМ ЕГО. Несколько — берём первого и это допущение,
 * которое однажды окажется ложным; когда окажется, экран получит выбор, а не
 * молчаливую подмену.
 */
export async function personKey(): Promise<string | null> {
  const answer = await call("people", {})
  const list = Array.isArray(answer?.people) ? (answer!.people as { who: string }[]) : []
  return list.length ? String(list[0].who) : null
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
    // 🔒 «ПАМЯТЬ ПУСТА» И «ПАМЯТЬ НЕ ОТВЕТИЛА» — РАЗНЫЕ СОСТОЯНИЯ. Первое честно
    // говорит «пока никто ничего не рассказывал», второе — отказ.
    const alive = await fetch(`${MEMORY}/v1/health`, { cache: "no-store" }).then(
      (r) => r.ok,
      () => false,
    )
    return alive
      ? { ...EMPTY, ok: true, trouble: null }
      : { ...EMPTY, trouble: "служба памяти не отвечает" }
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
