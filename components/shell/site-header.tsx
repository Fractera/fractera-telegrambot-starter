import Link from "next/link"
import { shellUi } from "./shell.i18n";

// ШАПКА СЛУЖБЫ — ОДНА КНОПКА СЛЕВА, И БОЛЬШЕ НИЧЕГО.
//
// 🎯 РЕШЕНИЕ ВЛАДЕЛЬЦА 2026-09-06, ДОСЛОВНО: «хедер убираем кнопку войти и
// оставляем только слева кнопку Fractera».
//
// 🔒 ИМЯ ЗАХАРДКОЖЕНО, И ЭТО НЕ ЛЕНЬ. Прежняя шапка брала его из `APP-CONFIG`
// порта 3000 (`cfg.short_name`, `cfg.logo`) — то есть служба показывала имя
// ЧУЖОГО приложения и пропадала бы вместе с ним. Слово владельца того же дня:
// «никакие другие импорты из слоя 3000 нам не нужны».
//
// 🔒 КНОПКИ ВХОДА ЗДЕСЬ НЕТ ПО УСТРОЙСТВУ, А НЕ ПО НАСТРОЙКЕ. Своего входа у
// службы не существует: страницы закрыты ролями, проверка идёт в службу `:3001`,
// и человек попадает сюда уже вошедшим. Кнопка «войти» на закрытой странице
// обещает выбор, которого нет.
//
// 🪦 ЗДЕСЬ БЫЛ `TopMenu` (115 строк): меню из `APP-CONFIG`, ящики по бокам,
// кнопка аккаунта, корзина, мобильное меню, выключатель `featureOn("topMenu")`.
// Удалён 2026-09-06, восстанавливается из git.

// 🔒 КНОПКА НАВИГАЦИИ СПРАВА, А ИМЯ СЛЕВА (2026-09-06, слово владельца: «в
// верхнем меню сделай кнопку навигации, которая открывает страницу settings»).
// Место у неё то же, к которому человек привык на любом сайте; переносить её к
// имени значило бы ломать привычку ради симметрии.
// 🔒 ОБЫЧНАЯ ССЫЛКА, А НЕ ОСТРОВОК: она никуда не ведёт, кроме адреса, и
// работает без единой строки JavaScript. Клиентский компонент ради перехода —
// это отказ навигации у того, у кого скрипты не выполнились.
export function SiteHeader({ lang }: { lang: string }) {
  const ui = shellUi(lang)

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="flex h-14 w-full items-center px-6 md:px-8">
        <Link
          className="shrink-0 font-semibold text-foreground text-sm tracking-tight transition-opacity hover:opacity-80"
          href={`/${lang}`}
        >
          Fractera
        </Link>

        <Link
          className="ml-auto shrink-0 rounded-md px-3 py-1.5 text-[length:var(--fs-small)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          data-header-settings
          href={`/${lang}/settings`}
        >
          {ui.settings}
        </Link>
      </div>
    </header>
  );
}
