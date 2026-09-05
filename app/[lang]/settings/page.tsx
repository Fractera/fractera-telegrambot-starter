import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { fracteraRoles } from "@/lib/fractera/session";
import { TelegramAbout } from "./_components/telegram-about";
import { telegramUi } from "./_i18n/telegram.i18n";
import {
  hrefOfTelegramSection,
  resolveTelegramSection,
  TELEGRAM_SECTIONS,
} from "./_lib/telegram-sections";

// СТРАНИЦА БОТА ПЕРЕЕХАЛА СЮДА С ПОРТА 3000 (шаг 137, 2026-09-05).
//
// 🎯 ЦЕЛЬ ВЛАДЕЛЬЦА, ДОСЛОВНО: «если пользователь, которому не нужен сайт,
// придёт только на чат-бот, то ему будет достаточно всей информации». Работа
// бота изолируется на 3600 целиком; сайт на 3000 отдаёт сюда ссылку в подвале
// и переадресацию со старого адреса.
//
// 🔒 СЕГМЕНТ `[lang]` ЗАВЕДЁН ТОЛЬКО ДЛЯ ЭТОЙ СТРАНИЦЫ, И ЭТО НЕ ПРОТИВОРЕЧИТ
// ЗАКОНУ ЧАТА. `lib/fractera/i18n.ts` говорит: у чата нет сегмента языка, язык
// берётся из заголовка браузера — потому что у шаблона включён
// `cacheComponents`, и обращение к заголовкам В КОРНЕВОЙ РАСКЛАДКЕ делает
// динамическими все страницы разом. Здесь язык приходит ПАРАМЕТРОМ МАРШРУТА:
// корневая раскладка не тронута, остальные страницы остаются какими были.
// Адрес назван владельцем: `chat.<домен>/ru/settings`.
//
// 🔒 НАБОР ЯЗЫКОВ ЗАКРЫТ ПРОВЕРКОЙ В КОДЕ, А НЕ `dynamicParams`. ✗ измерено
// сборкой: `export const dynamicParams = false` несовместим с `cacheComponents`
// шаблона — «Route segment config "dynamicParams" is not compatible with
// nextConfig.cacheComponents». Тот же класс запрета, что у `runtime` и
// `dynamic` в дверях `api/fractera/*`, и причина одна.
// Поэтому неизвестный язык отсекает `notFound()` ниже: `/xx/settings` обязан
// дать 404, а не молча показать английский — иначе человек решит, что его язык
// поддержан.

const LANGS = ["en", "ru"] as const;

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

// ✗ ЗАМОК ЖИВЁТ ПОД `<Suspense>`, И ЭТО ОПЛАЧЕНО СБОРКОЙ, А НЕ ВЫВЕДЕНО.
// Первая версия спрашивала роли прямо в теле страницы, и сборка упала:
// «Uncached data was accessed outside of <Suspense>. This delays the entire
// page from rendering». Тот же приём и по той же причине стоит в
// `app/terminal/page.tsx` и в раскладке чата — здесь он повторён, а не
// изобретён заново.
export default function BotSettingsPage(props: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <BotSettingsGate {...props} />
    </Suspense>
  );
}

async function BotSettingsGate({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { lang } = await params;
  if (!(LANGS as readonly string[]).includes(lang)) {
    notFound();
  }

  // 🔒 ЗАМОК ТОТ ЖЕ, ЧТО У ОСТАЛЬНЫХ ДВЕРЕЙ ЧАТА: страница показывает состояние
  // бота владельца, а не публичный текст. Роль спрашивается у единственной
  // службы входа, как везде в этом репозитории.
  const roles = await fracteraRoles();
  if (!roles.includes("architect")) {
    notFound();
  }

  const { section: rawSection } = await searchParams;
  const active = resolveTelegramSection(rawSection);
  const ui = telegramUi(lang);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-6 flex flex-col gap-1">
          <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
            {ui.menuTitle}
          </span>
          <h1 className="font-semibold text-2xl text-foreground">{ui.title}</h1>
          <p className="text-[13px] text-muted-foreground">{ui.subtitle}</p>
        </header>

        {/* 🔒 РАЗДЕЛЫ — ССЫЛКАМИ, А НЕ ОСТРОВКОМ С СОСТОЯНИЕМ. Страница обязана
            читаться без JS: её открывает человек, который пришёл узнать, что
            умеет его бот, и половина таких приходит с телефона по слабой связи.
            Адрес раздела строит `hrefOfTelegramSection` — тот же файл, что и на
            3000, перенесён без правок кроме самого адреса. */}
        <nav className="mb-6 flex flex-wrap gap-2 border-border border-b pb-3">
          {TELEGRAM_SECTIONS.map((id) => (
            <Link
              className={
                id === active
                  ? "rounded-full bg-primary px-3 py-1.5 font-medium text-[13px] text-primary-foreground"
                  : "rounded-full px-3 py-1.5 text-[13px] text-muted-foreground transition hover:bg-muted"
              }
              href={hrefOfTelegramSection(lang, id)}
              key={id}
            >
              {ui.pages[id].title}
            </Link>
          ))}
        </nav>

        <section className="flex flex-col gap-3">
          <h2 className="font-medium text-[15px] text-foreground">
            {ui.pages[active].title}
          </h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {ui.pages[active].hint}
          </p>

          {active === "about" ? <TelegramAbout ui={ui} /> : null}

          {/* 🛑 ТРИ РАЗДЕЛА ЕЩЁ НЕ ПЕРЕЕХАЛИ, И ЭТО СКАЗАНО СЛОВАМИ, А НЕ
              ПУСТЫМ ЭКРАНОМ. «Логи» и «Настройки» ходят в службу каналов
              `:3500`, «Паспорт» читает файл проекта — это волны 2 и 3 шага 137.
              Пустой раздел без объяснения читается как поломка. */}
          {active === "about" ? null : (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300">
              Этот раздел ещё переезжает сюда с сайта проекта. Пока он доступен
              там же, где был раньше.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
