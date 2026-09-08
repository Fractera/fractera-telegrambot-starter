// @api закрытие автоматизации: агент объявляет род закрытия, служба решает и записывает
import { NextResponse } from "next/server"
import { decideClosing, type RunFacts } from "@/lib/automations/closing"
import { runFactsFromRows } from "@/lib/automations/run-facts"
import { closeAutomation, readAutomationRow, setAutomationFields } from "@/lib/automations/store"
import { machineEnv } from "@/lib/fractera/machine-env"

// ДВЕРЬ ЗАКРЫТИЯ (155-6).
//
// 🔒 ЗАКРЫТИЕ ОБЪЯВЛЯЕТСЯ ЯВНО, А НЕ НАСТУПАЕТ (§3е). «Человек перестал писать» —
// это отсутствие сообщений, а не решение; на нём нельзя строить ни отзыв, ни
// следующую ступень. Поэтому закрыть может только этот вызов, и род обязателен.
//
// 🔒 СНАЧАЛА СОСТОЯНИЕ, ПОТОМ ПОБОЧНЫЕ ДЕЙСТВИЯ. Обрыв на середине иначе
// оставляет автоматизацию открытой при уже отправленном отзыве — и на следующем
// сообщении её закроют второй раз.
//
// 🔒 РЕШЕНИЯ ВОЗВРАЩАЮТСЯ СПИСКОМ С ПРИЧИНАМИ, ВКЛЮЧАЯ «НЕ ДЕЛАТЬ». Пустой ответ
// читается как «ничего не случилось»; список показывает, что система подумала и
// отказалась — и агент скажет это человеку.

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

  const id = Number(body.automation_id)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "no-automation-id" }, { status: 400 })
  }
  const kind = body.kind === "step" ? "step" : body.kind === "whole" ? "whole" : null
  if (!kind) {
    // 🔒 РОД ЗАКРЫТИЯ НЕ ИМЕЕТ УМОЛЧАНИЯ. Шаг, закрытый как автоматизация,
    // оборвёт цепочку; автоматизация, закрытая как шаг, никогда не спросит отзыв.
    return NextResponse.json({ ok: false, error: "no-closing-kind" }, { status: 400 })
  }

  const row = await readAutomationRow(id)
  if (!row) {
    return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 })
  }

  // ── ФАКТЫ ПРОГОНА БЕРУТСЯ ИЗ ЛЕНТЫ, А НЕ ИЗ ТЕЛА ЗАПРОСА (143-4) ──────────
  //
  // 🔒 ЗАКОН §3е ДОСЛОВНО: условия закрытия считаются ИЗ ФАКТОВ ПРОГОНА, а не из
  // впечатления модели. До 143-4 здесь стояло чтение `body.messages`,
  // `body.fact_keys`, `body.tools`, `body.from_media`, `body.missing_facts` —
  // то есть система верила агенту на слово о его собственной работе.
  // ✗ ЧЕМ ЭТО ПЛОХО КОНКРЕТНО: модель, пересказывающая себя, ошибается В СВОЮ
  // ПОЛЬЗУ. «Звал инструменты» звучит лучше, чем «ничего не сделал», — и отзыв
  // просили бы у человека после пустого разговора.
  //
  // 🔒 СО СЛОВ АГЕНТА ОСТАЁТСЯ РОВНО ТО, ЧЕМУ НЕТ СЛЕДА В ЗАПИСЯХ: род закрытия
  // (решение, а не факт), саммари (текст для человека) и срок следующей ступени
  // (его называет человек). Остальное имеет след в ленте — спрашивать об этом
  // свидетеля значит не читать протокол.
  //
  // 🔒 ТРИ ЗНАЧЕНИЯ ПРИХОДЯТ ИЗ ЗАПИСИ АВТОМАТИЗАЦИИ, А НЕ ИЗ ЛЕНТЫ: публичный
  // договор и «уже спрашивали» живут в её колонках; наличие следующей ступени —
  // свойство цепочки, и до шага 150 (§3л) его называет вызывающий.
  const run: RunFacts = await runFactsFromRows(id, {
    publicContract: row.publicContract,
    // 🔒 «УЖЕ СПРАШИВАЛИ» БЕРЁТСЯ ИЗ ЗАПИСИ, А НЕ ИЗ СЛОВ АГЕНТА: агент забудет,
    // строка — нет. Так второй отзыв за тот же номер не запрашивается даже после
    // перезапуска сессии.
    feedbackAsked: row.liked !== null || row.needsWork !== null,
    hasNextStep: body.has_next_step === true,
  })

  const decisions = decideClosing(run, kind)
  const written = await closeAutomation(id, kind, `закрытие: ${kind}`)

  const summary = typeof body.summary === "string" ? body.summary.trim() : ""
  // 🔒 ТЕГИ — ТОЖЕ ФАКТ ПРОГОНА, А НЕ СЛОВО АГЕНТА (143-4). Раньше они брались
  // из `body.fact_keys` рядом с саммари, и это было незаметное второе место, где
  // модель рассказывала о себе. Теперь — те же ключи, что попали в ленту.
  const tags = run.factKeys
  if (summary || tags.length > 0) {
    // 🔒 САММАРИ И ТЕГИ ПИШУТСЯ ЗАПЛАТОЙ: вердикты и договор принадлежат другим
    // писателям, и снимок затёр бы их.
    await setAutomationFields(id, {
      ...(summary ? { summary } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    })
  }

  return NextResponse.json({ ok: true, state: written.state, wrote: written.written, decisions })
}

function toStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(x => typeof x === "string" && x).map(String) : []
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "post-only" }, { status: 405 })
}
