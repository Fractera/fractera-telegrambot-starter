import { Suspense } from "react";
import { headers } from "next/headers";
import { Breadcrumbs, type Crumb } from "./breadcrumbs.server";
import { publicSiteUrl } from "@/lib/fractera/auth-url";

// КРОШКИ, ЗНАЮЩИЕ РЕАЛЬНЫЙ ДОМЕН (2026-09-11).
//
// 🔒 ЗАЧЕМ ОТДЕЛЬНЫЙ КОМПОНЕНТ, А НЕ ТРИ СТРОКИ В КАЖДОЙ СТРАНИЦЕ. Первая
// крошка ведёт в корень БЕЗ субдомена, а он выводится из хоста запроса. Значит
// каждая страница обязана читать заголовки — и каждая обязана делать это под
// `<Suspense>`.
//
// ✗ ОПЛАЧЕНО СБОРКОЙ В ТОТ ЖЕ ЧАС, И ДВАЖДЫ — У ПАМЯТИ И У ЧАТА. Я прочитал
// заголовки в теле страницы, как это делает соседний экран настроек, и сборка
// упала: «Error occurred prerendering page /en/terminal». Разница в том, что у
// настроек всё тело уже живёт под `<Suspense>`, а у терминала — нет. Приём,
// скопированный с соседа, приносит с собой и условие, при котором сосед его
// применяет; условие невидимо, пока не упадёт сборка.
//
// 🔒 ЗАПАСНОЙ ПУТЬ — МЕСТО ПОД КРОШКИ, А НЕ ПУСТОТА. Пока заголовки читаются,
// на их месте стоит полоса той же высоты: строка, появляющаяся рывком, двигает
// весь заголовок страницы.

export function PageCrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <Suspense fallback={<div className="h-4" />}>
      <CrumbsWithHost trail={trail} />
    </Suspense>
  );
}

async function CrumbsWithHost({ trail }: { trail: Crumb[] }) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return <Breadcrumbs rootHref={publicSiteUrl(host, proto)} trail={trail} />;
}
