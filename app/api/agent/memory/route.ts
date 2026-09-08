// @api чёрный ящик памяти: четыре метода за одной дверью
import { NextResponse } from "next/server"
import { MEMORY_FUNCTIONS, validateArgs } from "@/lib/memory/decl.mjs"
import { forget, mutate, read, write } from "@/lib/memory/box"
import { machineEnv } from "@/lib/fractera/machine-env"

// ДВЕРЬ ЯЩИКА ПАМЯТИ (161-1, стандарт памяти §10).
//
// 🔒 ОДНА ДВЕРЬ НА ЧЕТЫРЕ МЕТОДА, А НЕ ЧЕТЫРЕ ДВЕРИ — тот же довод, что у единого
// входа в реестры (157-5): четыре адреса это четыре места, где однажды разойдётся
// форма ответа и проверка права.
//
// 🔒 ЗАМОК — ОБЩИЙ СЕКРЕТ МАШИНЫ, как у соседних дверей агента. Свой ключ надо
// кому-то выдавать и когда-то менять: третье звено («учётные данные кем-то
// выдаются») тут же сделало бы дверь тупиком.
//
// 🔒 ПАРАМЕТРЫ ПРОВЕРЯЮТСЯ ОБЪЯВЛЕНИЕМ, тем же, из которого порождается схема
// инструмента агента. Проверка, написанная здесь, разошлась бы с ним на первой
// правке параметра.
//
// 🛑 `runtime` И `dynamic` НЕ ОБЪЯВЛЯЮТСЯ: в проекте включён `cacheComponents`,
// и сборка отвергает эти сегменты.

function secret(): string {
  return process.env.DATA_SECRET || machineEnv("DATA_SECRET") || ""
}

export async function POST(request: Request) {
  const expected = secret()
  if (!expected || (request.headers.get("x-data-secret") ?? "") !== expected) {
    return NextResponse.json({ ok: false, error: "no-access" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 })
  }

  const fn = typeof body.fn === "string" ? body.fn : ""
  const decl = MEMORY_FUNCTIONS.find(d => d.fn === fn || d.name === fn)
  if (!decl) {
    return NextResponse.json(
      { ok: false, error: "unknown-fn", got: fn, known: MEMORY_FUNCTIONS.map(d => d.fn) },
      { status: 400 }
    )
  }

  // 🔒 «ЕЩЁ НЕ ПОСТРОЕНО» И «ТАКОГО НЕ БЫВАЕТ» — РАЗНЫЕ ОТВЕТЫ, И РАЗНИЦА ВИДНА
  // ТОМУ, КТО ОТЛАЖИВАЕТ. Метод объявлен договором целиком, а строится подшагами;
  // ответ `unknown-fn` на объявленный метод отправил бы искать опечатку.
  if (decl.state !== "live") {
    return NextResponse.json(
      {
        ok: false,
        error: "not-built",
        fn: decl.fn,
        hint: `метод «${decl.title}» объявлен договором, но ещё не построен`,
      },
      { status: 501 }
    )
  }

  const checked = validateArgs(decl, body.args)
  if (!checked.ok) {
    return NextResponse.json(
      { ok: false, error: "bad-args", fn: decl.fn, problems: checked.problems },
      { status: 400 }
    )
  }
  const args = checked.args as Record<string, unknown>

  if (decl.fn === "write") {
    const result = await write({
      anchors: args.anchors as string[] | undefined,
      automationId:
        typeof args.automation_id === "number" && Number.isInteger(args.automation_id)
          ? args.automation_id
          : null,
      basis: args.basis as string | undefined,
      claim: args.claim as string | undefined,
      key: args.key as string | undefined,
      source: args.source as string | undefined,
      what: (args.what ?? "") as string | Record<string, unknown>,
    })
    return NextResponse.json({ ...result, fn: "write" }, { status: result.ok ? 200 : 400 })
  }

  if (decl.fn === "read") {
    const answer = await read({
      approved: args.approved === true,
      budget: args.budget as string | undefined,
      depth: args.depth as number | undefined,
      key: args.key as string | undefined,
      limit: args.limit as number | undefined,
      query: args.query as string | undefined,
      subject: args.subject as string | undefined,
    })
    // 🔒 ПРОМАХ — ЭТО `200` С `found: false`, А НЕ ОШИБКА. «Ничего не записано» —
    // законное состояние памяти, и код ошибки на него сказал бы неправду о службе.
    return NextResponse.json({ ok: true, fn: "read", answer })
  }

  if (decl.fn === "mutate") {
    const result = await mutate({
      key: String(args.key ?? ""),
      subject: args.subject as string | undefined,
      value: (args.value ?? "") as string | Record<string, unknown>,
      why: args.why as string | undefined,
    })
    return NextResponse.json({ ...result, fn: "mutate" }, { status: result.ok ? 200 : 400 })
  }

  if (decl.fn === "forget") {
    const result = await forget({
      anchors: Array.isArray(args.anchors) ? (args.anchors as string[]) : undefined,
      depth: typeof args.depth === "number" ? args.depth : undefined,
      id: typeof args.id === "number" ? args.id : undefined,
      key: String(args.key ?? ""),
      subject: args.subject as string | undefined,
    })
    return NextResponse.json({ ...result, fn: "forget" }, { status: result.ok ? 200 : 400 })
  }

  // Сюда попасть нельзя: `live` без обработчика не бывает — список закрыт
  // объявлением, и каждый новый метод приходит вместе со своей веткой.
  return NextResponse.json({ ok: false, error: "no-handler", fn: decl.fn }, { status: 500 })
}

export async function GET() {
  // 🔒 ЧТО УМЕЕТ ЯЩИК — ЧЕСТНЫЙ ОТВЕТ НА GET, И ОН ЖЕ ПРИБОР. Список методов с
  // их состоянием отвечает на вопрос «построено ли», не требуя ключа: имён
  // достаточно, значений он не отдаёт.
  return NextResponse.json({
    ok: true,
    door: "agent/memory",
    methods: MEMORY_FUNCTIONS.map(d => ({ fn: d.fn, name: d.name, state: d.state, title: d.title })),
  })
}
