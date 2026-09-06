"use client"

import { ExternalLink, Eye, EyeOff } from "lucide-react"
import { createContext, type ReactNode, useContext, useState } from "react"
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview"

// ПРЕДПРОСМОТР СТРАНИЦЫ АВТОМАТИЗАЦИИ — И ЗАКОН «ОТКРЫТА НЕ БОЛЕЕ ОДНОЙ».
//
// 🎯 СЛОВА ВЛАДЕЛЬЦА 2026-09-06: «у тебя есть кнопка показать страницу, а ещё
// нужна кнопка Preview, лучше это реализовать в виде иконок. Показать страницу
// будет открывать новую вкладку, привью будет открывать её прям здесь. Preview
// ограничь высотой 600 пикселей, добавь вертикальную прокрутку. В ленте всегда
// может быть открыта не более одной страницы: если открываем вторую, первая
// закрывается».
//
// 🔒 «НЕ БОЛЕЕ ОДНОЙ» ДЕРЖИТСЯ ОБЩИМ СОСТОЯНИЕМ, А НЕ ДИСЦИПЛИНОЙ СТРОК. Строка,
// закрывающая соседку сама, обязана знать про соседок — то есть про весь список.
// Здесь знание одно и наверху: лента помнит ЕДИНСТВЕННЫЙ открытый ключ, и второе
// открытие просто меняет его значение. Закрыть первую отдельным действием не
// нужно, потому что открытых двух не бывает по устройству.
//
// 🔒 КЛИЕНТСКОЕ ЗДЕСЬ ТОЛЬКО ЭТО. Содержимое карточки приходит `children` уже
// отрисованным на сервере: островок оборачивает разметку, а не порождает её.
// Иначе весь список — с метками, тегами и словами — уехал бы в браузер.
//
// 🛑 РАМКА СОЗДАЁТСЯ ТОЛЬКО ПОСЛЕ НАЖАТИЯ. `iframe`, поставленный сразу для
// каждой строки, — это столько полных загрузок страницы, сколько строк в ленте.

const OpenCtx = createContext<{
  openId: string | null
  toggle: (id: string) => void
}>({ openId: null, toggle: () => undefined })

/** Лента: помнит единственный открытый предпросмотр. */
export function AutomationsFeed({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <OpenCtx.Provider
      value={{
        openId,
        toggle: (id) => setOpenId((was) => (was === id ? null : id)),
      }}
    >
      <div className="flex flex-col gap-2">{children}</div>
    </OpenCtx.Provider>
  )
}

export function AutomationPreview({
  children,
  href,
  id,
  words,
}: {
  children: ReactNode
  href: string
  id: string
  words: { open: string; preview: string; close: string }
}) {
  const { openId, toggle } = useContext(OpenCtx)
  const open = openId === id

  const iconBtn =
    "inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"

  return (
    <div className="rounded-md border border-border" data-automation-row={id}>
      <div className="flex flex-wrap items-start gap-3 p-3">
        <div className="min-w-0 flex-1">{children}</div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* 🔒 ПОДПИСЬ У ИКОНКИ ЕСТЬ, ПРОСТО ОНА НЕ НАРИСОВАНА. `title` и
              `aria-label` обязательны: иконка без имени понятна тому, кто её
              рисовал, и никому больше — включая человека с экранным диктором. */}
          <button
            aria-label={open ? words.close : words.preview}
            aria-pressed={open}
            className={iconBtn}
            data-automation-preview={id}
            onClick={() => toggle(id)}
            title={open ? words.close : words.preview}
            type="button"
          >
            {open ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>

          {/* 🔒 ОТДЕЛЬНОЙ ВКЛАДКОЙ, И `noopener` ОБЯЗАТЕЛЕН: без него открытая
              страница получает `window.opener` и может увести исходную вкладку. */}
          <a
            aria-label={words.open}
            className={iconBtn}
            data-automation-open={id}
            href={href}
            rel="noopener noreferrer"
            target="_blank"
            title={words.open}
          >
            <ExternalLink aria-hidden className="size-4" />
          </a>
        </div>
      </div>

      {open && (
        <div className="border-border border-t p-3">
          {/* 🛑 ВЫСОТА 600 И ПРОКРУТКА ВНУТРИ — ПРЯМОЕ ТРЕБОВАНИЕ ВЛАДЕЛЬЦА.
              Без ограничения рамка растёт под содержимое и уносит ленту вниз:
              человек, открывший предпросмотр, теряет из виду сам список. */}
          <WebPreview className="h-[600px]" defaultUrl={href}>
            <WebPreviewNavigation>
              <WebPreviewUrl readOnly value={href} />
            </WebPreviewNavigation>
            <WebPreviewBody className="overflow-y-auto" src={href} />
          </WebPreview>
        </div>
      )}
    </div>
  )
}
