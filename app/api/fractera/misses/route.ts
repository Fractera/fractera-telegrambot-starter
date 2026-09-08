// @api журнал промахов поиска: что бот не понял и сколько раз
import { NextResponse } from "next/server"
import { dataFetch } from "@/lib/fractera/data-service"
import { fracteraSession } from "@/lib/fractera/session"

// ДВЕРЬ ЖУРНАЛА ПРОМАХОВ (158-7, поверхность добавлена 2026-09-08).
//
// 🔒 ЗАЧЕМ ЧЕЛОВЕКУ ЭТО ВИДЕТЬ. Промах — это фраза, которой человек назвал то,
// чего система не нашла. Каждая такая фраза — готовый кандидат в `triggers`, то
// есть **бесплатный материал для обучения корпуса**. Невидимый журнал копит его
// и никому не отдаёт.
//
// 🛑 ЭКРАН НЕ ПРАВИТ РЕЕСТР, И ЭТО НЕ ОГРАНИЧЕНИЕ, А УСТРОЙСТВО. Писатель реестра
// ровно один — агент, правящий конфиг коммитом (README реестра). Форма здесь
// стала бы вторым писателем, и два процесса писали бы один файл — тот же дефект,
// которым оплачена панельная вкладка «Способы входа» (шаг 78-6).
// 🔒 ПОЭТОМУ ДЕЙСТВИЕ ЧЕЛОВЕКА ЗДЕСЬ ДВА: посмотреть и **снять шум**. Дописать
// триггер он просит у бота словами — тем же путём, что и всё остальное о себе.

export async function GET() {
  const session = await fracteraSession()
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!session.roles.includes("architect")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  try {
    const r = await dataFetch("/db/migrate", {
      method: "POST",
      body: JSON.stringify({
        sql:
          "SELECT id, corpus, query, times, last_at, created_at FROM registry_search_misses " +
          "ORDER BY COALESCE(times, 1) DESC, id DESC LIMIT 100",
      }),
    })
    if (!r.ok) {
      // 🔒 ТРИ ИСХОДА РАЗЛИЧИМЫ: есть промахи · их нет · база молчит. Слить
      // второе с третьим значило бы показать «всё понято» при мёртвой базе.
      return NextResponse.json(
        { ok: false, state: "down", hint: `слой данных ответил ${r.status}` },
        { status: 503 }
      )
    }
    const body = (await r.json()) as { rows?: Record<string, unknown>[] }
    const items = (body.rows ?? []).map(row => ({
      id: Number(row.id ?? 0),
      corpus: String(row.corpus ?? ""),
      query: String(row.query ?? ""),
      times: Number(row.times ?? 1),
      at: String(row.last_at ?? row.created_at ?? ""),
    }))
    return NextResponse.json(
      { ok: true, state: items.length > 0 ? "some" : "empty", items },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    return NextResponse.json(
      { ok: false, state: "down", hint: "слой данных недоступен" },
      { status: 503 }
    )
  }
}

export async function DELETE(request: Request) {
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
    return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 })
  }
  const id = body.id
  // 🛑 УДАЛЯЕТСЯ ОДНА НАЗВАННАЯ СТРОКА, А НЕ «ВСЁ ЛИШНЕЕ». Кнопка «очистить
  // журнал» стёрла бы материал обучения одним нажатием и без возможности
  // вспомнить, что там было.
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { ok: false, error: "bad-id", hint: "нужен номер строки журнала" },
      { status: 400 }
    )
  }
  try {
    const r = await dataFetch("/db/migrate", {
      method: "POST",
      body: JSON.stringify({
        sql: "DELETE FROM registry_search_misses WHERE id = ?",
        params: [id],
      }),
    })
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: `http-${r.status}` }, { status: 503 })
    }
  } catch {
    return NextResponse.json({ ok: false, error: "unreachable" }, { status: 503 })
  }
  return NextResponse.json({ ok: true, id })
}
