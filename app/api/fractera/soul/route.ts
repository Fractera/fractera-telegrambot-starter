// @api SOUL.md — характер агента: прочитать и переписать
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { NextResponse } from "next/server"
import { fracteraSession } from "@/lib/fractera/session"

// ДВЕРЬ К `SOUL.md` (158-5в, замысел З15).
//
// 🔒 ЭТО ФАЙЛ РЕПОЗИТОРИЯ, А НЕ ЗАПИСЬ В БАЗЕ, И РЕШЕНИЕ ЭТО ВЛАДЕЛЬЦА
// (2026-09-07): агент читает его НАТИВНО, как `CLAUDE.md`; правка едет коммитом
// и **откатывается** — то единственное требование, которым оплачено право
// проекта править самого себя.
//
// 🔒 MARKDOWN, А НЕ ПОЛЯ, И ЭТО РАЗБОР ВОПРОСА ВЛАДЕЛЬЦА 2026-09-08 («стоит ли
// делать такую же архитектуру, или обычным Markdown?»). Различие настоящее:
// признаки `person.*` спрашивают ПО КЛЮЧУ и по требованию — им нужны таблицы,
// поиск и накопление. `SOUL.md` читается ЦЕЛИКОМ и всегда. Разложи его по полям —
// человек начнёт укладывать характер в клетки, и первым исчезнет нюанс
// («отвечай коротко, но про архитектуру разворачивай»), ради которого файл и
// заводится. Дизайн при этом общий: одинаковый вид не требует одинаковой формы.
//
// 🛑 РАЗМЕР ОГРАНИЧЕН. Файл едет в контекст агента при КАЖДОМ старте сессии;
// без потолка одна длинная правка молча съедала бы окно у самой работы.

const SOUL_PATH = join(process.cwd(), "SOUL.md")
/** Потолок: файл читается целиком и всегда — он платит за себя каждым запуском. */
const MAX_BYTES = 16_000

export async function GET() {
  const session = await fracteraSession()
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!session.roles.includes("architect")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  try {
    const text = await readFile(SOUL_PATH, "utf8")
    return NextResponse.json(
      { ok: true, text, bytes: Buffer.byteLength(text, "utf8"), max: MAX_BYTES },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    // 🔒 ФАЙЛА НЕТ — ЗАКОННОЕ СОСТОЯНИЕ, А НЕ ОТКАЗ. Он появляется с первой
    // правкой; пустой экран с объяснением честнее ошибки.
    return NextResponse.json({ ok: true, text: "", bytes: 0, max: MAX_BYTES })
  }
}

export async function POST(request: Request) {
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

  const text = typeof body.text === "string" ? body.text : null
  if (text === null) {
    return NextResponse.json({ ok: false, error: "no-text" }, { status: 400 })
  }
  const bytes = Buffer.byteLength(text, "utf8")
  if (bytes > MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: "too-big",
        bytes,
        max: MAX_BYTES,
        hint: "файл едет в контекст агента при каждом старте — длинная душа стоит окна у работы",
      },
      { status: 400 }
    )
  }

  try {
    await writeFile(SOUL_PATH, text, "utf8")
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, error: "write-failed", hint: message },
      { status: 503 }
    )
  }

  // 🛑 ПРАВКА НЕ ДЕЙСТВУЕТ, ПОКА СЕССИЯ АГЕНТА НЕ ПЕРЕЗАПУЩЕНА, И ДВЕРЬ ГОВОРИТ
  // ЭТО ВСЛУХ. Он читает `SOUL.md` при старте — так же, как `CLAUDE.md` и схемы
  // инструментов (закон 155-7). Зелёное «Сохранено» без этой оговорки лжёт:
  // человек ждал бы нового поведения в следующем же сообщении.
  return NextResponse.json({
    ok: true,
    bytes,
    note: "сохранено в файл; агент прочитает его при следующем запуске сессии",
  })
}
