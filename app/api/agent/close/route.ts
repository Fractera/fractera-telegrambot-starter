// @api закрытие автоматизации: агент объявляет род закрытия, служба решает и записывает
import { NextResponse } from "next/server"
import { decideClosing, type RunFacts } from "@/lib/automations/closing"
import { planNextStep, type NextStepResult } from "@/lib/automations/chain"
import { proposeFacts, type FactProposal } from "@/lib/automations/fact-proposal"
import { ensureAutomationRowsTable } from "@/lib/automations/rows"
import { runFactsFromRows } from "@/lib/automations/run-facts"
import { ensureAutomationsTable, closeAutomation, readAutomationRow, setAutomationFields } from "@/lib/automations/store"
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

  // 🔒 ЛЕСТНИЦА КОЛОНОК ПОДНИМАЕТСЯ ПЕРЕД ЧТЕНИЕМ, А НЕ ТОЛЬКО ПРИ СОЗДАНИИ.
  // ✗ НАЙДЕНО ПРИБОРОМ 2026-09-08, И ЭТО БЫЛ НАСТОЯЩИЙ ДЕФЕКТ, А НЕ ОШИБКА
  // ПРИБОРА: 143-6 добавил колонку `feedback_note` в образец, читаем мы
  // ПОИМЁННО — и `SELECT ... feedback_note` на живой таблице, где колонки ещё
  // нет, падает целиком. Наружу это выглядело как `404 not-found`: будто
  // автоматизации не существует. Лестницу звала только дверь сепарации.
  // 🔒 ЗАКОН ОБЩИЙ: «КОЛОНКА — НЕ ТАБЛИЦА». `CREATE TABLE IF NOT EXISTS` на
  // существующей таблице не делает НИЧЕГО, и новая колонка не приезжает туда
  // никогда — пока кто-нибудь не исполнит `ALTER`.
  await ensureAutomationsTable()
  // 🔒 И ТАБЛИЦУ ЛЕНТЫ ТОЖЕ: эта дверь её ЧИТАЕТ, а создаёт её сегодня только
  // сепарация. Закрытие автоматизации, заведённой до 143-3, иначе читало бы
  // отсутствующую таблицу — и получило бы «ничего не случилось» вместо отказа.
  await ensureAutomationRowsTable()

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
    // 🔒 НАЗВАННАЯ СТУПЕНЬ САМА ЕСТЬ ЕЁ ОБЪЯВЛЕНИЕ — И ЭТО ПРАВКА ПО ЗАМЕРУ.
    // ✗ НАЙДЕНО ПРИБОРОМ 2026-09-08: агент присылал `next_what` и `next_due_at`,
    // а флага `has_next_step` не ставил — и не происходило НИЧЕГО, молча.
    // Требовать объявления отдельным полем при уже присланном сроке значит
    // завести ловушку, в которую попадёт каждый, кто не прочитал схему целиком.
    // 🔒 ФЛАГ ОСТАЁТСЯ ЗАКОННЫМ ПУТЁМ: он говорит «ступень будет, но срок ещё
    // не назван» — и тогда отказ объяснит, чего не хватает.
    hasNextStep:
      body.has_next_step === true ||
      (typeof body.next_what === "string" && body.next_what.trim().length > 0 &&
        typeof body.next_due_at === "string" && body.next_due_at.trim().length > 0),
  })

  const decisions = decideClosing(run, kind)
  const written = await closeAutomation(id, kind, `закрытие: ${kind}`)

  // ── ИСПОЛНЕНИЕ ПЕРВОГО ИЗ ПЯТИ ДЕЙСТВИЙ: СЛЕДУЮЩАЯ СТУПЕНЬ (143-5) ────────
  //
  // 🔒 ПОРЯДОК ЗАКОНА 2 §3е СОБЛЮДЁН БУКВАЛЬНО: состояние записано СТРОКОЙ ВЫШЕ,
  // и только теперь делаются побочные действия. Обрыв на середине оставил бы
  // автоматизацию открытой при уже заведённой ступени — и на следующем сообщении
  // её закрыли бы второй раз, поставив вторую.
  //
  // 🔒 ДЕЙСТВИЕ ДЕЛАЕТСЯ ТОЛЬКО ПО СВОЕМУ РЕШЕНИЮ. Решения считаются из ленты
  // (143-4); «ступень» приходит с do: true лишь при закрытии ШАГА. Пять действий
  // на каждом закрытии — назойливость, от которой способность умирает.
  let nextStep: NextStepResult | null = null
  if (decisions.some(d => d.action === "next-step" && d.do)) {
    // 🔒 СРОК И СУТЬ СТУПЕНИ ПРИХОДЯТ СО СЛОВ — И ЭТО НЕ ПРОТИВОРЕЧИТ 143-4.
    // Записи о том, чего человек ХОЧЕТ дальше, нет и быть не может: он только
    // что это сказал. Из ленты берут то, что УЖЕ случилось, а не то, что просят.
    nextStep = await planNextStep({
      automationId: id,
      what: typeof body.next_what === "string" ? body.next_what : "",
      dueAt: typeof body.next_due_at === "string" ? body.next_due_at : "",
      tz: typeof body.next_tz === "string" ? body.next_tz : "",
    })
  }

  // ── ПЯТОЕ ДЕЙСТВИЕ: ПРЕДЛОЖЕНИЕ ПРИЗНАКА (143-7) ─────────────────────────
  //
  // 🔒 ПРЕДЛАГАЕТ, НО НЕ ПРИМЕНЯЕТ. Возвращается агенту, чтобы он показал это
  // человеку словами; реестр меняет ЧЕЛОВЕК. Признак, заведённый системой
  // самой, меняет то, что она понимает, — и завтра она разберёт сообщение
  // иначе, а объяснить это будет некому.
  let proposals: FactProposal[] = []
  if (decisions.some(d => d.action === "propose-fact" && d.do)) {
    proposals = await proposeFacts(id)
  }

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

  // 🔒 ИСХОД ПОБОЧНОГО ДЕЙСТВИЯ НАЗЫВАЕТСЯ В ОТВЕТЕ, А НЕ МОЛЧИТ (158-5): агент
  // обязан знать, заведена ступень или нет, — иначе он пообещает человеку
  // напоминание, которого не существует.
  return NextResponse.json({ ok: true, state: written.state, wrote: written.written, decisions, nextStep, proposals })
}

function toStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(x => typeof x === "string" && x).map(String) : []
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "post-only" }, { status: 405 })
}
