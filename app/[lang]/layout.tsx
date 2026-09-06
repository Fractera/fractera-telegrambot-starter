import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";
import { DrawerMenu } from "@/components/menu/drawer/drawer-menu.server";
import { FooterMenu } from "@/components/menu/footer/footer-menu.server";
import { TopMenu } from "@/components/menu/top/top-menu.server";
import { buildDesignCss } from "@/lib/design-css";
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

  // ✗ ДИЗАЙН-СИСТЕМА НЕ БЫЛА ПОДКЛЮЧЕНА, И ЭТО НАШЁЛ ВЛАДЕЛЕЦ (137-7,
  // 2026-09-06): «я смотрю, что ты не стал дизайн подключать к дизайн-системе?».
  // ✗ В 137-1 я записал шкалу размеров в `globals.css` ЗНАЧЕНИЯМИ и объявил, что
  // «слоя дизайна здесь нет». Это было неверно: слой дизайна живёт не в панели,
  // а В САМОМ ПРОЕКТЕ на 3000 — `/{lang}/architect/design`, хранилище
  // `DESIGN-CONFIG`, четвёртый конфиг слота (шаг 41). Значит подключается он тем
  // же приёмом, что `APP-CONFIG` и `PLATFORM-CONFIG`: путём в окружении
  // (`DESIGN_CONFIG_PATH`) — способность существовала, я её не изобретал.
  //
  // 🔒 ЧТО ЭТО ДАЁТ: шрифты, шкала текста, формы и обе палитры владельца
  // приезжают сюда БЕЗ ПЕРЕСБОРКИ, ровно как на сайт. Правка на экране дизайна
  // видна здесь на следующей загрузке.
  //
  // 🛑 ПУСТОЙ КОНФИГ — ЗАКОННЫЙ ИСХОД: `buildDesignCss()` возвращает пустую
  // строку, `<style>` не печатается, и действуют значения из `globals.css`.
  // Ровно это и происходит, если проект на 3000 удалён целиком.
  const { css: designCss, fontLinks: designFontLinks } = buildDesignCss();

  return (
    <DrawerProvider>
      {/* 🔒 СТИЛЬ ПЕЧАТАЕТСЯ ВНУТРИ СЕГМЕНТА, А НЕ В `<head>`. На 3000 это
          корневая раскладка и место в голове документа; здесь корень чужой —
          общий для чата, — и трогать его ради одной страницы значило бы менять
          вид всей службы. Переменные каскадом действуют одинаково. */}
      {designCss.length > 0 ? (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: тот же приём, что в раскладке стартера — CSS печатается строкой
        <style dangerouslySetInnerHTML={{ __html: designCss }} />
      ) : null}
      {designFontLinks.map((href) => (
        <link href={href} key={href} rel="stylesheet" />
      ))}

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
