"use client"

// ТЕРМИНАЛ АГЕНТА В МОДАЛЬНОМ ОКНЕ ВКЛАДКИ (шаг 117, 2026-09-05).
//
// 🪦 С 181-3 В РАМКЕ — СТРАНИЦА «ПОДПИСКА CLAUDE», А НЕ ТЕРМИНАЛ. Вход в подписку из
// терминала убран словом владельца 2026-09-10 («Из терминала убери вход в подписку»),
// а карточка существует ради входа; адрес относительный — страница на этом же хосте.
//
// 🔒 РАМКА ВОКРУГ СУЩЕСТВУЮЩЕГО ТЕРМИНАЛА, А НЕ ВТОРОЙ ТЕРМИНАЛ. Мост
// псевдотерминала живёт в процессе чата `:3600` (114-3), и замок у него там же.
// Построить свой мост в слоте значило бы завести ВТОРУЮ реализацию оболочки
// сервера — и второй замок к ней, который однажды разойдётся с первым. Заказ
// владельца: «на этой вкладке внутри отобразить терминал как модальное окно».
//
// 🔒 ИЗМЕРЕНО ДО ПОСТРОЙКИ, А НЕ ПРЕДПОЛОЖЕНО: `/terminal` чата не отдаёт ни
// `X-Frame-Options`, ни `Content-Security-Policy: frame-ancestors`, и в nginx
// такого запрета нет. Значит встраивание возможно; если запрет появится, окно
// останется пустым — поэтому рядом стоит прямая ссылка «открыть отдельной
// вкладкой», и она же ответ на слова владельца «отдельная страница тоже может
// работать».
//
// 🔒 РАМКА СОЗДАЁТСЯ ТОЛЬКО ПРИ ОТКРЫТИИ. Терминал — это живой процесс на
// сервере: держать его запущенным под закрытым окном значит платить за то, чего
// человек не просил.

import { useState } from "react"
import { SquareTerminal, ExternalLink } from "lucide-react"
import { AppDialog } from "@/components/dialog/app-dialog.client"
import type { AppDialogUi } from "@/components/dialog/app-dialog.i18n"
import { Button } from "@/components/ui/button"

export type ClaudeTerminalLabels = {
  open: string
  title: string
  description: string
  newTab: string
}

export function ClaudeTerminal({
  href,
  labels,
  ui,
}: {
  /** Что показать в рамке — страница «Подписка Claude» этого же хоста (181-3). */
  href: string
  labels: ClaudeTerminalLabels
  ui: AppDialogUi
}) {
  const [open, setOpen] = useState(false)
  // 🔒 АДРЕС СЧИТАЕТСЯ В МОМЕНТ ОТКРЫТИЯ, а не при первом рендере: на сервере
  // `window` нет, и посчитанный там адрес был бы `localhost` в разметке.
  const [url, setUrl] = useState("")

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-agent-terminal="open"
        onClick={() => {
          setUrl(href)
          setOpen(true)
        }}
      >
        <SquareTerminal className="size-4" />
        {labels.open}
      </Button>

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        size="xl"
        title={labels.title}
        description={labels.description}
        ui={ui}
        bodyClassName="p-0"
        toolbar={
          url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[length:var(--fs-small)] text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
              {labels.newTab}
            </a>
          ) : undefined
        }
      >
        {open && url ? (
          <iframe
            src={url}
            title={labels.title}
            data-agent-terminal="frame"
            className="h-[70vh] w-full border-0 bg-background"
          />
        ) : null}
      </AppDialog>
    </>
  )
}
