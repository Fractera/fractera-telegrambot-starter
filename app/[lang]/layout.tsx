import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";
import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { buildDesignCss } from "@/lib/design-css";

// РАСКЛАДКА ЯЗЫКОВОГО СЕГМЕНТА СЛУЖБЫ БОТА (137-3, 2026-09-06).
//
// 🎯 ЗАКАЗ ВЛАДЕЛЬЦА 2026-09-06, ДОСЛОВНО: «никакие другие импорты из слоя 3000
// нам не нужны… от футера у нас остаётся только надпись год — Fractera, все права
// защищены… хедер убираем кнопку войти и оставляем только слева кнопку Fractera».
//
// 🪦 ОТМЕНЯЕТ ЗАКАЗ ТОГО ЖЕ ВЛАДЕЛЬЦА ОТ 137-3: «add header and footer 1:1 as in
// port 3000». Тогда шапку и подвал перенесли из стартера побайтно, и вместе с
// видом приехал ИСТОЧНИК — `APP-CONFIG` и `PLATFORM-CONFIG` чужого проекта.
// Теперь у службы своя оболочка: `components/shell/`, ноль чужих конфигов.
// Прежние `TopMenu`, `FooterMenu`, `DrawerMenu` удалены, восстанавливаются из git.

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
  return <SiteFooter lang={lang} />;
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
    <>
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
        <SiteHeader lang={lang} />
        {children}
        {/* Подвал ждёт запроса из-за года копирайта — см. адаптер выше.
            Заглушка держит высоту, чтобы страница не прыгала при подстановке. */}
        <Suspense fallback={<div className="min-h-[200px]" />}>
          <FooterAtRequestTime lang={lang} />
        </Suspense>
        {/* 🪦 ЗДЕСЬ БЫЛА ПАРА ВЫДВИЖНЫХ ПАНЕЛЕЙ `DrawerMenu` — УДАЛЕНЫ 2026-09-06.
            Они рисовались группами меню из `APP-CONFIG` порта 3000: у службы своих
            групп нет и не будет, значит панели были пустыми всегда, а зависимость
            от чужого конфига — настоящей. Восстанавливаются из git. */}
      </div>
    </>
  );
}
