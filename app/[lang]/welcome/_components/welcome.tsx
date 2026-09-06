import type { ReactNode } from "react"
import { buttonVariants } from "@/components/ui/button"
import type { WelcomeUi } from "../_i18n/welcome.i18n"

// ОКНО «АВТОРИЗУЙТЕСЬ» — КАРТОЧКА ПО ЦЕНТРУ (правка владельца 2026-09-02).
//
// 🔒 ЭТО НЕ МОДАЛЬНОЕ ОКНО ПРОЕКТА, И ЭТО НАМЕРЕННО. Модальное окно
// открывается ПОВЕРХ чего-то и закрывается; здесь закрывать нечего — за ним нет
// страницы, на которую человек имеет право. Карточка на пустом фоне говорит то
// же самое и не обещает возврата.
//
// 🔒 БОЛЬШЕ НЕ КЛИЕНТСКИЙ ОСТРОВОК, И ПРИЧИНА ПРИЧИННАЯ, А НЕ ВКУСОВАЯ
// (2026-09-06). Пока страница жила в `app/welcome`, вне языкового сегмента,
// сервер языка не знал — и компонент выяснял его в браузере хуком `useUiLang`.
// После переезда в `app/[lang]/welcome` язык приходит параметром маршрута,
// узнавать нечего, и `"use client"` вместе с хуком стали не нужны.
// ✗ Цена прежнего устройства была видимой: первый проход всегда рисовался
// по-английски, и русский подставлялся уже после разметки.
//
// 🔒 СЛОВА ПРИХОДЯТ ПРОПСОМ ИЗ `_i18n/`, а не лежат константой внутри: у
// `settings` так же, и это то самое устройство, к которому страницу приводят.

export function WelcomeCard({ children, ui }: { children: ReactNode; ui: WelcomeUi }) {
  return (
    <div
      className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-[var(--shadow-float)]"
      data-welcome
    >
      <h1 className="font-semibold text-foreground text-xl">{ui.title}</h1>
      <p className="mt-2 text-muted-foreground text-sm">{ui.lead}</p>
      <div className="mt-6">{children}</div>
    </div>
  )
}

export function WelcomeSignIn({ href, ui }: { href: string; ui: WelcomeUi }) {
  // 🛑 ПУСТОЙ АДРЕС — ЗАКОННОЕ СОСТОЯНИЕ, И ОНО НАЗЫВАЕТСЯ СЛОВАМИ. Кнопка,
  // ведущая в никуда, хуже её отсутствия: человек нажимает и решает, что
  // сломан вход, а не что адрес не настроен.
  if (!href) {
    return <p className="text-muted-foreground text-sm">{ui.unavailable}</p>
  }

  return (
    <a className={`${buttonVariants()} w-full`} href={href}>
      {ui.action}
    </a>
  )
}
