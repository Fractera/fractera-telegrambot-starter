// @api что система знает о человеке: показать и поправить
import { NextResponse } from "next/server"
import { allFacts } from "@/lib/facts/registry"
import { writeFact } from "@/lib/facts/write"
import { recall } from "@/lib/registry/access"
import { fracteraSession } from "@/lib/fractera/session"

// ДВЕРЬ РАЗДЕЛА «ЧТО Я ЗНАЮ О ВАС» (158-5, замысел З17, третий путь).
//
// 🔒 ЗАМОК — СЕССИЯ ЧЕЛОВЕКА, А НЕ СЕКРЕТ МАШИНЫ, И ЭТО РАЗНИЦА ПО СУЩЕСТВУ.
// Соседняя дверь `api/agent/registry` служит агенту — процессу на этой машине,
// у которого кук нет. Здесь по ту сторону человек в браузере, и знание о нём —
// его собственное. Роль та же, что у ключа и терминала: `architect`.
//
// 🔒 ХОДИТ ЧЕРЕЗ ТЕ ЖЕ ПРИМИТИВЫ, ЧТО И АГЕНТ (`recall`, `writeFact`), а не
// читает таблицы по-своему. Второй читатель «потому что так удобнее» — ровно та
// ошибка, ради устранения которой заведён единый вход (§3о). Это же и проверка
// самих примитивов вторым потребителем: договор с одним пользователем всегда
// подогнан под него.
//
// 🛑 `runtime` И `dynamic` НЕ ОБЪЯВЛЯЮТСЯ: `cacheComponents` их отвергает.

/** Признаки о человеке: те, у кого субъект — он сам. */
function personFacts() {
  return allFacts().filter(f => f.subject === "self")
}

export async function GET() {
  const session = await fracteraSession()
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!session.roles.includes("architect")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const facts = personFacts()
  const items = await Promise.all(
    facts.map(async fact => {
      const got = await recall(fact.key, { subject: "self", limit: 1 })
      // 🔒 ТРИ ИСХОДА РАЗЛИЧИМЫ И ДОЕЗЖАЮТ ДО ЭКРАНА: значение есть · значений
      // ещё не было · слой данных отказал. Слить второе с третьим значило бы
      // показать человеку «ничего не знаю» там, где база просто молчит.
      const has = got.found === true && got.items.length > 0
      const failed = got.found === false && "error" in got
      return {
        key: fact.key,
        title: fact.title,
        what: fact.description,
        example: fact.example ?? null,
        value: has ? String(got.items[0].value ?? "") : null,
        at: has ? got.items[0].at : null,
        source: has ? null : null,
        state: has ? "known" : failed ? "down" : "empty",
        hint: got.found === false ? got.hint : null,
      }
    })
  )

  return NextResponse.json(
    { ok: true, items },
    { headers: { "Cache-Control": "no-store" } }
  )
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

  const key = String(body.key ?? "").trim().toLowerCase()
  const value = String(body.value ?? "").trim()

  // 🔒 ПРАВИТЬ МОЖНО ТОЛЬКО ПРИЗНАК О ЧЕЛОВЕКЕ. Ключ приходит из браузера, то
  // есть от кого угодно; без этой проверки экран настроек стал бы дверью в
  // любую таблицу признаков.
  if (!personFacts().some(f => f.key === key)) {
    return NextResponse.json(
      { ok: false, error: "not-a-person-fact", got: key },
      { status: 400 }
    )
  }

  // 🛑 ПУСТОЕ ЗНАЧЕНИЕ — ЭТО «СНЯТЬ», И ОНО ПИШЕТСЯ СТРОКОЙ, А НЕ УДАЛЕНИЕМ.
  // История значений — это история решений человека; стерев её, мы потеряли бы
  // ответ на вопрос «откуда система это взяла». Снятое помечается словом.
  const written = await writeFact({
    key,
    value: value === "" ? "—" : value,
    subject: "self",
    source: value === "" ? "снято человеком на экране" : "правка человека на экране",
  })

  if (!written.ok) {
    return NextResponse.json(
      { ok: false, error: written.error, hint: written.hint },
      { status: 503 }
    )
  }
  return NextResponse.json({ ok: true, key, value: value || null })
}
