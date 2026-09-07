"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

// КНОПКА ВХОДА И ВЫХОДА — ЗЕРКАЛО ОСТРОВКА С ПОРТА 3000 (156-1).
//
// 🔒 СКОПИРОВАНО ПОВЕДЕНИЕ, А НЕ ПРИДУМАНО СВОЁ. Слово владельца 2026-09-07:
// «используй полную зеркальную копию того, что существует на странице порт 3000».
// Там островок читает `/api/me`, гостю показывает вход, вошедшему — выход, а сами
// адреса `/login` и `/logout` относительные: их перехватывает привратник и уводит
// в единственную службу входа.
//
// 🔒 `prefetch={false}` ОБЯЗАТЕЛЕН, И ЭТО ОПЛАЧЕНО НА 3000 (найдено владельцем в
// консоли 2026-08-13). Next заранее тянет страницы по видимым ссылкам, а `/login`
// уводит на ДРУГОЙ домен — слой авторизации. Браузер видит запрос через границу
// источника, не находит разрешающего заголовка и пишет ошибку CORS на КАЖДОЙ
// странице. Посетитель при этом не страдает, но в отчёте проверки это «ошибки в
// консоли» — первое, что видит владелец, открыв свой сайт инструментом.
//
// 🔒 ДО ГИДРАТАЦИИ ПОКАЗЫВАЕТСЯ ВХОД. Посетитель без JavaScript тоже получает
// точку входа; пустое место на её месте читалось бы как «войти некуда».

type Me = { userId?: string; email?: string; roles?: string[] } | null

export function AccountButton({ lang }: { lang: string }) {
  const [me, setMe] = useState<Me>(null)

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

  if (me?.userId) {
    return (
      <div data-account-state="signed-in" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span>Вы вошли: {me.email}</span>
        {/* 🔒 РОЛИ НАЗЫВАЮТСЯ ВСЛУХ: без роли `architect` разделы не откроются, и
            человек должен видеть ПОЧЕМУ, а не упираться в пустоту. */}
        <span data-account-roles>Роли: {(me.roles ?? []).join(", ") || "нет"}</span>
        <Link href={`/logout?lang=${lang}`} prefetch={false}>
          Выйти
        </Link>
      </div>
    )
  }

  return (
    <div data-account-state="guest" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span>Вы не вошли. Разделы проекта откроются после входа.</span>
      <Link href={`/login?lang=${lang}`} prefetch={false}>
        Войти
      </Link>
    </div>
  )
}
