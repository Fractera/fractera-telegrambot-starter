// СЛОВА СТРАНИЦЫ АВТОМАТИЗАЦИИ — В СВОЁМ `_i18n`, как у соседних маршрутов.

export type AutomationUi = {
  layer: string
  title: string
  lead: string
  /** Подпись дополнительного атрибута — имени из имени файла. */
  nameLabel: string
  atLabel: string
  stepsLabel: string
  fileLabel: string
  notFound: string
  demo: string
}

const DICT: Record<string, AutomationUi> = {
  en: {
    atLabel: "Started",
    demo: "Demo record. Real chains will come from the logs at the next step — nothing here is measured yet.",
    fileLabel: "File",
    layer: "Architect layer",
    lead: "One automation is one connected chain of requests. This page is its own address: everything known about the chain lives here.",
    nameLabel: "Name",
    notFound: "There is no automation with this address.",
    stepsLabel: "Messages in the chain",
    title: "Automation",
  },
  ru: {
    atLabel: "Начата",
    demo: "Выдуманная запись. Настоящие цепочки придут из логов следующим шагом — здесь пока ничего не измерено.",
    fileLabel: "Файл",
    layer: "Слой архитектора",
    lead: "Одна автоматизация — одна связанная цепочка запросов. Эта страница её собственный адрес: здесь живёт всё, что о цепочке известно.",
    nameLabel: "Название",
    notFound: "Автоматизации с таким адресом нет.",
    stepsLabel: "Сообщений в цепочке",
    title: "Автоматизация",
  },
}

/** Слова страницы. Незнакомый язык деградирует до английского, а не до пустоты. */
export function automationUi(lang: string): AutomationUi {
  return DICT[lang] ?? DICT.en
}
