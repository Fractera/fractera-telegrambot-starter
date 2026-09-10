// @api read, save and verify the Anthropic key of this machine
import { NextResponse } from "next/server"
import {
  checkAnthropicKey,
  looksLikeAnthropicKey,
  readAnthropicKeyState,
  writeAnthropicKey,
} from "@/lib/architect/anthropic-key"
import { fracteraRoles } from "@/lib/fractera/session"

// ДВЕРЬ КЛЮЧА ANTHROPIC (113-1, 2026-09-04).
//
// 🔒 ФАЙЛ ОДИН НА ДВЕ СЛУЖБЫ — ЧАТ И ПАМЯТЬ, БАЙТ В БАЙТ (181-9). Обе службы
// узнают вошедшего одним и тем же помощником `lib/fractera/session`, и обе пишут
// в один склад секретов машины: единая система, как у ключа OpenAI.
// 🪦 В ЧАТЕ ДВЕРЬ ЖИЛА ПО АДРЕСУ `/api/architect/anthropic-key` И ПРОВЕРЯЛА РОЛЬ
// ЧЕРЕЗ `requireRoles` — переехала сюда 181-9. Причина не в чистоте адреса:
// у памяти нет ни того слоя ролей, ни той папки, и вторая дверь к одному
// хранилищу разошлась бы с первой на первой же правке — оплачено шагом 109-3.
//
// 🔒 ЗЕРКАЛО СОСЕДНЕЙ ДВЕРИ КЛЮЧА OPENAI, И ЭТО НАМЕРЕННО. Две двери одного рода,
// ведущие себя по-разному, — источник вопросов «почему здесь сохранилось, а там
// нет». Приёмы те же: замок на самой двери, форма проверяется до записи, проверка
// идёт ключом, который УЖЕ на сервере.
//
// 🔒 НО ОДНО ОТЛИЧИЕ ЕСТЬ, И ОНО ГЛАВНОЕ: ЗДЕСЬ НЕТ ПЕРЕЗАПУСКА СЛУЖБЫ. Проект
// сайта читает окружение при старте, поэтому после ключа OpenAI его
// перезапускают. Этот ключ читается из файла при каждом обращении, и обещать
// перезапуск значило бы заставить человека ждать события, которого не будет.
//
// 🔒 ЗАМОК ЗДЕСЬ, А НЕ ТОЛЬКО НА СТРАНИЦЕ: через дверь едет секрет, а проверку в
// браузере в браузере же и отключают.
// 🛑 НАСТРОЕК СЕГМЕНТА ЗДЕСЬ НЕТ: у обоих шаблонов включён `cacheComponents`, и
// он несовместим ни с `runtime`, ни с `dynamic` — измерено сборкой (137-3).

export async function GET() {
  const roles = await fracteraRoles()
  if (!roles.includes("architect")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  return NextResponse.json(readAnthropicKeyState(), { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const roles = await fracteraRoles()
  if (!roles.includes("architect")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // Проверка живого ключа — без тела запроса и без секрета в проводе.
  if (new URL(request.url).searchParams.get("check") === "1") {
    if (!readAnthropicKeyState().configured) {
      return NextResponse.json({ error: "no-key" }, { status: 409 })
    }
    return NextResponse.json(await checkAnthropicKey(), { headers: { "Cache-Control": "no-store" } })
  }

  const body = (await request.json().catch(() => null)) as { key?: string } | null
  const key = (body?.key ?? "").trim()
  if (!key) return NextResponse.json({ error: "empty" }, { status: 400 })
  if (!looksLikeAnthropicKey(key)) {
    return NextResponse.json({ error: "bad-key-format" }, { status: 400 })
  }

  const res = writeAnthropicKey(key)
  if (!res.ok) {
    return NextResponse.json({ error: "write-failed", detail: res.detail }, { status: 500 })
  }

  // 🔒 ОТВЕТ ГОВОРИТ РОВНО ТО, ЧТО ПРОИЗОШЛО. `applies: true` здесь честно:
  // следующий вопрос уйдёт уже с новым ключом, потому что читается он из файла
  // при каждом обращении. У соседней двери на этом месте стоял бы `false`.
  return NextResponse.json({ ok: true, applies: true }, { headers: { "Cache-Control": "no-store" } })
}
