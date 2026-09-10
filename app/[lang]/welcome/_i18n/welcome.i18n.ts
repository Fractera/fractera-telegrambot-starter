// СЛОВА СТРАНИЦЫ «ДОБРО ПОЖАЛОВАТЬ» — В СВОЁМ `_i18n`, КАК У `settings`.
//
// 🎯 СЛОВО ВЛАДЕЛЬЦА 2026-09-06: «данные маршруты должны иметь `_components`
// внутри себя, а не импортировать их из внешних источников». То же и со
// словами: раньше они жили константой ВНУТРИ компонента, а компонент — в общей
// папке `components/fractera/`. Теперь всё своё лежит рядом со своим маршрутом.

export type WelcomeUi = {
  title: string
  lead: string
  action: string
  /** Второй режим — вернуться на публичную главную (179-2). */
  home: string
  unavailable: string
}

// 🔒 КНОПКИ НАЗЫВАЮТСЯ ТАК ЖЕ, КАК У ПАМЯТИ, И ЭТО НАМЕРЕННО (179-2, слово
// владельца: «в обоих проектах эта кнопка должна иметь два режима»). Отличается
// только лид — он говорит, что именно за входом. Разные слова на одной кнопке
// двух служб человек читает как два разных продукта.
const DICT: Record<string, WelcomeUi> = {
  en: {
    title: "Sign in to start",
    lead: "This chat with the AI agent is available after you sign in.",
    action: "Sign in or sign up",
    home: "Back to the home page",
    unavailable: "The sign-in service address is not configured yet.",
  },
  ru: {
    title: "Авторизуйтесь, чтобы начать",
    lead: "Чат с ИИ-агентом доступен после входа в проект.",
    action: "Войти или зарегистрироваться",
    home: "Вернуться на главную",
    unavailable: "Адрес службы входа пока не настроен.",
  },
}

/** Слова страницы. Незнакомый язык деградирует до английского, а не до пустоты. */
export function welcomeUi(lang: string): WelcomeUi {
  return DICT[lang] ?? DICT.en
}
