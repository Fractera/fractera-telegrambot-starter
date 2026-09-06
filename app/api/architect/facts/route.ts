// @api read the fact registry
import { NextRequest, NextResponse } from "next/server"
import { requireRoles } from "@/lib/auth/require-roles"
import { ARCHITECT_LAYER_ROLES } from "@/lib/roles"
import { allFacts } from "@/lib/facts/registry"

// ДВЕРЬ РЕЕСТРА ПРИЗНАКОВ — ТОЛЬКО ЧТЕНИЕ (81-4, сведена к GET 2026-09-06).
//
// 🔒 ЗАМОК ЗДЕСЬ, А НЕ ТОЛЬКО НА СТРАНИЦЕ. Реестр перечисляет, что система умеет
// вынимать из личных сообщений владельца; проверку в браузере в браузере же и
// отключают.
// 🛑 `runtime` СНЯТ ЗДЕСЬ (137-3): несовместим с `cacheComponents` шаблона
// чата. В источнике строка стоит и верна ТАМ. Тот же запрет, что у `dynamic`
// и у дверей `api/fractera/*` этого репозитория — измерено сборкой.
// 🛑 `dynamic` СНЯТ ПО ТОЙ ЖЕ ПРИЧИНЕ. Дверь и так не кэшируется: она читает
// запрос. Сборка отвечала: «Route segment config "dynamic" is not compatible
// with nextConfig.cacheComponents».

export async function GET(req: NextRequest) {
  const denied = await requireRoles(req, ARCHITECT_LAYER_ROLES)
  if (denied) return denied
  return NextResponse.json(
    { ok: true, facts: allFacts() },
    { headers: { "Cache-Control": "no-store" } },
  )
}

// 🪦 ЗДЕСЬ БЫЛИ POST И PATCH — УДАЛЕНЫ 137-13 (слово владельца 2026-09-06).
// Реестр больше не правится из приложения: человек просит агента, агент строит
// и кладёт коммит, по которому правку можно откатить. Двери записи оставляли бы
// определениям ВТОРОГО хозяина, и две правды разошлись бы молча в первый же
// день, когда владелец воспользовался бы и формой, и ботом.
//
// 🪦 И ВМЕСТЕ С НИМИ — ВСЯ ИХ ПРОВЕРКА: `readSecondLayer()`, `hostOfFnAllowed()`,
// пределы `MAX_PRODUCES`/`MAX_STATUSES`/`MAX_UNIT`, помощник `no()`. Удалены
// 2026-09-06, восстанавливаются из git.
// 🔒 ПОЧЕМУ ЭТО НЕ ПОТЕРЯ ПРОВЕРКИ, А ЕЁ ПЕРЕЕЗД. Проверка защищала дверь от
// произвольного тела запроса из браузера. Такого тела больше не существует:
// записи приходят файлом `lib/facts/registry.json`, и закрытые списки сверяет
// `lib/facts/store.ts` при чтении — чужое значение становится отсутствующим.
// ✗ 137-13 снял обработчики и ОСТАВИЛ их проверку висеть: 130 строк, которые
// никто не звал. Мёртвый код рядом с живым читается как действующее правило.
