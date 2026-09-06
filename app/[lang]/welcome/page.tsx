import { headers } from "next/headers"
import { Suspense } from "react"
import { publicAuthUrl } from "@/lib/fractera/auth-url"
import { WelcomeCard, WelcomeSignIn } from "./_components/welcome"
import { welcomeUi } from "./_i18n/welcome.i18n"

// СТРАНИЦА-ЗАГЛУШКА ДЛЯ НЕАВТОРИЗОВАННОГО (правка владельца 2026-09-02;
// приведена к устройству `settings` 2026-09-06).
//
// 🎯 СЛОВА ВЛАДЕЛЬЦА 2026-09-06: «две страницы, терминал и добро пожаловать,
// выполнены неправильно — приведи к стандарту такому, как settings» и «данные
// маршруты должны иметь `_components` внутри себя, а не импортировать их из
// внешних источников».
//
// 🔒 ЧТО ИМЕННО ИЗМЕНИЛОСЬ — УСТРОЙСТВО, А НЕ ВИД. Страница переехала из
// `app/welcome` в `app/[lang]/welcome` и получила своё: `_components/` рядом,
// `_i18n/` рядом, язык параметром маршрута. Оттуда же бесплатно приехали шапка,
// подвал и переменные дизайна — их даёт раскладка `[lang]/layout.tsx`.
//
// 🔒 АНАТОМИЯ ЗАГОЛОВКА ЗДЕСЬ УРЕЗАНА НАМЕРЕННО, И ЭТО СОГЛАСОВАНО. У `settings`
// сверху крошки и надзаголовок «слой архитектора»; человеку, который ЕЩЁ НЕ
// ВОШЁЛ, показывать путь по слою, куда он не имеет доступа, — обещание вместо
// приглашения. Остаются заголовок и лид, и они внутри карточки.
//
// 🛑 ДОСТУП К ЭТОЙ СТРАНИЦЕ ОТКРЫТ НАМЕРЕННО, и это не дыра: она не показывает
// ни разговоров, ни данных — только приглашение войти. Список публичных путей
// живёт в `proxy.ts`, и он знает новый адрес.

// 🔒 НАБОР ЯЗЫКОВ ОБЪЯВЛЕН, КАК У `settings`, И БЕЗ НЕГО СБОРКА НЕ ИДЁТ.
// Пока набор значений динамического сегмента неизвестен, Next не может собрать
// даже оболочку страницы и отвечает «Uncached data was accessed outside of
// <Suspense>», показывая стеком корневую раскладку — то есть место, где дефекта
// нет. ✗ Оплачено дважды подряд 2026-09-06: сначала страницей автоматизации,
// потом этой; в первый раз я прочитал стек буквально и полез чинить провайдер.
const LANGS = ["en", "ru"] as const

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }))
}

export default async function WelcomePage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const ui = welcomeUi(lang)

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <WelcomeCard ui={ui}>
        {/* 🔒 КНОПКА ВНУТРИ `Suspense`, И ЭТО НЕ УКРАШЕНИЕ: она читает заголовки
            запроса, а у сборки включён `cacheComponents` — без границы ожидания
            такое чтение делает динамической всю страницу и роняет сборку. */}
        <Suspense fallback={null}>
          <SignInLink lang={lang} />
        </Suspense>
      </WelcomeCard>
    </main>
  )
}

async function SignInLink({ lang }: { lang: string }) {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? ""
  const proto = h.get("x-forwarded-proto") ?? "https"

  // Адрес выводится из хоста, по которому открыт сам чат; почему именно так —
  // в `lib/fractera/auth-url.ts`, там же и оплаченный этим дефект.
  const authUrl = publicAuthUrl(host, proto)
  const back = host ? `${proto}://${host}/` : ""
  const href = authUrl && back ? `${authUrl}/login?redirectUrl=${encodeURIComponent(back)}` : ""

  return <WelcomeSignIn href={href} ui={welcomeUi(lang)} />
}
