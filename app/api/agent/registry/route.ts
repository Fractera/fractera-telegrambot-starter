// @api единый вход в реестры: четыре примитива за одной дверью
import { NextResponse } from "next/server"
import { ACCESS_FUNCTIONS, validateArgs } from "@/lib/registry/access-decl.mjs"
import { describe, find, isCorpus, list, recall } from "@/lib/registry/access"
import { machineEnv } from "@/lib/fractera/machine-env"

// ДВЕРЬ ЕДИНОГО ВХОДА (157-5, паспорт §3о).
//
// 🔒 ОДНА ДВЕРЬ НА ЧЕТЫРЕ ПРИМИТИВА, А НЕ ЧЕТЫРЕ ДВЕРИ. Четыре адреса — четыре
// места, где однажды разойдётся форма ответа и проверка права. Имя примитива
// приходит полем, и список имён закрыт объявлением.
//
// 🔒 ЗАМОК — ОБЩИЙ СЕКРЕТ МАШИНЫ, тот же, что у соседних дверей агента. Ключ,
// заведённый ради одной двери, надо кому-то выдавать и когда-то менять; третье
// звено («учётные данные кем-то выдаются») тут же стало бы тупиком.
//
// 🔒 ПАРАМЕТРЫ ПРОВЕРЯЮТСЯ ОБЪЯВЛЕНИЕМ, А НЕ ЗДЕСЬ. `validateArgs` читает тот же
// список, из которого порождается схема инструмента агента: проверка, написанная
// рядом с объявлением, разошлась бы с ним на первой правке параметра.
//
// 🛑 `runtime` И `dynamic` НЕ ОБЪЯВЛЯЮТСЯ: в проекте включён `cacheComponents`,
// и сборка отвергает эти сегменты. Дверь читает заголовки — значит и так
// исполняется на узле.

function secret(): string {
  return process.env.DATA_SECRET || machineEnv("DATA_SECRET") || ""
}

export async function POST(request: Request) {
  const expected = secret()
  const given = request.headers.get("x-data-secret") ?? ""
  // Отказ без ключа — раньше чтения тела: разбирать присланное до проверки права
  // значит работать на того, кто права не имеет.
  if (!expected || given !== expected) {
    return NextResponse.json({ ok: false, error: "no-access" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 })
  }

  const fn = typeof body.fn === "string" ? body.fn : ""
  const decl = ACCESS_FUNCTIONS.find(d => d.fn === fn || d.name === fn)
  if (!decl) {
    // 🔒 ЧУЖОЕ ИМЯ — ОТКАЗ С ПЕРЕЧИСЛЕНИЕМ, А НЕ ПУСТОЙ ОТВЕТ. Опечатка в имени
    // примитива иначе неотличима от «ничего не нашлось».
    return NextResponse.json(
      { ok: false, error: "unknown-fn", got: fn, known: ACCESS_FUNCTIONS.map(d => d.fn) },
      { status: 400 }
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

  // Корпус проверяется отдельно: объявление знает, что это строка, и не знает,
  // какая именно. Закрытый список живёт рядом с примитивами.
  if (decl.fn !== "recall" && !isCorpus(args.corpus)) {
    return NextResponse.json(
      { ok: false, error: "unknown-corpus", got: args.corpus, known: ["facts", "tools"] },
      { status: 400 }
    )
  }

  if (decl.fn === "list") {
    const answer = list(args.corpus as "facts" | "tools", {
      tags: args.tags as string[] | undefined,
      limit: args.limit as number | undefined,
    })
    return NextResponse.json({ ok: true, fn: "list", answer })
  }
  if (decl.fn === "find") {
    const answer = find(args.corpus as "facts" | "tools", String(args.query ?? ""), {
      limit: args.limit as number | undefined,
    })
    return NextResponse.json({ ok: true, fn: "find", answer })
  }
  if (decl.fn === "describe") {
    const answer = describe(args.corpus as "facts" | "tools", String(args.key ?? ""))
    return NextResponse.json({ ok: true, fn: "describe", answer })
  }
  const answer = await recall(String(args.key ?? ""), {
    subject: args.subject as string | undefined,
    scope: args.scope as string | undefined,
    limit: args.limit as number | undefined,
  })
  return NextResponse.json({ ok: true, fn: "recall", answer })
}

export async function GET() {
  // 🔒 ЧИТАТЬ ЗДЕСЬ НЕЧЕГО, И ДВЕРЬ ГОВОРИТ ЭТО ЯВНО: `405` честнее, чем
  // страница с пустым телом, которую примут за поломку.
  return NextResponse.json({ ok: false, error: "post-only" }, { status: 405 })
}
