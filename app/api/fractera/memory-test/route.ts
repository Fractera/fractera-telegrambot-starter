// @api испытательный стенд памяти: позвать её метод и увидеть ответ целиком
import { NextResponse } from "next/server"
import { bench, benchGet } from "@/lib/architect/memory-service"
import { fracteraSession } from "@/lib/fractera/session"

// ДВЕРЬ СТЕНДА ПАМЯТИ (176-1).
//
// 🔒 ЗАЧЕМ ОНА ВООБЩЕ НУЖНА: ПАМЯТЬ СЛУШАЕТ ТОЛЬКО ПЕТЛЮ. Браузер до `:3700` не
// достаёт по построению, и секрет машины ему не отдают. Дверь — единственный
// законный способ дать человеку поговорить с памятью напрямую.
//
// 🔒 ЗАМОК — СЕССИЯ ЧЕЛОВЕКА, РОЛЬ `architect`, как у соседней `api/fractera/known`.
// Секрет машины сюда не годится: по ту сторону браузер, у которого его нет.
//
// 🔒 ОТВЕТ ПАМЯТИ ВОЗВРАЩАЕТСЯ ЦЕЛИКОМ — С КОДОМ, ТЕЛОМ И ВРЕМЕНЕМ. Стенд заведён
// ради вопроса «что память ответила НА САМОМ ДЕЛЕ»; дверь, приглаживающая отказ,
// отняла бы у него единственный смысл. ✗ разбор 2026-09-10 показал цену обратного:
// цепочку пришлось восстанавливать по журналу сессии, потому что видимого следа
// не осталось нигде.
//
// 🛑 `runtime` И `dynamic` НЕ ОБЪЯВЛЯЮТСЯ: `cacheComponents` их отвергает.

/**
 * 🔒 СЛУЖЕБНОЕ ИМЯ ЗАПИСИ ЗАВОДИТ СТЕНД САМ И НАРУЖУ НЕ ВЫНОСИТ.
 *
 * Решение владельца 2026-09-10, дословно: «какой ещё ключ?.. я никакие ключи не
 * даю… если что-то надо сделай свою». Поля на экране нет и не будет.
 *
 * 🛑 ИМЯ НАЧИНАЕТСЯ С `bench-`, И ЭТО НЕ КОСМЕТИКА, А ГРАНИЦА. По нему видно,
 * что строка родилась на стенде, а не в разговоре с человеком: стенд «не имеет
 * никакого отношения никаким живым записям ни к какому реальному агенту и потом
 * не будет иметь отношения» — его слова того же дня.
 */
const BENCH_WHO = "bench-1"

/** Методы, у которых первый параметр — это «чей факт». Стенд подставляет своё имя. */
const NEEDS_WHO = new Set(["remember", "recall"])

export async function GET(request: Request) {
  const session = await fracteraSession()
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!session.roles.includes("architect")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const what = new URL(request.url).searchParams.get("what") ?? "contract"

  // 🔒 ЧТО МОЖНО СПРОСИТЬ — ЗАКРЫТЫЙ СПИСОК, А НЕ СВОБОДНЫЙ ПУТЬ. Иначе адрес из
  // строки браузера уехал бы в путь запроса к службе, и дверь стала бы открытым
  // проводником куда угодно внутри неё.
  if (what === "contract") {
    return NextResponse.json(await benchGet("contract"), {
      headers: { "Cache-Control": "no-store" },
    })
  }
  if (what === "tables") {
    return NextResponse.json(await benchGet("tables"), {
      headers: { "Cache-Control": "no-store" },
    })
  }
  if (what === "table") {
    const name = new URL(request.url).searchParams.get("name") ?? ""
    // Имя проверяет и сама память (`isSafeName`), но пускать в путь непроверенное
    // значило бы полагаться на чужую проверку — она может смягчиться без нас.
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,80}$/.test(name)) {
      return NextResponse.json({ error: "bad-name", ok: false }, { status: 400 })
    }
    return NextResponse.json(await benchGet(`tables/${encodeURIComponent(name)}`), {
      headers: { "Cache-Control": "no-store" },
    })
  }

  return NextResponse.json({ error: "unknown-what", ok: false }, { status: 400 })
}

export async function POST(request: Request) {
  const session = await fracteraSession()
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!session.roles.includes("architect")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "bad-json", ok: false }, { status: 400 })
  }

  const method = typeof body.method === "string" ? body.method.trim() : ""
  // 🔒 ИМЯ МЕТОДА ПРОВЕРЯЕТСЯ ФОРМОЙ, А НЕ СПИСКОМ, И ЭТО ВЫБОР. Список здесь был
  // бы рукописной копией договора и разошёлся бы с ним на первом новом методе —
  // а стенд заведён в том числе для методов, которых ещё нет. Непостроенное
  // память отвергает сама, кодом `501`, и стенд обязан этот отказ ПОКАЗАТЬ.
  if (!/^[a-z][a-z0-9_-]{0,40}$/.test(method)) {
    return NextResponse.json({ error: "bad-method", ok: false }, { status: 400 })
  }

  const sent = (body.body ?? {}) as Record<string, unknown>
  // 🔒 СВОЁ ИМЯ ПОДСТАВЛЯЕТСЯ, НО НЕ ЗАТИРАЕТ УКАЗАННОЕ ЯВНО: в сыром режиме
  // человек вправе назвать любое, и стенд не спорит — он показывает, что вышло.
  const payload =
    NEEDS_WHO.has(method) && !("who" in sent) ? { ...sent, who: BENCH_WHO } : sent

  const answer = await bench(method, payload)
  return NextResponse.json(
    { ...answer, sent: { body: payload, method } },
    { headers: { "Cache-Control": "no-store" } }
  )
}
