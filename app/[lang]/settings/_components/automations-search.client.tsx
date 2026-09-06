"use client"

import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import type { FormEvent } from "react"

// ПОИСК ПО ТАБЛИЦЕ — ЕДИНСТВЕННОЕ МЕСТО ОТБОРА, КОТОРОЕ ПРИШЛОСЬ СДЕЛАТЬ
// ОСТРОВКОМ, И ПРИЧИНА НАЗВАНА.
//
// 🎯 ЖАЛОБА ВЛАДЕЛЬЦА 2026-09-06: «каждый раз, когда я нажимаю на какой-то
// фильтр, моя страница прыгает, меня отбрасывает вверх, и мне приходится
// прокручивать вниз».
//
// 🔒 У ССЫЛОК ЛЕЧЕНИЕ ПРОСТОЕ — `scroll={false}` у `Link`. У ФОРМЫ ЕГО НЕТ:
// обычная `<form method="get">` — это полная навигация браузера, и он отматывает
// к началу всегда. Никакого атрибута «не отматывай» у формы не существует.
// Поэтому здесь перехват отправки и переход тем же способом, что у ссылок.
//
// 🔒 АДРЕС СОБИРАЕТСЯ ИЗ ПОЛЕЙ САМОЙ ФОРМЫ, А НЕ ВТОРОЙ КОПИЕЙ ПРАВИЛ. Скрытые
// поля с остальным отбором ставит сервер; здесь мы их только читаем. Собери я
// адрес заново по своим правилам — получилась бы вторая правда о том, как
// выглядит запрос, и она разошлась бы с серверной на первом же новом фильтре.
//
// 🛑 БЕЗ JAVASCRIPT ФОРМА ВСЁ РАВНО РАБОТАЕТ: `action` и `method="get"` остались
// на месте, перехват лишь заменяет переход. Отняв их, мы сделали бы поиск
// недоступным тому, у кого скрипт не выполнился.

export function AutomationsSearch({
  action,
  defaultValue,
  hidden,
  placeholder,
  submitLabel,
  submitClassName,
}: {
  action: string
  defaultValue: string
  /** Остальной отбор, как его видит сервер: имя поля → значение. */
  hidden: Record<string, string>
  placeholder: string
  submitLabel: string
  submitClassName: string
}) {
  const router = useRouter()

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const p = new URLSearchParams()
    for (const [k, v] of data.entries()) {
      const value = String(v)
      // Пустой поиск не пишется в адрес: `?q=` — это шум в ссылке, которой
      // человек делится, и лишний параметр в закладке.
      if (value) {
        p.set(k, value)
      }
    }
    router.push(`${action}?${p.toString()}`, { scroll: false })
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2" method="get" onSubmit={onSubmit}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}

      <div className="relative min-w-[16rem] flex-1">
        <Search
          aria-hidden
          className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground"
        />
        <input
          className="h-9 w-full rounded-md border border-border bg-background pr-3 pl-8 text-[length:var(--fs-small)] text-foreground placeholder:text-muted-foreground"
          data-automations-search
          defaultValue={defaultValue}
          name="q"
          placeholder={placeholder}
          type="search"
        />
      </div>

      <button className={submitClassName} type="submit">
        {submitLabel}
      </button>
    </form>
  )
}
