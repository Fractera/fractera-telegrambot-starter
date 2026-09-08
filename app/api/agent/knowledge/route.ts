// @api знание второго порядка уходит в граф — обязательно с якорем
import { NextResponse } from "next/server"
import { allFacts } from "@/lib/facts/registry"
import { learn } from "@/lib/fractera/knowledge"
import { machineEnv } from "@/lib/fractera/machine-env"
import { recall } from "@/lib/registry/access"

// ДВЕРЬ ЗНАНИЙ (160-6, 2026-09-08).
//
// 🔒 ЗАЧЕМ ОНА ЕСТЬ: ЭТО АДРЕС, КУДА УХОДИТ ВТОРОЙ ПОРЯДОК. Стандарт памяти
// (§2.3) запрещает писать в личную таблицу факты о чужих сущностях: «Денис
// служил в президентском полку» — не атрибут человека, а история его друга.
// Отбрасывать её нельзя, и держать в таблице нельзя; её дом — граф.
//
// ✗ ЧЕМ ОПЛАЧЕНА ЭТА ДВЕРЬ. Измерено 2026-09-08: `learn()` существовала и **не
// звалась ниоткуда** — четвёртый случай «способность построена и не подключена»
// за два дня. Восемь документов в графе положил прежний путь со слота, до
// переезда службы; новый путь не писал туда ничего.
//
// 🔒 ЯКОРЬ ОБЯЗАТЕЛЕН, И ЭТО ГЛАВНОЕ, ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ. Запись без имени
// сущности первого уровня не найдётся никогда: вопрос приходит от корня, а связи
// с корнем у неё нет.
// 🛑 И ЯКОРЬ СВЕРЯЕТСЯ С ТЕМ, ЧТО СИСТЕМА ЗНАЕТ. Имя, которого нет ни в одной
// записи о человеке, — скорее всего опечатка или выдумка модели; мост, собранный
// из такого имени, не сойдётся, а обнаружится это через месяц пустым ответом.

function secret(): string {
  return process.env.DATA_SECRET || machineEnv("DATA_SECRET") || ""
}

function toStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(x => typeof x === "string" && x.trim()).map(x => String(x).trim()) : []
}

/**
 * Знает ли система это имя.
 *
 * 🔒 СМОТРИМ В ЗНАЧЕНИЯ ПРИЗНАКОВ О ЧЕЛОВЕКЕ: окружение, проекты, важные люди.
 * Совпадение ищется вхождением, а не равенством: в таблице лежит «Денис — друг»
 * или объект `{name: "Денис"}`, а якорь приходит именем.
 */
async function anchorIsKnown(anchor: string): Promise<boolean> {
  const needle = anchor.toLowerCase()
  const keys = allFacts()
    .filter(f => f.subject === "self")
    .map(f => f.key)
  for (const key of keys) {
    const got = await recall(key, { subject: "self", limit: 20 })
    if (got.found !== true) continue
    for (const item of got.items) {
      if (String(item.value ?? "").toLowerCase().includes(needle)) return true
    }
  }
  return false
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

  const text = typeof body.text === "string" ? body.text.trim() : ""
  const anchors = toStrings(body.anchors)

  if (!text) {
    return NextResponse.json(
      { ok: false, error: "empty-text", hint: "нечего запоминать" },
      { status: 400 }
    )
  }
  if (anchors.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "no-anchor",
        hint:
          "назови, к кому или к чему это относится — имя из личной таблицы. " +
          "Без якоря запись не найдётся ни одним вопросом",
      },
      { status: 400 }
    )
  }

  // 🔒 НЕИЗВЕСТНЫЙ ЯКОРЬ — ПРЕДУПРЕЖДЕНИЕ, А НЕ ОТКАЗ, И ЭТО ВЫБОР.
  // Человек мог рассказать про Дениса до того, как Денис попал в таблицу;
  // отказать значило бы потерять историю из-за порядка слов. Но промолчать
  // тоже нельзя: мост, собранный из имени, которого система не знает, не
  // сойдётся, и обнаружится это пустым ответом через месяц.
  const unknown: string[] = []
  for (const a of anchors) {
    if (!(await anchorIsKnown(a))) unknown.push(a)
  }

  const source =
    typeof body.source === "string" && body.source.trim()
      ? body.source.trim()
      : `knowledge/${anchors[0]}-${Date.now()}`

  const done = await learn({
    text,
    anchors,
    source,
    origin: typeof body.origin === "string" ? body.origin : undefined,
  })

  if (!done.accepted) {
    return NextResponse.json(
      { ok: false, error: done.refused ?? "refused", hint: "граф знаний не принял документ" },
      { status: 503 }
    )
  }

  return NextResponse.json({
    ok: true,
    anchors,
    source,
    // 🔒 НАЗЫВАЕТСЯ ВСЛУХ: граф строится в фоне, и вопрос, заданный сразу, может
    // документа ещё не увидеть. Молчание об этом читается как «уже доступно».
    hint:
      unknown.length > 0
        ? `записано; но этих имён система не знает: ${unknown.join(", ")} — проверь, те ли это имена, что в памяти о человеке`
        : "записано; граф строится в фоне, вопрос сразу после записи может его не увидеть",
    unknownAnchors: unknown,
  })
}

export async function GET() {
  return NextResponse.json({ ok: true, door: "agent/knowledge", requires: ["text", "anchors"] })
}
