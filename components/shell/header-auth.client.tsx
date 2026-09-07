"use client"

import Link from "next/link"

import { useEffect, useState } from "react"
import { LogIn, LogOut, User } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

// ШАПКА: НАВИГАЦИЯ СЛЕВА, АККАУНТ СПРАВА — ЗЕРКАЛО ПОРТА 3000 (156-2).
//
// 🎯 СЛОВА ВЛАДЕЛЬЦА 2026-09-07: «в правом верхнем углу должна была быть кнопка
// которая называется аккаунт, нажатие приводит к открытию выпадающего меню, в
// котором указан e-mail пользователя, его роль и кнопка выйти. А если бы я вышел
// — кнопка войти. А кнопка настройки вообще не должна быть видна пока я не
// авторизован; когда буду авторизован — должна появиться слева».
//
// 🔒 ОДИН ОСТРОВОК НА ОБА КРАЯ ШАПКИ, А НЕ ДВА. Оба ответа — «показывать ли
// настройки» и «кто вошёл» — приходят из ОДНОГО вопроса `/api/me`. Два островка
// спросили бы одно и то же дважды и однажды разошлись бы: слева уже вошёл, справа
// ещё гость.
//
// 🔒 ЯЩИК ВЗЯТ У 3000 ФОРМОЙ: `Sheet` поверх Radix, кнопка `Button variant=ghost`
// с иконкой `User`, снизу — строка личности и выход. Своей вёрстки выпадающего
// меню здесь нет: вторая реализация того же расходится с первой на первой правке.
//
// 🔒 `prefetch={false}` НА ОБОИХ АДРЕСАХ АВТОРИЗАЦИИ — оплачено на 3000 ошибками
// CORS в консоли на КАЖДОЙ странице: Next заранее тянет ссылки, а `/login` и
// `/logout` уводят на другой домен.
//
// 🛑 СПРЯТАННЫЙ ПУНКТ — ВЕЖЛИВОСТЬ, А НЕ ЗАЩИТА. Настоящий замок стоит в
// привратнике и на самой странице; здесь мы лишь не показываем заведомо закрытую
// дверь. Путать эти две вещи нельзя никогда.

type Me = { userId?: string; email?: string; roles?: string[] } | null

export function HeaderAuth({ lang, settingsLabel }: { lang: string; settingsLabel: string }) {
  const [me, setMe] = useState<Me>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    fetch("/api/me", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (alive) setMe(d?.userId ? d : null)
      })
      .catch(() => {
        if (alive) setMe(null)
      })
    return () => {
      alive = false
    }
  }, [])

  const signedIn = Boolean(me?.userId)
  const roles = me?.roles ?? []

  return (
    <>
      {/* Слева — навигация, и только вошедшему. До входа страница за замком, и
          кнопка вела бы на переадресацию: обещание двери, которая не откроется. */}
      {signedIn && (
        <Link
          className="ml-4 shrink-0 rounded-md px-3 py-1.5 text-[length:var(--fs-small)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          data-header-settings
          href={`/${lang}/settings`}
        >
          {settingsLabel}
        </Link>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2" data-header-auth={signedIn ? "in" : "out"}>
        {signedIn ? (
          <>
            <Button aria-label="Аккаунт" onClick={() => setOpen(true)} size="sm" title="Аккаунт" variant="ghost">
              <User />
              <span className="hidden sm:inline">Аккаунт</span>
            </Button>

            <Sheet onOpenChange={setOpen} open={open}>
              <SheetContent className="flex w-80 flex-col gap-0 p-0 sm:max-w-sm" side="right">
                <SheetHeader className="border-border border-b">
                  <SheetTitle>Аккаунт</SheetTitle>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-4">
                  <p className="text-muted-foreground text-[length:var(--fs-small)]">Почта</p>
                  <p className="mt-0.5 truncate text-foreground text-sm" data-account-email>
                    {me?.email}
                  </p>

                  <Separator className="my-4" />

                  {/* 🔒 РОЛИ ПЕРЕЧИСЛЯЮТСЯ ВСЕ, А НЕ ОДНА ГЛАВНАЯ. Человек бывает
                      сразу в нескольких, и от этого зависит, что ему откроется;
                      показав одну, мы ответили бы на другой вопрос. */}
                  <p className="text-muted-foreground text-[length:var(--fs-small)]">Роли</p>
                  <ul className="mt-1 flex flex-wrap gap-1" data-account-roles>
                    {roles.length > 0 ? (
                      roles.map(r => (
                        <li
                          className="rounded-full border border-border px-2 py-0.5 text-[12px] leading-tight text-muted-foreground"
                          key={r}
                        >
                          {r}
                        </li>
                      ))
                    ) : (
                      <li className="text-muted-foreground text-sm">ролей нет</li>
                    )}
                  </ul>
                </div>

                <div className="mt-auto border-border border-t p-3">
                  {/* 🛑 ОБЫЧНАЯ ССЫЛКА, А НЕ <Link>, И ЭТО НЕ СТИЛЬ — ЭТО
                      ЕДИНСТВЕННЫЙ СПОСОБ ВЫЙТИ. ✗ Оплачено 2026-09-07: выход не
                      работал вовсе. `<Link>` делает КЛИЕНТСКИЙ запрос, цепочка
                      уводит на `auth.aifa.dev` — другой источник, — и браузер не
                      применяет `Set-Cookie` из такого ответа. Служба чистила
                      куку исправно (измерено: `session-token=; Max-Age=0`), а до
                      браузера это не доезжало: человек нажимал «Выйти» и
                      оставался внутри.
                      🔒 `<a>` даёт НАСТОЯЩУЮ навигацию: браузер идёт по всей
                      цепочке 307 → 307 → 200 и применяет все заголовки по пути.
                      Это же снимает нужду в `prefetch={false}`: обычная ссылка
                      ничего не предзагружает. */}
                  <a
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-full justify-start")}
                    href={`/logout?lang=${lang}`}
                  >
                    <LogOut />
                    Выйти
                  </a>
                </div>
              </SheetContent>
            </Sheet>
          </>
        ) : (
          /* 🔒 ВХОД — ТОЖЕ ОБЫЧНАЯ ССЫЛКА, ПО ТОЙ ЖЕ ПРИЧИНЕ. Он уводит на тот
             же чужой источник, и кука сессии ставится ИМ. Клиентский переход
             сломал бы вход ровно так же, как ломал выход, — просто это
             обнаружилось бы позже. */
          <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={`/login?lang=${lang}`}>
            <LogIn />
            Войти
          </a>
        )}
      </div>
    </>
  )
}
