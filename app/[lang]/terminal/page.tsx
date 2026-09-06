import { redirect } from "next/navigation"
import { Suspense } from "react"
import { Breadcrumbs } from "@/components/nav/breadcrumbs.server"
import { Eyebrow, H1, Lead } from "@/components/ui/typography"
import { fracteraSession } from "@/lib/fractera/session"
import { TerminalPanel } from "./_components/terminal-panel.client"
import { terminalUi } from "./_i18n/terminal.i18n"

// СТРАНИЦА ТЕРМИНАЛА (114-4; приведена к устройству `settings` 2026-09-06).
//
// 🎯 СЛОВА ВЛАДЕЛЬЦА 2026-09-06: «приведи к стандарту такому, как settings» ·
// «данные маршруты должны иметь `_components` внутри себя, а не импортировать их
// из внешних источников» · «терминал без левой колонки».
//
// 🔒 ЧТО ИЗМЕНИЛОСЬ — УСТРОЙСТВО. Страница переехала из `app/terminal` в
// `app/[lang]/terminal`; четыре её компонента лежат теперь в `_components/`
// рядом, слова — в `_i18n/`. Шапка, подвал и переменные дизайна приезжают из
// раскладки `[lang]/layout.tsx` бесплатно — раньше их не было вовсе.
//
// 🔒 БЕЗ `WorkspaceShell`, И ЭТО РЕШЕНИЕ ВЛАДЕЛЬЦА, А НЕ УПРОЩЕНИЕ. У `settings`
// слева меню разделов; у терминала разделов нет, и левую колонку было бы нечем
// населить. Пустая колонка обещает содержимое, которого не будет.
// 🔒 АНАТОМИЯ ЗАГОЛОВКА ПРИ ЭТОМ ТА ЖЕ: крошки → надзаголовок → `H1` → лид.
// Общим у страниц слоя должен быть заголовок, а не раскладка тела.
//
// 🔒 ЗАМОК СТОИТ ДВАЖДЫ, И ЭТО НЕ ИЗБЫТОЧНОСТЬ. Здесь — чтобы человек без прав
// не увидел даже пустой экран терминала; в двери билета — потому что страница
// прав не выдаёт, их выдаёт билет.
//
// ✗ ЗАМОК ЖИВЁТ ПОД `<Suspense>`, И ЭТО ОПЛАЧЕНО КОНСОЛЬЮ БРАУЗЕРА, А НЕ
// ВЫВЕДЕНО. Первая версия спрашивала сессию прямо в теле страницы, и Next при
// включённом `cacheComponents` ответил: «Uncached data or `connection()` was
// accessed outside of `<Suspense>` … delays the ENTIRE page from rendering».
// Страница при этом рисовалась — то есть дефект был невидим и снаружи, и в
// типах, и в линтере.
//
// 🛑 НАСТРОЕК СЕГМЕНТА ЗДЕСЬ НЕТ: у шаблона включён `cacheComponents`, и он
// несовместим с `runtime`/`dynamic`.

export default async function TerminalPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const ui = terminalUi(lang)

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-6 py-10 md:px-8">
      <div className="flex flex-col gap-4">
        <Breadcrumbs trail={[{ label: ui.layer }, { label: ui.title }]} />

        <header className="flex flex-col gap-4 border-border border-b pb-8">
          <Eyebrow>{ui.layer}</Eyebrow>
          <H1>{ui.title}</H1>
          <Lead className="max-w-3xl">{ui.lead}</Lead>
        </header>
      </div>

      <Suspense fallback={<div className="min-h-[480px] w-full rounded-lg bg-muted/40" />}>
        <TerminalGate lang={lang} />
      </Suspense>
    </main>
  )
}

async function TerminalGate({ lang }: { lang: string }) {
  const session = await fracteraSession()
  if (!session) {
    redirect(`/${lang}/welcome`)
  }
  if (!session.roles.includes("architect")) {
    redirect("/")
  }
  return <TerminalPanel lang={lang} />
}
