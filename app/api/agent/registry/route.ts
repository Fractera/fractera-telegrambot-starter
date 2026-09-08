// @api единый вход в реестры: пять примитивов за одной дверью
import { NextResponse } from "next/server"
import { ACCESS_FUNCTIONS, validateArgs } from "@/lib/registry/access-decl.mjs"
import { describe, find, isCorpus, list, recall, recallSubject, rememberMiss } from "@/lib/registry/access"
import { allFacts } from "@/lib/facts/registry"
import { writeFact } from "@/lib/facts/write"
import { machineEnv } from "@/lib/fractera/machine-env"

// ДВЕРЬ ЕДИНОГО ВХОДА (157-5, паспорт §3о).
//
// 🔒 ОДНА ДВЕРЬ НА ПЯТЬ ПРИМИТИВОВ, А НЕ ПЯТЬ ДВЕРЕЙ. Пять адресов — пять
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
  if (decl.fn !== "recall" && decl.fn !== "remember" && !isCorpus(args.corpus)) {
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
    // 🔒 ПЕТЛЯ ОБУЧЕНИЯ ЗАМЫКАЕТСЯ ЗДЕСЬ, И ЗАПИСЬ ДОЖИДАЕТСЯ. ✗ оплачено
    // измерением 2026-09-07: запись, пущенная из чистой функции через `void`,
    // не доехала НИ РАЗУ — обещание умирает вместе с ответом, а в ответе при
    // этом честно печаталось «промах записан». Обещание в тексте и строка в
    // таблице — разные утверждения.
    if (answer.found === false && answer.searched.length > 0) {
      await rememberMiss(
        args.corpus as "facts" | "tools",
        String(args.query ?? ""),
        answer.searched
      )
    }
    return NextResponse.json({ ok: true, fn: "find", answer })
  }
  if (decl.fn === "describe") {
    const answer = describe(args.corpus as "facts" | "tools", String(args.key ?? ""))
    return NextResponse.json({ ok: true, fn: "describe", answer })
  }
  if (decl.fn === "remember_many") {
    // 🔒 КАЖДЫЙ ФАКТ ПРОВЕРЯЕТСЯ ОТДЕЛЬНО, И ОТКАЗ ПО ОДНОМУ НЕ ОТМЕНЯЕТ ОСТАЛЬНЫЕ.
    // Человек рассказал о себе тремя фразами; если одна не легла — потерять две
    // другие значило бы наказать его за то, что он сказал лишнее.
    // 🛑 И ОБРАТНОЕ ТОЖЕ ЗАПРЕЩЕНО: молча проглотить неудачную запись. В ответе
    // перечислено, что записано и что нет, с причиной по каждой.
    const raw = Array.isArray(args.facts) ? (args.facts as unknown[]) : []
    if (raw.length === 0) {
      return NextResponse.json(
        { ok: false, fn: "remember_many", error: "no-facts", hint: "список пуст: нечего записывать" },
        { status: 400 }
      )
    }
    const results: {
      key: string
      ok: boolean
      table?: string
      error?: string
      hint?: string
    }[] = []
    for (const item of raw) {
      const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
      const key = String(rec.key ?? "").trim().toLowerCase()
      // 🛑 ГРАНИЦУ СТЕРЕЖЁТ ДВЕРЬ, А НЕ ОБЪЯВЛЕНИЕ (158-5а) — та же проверка, что у
      // одиночного `remember`: пишем только то, что человек говорит О СЕБЕ.
      const fact = allFacts().find(f => f.key === key)
      if (!fact || fact.subject !== "self") {
        results.push({
          key,
          ok: false,
          error: "not-a-person-fact",
          hint: "запоминать можно только факты о человеке; ключ берут из registry_find",
        })
        continue
      }
      const written = await writeFact({
        key,
        value: (rec.value ?? "") as string | Record<string, unknown>,
        subject: "self",
        source: String(args.source ?? "сказано человеком в переписке"),
        automationId:
          typeof args.automation_id === "number" && Number.isInteger(args.automation_id)
            ? args.automation_id
            : null,
      })
      results.push(
        written.ok
          ? { key, ok: true, table: written.table }
          : { key, ok: false, error: written.error, hint: written.hint }
      )
    }
    const saved = results.filter(r => r.ok).length
    return NextResponse.json(
      { ok: saved > 0, fn: "remember_many", saved, total: results.length, results },
      { status: saved > 0 ? 200 : 400 }
    )
  }

  if (decl.fn === "remember") {
    // 🛑 ГРАНИЦУ СТЕРЕЖЁТ ДВЕРЬ, А НЕ ОБЪЯВЛЕНИЕ (158-5а). Ключ приходит от
    // модели; без этой проверки пятый примитив стал бы способом дописать что
    // угодно в любую таблицу признаков. Пишем только то, что человек говорит
    // О СЕБЕ, — у таких признаков объявлен `subject: self`.
    const key = String(args.key ?? "").trim().toLowerCase()
    const fact = allFacts().find(f => f.key === key)
    if (!fact || fact.subject !== "self") {
      return NextResponse.json(
        {
          ok: false,
          error: "not-a-person-fact",
          got: key,
          hint: "запоминать можно только факты о человеке; ключ берут из registry_find",
        },
        { status: 400 }
      )
    }
    const written = await writeFact({
      key,
      value: String(args.value ?? ""),
      subject: "self",
      source: String(args.source ?? "сказано человеком в переписке"),
      // 🔒 УКАЗАТЕЛЬ ПОЛУЧАЕТ ПИСАТЕЛЯ ЗДЕСЬ (145). Номер приходит от агента, и
      // он необязателен: без него `indexFact` честно пропускает запись — факт о
      // человеке живёт вне автоматизаций. С номером видно, В ХОДЕ ЧЕГО узнали.
      automationId:
        typeof args.automation_id === "number" && Number.isInteger(args.automation_id)
          ? args.automation_id
          : null,
    })
    return NextResponse.json(
      written.ok
        ? { ok: true, fn: "remember", key, table: written.table }
        : { ok: false, fn: "remember", error: written.error, hint: written.hint },
      { status: written.ok ? 200 : 503 }
    )
  }
  // 🔒 СУБЪЕКТ БЕЗ КЛЮЧА — ЭТО ВОПРОС «ЧТО ИЗВЕСТНО О ЧЕЛОВЕКЕ», И ОН ОДИН.
  // ✗ оплачено 2026-09-08: агент отвечал на него тринадцатью вызовами — сервер
  // тратил 595 мс, а модель тринадцать ходов рассуждения. Дорого стоила форма
  // примитива, а не данные.
  const askedKey = String(args.key ?? "").trim()
  const askedSubject = String(args.subject ?? "").trim()
  if (!askedKey && askedSubject) {
    const answer = await recallSubject(askedSubject, {
      limit: args.limit as number | undefined,
    })
    return NextResponse.json({ ok: true, fn: "recall", answer })
  }
  if (!askedKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "bad-args",
        fn: "recall",
        problems: ["нужен либо `key` (один признак), либо `subject` (всё о человеке)"],
      },
      { status: 400 }
    )
  }
  const answer = await recall(askedKey, {
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
