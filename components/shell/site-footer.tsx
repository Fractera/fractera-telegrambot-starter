import { shellUi } from "./shell.i18n";
import { ThemeToggle } from "./theme-toggle.client";

// ПОДВАЛ СЛУЖБЫ — СТРОКА КОПИРАЙТА И ПЕРЕКЛЮЧАТЕЛЬ ТЕМЫ. ВСЁ.
//
// 🎯 РЕШЕНИЕ ВЛАДЕЛЬЦА 2026-09-06, ДОСЛОВНО: «убирай из футера всё… внизу
// остаются у футера название Fractera — хардкод и иконки для работы с темой день
// или ночь или системная… значит от футера у нас остаётся только надпись год —
// Fractera, все права защищены».
//
// 🔒 ПОЧЕМУ ЭТО НЕ ОБЕДНЕНИЕ, А ОТВЯЗКА. Прежний подвал (481 строка) читал
// `APP-CONFIG` и `PLATFORM-CONFIG` порта 3000: меню групп, соцсети, ссылки в
// панель и слой архитектора, куки-баннер, переключатель языка, кнопка аккаунта,
// ширина приложения. Всё это — чужие настройки; сотри владелец порт 3000, и
// подвал показал бы пустоту или повёл в никуда. Слово владельца того же дня:
// «никакие другие импорты из слоя 3000 нам не нужны».
//
// 🔒 ИМЯ «Fractera» ЗАХАРДКОЖЕНО ПО ЕГО ПРЯМОМУ СЛОВУ. Прежде оно бралось из
// `cfg.short_name` — имени чужого приложения.
//
// 🛑 ГОД БЕРЁТСЯ ИЗ `new Date()`, И ПОД `cacheComponents` ЭТО ОТКАЗ СБОРКИ:
// «used `new Date()` before accessing either uncached data or Request data».
// Измерено сборкой, а не предположено. Лечение стоит в `app/[lang]/layout.tsx` —
// адаптер `connection()` перед вызовом; здесь оно НЕ повторяется, потому что
// вторая защита от той же беды означала бы два места, где её чинят.
//
// 🪦 УДАЛЕНЫ ВМЕСТЕ С ПРЕЖНИМ ПОДВАЛОМ И ВОССТАНАВЛИВАЮТСЯ ИЗ GIT:
// `footer-menu.server.tsx`, `footer-menu.i18n.ts`, `admin-link.client.tsx`,
// `app-width-toggle.client.tsx`, `cookie-settings-button.*`,
// `footer-social-dropdown.client.tsx`.

export function SiteFooter({ lang }: { lang: string }) {
  const ui = shellUi(lang);

  return (
    <footer className="w-full border-border border-t">
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
