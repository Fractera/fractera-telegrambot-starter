"use client"

import { useState } from "react"
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview"
import { Small } from "@/components/ui/typography"
import type { Automation } from "../_lib/automations"

// СПИСОК АВТОМАТИЗАЦИЙ И ПРЕДПРОСМОТР ИХ СТРАНИЦ — ВО ВКЛАДКЕ «ЛОГИ».
//
// 🎯 СЛОВА ВЛАДЕЛЬЦА 2026-09-06: «мы должны создать кнопку и здесь побудем
// показывать страницу. В инструменте ai elements найди инструмент web preview и
// показывай его в этой вкладке».
//
// 🔒 `WebPreview` ВЗЯТ ВЕНДОРОМ ОФИЦИАЛЬНЫМ CLI, А НЕ НАПИСАН ПО ПАМЯТИ:
// `npx ai-elements@latest add web-preview`. Тот же закон, по которому в корпус
// вошли остальные части AI Elements (шаг 63): чужой код входит копией, правится
// обновлением сверху, а не нашей рукой. При установке ни один наш файл не
// перезаписан — все предложения перезаписи отклонены.
//
// 🔒 СТРАНИЦА ПОКАЗЫВАЕТСЯ СВОИМ АДРЕСОМ, А НЕ ПЕРЕРИСОВЫВАЕТСЯ ЗДЕСЬ. Витрина,
// рисующая содержимое по-своему, показывает себя, а не продукт: разойдётся она с
// настоящей страницей в первый же день. Тот же закон, что у каталога блоков.
//
// 🛑 ПРЕДПРОСМОТР ПОЯВЛЯЕТСЯ ТОЛЬКО ПО НАЖАТИЮ, И ЭТО НЕ ЛЕНЬ. Рамка `iframe`,
// открытая сразу для каждой строки списка, — это столько же полных загрузок
// страницы, сколько автоматизаций.

export function AutomationsView({
  items,
  lang,
  words,
}: {
  items: Automation[]
  lang: string
  words: {
    open: string
    close: string
    steps: string
    empty: string
    demo: string
  }
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (items.length === 0) {
    return (
      <Small className="text-muted-foreground" data-automations-empty>
        {words.empty}
      </Small>
    )
  }

  return (
    <div className="flex flex-col gap-3" data-automations={items.length}>
      <Small className="text-muted-foreground">{words.demo}</Small>

      {items.map((a) => {
        const open = openId === a.id
        const href = `/${lang}/automation/${a.id}`

        return (
          <div className="rounded-md border border-border" data-automation-row={a.id} key={a.id}>
            <div className="flex flex-wrap items-center gap-3 p-3">
              <span className="font-medium text-[length:var(--fs-body)] text-foreground">
                {a.name}
              </span>
              {/* 🔒 ВРЕМЯ РЯДОМ С ИМЕНЕМ, А НЕ ВМЕСТО НЕГО: обе половины взяты из
                  имени файла, и человек узнаёт цепочку по паре «что» и «когда». */}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[length:var(--fs-small)] text-muted-foreground">
                {a.at || "—"}
              </code>
              <Small className="text-muted-foreground">
                {words.steps.replace("{n}", String(a.steps))}
              </Small>

              <button
                className="ml-auto rounded-md border border-border px-3 py-1.5 text-[length:var(--fs-small)] text-foreground transition-colors hover:bg-muted"
                data-automation-open={a.id}
                onClick={() => setOpenId(open ? null : a.id)}
                type="button"
              >
                {open ? words.close : words.open}
              </button>
            </div>

            {open && (
              <div className="border-border border-t p-3">
                <WebPreview className="h-[520px]" defaultUrl={href}>
                  <WebPreviewNavigation>
                    <WebPreviewUrl readOnly value={href} />
                  </WebPreviewNavigation>
                  <WebPreviewBody src={href} title={a.name} />
                </WebPreview>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
