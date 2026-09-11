import { Suspense } from "react";
import { headers } from "next/headers";
import { shellUi } from "./shell.i18n";
import { ThemeToggle } from "./theme-toggle.client";
import { publicMemoryUrl } from "@/lib/fractera/auth-url";

// ПОДВАЛ СЛУЖБЫ — ВЕРХНИЙ БЛОК СО ССЫЛКАМИ И СТРОКА КОПИРАЙТА.
//
// 🎯 РЕШЕНИЕ ВЛАДЕЛЬЦА 2026-09-11: «на двух страницах, которые мы сделали —
// страница чата и страница памяти, — верни второй верхний блок футера для
// страниц архитектора. И разместить там две ссылки, пока только перелинковкой
// друг на друга; больше добавлять ссылок не нужно».
//
// 🪦 ЭТОТ БЛОК СНИМАЛИ 2026-09-06 ЦЕЛИКОМ, И ТОГДА ЭТО БЫЛО ВЕРНО: прежний
// подвал на 481 строку читал `APP-CONFIG` и `PLATFORM-CONFIG` порта 3000 —
// меню групп, соцсети, ссылки в панель. Сотри владелец 3000, и подвал повёл бы
// в никуда. Теперь блок вернулся БЕЗ единого чужого конфига: в нём ровно одна
// ссылка, и её адрес выводится из хоста запроса.
//
// 🔒 ССЫЛКА ОДНА НА СЛУЖБУ, И ЭТО ЧИСЛО, А НЕ НЕДОДЕЛКА. Две службы, по ссылке
// на каждой — это и есть перелинковка, о которой шла речь. Третью сюда
// добавлять нельзя, пока её не назовут: подвал, растущий сам по себе, через
// месяц снова станет меню на 481 строку.
//
// 🛑 АДРЕС СОСЕДА ВЫВОДИТСЯ ИЗ ХОСТА, А НЕ ПИШЕТСЯ КОНСТАНТОЙ. На домене это
// `memory.<апекс>`, на голом IP — соседний порт. Константа увела бы
// человека с его сервера на наш, и он бы этого не заметил.
//
// 🛑 ЗАГОЛОВКИ ЧИТАЮТСЯ ПОД `<Suspense>`: под `cacheComponents` обращение к
// запросу вне границы ожидания роняет пререндер. В этом проекте закон оплачен
// сборкой трижды за один день — здесь он применён заранее.
//
// 🛑 ГОД БЕРЁТСЯ ИЗ `new Date()`, и лечение стоит в `app/[lang]/layout.tsx`:
// адаптер `connection()` перед вызовом. Здесь оно НЕ повторяется — две защиты
// от одной беды означают два места, где её чинят.

export function SiteFooter({ lang }: { lang: string }) {
  const ui = shellUi(lang);

  return (
    <footer className="w-full border-border border-t">
      {/* ВЕРХНИЙ БЛОК: соседние службы одной строкой. */}
      <div className="w-full border-border border-b px-6 py-4 md:px-8">
        <Suspense fallback={<div className="h-5" />}>
          <SiblingLink lang={lang} />
        </Suspense>
      </div>

      <div className="flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4 md:px-8">
        <span className="text-[length:var(--fs-small)] text-muted-foreground">
          © {new Date().getFullYear()} Fractera. {ui.rights}
        </span>
        <ThemeToggle
          labels={{ dark: ui.dark, light: ui.light, system: ui.system }}
        />
      </div>
    </footer>
  );
}

/**
 * Ссылка на соседнюю службу.
 *
 * 🛑 ПУСТОЙ АДРЕС — ЗАКОННЫЙ ИСХОД, И ТОГДА ССЫЛКИ НЕТ ВОВСЕ. Машина без домена
 * и без порта соседа сосчитать его не может; ссылка в никуда хуже её отсутствия.
 */
async function SiblingLink({ lang }: { lang: string }) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const ui = shellUi(lang);
  const href = publicMemoryUrl(host, proto);

  if (!href) return <div className="h-5" />;

  return (
    <nav aria-label="Fractera" className="flex flex-wrap items-center gap-4">
      <a
        className="text-[length:var(--fs-small)] text-muted-foreground hover:text-foreground"
        href={`${href}/${lang}`}
      >
        {ui.memoryService}
      </a>
    </nav>
  );
}
