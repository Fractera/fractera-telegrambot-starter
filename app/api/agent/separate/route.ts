// @api первичная сепарация: агент называет род сообщения, служба его записывает
import { NextResponse } from "next/server"
import { createAutomation, ensureAutomationsTable, listAutomationRows, setState } from "@/lib/automations/store"
import { machineEnv } from "@/lib/fractera/machine-env"
import { categoryLine, isMessageKind, opensAutomation } from "@/lib/task/separation"

// ДВЕРЬ ПЕРВИЧНОЙ СЕПАРАЦИИ (155-2, 155-3).
//
// 🔒 ОНА СТОИТ НА 3600, А НЕ НА 3000, И ЭТО НЕ ВЫБОР РАЗМЕЩЕНИЯ. Приёмный путь
// бота (`scripts/agent/intake-preloader.js`) до сих пор ходит на
// `http://127.0.0.1:3000/api/intake` и читает секрет из `.env.local` СЛОТА —
// долг «дверь приёма переезжает внутрь службы» назван в паспорте §6 2026-09-06.
// Поставить сюда ещё одну дверь на 3000 значило бы углубить долг: служба обязана
// работать, когда слота нет вовсе.
//
// 🔒 РАЗБОР ДЕЛАЕТ АГЕНТ, А НЕ ЭТА ДВЕРЬ, И ЭТО СЛЕДСТВИЕ УСТРОЙСТВА КАНАЛА.
// Сообщение приходит в живую сессию Claude Code; модель уже прочитала его.
// Второй разбор здесь стоил бы второго вызова модели ради ответа, который у нас
// уже есть, — и разошёлся бы с первым. Дверь ТИПИЗИРУЕТ решение и записывает его.
//
// 🔒 ЗАМОК — ОБЩИЙ СЕКРЕТ МАШИНЫ, А НЕ НОВЫЙ КЛЮЧ. Ключ, заведённый ради одной
// двери, надо кому-то выдавать, где-то хранить и когда-то менять; третье звено
// («учётные данные кем-то выдаются») тут же стало бы тупиком.

// 🛑 `runtime` И `dynamic` ЗДЕСЬ НЕ ОБЪЯВЛЯЮТСЯ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ.
// В проекте включён `cacheComponents`, и сборка отвергает эти сегменты словами
// «Route segment config runtime is not compatible». Ни одна соседняя дверь их не
// объявляет — я скопировал привычную форму, не посмотрев на соседей, и получил
// упавшую сборку при зелёном `tsc`.
// 🔒 ОТСЮДА УРОК: `npx tsc --noEmit` НЕ ЗАМЕНЯЕТ СБОРКУ. Конфигурация сегментов
// маршрута — не типы, и проверка типов о ней не знает вовсе.

function secret(): string {
  return process.env.DATA_SECRET || machineEnv("DATA_SECRET") || ""
}

export async function POST(request: Request) {
  const expected = secret()
  const given = request.headers.get("x-data-secret") ?? ""
  // 🔒 ОТКАЗ БЕЗ КЛЮЧА — РАНЬШЕ ЧТЕНИЯ ТЕЛА. Разбирать присланное до проверки
  // права значит работать на того, кто права не имеет.
  if (!expected || given !== expected) {
    return NextResponse.json({ ok: false, error: "no-access" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 })
  }

  const kind = body.kind
  // 🔒 ЧУЖОЙ РОД — ОТКАЗ С ПРИЧИНОЙ, А НЕ ТИХИЙ `unparsed`. Молчаливая замена
  // означала бы, что опечатка агента навсегда останется «не разобрано», и никто
  // не узнает, что список разошёлся.
  if (!isMessageKind(kind)) {
    return NextResponse.json(
      { ok: false, error: "unknown-kind", got: typeof kind === "string" ? kind : null },
      { status: 400 },
    )
  }

  const lang = body.lang === "en" ? "en" : "ru"
  const line = categoryLine(kind, lang)

  if (!opensAutomation(kind)) {
    return NextResponse.json({ ok: true, kind, line, automationId: null })
  }

  const ready = await ensureAutomationsTable()
  if (!ready.ok) {
    // 🔒 ОТКАЗ БАЗЫ НЕ ПРЕВРАЩАЕТСЯ В «АВТОМАТИЗАЦИИ НЕТ». Агент обязан сказать
    // человеку, что запись не сохранилась, а не промолчать про номер.
    return NextResponse.json({ ok: false, error: "store-down", line }, { status: 503 })
  }

  const messageId = typeof body.message_id === "string" ? body.message_id : null

  // 🔒 ПОВТОР ТОГО ЖЕ СООБЩЕНИЯ НЕ ЗАВОДИТ ВТОРУЮ АВТОМАТИЗАЦИЮ. Telegram и
  // плагин повторяют доставку чаще, чем кажется; без этой проверки один вопрос
  // человека получил бы два номера, и второй остался бы навсегда пустым.
  if (messageId) {
    const seen = await findByMessage(messageId)
    if (seen !== null) {
      return NextResponse.json({ ok: true, kind, line, automationId: seen, repeat: true })
    }
  }

  const id = await createAutomation(messageId)
  if (id === null) {
    return NextResponse.json({ ok: false, error: "not-created", line }, { status: 503 })
  }
  // 🔒 СОСТОЯНИЕ ПИШЕТСЯ СРАЗУ: автоматизация без первой строки перехода
  // читается как «о ней ещё никто ничего не решил», а решение уже принято.
  await setState(id, "open", { reason: `сепарация: ${kind}` })

  return NextResponse.json({ ok: true, kind, line, automationId: id })
}

/** Уже заводили автоматизацию по этому сообщению? Номер или `null`. */
async function findByMessage(messageId: string): Promise<number | null> {
  const { rows } = await listAutomationRows(200)
  const found = rows.find(r => r.firstMessageId === messageId)
  return found ? found.id : null
}

export async function GET() {
  // 🔒 ЧИТАТЬ ЗДЕСЬ НЕЧЕГО, И ДВЕРЬ ГОВОРИТ ЭТО ЯВНО: `405` честнее, чем
  // страница с пустым телом, которую примут за поломку.
  return NextResponse.json({ ok: false, error: "post-only" }, { status: 405 })
}

