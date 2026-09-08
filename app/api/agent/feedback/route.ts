// @api отзыв о работе автоматизации: вердикт человека ложится в её запись
import { NextResponse } from "next/server"
import { ensureAutomationsTable, readAutomationRow, setAutomationFields, type Verdict } from "@/lib/automations/store"
import { machineEnv } from "@/lib/fractera/machine-env"

// ДВЕРЬ ОТЗЫВА (143-6).
//
// ✗ ИЗМЕРЕНО ПРИ ПЛАНИРОВАНИИ 2026-09-08: колонки `verdict_liked` и
// `verdict_needs_work` существовали с 138 и **не имели ни одного писателя** —
// их только читали, чтобы решить, спрашивать ли отзыв. То есть система умела
// вечно спрашивать и не умела записать ответ: «уже спрашивали» не наступало
// никогда, и на каждом закрытии человека спросили бы заново.
//
// 🔒 ЗАКРЫТИЕ НЕ СПРАШИВАЕТ САМО — ОНО ВОЗВРАЩАЕТ РЕШЕНИЕ «СПРОСИТЬ». Вопрос
// человеку задаёт агент словами, в том же разговоре; вторая поверхность вопроса
// была бы второй реализацией отзыва (§3б, шаг 139), и разошлись бы они на первой
// правке текста.
//
// 🔒 ДВА ВЕРДИКТА, А НЕ ОЦЕНКА ПО ПЯТИБАЛЛЬНОЙ. Владелец назвал их сам:
// понравилось · нужно доработать. Шкала требует толкования («что значит 3?»), а
// вердикт — нет; и по нему сразу видно, о чём говорить дальше.

function secret(): string {
  return process.env.DATA_SECRET || machineEnv("DATA_SECRET") || ""
}

function verdict(v: unknown): Verdict | null {
  return v === "yes" ? "yes" : v === "no" ? "no" : null
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

  const liked = verdict(body.liked)
  const needsWork = verdict(body.needs_work)
  if (liked === null && needsWork === null) {
    // 🔒 ПУСТОЙ ОТЗЫВ НЕ ЗАПИСЫВАЕТСЯ, И ЭТО НЕ ПРИДИРКА К ФОРМЕ. Запись без
    // вердикта закрыла бы вопрос навсегда: «уже спрашивали» стало бы истиной,
    // а ответа человека в базе не было бы. Молчание — не отзыв.
    return NextResponse.json({ ok: false, error: "no-verdict" }, { status: 400 })
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

  const row = await readAutomationRow(id)
  if (!row) {
    return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 })
  }

  // 🔒 ПИШЕТСЯ ЗАПЛАТА, А НЕ СНИМОК: саммари, теги и публичный договор
  // принадлежат другим писателям, и снимок затёр бы их. Тот же закон, что у
  // конфигов слоя архитектора.
  const note = typeof body.note === "string" ? body.note.trim() : ""
  const written = await setAutomationFields(id, {
    ...(liked !== null ? { liked } : {}),
    ...(needsWork !== null ? { needsWork } : {}),
    ...(note ? { feedbackNote: note } : {}),
  })

  return NextResponse.json({
    ok: written,
    automationId: id,
    liked: liked ?? row.liked,
    needsWork: needsWork ?? row.needsWork,
    // 🔒 ГОВОРИТСЯ ВСЛУХ, ЧТО ВОПРОС БОЛЬШЕ НЕ ЗАДАДУТ: агент обязан знать, что
    // повторно спрашивать не нужно, — иначе он спросит из вежливости.
    askedAgain: false,
  })
}

export async function GET() {
  return NextResponse.json({ ok: true, door: "agent/feedback", verdicts: ["yes", "no"] })
}
