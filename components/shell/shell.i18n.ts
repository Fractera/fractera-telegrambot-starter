// СЛОВА ШАПКИ И ПОДВАЛА СЛУЖБЫ — СВОИ, А НЕ ЗАИМСТВОВАННЫЕ.
//
// 🔒 СЛОВАРЬ ЗДЕСЬ КРОШЕЧНЫЙ НАМЕРЕННО. В подвале осталась одна строка и три
// подписи к переключателю темы; тянуть ради них словарь чужого подвала значило
// бы вернуть зависимость, ради устранения которой подвал и вычищен.
//
// 🔒 ТЕКСТЫ ВЗЯТЫ ДОСЛОВНО ИЗ ПРЕЖНЕГО `footer-menu.i18n.ts`, а не переписаны
// заново: человек видел эти слова вчера, и менять их заодно с раскладкой значит
// смешивать две правки в одной.

export type ShellUi = {
  rights: string;
  system: string;
  light: string;
  dark: string;
};

const UI: Record<string, ShellUi> = {
  en: {
    dark: "Theme: dark",
    light: "Theme: light",
    rights: "All rights reserved.",
    system: "Theme: system",
  },
  es: {
    dark: "Tema: oscuro",
    light: "Tema: claro",
    rights: "Todos los derechos reservados.",
    system: "Tema: sistema",
  },
  ru: {
    dark: "Тема: тёмная",
    light: "Тема: светлая",
    rights: "Все права защищены.",
    system: "Тема: системная",
  },
};

/** Слова слоя. Незнакомый язык деградирует до английского, а не до пустоты. */
export function shellUi(lang: string): ShellUi {
  return UI[lang] ?? UI.en;
}
