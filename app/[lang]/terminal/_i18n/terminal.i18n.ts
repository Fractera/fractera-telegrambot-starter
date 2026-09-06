// СЛОВА СТРАНИЦЫ ТЕРМИНАЛА — В СВОЁМ `_i18n`, КАК У `settings`.
//
// 🎯 СЛОВО ВЛАДЕЛЬЦА 2026-09-06: маршрут держит своё внутри себя, а не тянет из
// общих папок.

export type TerminalUi = {
  /** Надзаголовок — тот же слой, что у настроек: человек не переходит в другой продукт. */
  layer: string
  title: string
  lead: string
}

const DICT: Record<string, TerminalUi> = {
  en: {
    layer: "Architect layer",
    title: "Agent terminal",
    lead: "A live console of the server this project runs on. The agent session lives here — it is attached, not started anew.",
  },
  ru: {
    layer: "Слой архитектора",
    title: "Терминал агента",
    lead: "Живая консоль сервера, на котором работает проект. Здесь же живёт сессия агента — к ней подключаются, а не запускают заново.",
  },
}

/** Слова страницы. Незнакомый язык деградирует до английского, а не до пустоты. */
export function terminalUi(lang: string): TerminalUi {
  return DICT[lang] ?? DICT.en
}
