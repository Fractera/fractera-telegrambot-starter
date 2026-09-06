import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";
import { DrawerMenu } from "@/components/menu/drawer/drawer-menu.server";
import { FooterMenu } from "@/components/menu/footer/footer-menu.server";
import { TopMenu } from "@/components/menu/top/top-menu.server";
import { DrawerProvider } from "@/providers/drawer-provider.client";

// РАСКЛАДКА ЯЗЫКОВОГО СЕГМЕНТА СЛУЖБЫ БОТА (137-3, 2026-09-06).
//
// 🎯 ЗАКАЗ ВЛАДЕЛЬЦА, ДОСЛОВНО: «add header and footer 1:1 as in port 3000 /
// Страницы должно быть выглядеть одинаково, ты подключаешь те же самые
// компоненты, но естественно layout ты создаёшь свой».
//
// 🔒 КОМПОНЕНТЫ ТЕ ЖЕ, РАСКЛАДКА СВОЯ — И РАЗНИЦА МЕХАНИЧЕСКАЯ. `TopMenu`,
// `FooterMenu`, `DrawerMenu` перенесены из стартера ПОБАЙТНО и здесь только
// зовутся. А раскладка стартера — КОРНЕВАЯ: она печатает `<html>`, `<head>`,
// `<body>`, шрифты, дизайн-CSS, JSON-LD, аналитику. Скопировать её сюда
// нельзя — корень у чата уже есть, со своим `ThemeProvider`, `SessionProvider`
// и `TooltipProvider`. Поэтому здесь ровно то, что даёт вид страницы: ящик,
// шапка, содержимое, подвал.
//
// 🔒 `min-h-screen flex flex-col` СТОИТ ЗДЕСЬ, ПОТОМУ ЧТО В КОРНЕ ЧАТА ЕГО НЕТ.
// В стартере эти классы висят на `<body>`; без них подвал прижимается к тексту,
// а не к низу экрана, и страница «выглядит одинаково» перестаёт быть правдой на
// коротком содержимом.
//
// 🛑 ЧЕГО ЗДЕСЬ НЕТ И ЭТО НАЗВАНО: куки-баннера, PWA-подсказки, заставок iOS,
// индикатора ширины и разметки для поисковика. Всё это принадлежит ПУБЛИЧНОМУ
// сайту на 3000; служба бота стоит за замком, её никто не индексирует и на
// домашний экран не ставит. Приедет тогда, когда для этого будет причина.

// ✗ ПОДВАЛ ПЕЧАТАЕТ ГОД КОПИРАЙТА, И ПОД `cacheComponents` ЭТО ОТКАЗ СБОРКИ:
// «used `new Date()` before accessing either uncached data or Request data».
// Измерено сборкой, а не предположено — `BUILD_RC=1`, страница `/en/settings`.
//
// 🔒 ЛЕЧЕНИЕ — АДАПТЕР ЗДЕСЬ, А НЕ ПРАВКА ПЕРЕНЕСЁННОГО ФАЙЛА. `connection()`
// объявляет: дальше идёт то, что зависит от запроса, — и время становится
// законным. Правь я `footer-menu.server.tsx`, он перестал бы быть побайтной
// копией, а `diff` с источником — единственный прибор, которым видно, что
// зеркало не разошлось. Тот же довод, по которому эти файлы исключены из
// линтера.
async function FooterAtRequestTime({ lang }: { lang: string }) {
  await connection();
  return <FooterMenu lang={lang} />;
}

export default async function BotLangLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  return (
    <DrawerProvider>
      <div className="flex min-h-screen flex-col">
        <TopMenu lang={lang} />
        {children}
        {/* Подвал ждёт запроса из-за года копирайта — см. адаптер выше.
            Заглушка держит высоту, чтобы страница не прыгала при подстановке. */}
        <Suspense fallback={<div className="min-h-[200px]" />}>
          <FooterAtRequestTime lang={lang} />
        </Suspense>
        {/* Выдвижные панели слева и справа — та же пара, что на 3000: каждая
            не рисует ничего, пока её сторону не включит группа меню. */}
        <DrawerMenu lang={lang} side="left" />
        <DrawerMenu lang={lang} side="right" />
      </div>
    </DrawerProvider>
  );
}
