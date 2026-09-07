// @api закрытие автоматизации: агент объявляет род закрытия, служба решает и записывает
import { NextResponse } from "next/server"
import { decideClosing, type RunFacts } from "@/lib/automations/closing"
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

  const run: RunFacts = {
    automationId: id,
    messages: Number(body.messages ?? 1),
    factKeys: toStrings(body.fact_keys),
    tools: toStrings(body.tools),
    fromMedia: body.from_media === true,
    hasNextStep: body.has_next_step === true,
    publicContract: row.publicContract,
    // 🔒 «УЖЕ СПРАШИВАЛИ» БЕРЁТСЯ ИЗ ЗАПИСИ, А НЕ ИЗ СЛОВ АГЕНТА: агент забудет,
    // строка — нет. Так второй отзыв за тот же номер не запрашивается даже после
    // перезапуска сессии.
    feedbackAsked: row.liked !== null || row.needsWork !== null,
    missingFacts: toStrings(body.missing_facts),
  }

  const decisions = decideClosing(run, kind)
  const written = await closeAutomation(id, kind, `закрытие: ${kind}`)

  const summary = typeof body.summary === "string" ? body.summary.trim() : ""
  const tags = toStrings(body.fact_keys)
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
