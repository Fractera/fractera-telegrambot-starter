"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// ПОЛОСА ОБНОВЛЕНИЯ НАД ЗАГОЛОВКОМ (правка владельца).
//
// 🔒 ЕГО СЛОВА: «в верхней части над заголовком сделай на всю ширину слайдер,
// который движется справа налево каждые 5 секунд, и в тот момент, когда он
// завершает свой цикл, обновлять страницу, чтобы показать новые результаты».
// Полоса здесь — не украшение: она отвечает на вопрос «когда обновится», и без
// неё обновление выглядит самопроизвольным дёрганьем экрана.
//
// 🔒 `router.refresh()`, А НЕ ПЕРЕЗАГРУЗКА ОКНА. Перезагрузка теряет прокрутку и
// раскрытые окна и стоит полной загрузки страницы; `refresh` перерисовывает
// серверную часть на месте — то есть ровно строки таблицы.

// 🔒 ПЕРИОД — ОДНА КОНСТАНТА, И ОН ЖЕ НАЗЫВАЕТСЯ СЛОВАМИ (147-5, добито 158-6).
// ✗ ДО ЭТОГО ПЕРИОД ЗНАЛА ТОЛЬКО ПОЛОСА. Полоса отвечает «когда обновится» тому,
// кто её видит и понял; человеку, который её не заметил или отключил анимацию,
// экран не говорил ничего. 🛑 И главное: **потока событий у нас нет**, а «живая
// лента» без объяснения читается как реальное время — обещание, которое человек
// проверит в свой худший день.
const CYCLE_MS = 5000

export function AutoRefresh({ everyLabel }: { everyLabel?: string }) {
  const router = useRouter()

  useEffect(() => {
    const t = setInterval(() => router.refresh(), CYCLE_MS)
    return () => clearInterval(t)
  }, [router])

  return (
    <div className="mb-4 flex flex-col gap-1" data-auto-refresh>
      {everyLabel ? (
        <span className="text-muted-foreground text-xs" data-auto-refresh-every={CYCLE_MS}>
          {everyLabel.replace("{n}", String(Math.round(CYCLE_MS / 1000)))}
        </span>
      ) : null}
      <div
        aria-hidden
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
      >
      <div className="task-refresh-bar h-full w-1/3 rounded-full bg-primary" />
      {/* Движение справа налево, ровно один цикл на обновление. Разметка стилей
          лежит рядом с полосой: это её собственное поведение, а не тема сайта. */}
      <style>{`
        @keyframes task-refresh-slide {
          from { transform: translateX(300%); }
          to { transform: translateX(-100%); }
        }
        .task-refresh-bar {
          animation: task-refresh-slide ${CYCLE_MS}ms linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .task-refresh-bar { animation: none; width: 100%; opacity: 0.3; }
        }
      `}</style>
      </div>
    </div>
  )
}
