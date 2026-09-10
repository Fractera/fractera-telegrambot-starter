// СЛОВА СТРАНИЦЫ «ПОДПИСКА CLAUDE» ЧАТА — В СВОЁМ `_i18n` (181-2).
//
// 🔒 СТРАНИЦА — КОПИЯ СТРАНИЦЫ ВХОДА ПАМЯТИ, А СЛОВА СВОИ: у службы свои файлы в
// своём дереве (закон 137), и надзаголовок называет слой этой службы.

export type TerminalUi = {
  /** Надзаголовок — тот же слой, что у настроек: человек не переходит в другой продукт. */
  layer: string
  title: string
  lead: string
}

const DICT: Record<string, TerminalUi> = {
  en: {
    layer: "Architect layer",
    title: "Claude subscription",
    lead: "Sign in to your Claude subscription for this whole server — the bot and the memory both think with it. One sign-in is enough for both.",
  },
  ru: {
    layer: "Слой архитектора",
    title: "Подписка Claude",
    lead: "Вход в подписку Claude для всего сервера — ей думают и бот, и память. Одного входа достаточно для обоих.",
  },
}

/** Слова страницы. Незнакомый язык деградирует до английского, а не до пустоты. */
export function terminalUi(lang: string): TerminalUi {
  return DICT[lang] ?? DICT.en
}
