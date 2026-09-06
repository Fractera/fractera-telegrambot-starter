// СЛОВА ВХОДА «TELEGRAM-БОТ» (77-1, 2026-08-31).
//
// 🔒 СЛОВАРЬ СЕРВЕРНЫЙ. Ни один файл с `"use client"` не имеет права импортировать
// его значением: тогда все языки уезжают в браузер на каждой странице слоя.
// Серверная страница резолвит и передаёт островкам СТРОКИ ПОИМЁННО — закон,
// оплаченный в 76-4 замером отданной разметки.
//
// 🔒 ДВА ЯЗЫКА, А НЕ 82. Слой архитектора живёт на `en` и `ru`; 82 языка — у
// панели и у слоя авторизации, потому что там воронка и мы не знаем, из какой
// страны придёт покупатель. Сюда приходит хозяин проекта, и он уже пришёл.

export type TelegramUi = {
  /** Заголовок входа — он же подпись кнопки в подвале. */
  title: string;
  /** Подпись группы в левом меню. */
  menuTitle: string;
  /** Слова таблицы автоматизаций во вкладке «Логи». */
  automations: {
    open: string
    preview: string
    previewClose: string
    steps: string
    empty: string
    demo: string
    search: string
    searchDo: string
    sortNew: string
    sortOld: string
    status: { any: string; done: string; running: string }
    calendar: { any: string; yes: string; no: string }
    map: { any: string; yes: string; no: string }
    perPage: string
    shown: string
    first: string
    prev: string
    next: string
    last: string
    page: string
    reset: string
  };
  /**
   * Подпись пункта «Терминал» в левом меню.
   *
   * 🔒 ЛЕЖИТ ОТДЕЛЬНО ОТ `pages`, И ЭТО НЕ МЕЛОЧЬ. `pages` описывает РАЗДЕЛЫ —
   * то, что открывается внутри этого экрана и имеет `?section=`. Терминал
   * уводит на другую страницу, в соседнюю вкладку; положи его в `pages`, и
   * маршрутизация начала бы искать раздел `terminal`, которого нет.
   */
  terminalLabel: string;
  subtitle: string;
  // 🪦 БЫЛО СЕМЬ РАЗДЕЛОВ, СТАЛО ЧЕТЫРЕ (111, 2026-09-04): «команды»,
  // «календарь» и «карта» убраны словом владельца вместе со своими словами.
  // 🪦 И СТАЛО ЧЕТЫРЕ ИЗ ПЯТИ (ревизия, шаг 116, 2026-09-05): «Стратегия
  // автоматизации» убрана — выбор между конвейером на OpenAI и агентом Anthropic
  // перестал существовать вместе со стратегией, которая его породила.
  pages: Record<
    "about" | "logs" | "settings" | "passport",
    { title: string; hint: string }
  >;
  /** Свёрнутая справка раздела «Описание». */
  helpMore: string;
  helpLess: string;
  aboutSoonTitle: string;
  /** Карточка «это ваш стартовый шаблон» (137-15). */
  starter: {
    title: string;
    body: string;
    openTitle: string;
    open: string;
  };
  aboutSoon: string;
  /** Заглушки двух рабочих разделов. */
  soonTitle: string;
  soonLead: string;
  soonWhere: string;
  soonPanel: string;
  /**
   * КАРКАС РАЗДЕЛОВ, ПОСТРОЕННЫХ ПОЗЖЕ (77-15, 2026-09-01).
   *
   * 🔒 СЛОВА ЗАГЛУШКИ ЖИВУТ ЗДЕСЬ, А НЕ В КОМПОНЕНТЕ. Заглушка одна на семь мест,
   * и текст у каждого свой: «в процессе разработки» без имени того, чего ждать,
   * не отличается от поломки.
   */
  skeleton: {
    inProgress: string;
    instructionTitle: string;
    instructionLead: string;
    views: Record<"automations" | "parse" | "db" | "media" | "vectors" | "rag", string>;
  };

  /**
   * СЛОВА ВИДА «РАЗБОР ЗАПРОСА» (91-1).
   *
   * 🔒 ВКЛАДКА ОБЯЗАНА ОБЪЯСНЯТЬ СОБОЙ, А НЕ НАЗЫВАТЬСЯ — прямое требование
   * владельца: «вкладку которая в своем описании подробно расскажет что здесь
   * происходит». Экран показывает ХОД РАССУЖДЕНИЯ, и без слов он читается как
   * технический мусор, а не как работа.
   *
   * 🔒 ПУСТОЕ СОСТОЯНИЕ НАЗЫВАЕТ ПРИЧИНУ, И ПРИЧИН ТРИ РАЗНЫХ. «Ничего нет»
   * одинаково выглядит при мёртвой службе, непривязанном боте и просто молчании
   * — а лечится по-разному. Молчание вместо причины читается как поломка (28-13).
   */
  parse: {
    title: string;
    /** Первый абзац справки: виден свёрнутым. */
    summary: string;
    /** Остальное: пять родов строки, почему всегда одна запись, что дальше. */
    details: string;
    /** Причины пустоты — по одной на состояние. */
    emptyServiceDown: string;
    emptyNotLinked: string;
    emptyNoRequests: string;
    /** Заголовки колонок таблицы. */
    colNo: string;
    colInstruction: string;
    colAction: string;
    /** Кнопка под однострочной ячейкой: открыть весь текст в окне. */
    viewAll: string;
    /** Следующее действие первой строки — она всегда ведёт к анализу реестра. */
    nextAfterIntake: string;
    /** Что умеет «инструмент» первой строки — канал. */
    intakeToolWhat: string;
    colKind: string;
    colWhat: string;
    colSource: string;
    colTime: string;
    /**
     * Строка «сырой запрос»: чем она добыта и что показать, когда слов нет.
     *
     * 🔒 ИМЯ КАНАЛА ПОДСТАВЛЯЕТСЯ В `{name}`, А НЕ ПИШЕТСЯ ВТОРЫМ СПИСКОМ.
     * Список каналов один — `REQUEST_CHANNELS`; словарь, перечисляющий их
     * заново, разошёлся бы с ним на первом же добавленном канале.
     */
    via: string;
    noWords: string;
    /** Имена пяти родов строки. */
    kinds: Record<
      | "intake"
      | "store"
      | "match"
      | "evolve"
      | "extract"
      | "resolve"
      | "plan"
      | "reveal",
      string
    >;
    /**
     * Чем строка добыта — по слову на источник.
     *
     * 🔒 СПИСОК ТОТ ЖЕ, ЧТО `TASK_SOURCES`, И ПРОВЕРЯЕТСЯ ТИПОМ. Словарь, не
     * знающий нового источника, показал бы пустую ячейку вместо ответа на
     * вопрос «чем это добыто» — то есть отнял бы у таблицы половину смысла.
     */
    sources: Record<
      "none" | "model" | "http" | "rag" | "table" | "vector" | "map",
      string
    >;
  };

  /**
   * СЛОВА КАРТОЧКИ «РЕЕСТР ПРИЗНАКОВ» (81-3).
   *
   * 🔒 ОПРЕДЕЛЕНИЕ ЛЕЖИТ В СЛОВАХ ЭКРАНА, А НЕ В КОММЕНТАРИИ КОДА. Правило,
   * которое негде увидеть, исполняется по памяти — то есть не исполняется:
   * закон, оплаченный шагом 62 на модальных окнах и шагом 51 на карточках видов.
   */
  facts: {
    title: string;
    /** Первый абзац справки: виден свёрнутым. */
    summary: string;
    /** Остальное: определение через отрицание, пять частей, откуда берутся. */
    rest: string;
    more: string;
    less: string;
    /** Подписи пяти уровней — отвечают на вопрос «когда признак известен». */
    levels: Record<
      "initiator" | "material" | "intent" | "entity" | "destination" | "field",
      string
    >;
    /** Пометки записи. */
    builtin: string;
    required: string;
    noTable: string;
    counted: string;
    /** Передача задачи агенту вместо формы записи (137-13). */
    handoffHint: string;
    handoffTrigger: string;
    handoffTitle: string;
    handoffLead: string;
    handoffAdvice: string;
    handoffEditTrigger: string;
    handoffEditTitle: string;
    handoffCopy: string;
    handoffCopied: string;
    /** Слова формы добавления (81-4). */
    addTitle: string;
    keyLabel: string;
    keyHint: string;
    titleLabel: string;
    descriptionLabel: string;
    valueTypeLabel: string;
    howToFindLabel: string;
    howToFindHint: string;
    onMissingLabel: string;
    onMissingWords: Record<"silent" | "ask" | "join", string>;
    valueTypes: Record<
      | "flag"
      | "text"
      | "number"
      | "money"
      | "date"
      | "geo"
      | "relation"
      | "list",
      string
    >;
    submit: string;
    submitting: string;
    /** `{table}` — имя созданной таблицы. */
    savedWithTable: string;
    /** Причины отказа двери, по её кодам. */
    errors: Record<string, string>;
    errorOther: string;
    /** Слова инструмента черновика (81-5). */
    draftTitle: string;
    draftHint: string;
    draftPlaceholder: string;
    draftSubmit: string;
    draftSubmitting: string;
    draftNotes: string;
    draftFailures: Record<
      "no-key" | "too-short" | "model-silent" | "not-understood",
      string
    >;
    /**
     * ПОДПИСИ РАСКРЫТИЯ КАРТОЧКИ (81-9).
     *
     * 🔒 ПОДПИСИ ЖИВУТ ЗДЕСЬ, А СОДЕРЖИМОЕ — РЯДОМ С МЕХАНИЗМОМ. Словарь
     * принадлежит экрану и знает, КАК назвать строку; что в ней стоит, знает
     * `lib/facts/{detail,builtin}.ts`. Положи мы туда и текст — он устарел бы в
     * день правки кода, и устарел бы молча.
     */
    detailsMore: string;
    detailExample: string;
    detailExtracts: string;
    detailTools: string;
    detailFunctions: string;
    detailLost: string;
    /** Рукописного нет — так и говорим. Выдуманный пример хуже пустоты. */
    detailNotDescribed: string;
    /** Терять нечего — это тоже ответ, и он отличается от «не описано». */
    detailNothingLost: string;
  };

  /**
   * СЛОВА РАЗДЕЛА «НАСТРОЙКИ» — ПЕРЕНЕСЕНЫ ИЗ ПАНЕЛИ ДОСЛОВНО (77-4, 2026-09-01),
   * из `admin-translations.json` → `channels`.
   *
   * 🔒 ПЕРЕВОД НЕ ПИШЕТСЯ ЗАНОВО. Он выверен на живых людях и правился не раз;
   * «сказать то же самое своими словами» здесь означает завести второй текст,
   * который разойдётся с первым и будет расходиться дальше.
   * Изменено ровно одно: строка про базу знаний потеряла ссылку в панель —
   * такой страницы у гостя нет, а ссылка в чужой контур хуже её отсутствия.
   */
  settings: {
    serviceDown: string;
    noToken: string;
    /** Ботов может быть несколько (99-4). {n} — их число. */
    botsTitle: string;
    /** Заголовок строки бота, у которого ещё нет токена. {n} — номер. */
    botUnnamed: string;
    addBot: string;
    addingBot: string;
    addedBot: string;
    removeBot: string;
    removingBot: string;
    removedBot: string;
    confirmRemoveBot: string;
    notLinked: string;
    /** `{who}` — имя привязанной учётной записи. */
    linkedTo: string;
    tokenRejected: string;
    currentBot: string;
    tokenLabel: string;
    tokenPlaceholder: string;
    tokenReplace: string;
    save: string;
    saving: string;
    saved: string;
    failed: string;
    connect: string;
    relink: string;
    waiting: string;
    openTelegram: string;
    linkedToast: string;
    linkTimeout: string;
    linkExpired: string;
    linkFailed: string;
    channelOn: string;
    answersFrom: string;
    neverInvents: string;
    scheduleLabel: string;
    scheduleHint: string;
    scheduleOff: string;
    /** `{n}` — шаг в секундах. */
    scheduleEvery: string;
    scheduleSaved: string;
    helpLabel: string;
    helpWhatTitle: string;
    helpWhat: string;
    helpWhyTitle: string;
    helpWhy: string;
    helpLinkTitle: string;
    helpLink: string;
    helpOffTitle: string;
    helpOff: string;
  };
  /**
   * СЛОВА РАЗДЕЛА «ЛОГИ» — НАПИСАНЫ ЗДЕСЬ, А НЕ ПЕРЕНЕСЕНЫ (77-5, 2026-09-01).
   *
   * 🔒 И ЭТО СКАЗАНО ВСЛУХ ИМЕННО ПОТОМУ, ЧТО ОСТАЛЬНОЙ ВХОД — ПЕРЕНОС. В панели
   * экрана логов нет вовсе: служба хранила входящие с самого начала, и читал их
   * только код. Не найдя источника, легко решить, что «перевод потерялся».
   */
  /**
   * СЛОВА РАЗДЕЛА «ОПИСАНИЕ» (77-6, 2026-09-01).
   *
   * 🔒 НАПИСАНЫ ПО КОДУ СЛУЖБЫ И ПРОДУКТА, А НЕ ПО ПАМЯТИ И НЕ ПО НАВЫКУ. Три
   * утверждения, которые «все знали», оказались устаревшими: голос расшифровывается,
   * сообщения уезжают в сам проект, файлы попадают в медиатеку. Каждая строка ниже
   * проверена в первоисточнике — иначе описание обещает то, чего нет, или молчит о
   * том, что есть.
   */
  /**
   * СЛОВА БЛОКА «КЛЮЧ OPENAI» (77-8, 2026-09-01).
   *
   * 🔒 ОСТАТОК ПО СЧЁТУ НЕ ОБЕЩАН НИ ОДНОЙ СТРОКОЙ, И ЭТО ИЗМЕРЕНО, А НЕ
   * ПРЕДПОЛОЖЕНО: OpenAI отдаёт баланс только браузерной сессии кабинета либо
   * админскому ключу с правом api.usage.read. Поэтому есть строка, которая
   * объясняет это человеку, а не пустое поле «остаток: —».
   */
  openai: {
    title: string;
    lead: string;
    exists: string;
    missing: string;
    partial: string;
    consumerApp: string;
    consumerData: string;
    consumerGraph: string;
    keyLabel: string;
    keyPlaceholder: string;
    keyReplace: string;
    save: string;
    saving: string;
    saved: string;
    failed: string;
    badFormat: string;
    check: string;
    checking: string;
    valid: string;
    invalid: string;
    funded: string;
    noFunds: string;
    fundsUnknown: string;
    balanceNote: string;
    restartNote: string;
  };

  /**
   * КАНАЛ АГЕНТА: ПОДПИСКА CLAUDE CODE И ДВА ЕГО БОТА (шаг 117, 2026-09-05).
   *
   * 🔒 ПОДПИСКА — ПЕРВАЯ КАРТОЧКА РАЗДЕЛА по прямому слову владельца. Ключи
   * отвечают на вопрос «чем оплачено дополнительное», подписка — «работает ли
   * агент вообще»; порядок карточек повторяет этот порядок вопросов.
   */
  agent: {
    title: string;
    statusOn: string;
    statusOff: string;
    lead: string;
    openTerminal: string;
    dialogTitle: string;
    dialogDescription: string;
    newTab: string;
    unreachable: string;
    botAutomationTitle: string;
    botAutomationLead: string;
    allowed: string;
    pending: string;
    bot: {
      placeholder: string;
      save: string;
      saving: string;
      saved: string;
      configured: string;
      notConfigured: string;
      hint: string;
      appliesOnRestart: string;
      errBadFormat: string;
      errUnreachable: string;
      errFailed: string;
    };
  };

  about: {
    /**
     * ПЕРВЫЙ АБЗАЦ ОПИСАНИЯ (77-10, 2026-09-01, заказ владельца).
     *
     * 🔒 ОН ОБЪЯСНЯЕТ, ЧЕМ БОТ ЯВЛЯЕТСЯ, А НЕ ЧТО ОН УМЕЕТ. Список умений идёт
     * ниже и отвечает на другой вопрос. Человек, не понявший ЗАЧЕМ здесь бот,
     * читает список умений как набор случайных возможностей.
     */
    demoTitle: string;
    demoWhat: string;
    demoWriteTitle: string;
    demoWrite: string;
    demoReadTitle: string;
    demoRead: string;
    demoWhy: string;
    /** Страница на каждый запрос (137-14). */
    pageTitle: string;
    page: string;
    whatTitle: string;
    what: string;
    arrangedTitle: string;
    arranged: string;
    canTitle: string;
    can: string[];
    cannotTitle: string;
    cannot: string[];
    boundaryTitle: string;
    boundary: string;
    startTitle: string;
    start: string;
  };

  logs: {
    title: string;
    lead: string;
    /** Три причины пустоты — у каждой своё лечение. */
    emptyNoToken: string;
    emptyNotLinked: string;
    emptyNoMessages: string;
    refresh: string;
    refreshing: string;
    live: string;
    /** `{n}` — сколько записей показано. */
    counted: string;
    /** Пометка о пределе склада службы. */
    ringNote: string;
    /** Кто сказал реплику — человек или бот (77-11). */
    fromBot: string;
    fromPerson: string;
    kindVoice: string;
    kindFile: string;
    kindLocation: string;
    forwarded: string;
  };
};

const EN: TelegramUi = {
  about: {
    arranged:
      "One service on this machine is the only reader of the bot. It listens, keeps what it heard, and hands every message to this project at once. Nothing about the bot lives in your repository except the screens you are looking at.",
    arrangedTitle: "How it is arranged.",
    boundary:
      "The channels service belongs to the platform, not to your repository: on the server they are neighbours, and on your laptop the service is not running at all. That is why these screens say the service is unavailable there — nothing is broken, the bot simply lives on the server.",
    boundaryTitle: "Where the boundary is.",
    can: [
      "hear text and voice — a voice note is fetched and transcribed, and from then on it is indistinguishable from typing (an OpenAI key is required for that)",
      "accept a photo, a video, a document or audio — the file goes into the media library and is READ, so a receipt sent without a word is still searchable",
      "keep the whole conversation — both what it heard and what it answered — for as long as the server lives; that is what the Logs section shows",
      "hand every message to this project the moment it lands — your own door at /api/telegram/hook, with a shared secret; while that wiring is in place the PROJECT answers, not the service",
      "knock on the project on a schedule, so a reminder can fire while nobody is looking at the site",
      "send back: your project can write text and files into the chat",
    ],
    cannot: [
      "one linked chat, yours. Other people can write to the bot and their messages reach the project, but the linked chat stays the default recipient, and nothing here collects a list of other people",
      "no mass mailing. One bot, one messenger, one conversation at a time — a loyalty service writing to thousands is a different product",
      "two of its own phrases (the greeting and the reply after linking) are English and live inside the service. This project cannot translate them",
      "without an OpenAI key a voice note arrives without text — the message is kept, but nobody transcribed it",
      "nothing is deleted automatically, so the journal only grows — the disk of your server is the limit",
    ],
    cannotTitle: "What it does not do — said plainly",
    canTitle: "What it can do today",
    demoRead:
      "A question is not answered from a single row. Several sources are read at once — the records, their meaning, the connections between them — and the answer is assembled from all of them, so it stays whole rather than literal.",
    demoReadTitle: "How the parts come back together.",
    demoTitle:
      "Your starter bot is a working demonstration of how this project remembers.",
    demoWhat:
      "It is not a toy and not a placeholder. Everything it does is built from the same parts your own project has, so trying it out is the shortest way to see the memory of Fractera at work.",
    demoWhy:
      "That is why it is worth talking to before you build anything of your own: what you see here is the behaviour your project can be given.",
    demoWrite:
      "One sentence does not land as one line of text. It is taken apart: the record itself, when it happened, what it was about, the money in it, the place, the links to everything said before. Each part goes to the kind of memory that can answer questions about it later.",
    demoWriteTitle: "What happens to what you tell it.",
    page:
      "Every request gets its own page. It shows how the request was handled, step by step: what was understood, what was found, what was done. You can come back to it to re-read the research the agent wrapped up for you, or share the finished result as a link. By default such a page is protected by routing and visible only to you — you can turn it public when you want to show it.",
    pageTitle: "A page for every request.",
    start:
      "Ask @BotFather in Telegram for a new bot, take the token it gives you, and paste it into Settings here. Then link your account and write to the bot — the first message appears in Logs.",
    startTitle: "How to get a bot.",
    what: "A person writes to your bot and talks to your project — no separate app, no login screen. The bot is yours: the token comes from @BotFather and belongs to you, so the conversation runs between your visitors and your server.",
    whatTitle: "A door into this project from a messenger.",
  },
  starter: {
    body:
      "You can use it as it is — or reshape it by voice, with Claude Code: add a new menu, build dashboards, wire up integrations. Say what you want in your own words; the agent writes the code and commits it, so any change can be rolled back.",
    open:
      "The whole source code of this project is yours and fully open — nothing here hides behind a service you cannot read.",
    openTitle: "Everything is open.",
    title: "This is your starter template.",
  },
  aboutSoon:
    "The section exists and its place is taken; the text and the picture that explain how the bot is arranged in this project are still being prepared. Nothing is broken here — there is simply nothing written yet.",
  aboutSoonTitle: "This description is being written.",

  agent: {
    allowed: "people paired: {n}",
    bot: {
      appliesOnRestart:
        "Saving is not yet working: the plugin reads this file when the channel starts, so until it restarts the token is checked by its shape alone.",
      configured: "configured",
      errBadFormat:
        "That does not look like a bot token. Copy it from @BotFather whole, including the digits before the colon.",
      errFailed: "Could not save. The reason is in the chat service log.",
      errUnreachable:
        "The chat service is not answering — the token has not been saved.",
      hint: "Create the bot in @BotFather and paste its token. Pairing happens in Telegram: the bot sends a code, you confirm it.",
      notConfigured: "not configured",
      placeholder: "Token from @BotFather",
      save: "Save",
      saved: "Saved. The bot starts answering after the channel restarts.",
      saving: "Saving…",
    },
    botAutomationLead:
      "The main bot of the project: you write to it from your phone and Claude Code answers. The token entered here goes to the very file the channel plugin reads — set it up here or in the terminal, it is the same bot either way.",
    botAutomationTitle: "Telegram bot — automation agent",
    dialogDescription:
      "Sign in to the subscription, connect the bot and confirm the pairing code that arrives in Telegram.",
    dialogTitle: "Claude Code terminal",
    lead: "This is how the bot thinks. A message from Telegram goes straight into a live Claude Code session on your server, and the answer comes back to Telegram — on your subscription, with no API billing. Without this sign-in nothing below works: neither the bot nor its answers.",
    newTab: "Open in a new tab",
    openTerminal: "Open the terminal",
    pending: "codes awaiting confirmation: {n}",
    statusOff: "not signed in",
    statusOn: "signed in",
    title: "Claude Code subscription",
    unreachable:
      "The chat service is not answering, so the terminal cannot be shown. That is normal on your own machine: the service lives on the server.",
  },

  facts: {
    handoffHint: "The registry is edited through the agent — it builds and commits.",
    handoffTrigger: "Request a new fact",
    handoffTitle: "Task for the development agent",
    handoffLead: "Copy this text and send it to the Fractera development Telegram bot.",
    handoffAdvice: "Fill in the angle brackets in your own words — the agent will work out the rest.",
    handoffEditTrigger: "Request a change",
    handoffEditTitle: "Change request for this fact",
    handoffCopy: "Copy",
    handoffCopied: "Copied",
    addTitle: "Add a fact",
    builtin: "built-in",
    counted: "{n} facts",
    descriptionLabel: "What it is",
    detailExample: "How a person says it",
    detailExtracts: "What is extracted, and where it lands",
    detailFunctions: "The code behind it",
    detailLost: "What is extracted and NOT kept",
    detailNotDescribed: "not described",
    detailNothingLost: "nothing is lost — everything extracted is stored",
    detailsMore: "More about this fact",
    detailTools: "Obtained by",
    draftFailures: {
      "model-silent": "The model did not answer. Try again in a minute.",
      "no-key":
        "No OpenAI key — fill the fields by hand, everything else works.",
      "not-understood":
        "Could not make a record out of this. Say it in other words, or fill the fields by hand.",
      "too-short": "Too short. Say what it is and by which words it shows up.",
    },
    draftHint:
      "Say what you want to store and how it shows up in messages. The model fills the fields in — you check them and save. Nothing is written until you do.",
    draftNotes: "Assumed:",
    draftPlaceholder:
      "I want to keep the weather when a message arrived — take it from mentions of rain, heat, snow or degrees",
    draftSubmit: "Fill the fields in",
    draftSubmitting: "Reading…",
    draftTitle: "Describe it in words",
    errorOther: "Could not save. Try again in a minute.",
    errors: {
      "bad-key":
        "This machine name will not do: latin letters and digits only, dots between levels.",
      "builtin-exists": "A built-in fact already has this name.",
      "builtin-readonly":
        "Built-in facts are generated from the code and cannot be edited.",
      "no-how-to-find":
        "Say how to recognise it — without that the fact stays an empty column.",
      "no-title": "A name is required.",
    },
    howToFindHint:
      "The words and shapes it appears in. This is what goes to the model — without it the fact is a column nobody fills.",
    howToFindLabel: "How to recognise it",
    keyHint:
      "Latin letters and digits, dots for levels. The table name is built from it and never changes.",
    keyLabel: "Machine name",
    less: "Collapse",
    levels: {
      destination: "Where it went",
      entity: "What it turned out to be",
      field: "What was extracted",
      initiator: "Who started it",
      intent: "Why it arrived",
      material: "How it arrived",
    },
    more: "What is a fact",
    noTable: "no table of its own: a link is a relation, not a value",
    onMissingLabel: "When it is implied but not extracted",
    onMissingWords: {
      ask: "Ask a clarifying question",
      join: "Look in neighbouring messages",
      silent: "Say nothing",
    },
    required: "cannot be turned off",
    rest: "A fact is a declared ability to recognise a class of facts in a message, store them apart from the text and link them to the rest. Put the other way round, which is more exact: no fact in the registry means no instruction for how to decompose it — so it lands in no table and stays plain text. Every entry carries five parts: a name, what it is, the form of the value, HOW TO RECOGNISE it, and what to do when it is implied but not extracted. Built-in facts are generated from the code and cannot be edited: they describe what the system does by construction. Added ones you describe yourself, and each gets its own table the moment it is saved.",
    savedWithTable:
      "Saved. Table {table} created — the fact works from now on, no rebuild needed.",
    submit: "Save",
    submitting: "Saving…",
    summary:
      "What this project knows how to pull out of a message: the date of the event, money, a place, a link to what was said before. Each of them is a declared ability — not a label.",
    title: "Fact registry",
    titleLabel: "Name",
    valueTypeLabel: "Form of the value",
    valueTypes: {
      date: "Date",
      flag: "Yes or no",
      geo: "Coordinates",
      list: "List",
      money: "Money",
      number: "Number",
      relation: "Link between messages",
      text: "Text",
    },
  },
  helpLess: "Collapse",
  helpMore: "Learn more",
  logs: {
    counted: "{n} messages",
    emptyNoMessages:
      "The bot is set up and listening — nobody has written to it yet. This page is empty because there is nothing to show, not because something failed.",
    emptyNoToken:
      "Nothing here yet, and the reason is simple: the bot has no token. Save one in Settings and it starts listening.",
    emptyNotLinked:
      "The bot is alive but no account is linked yet, so nobody has written to it. Link yours in Settings and the first message appears here.",
    forwarded: "forwarded from",
    fromBot: "bot",
    fromPerson: "person",
    kindFile: "file",
    kindLocation: "location",
    kindVoice: "voice",
    lead: "Everything that reaches the bot is kept by the channels service, and so is every answer it sends back — the whole conversation, from the day this project started until the server is gone. This is that record, oldest first.",
    live: "Updating while this section is open",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    ringNote:
      "Nothing here is ever dropped: the journal keeps the whole history for as long as the server lives. Only the newest part is loaded at once.",
    title: "What the bot has heard",
  },
  automations: {
    calendar: { any: "Calendar: any", no: "No calendar", yes: "On a timer" },
    demo: "Demo records: real chains will come from the logs at the next step.",
    empty: "Nothing matches this filter.",
    first: "First page",
    last: "Last page",
    map: { any: "Map: any", no: "No map pins", yes: "Has map pins" },
    next: "Forward",
    open: "Open page in a new tab",
    page: "Page {n} of {of}",
    perPage: "Per page",
    prev: "Back",
    preview: "Preview here",
    previewClose: "Hide preview",
    reset: "Reset filters",
    search: "Search by name or tag",
    searchDo: "Search",
    shown: "Showing {from}-{to} of {total}",
    sortNew: "Newest first",
    sortOld: "Oldest first",
    status: { any: "Any state", done: "Done", running: "Running" },
    steps: "{n} messages",
  },
  menuTitle: "Telegram bot",
  terminalLabel: "Terminal",
  openai: {
    badFormat: "That does not look like an OpenAI key — they start with sk-",
    balanceNote:
      "The remaining balance cannot be shown: OpenAI returns it only to a browser session of your account or to an admin key with the api.usage.read scope. An ordinary project key never sees it.",
    check: "Check",
    checking: "Checking…",
    consumerApp: "this project",
    consumerData: "data layer",
    consumerGraph: "knowledge graph",
    exists: "An OpenAI key is set",
    failed: "Action failed",
    funded: "The balance is positive",
    fundsUnknown: "Could not tell whether there is credit — try again later",
    invalid: "OpenAI did not accept this key",
    keyLabel: "Key from platform.openai.com",
    keyPlaceholder: "sk-…",
    keyReplace: "Paste a new key to replace the saved one",
    lead: "Recommended, not required. This key powers Fracteras memory: the vector store and the agentic RAG, that is the knowledge graph. With it the bot remembers what was said, searches by meaning and answers from your own documents rather than from the last few messages. Without it the bot still works — it simply has no memory of its own.",
    missing: "No OpenAI key yet",
    noFunds: "The key works, but the account is out of credit",
    partial: "The key has not reached every service",
    restartNote:
      "The project restarts to pick up the new key; the channel service reads it straight away.",
    save: "Save",
    saved: "OpenAI key saved",
    saving: "Saving…",
    title: "OpenAI key",
    valid: "The key is valid",
  },
  pages: {
    about: {
      hint: "What the bot is for in this project and how it is arranged.",
      title: "About",
    },
    logs: {
      hint: "The bot picks one of two modes. Fast and cheap, on the fact registry, for most simple tasks. Complex and recursively evolving, on an agent that grows skills, MCP, external APIs and AI browsers for research.",
      title: "Logs",
    },
    passport: {
      hint: "What we are building, why, and how it works today. A living document.",
      title: "Passport",
    },
    settings: {
      hint: "The token, the connection and everything the bot needs in order to answer.",
      title: "Settings",
    },
  },

  parse: {
    colAction: "Next action",
    colInstruction: "Instruction",
    colKind: "Fact",
    colNo: "#",
    colSource: "Tool",
    colTime: "Time",
    colWhat: "Output",
    details:
      "Rows appear as the work finishes, not all at once. The first is the raw request exactly as it came in, down to the millisecond. Then, if there was an attachment, what was read out of it. Then, if the message refers to something said earlier, which thing exactly and how it was chosen. Then the plan: which registry facts this request contains. Then one row per fact, with the values pulled out and the table they would go into.\n\nThere is always exactly ONE record here, and the next request replaces it — this is working material, not a history. Yesterday's breakdown is not kept: the point is to see how the system thinks right now, and later this record is split across the fact tables and freed for the next conversation.\n\nNothing is written into those tables yet. A row names where a value would land; it does not put it there.",
    emptyNoRequests:
      "Nobody has written to the bot yet. The first message will be taken apart here.",
    emptyNotLinked:
      "The bot is not linked to a chat yet. Link it in Settings, write to it, and the breakdown of that message appears here.",
    emptyServiceDown:
      "The channel service is not running, so nothing reaches the bot and there is nothing to take apart.",
    intakeToolWhat:
      "The channel the message arrived through, and the person who sent it. Nothing here is interpreted: this is the raw material everything else is checked against.",
    kinds: {
      evolve: "Registry evolution",
      extract: "Read from attachment",
      intake: "Raw request",
      match: "Fact lookup",
      plan: "Plan",
      resolve: "Link to previous message",
      reveal: "Fact",
      store: "Message saved",
    },
    nextAfterIntake: "Find out which registry facts this message matches.",
    noWords: "No words of their own — the message arrived as an attachment.",
    sources: {
      http: "an external service",
      map: "the map service",
      model: "a model",
      none: "taken as it came",
      rag: "the knowledge graph",
      table: "the project database",
      vector: "the vector store",
    },
    summary:
      "One message, taken apart in front of you. Not the result — the reasoning: what arrived, what was read out of it, which registry facts it turned out to contain, and what each of them would be stored as.",
    title: "Request breakdown",
    via: "{name}",
    viewAll: "View all",
  },
  settings: {
    addBot: "Add a bot",
    addedBot: "Bot added — enter its token",
    addingBot: "Adding…",
    answersFrom:
      "Once linked, the bot answers from the knowledge base of this project.",
    botsTitle: "Telegram bots: {n}",
    botUnnamed: "Bot {n} — no token",
    channelOn: "Channel active",
    confirmRemoveBot: "Press again to remove",
    connect: "Connect your account",
    currentBot: "Current bot:",
    failed: "Action failed",
    helpLabel: "What a channel is, and what it is not",
    helpLink:
      "The link is opened inside a messenger, where it is visible to anyone who sees the screen. A code that worked twice would let someone else attach their account to your project, so it works once and expires.",
    helpLinkTitle: "Why linking needs a one-time code.",
    helpOff:
      "The switch stops the bot answering without deleting the token or the link — useful while you are changing the knowledge base and would rather nobody got half-built answers.",
    helpOffTitle: "Turning the channel off.",
    helpWhat:
      "A door into your project from a messenger instead of a browser. A person writes to your bot and gets an answer built from your own knowledge base — no separate app, no login screen.",
    helpWhatTitle: "What this gives you.",
    helpWhy:
      "The token belongs to a bot you created, so the conversation runs between your visitors and your server. Nothing passes through us, and if you ever move the server the bot moves with the token.",
    helpWhyTitle: "Why your own bot and not ours.",
    linkExpired: "The code expired — press Connect again.",
    linkedTo: "linked to {who}",
    linkedToast: "Linked to",
    linkFailed: "Linking could not be started.",
    linkTimeout: "Linking timed out — press Connect again.",
    neverInvents:
      "It never invents an answer: with the base empty or the service off, it says so.",
    noToken: "no token yet",
    notLinked: "token saved, account not linked",
    openTelegram: "open Telegram",
    relink: "Link another account",
    removeBot: "Remove",
    removedBot: "Bot removed. The conversation history is kept.",
    removingBot: "Removing…",
    save: "Save",
    saved: "Bot token saved",
    saving: "Saving…",
    scheduleEvery: "Every {n} sec",
    scheduleHint:
      "How often the product is asked whether a reminder has come due. Reminders have to fire while nobody is looking at the site, so something has to knock — this is it. Off means the project has no reminders and pays for none.",
    scheduleLabel: "Schedule",
    scheduleOff: "Off",
    scheduleSaved: "Schedule saved",
    serviceDown:
      "The channels service is not running, so nothing can be set up here yet.",
    tokenLabel: "Bot token from @BotFather",
    tokenPlaceholder: "123456789:AA…",
    tokenRejected:
      "The token is saved, but Telegram does not recognise it. Either it was mistyped, or it was revoked in @BotFather — get a fresh one there and save it again.",
    tokenReplace: "Paste a new token to replace the saved one",
    waiting: "Waiting for START in Telegram…",
  },
  skeleton: {
    inProgress: "Being built",
    instructionLead:
      "A text you write yourself and the bot follows in addition to its own rules — your limits, your tone, your subject. It is added to the instruction the bot already has, not instead of it.",
    instructionTitle: "Your own instruction for the bot",
    views: {
      automations: "Automations",
      db: "Database",
      media: "Media library",
      parse: "Request breakdown",
      rag: "Agentic RAG",
      vectors: "Vector store",
    },
  },
  soonLead:
    "The place for it is here, and it is deliberately empty rather than hidden: a section that appears out of nowhere later is harder to notice than one that says it is coming.",
  soonPanel:
    "the Channels tab of the control panel — the link to it is in the site footer.",
  soonTitle: "This section is not built yet",
  soonWhere: "Where this works today:",
  subtitle:
    "The architect's own tool: it builds automations of any shape, using Claude Code and the special memory of Fractera.",
  title: "Telegram bot",
};

const RU: TelegramUi = {
  about: {
    arranged:
      "На этой машине есть одна служба, и она единственный читатель бота. Она слушает, хранит услышанное и сразу передаёт каждое сообщение в этот проект. В вашем репозитории от бота нет ничего, кроме экранов, на которые вы сейчас смотрите.",
    arrangedTitle: "Как это устроено.",
    boundary:
      "Служба каналов принадлежит платформе, а не вашему репозиторию: на сервере они соседи, а на вашем ноутбуке служба не запущена вовсе. Поэтому там эти экраны говорят, что службы нет, — ничего не сломано, просто бот живёт на сервере.",
    boundaryTitle: "Где проходит граница.",
    can: [
      "слышать текстом и голосом — голосовая заметка скачивается и расшифровывается, и дальше неотличима от напечатанной (для этого нужен ключ OpenAI)",
      "принимать фотографию, видео, документ и звук — файл попадает в медиатеку и ПРОЧИТЫВАЕТСЯ, поэтому снимок чека, присланный молча, всё равно находится поиском",
      "хранить весь разговор — и услышанное, и свои ответы — пока жив сервер; это и есть раздел «Логи»",
      "передавать каждое сообщение в сам проект в момент прихода — в вашу дверь /api/telegram/hook, с общим секретом; пока эта проводка на месте, отвечает ПРОЕКТ, а не служба",
      "стучать в проект по расписанию, чтобы напоминание сработало, когда на сайт никто не смотрит",
      "отвечать: ваш проект умеет писать в чат текст и присылать файлы",
    ],
    cannot: [
      "привязанный чат один, ваш. Другие люди могут писать боту, и их сообщения доходят до проекта, но адресатом по умолчанию остаётся привязанный чат, а списка чужих чатов здесь никто не собирает",
      "рассылок нет. Один бот, один мессенджер, один разговор за раз — служба лояльности, пишущая тысячам, это другой продукт",
      "две его собственные фразы (приветствие и ответ после привязки) — английские и живут внутри службы. Этот проект их не переводит",
      "без ключа OpenAI голосовая заметка приходит без текста — сообщение сохранится, но расшифровать его будет некому",
      "ничего не удаляется само, поэтому журнал только растёт — предел здесь один, диск вашего сервера",
    ],
    cannotTitle: "Чего он не умеет — сказано прямо",
    canTitle: "Что он умеет сегодня",
    demoRead:
      "Ответ не берётся из одной строки. Читаются сразу несколько источников — сами записи, их смысл, связи между ними, время и место, — и ответ собирается из всего этого. Поэтому он получается целостным, а не буквальным: система отвечает на то, что вы имели в виду, а не на то, какими словами спросили.",
    demoReadTitle: "Как части собираются обратно.",
    demoTitle:
      "Ваш бот — вход в автоматизацию: вы говорите словами, а строит Claude Code, опираясь на специальную память Fractera.",
    demoWhat:
      "Специальная память Fractera — это синергия специально настроенной базы данных, объектного хранилища, календарей, гео-меток, а также векторного хранилища и графа знаний. Ни одна из этих частей по отдельности не отвечает на вопрос целиком; отвечают они вместе.",
    demoWhy:
      "Отсюда и главное отличие: вам не нужно описывать автоматизацию языком настроек. Вы говорите, чего хотите, — остальное собирает агент.",
    demoWrite:
      "Сначала сказанное разделяется по роду: общий вопрос, обращение к памяти на извлечение или запись, просьба о разработке. Это разделение делает Claude Code, и только после него что-то происходит. Дальше фраза раскладывается на части — когда это случилось, о чём речь, какие в ней деньги, где это было, с чем связано из сказанного раньше, — и каждая уходит в тот вид памяти, который потом сможет о ней ответить.",
    demoWriteTitle: "Что происходит с тем, что вы ему сказали.",
    page:
      "У каждого запроса появляется своя страница. На ней видно, как шла обработка: что было понято, что найдено, что сделано. К ней можно вернуться, чтобы перечитать исследование, которое агент свернул в ответ, — и ею же можно поделиться как готовым результатом через ссылку. По умолчанию такая страница защищена маршрутизацией и видна только вам; вы можете сделать её публичной, когда захотите показать.",
    pageTitle: "Страница на каждый запрос.",
    start:
      "Попросите у @BotFather в Telegram нового бота, возьмите выданный токен и вставьте его здесь, в «Настройках». Потом привяжите свою учётную запись и напишите боту — первое сообщение появится в «Логах».",
    startTitle: "Как завести бота.",
    what: "Человек пишет вашему боту и разговаривает с вашим проектом — без отдельного приложения и без страницы входа. Бот ваш: токен вы получаете у @BotFather, и он принадлежит вам, поэтому разговор идёт между вашими посетителями и вашим сервером.",
    whatTitle: "Дверь в этот проект из мессенджера.",
  },
  starter: {
    body:
      "Его можно использовать сразу как есть — а можно переделать голосом, при помощи Claude Code: создать новое меню, добавить дашборды, построить интеграции. Скажите своими словами, чего хотите; агент напишет код и положит коммит, поэтому любую правку можно откатить.",
    open:
      "Весь исходный код этого проекта ваш и полностью вам доступен — здесь ничего не спрятано за службой, которую нельзя прочитать.",
    openTitle: "Всё открыто.",
    title: "Это ваш стартовый шаблон.",
  },
  aboutSoon:
    "Раздел существует, и место под него занято; текст и изображение, объясняющие, как устроен бот в этом проекте, ещё готовятся. Здесь ничего не сломано — здесь пока просто ничего не написано.",
  aboutSoonTitle: "Это описание сейчас пишется.",

  agent: {
    allowed: "привязано собеседников: {n}",
    bot: {
      appliesOnRestart:
        "Сохранить — ещё не значит заработало: плагин читает этот файл при запуске канала, и до перезапуска токен проверен только своей формой.",
      configured: "настроен",
      errBadFormat:
        "Это не похоже на токен бота. Скопируйте его у @BotFather целиком, вместе с цифрами до двоеточия.",
      errFailed: "Сохранить не удалось. Причина — в журнале службы чата.",
      errUnreachable: "Служба чата не отвечает — токен не сохранён.",
      hint: "Заведите бота у @BotFather и вставьте его токен. Привязка происходит в Telegram: бот пришлёт код, вы его подтвердите.",
      notConfigured: "не настроен",
      placeholder: "Токен от @BotFather",
      save: "Сохранить",
      saved: "Сохранено. Бот начнёт отвечать после перезапуска канала.",
      saving: "Сохраняю…",
    },
    botAutomationLead:
      "Основной бот проекта: вы пишете ему с телефона, отвечает Claude Code. Токен, введённый здесь, попадает в тот же файл, который читает плагин каналов, — настроите отсюда или из терминала, бот получится один и тот же.",
    botAutomationTitle: "Telegram-бот — агент автоматизации",
    dialogDescription:
      "Войдите в подписку, подключите бота и подтвердите код привязки, который придёт в Telegram.",
    dialogTitle: "Терминал Claude Code",
    lead: "Этим бот и думает. Сообщение из Telegram попадает прямо в живую сессию Claude Code на вашем сервере, а ответ возвращается в Telegram — по вашей подписке, без оплаты API. Без этого входа не работает ничего из того, что ниже: ни бот, ни ответы.",
    newTab: "Открыть отдельной вкладкой",
    openTerminal: "Открыть терминал",
    pending: "ожидают подтверждения: {n}",
    statusOff: "вход не выполнен",
    statusOn: "вход выполнен",
    title: "Подписка Claude Code",
    unreachable:
      "Служба чата не отвечает, поэтому терминал показать нечем. На вашем компьютере это нормально: служба живёт на сервере.",
  },

  facts: {
    handoffHint: "Реестр правится через агента — он строит и кладёт коммит.",
    handoffTrigger: "Запросить новый признак",
    handoffTitle: "Задача агенту разработки",
    handoffLead: "Скопируйте этот текст и отправьте его в Telegram-бот агента разработки Fractera.",
    handoffAdvice: "Заполните угловые скобки своими словами — остальное агент разберёт сам.",
    handoffEditTrigger: "Запросить правку",
    handoffEditTitle: "Задача на правку этого признака",
    handoffCopy: "Скопировать",
    handoffCopied: "Скопировано",
    addTitle: "Добавить признак",
    builtin: "встроенный",
    counted: "признаков: {n}",
    descriptionLabel: "Что это",
    detailExample: "Как человек это говорит",
    detailExtracts: "Что извлекается и куда ложится",
    detailFunctions: "Какой код за этим стоит",
    detailLost: "Что извлекается и НЕ сохраняется",
    detailNotDescribed: "не описано",
    detailNothingLost: "не теряется ничего — всё извлечённое сохраняется",
    detailsMore: "Подробнее об этом признаке",
    detailTools: "Чем добывается",
    draftFailures: {
      "model-silent": "Модель не ответила. Попробуйте через минуту.",
      "no-key": "Ключа OpenAI нет — заполните поля руками, остальное работает.",
      "not-understood":
        "Не получилось собрать запись. Скажите иначе или заполните поля руками.",
      "too-short":
        "Слишком коротко. Скажите, что это и по каким словам встречается.",
    },
    draftHint:
      "Скажите, что хотите хранить и по каким словам это встречается. Модель заполнит поля — вы проверите и сохраните. До этого ничего не записывается.",
    draftNotes: "Предположил:",
    draftPlaceholder:
      "хочу хранить погоду в момент сообщения — бери из упоминаний дождя, жары, снега или градусов",
    draftSubmit: "Заполнить поля",
    draftSubmitting: "Читаем…",
    draftTitle: "Опишите словами",
    errorOther: "Не удалось сохранить. Попробуйте через минуту.",
    errors: {
      "bad-key":
        "Такое машинное имя не годится: только латиница и цифры, точки между уровнями.",
      "builtin-exists": "Встроенный признак уже носит это имя.",
      "builtin-readonly":
        "Встроенные признаки порождаются из кода и не правятся.",
      "no-how-to-find":
        "Скажите, как это узнавать, — без этого признак останется пустой колонкой.",
      "no-title": "Название обязательно.",
    },
    howToFindHint:
      "По каким словам и в каком виде встречается. Именно это едет в модель — без него признак останется колонкой, которую никто не заполняет.",
    howToFindLabel: "Как это узнавать",
    keyHint:
      "Латиница и цифры, точки между уровнями. Из него строится имя таблицы, и оно не меняется никогда.",
    keyLabel: "Машинное имя",
    less: "Свернуть",
    levels: {
      destination: "Куда уехало",
      entity: "Чем оказалось",
      field: "Что извлекли",
      initiator: "Кто инициировал",
      intent: "Зачем пришло",
      material: "Чем пришло",
    },

    more: "Что такое признак",
    noTable: "своей таблицы нет: связь — отношение, а не значение",
    onMissingLabel: "Если подразумевается, но не извлекается",
    onMissingWords: {
      ask: "Задать уточняющий вопрос",
      join: "Поискать в соседних сообщениях",
      silent: "Промолчать",
    },
    required: "выключить нельзя",
    rest: "Признак — объявленная способность узнать в сообщении класс фактов, сохранить их отдельно от текста и связать с остальным. С другой стороны, и так точнее: нет признака в реестре — нет инструкции, как это декомпозировать, значит факт не попадёт ни в одну таблицу и останется просто текстом. У каждой записи пять частей: имя, что это, форма значения, КАК ЭТО УЗНАВАТЬ и что делать, когда признак подразумевается, но не извлекается. Встроенные порождаются из кода и не правятся: они описывают то, что система делает по устройству. Добавленные вы описываете сами, и каждый получает свою таблицу в момент сохранения.",
    savedWithTable:
      "Сохранено. Таблица {table} создана — признак работает с этой минуты, пересборка не нужна.",
    submit: "Сохранить",
    submitting: "Сохраняем…",
    summary:
      "Что проект умеет вынимать из сообщения: дату события, деньги, место, связь со сказанным раньше. Каждый признак — объявленная способность, а не ярлык.",
    title: "Реестр признаков",
    titleLabel: "Название",
    valueTypeLabel: "Форма значения",
    valueTypes: {
      date: "Дата",
      flag: "Да или нет",
      geo: "Координаты",
      list: "Список",
      money: "Деньги",
      number: "Число",
      relation: "Связь между сообщениями",
      text: "Текст",
    },
  },
  helpLess: "Свернуть",
  helpMore: "Узнать больше",
  logs: {
    counted: "сообщений: {n}",
    emptyNoMessages:
      "Бот настроен и слушает — ему просто ещё никто не написал. Пусто здесь потому, что показывать нечего, а не потому, что что-то отказало.",
    emptyNoToken:
      "Здесь пока пусто, и причина простая: у бота нет токена. Сохраните его в «Настройках», и он начнёт слушать.",
    emptyNotLinked:
      "Бот жив, но учётная запись ещё не привязана, поэтому ему никто не писал. Привяжите свою в «Настройках» — и первое сообщение появится здесь.",
    forwarded: "переслано от",
    fromBot: "бот",
    fromPerson: "человек",
    kindFile: "файл",
    kindLocation: "место",
    kindVoice: "голос",
    lead: "Всё, что доходит до бота, и всё, что он отвечает, служба каналов складывает у себя — весь разговор целиком, со дня запуска проекта и до тех пор, пока жив сервер. Это и есть та запись, старые сверху.",
    live: "Обновляется, пока раздел открыт",
    refresh: "Обновить",
    refreshing: "Обновляю…",
    ringNote:
      "Отсюда ничего не удаляется: журнал хранит всю переписку, пока жив сервер. Разом загружается только свежая часть.",
    title: "Что бот услышал",
  },
  automations: {
    calendar: { any: "Календарь: всё равно", no: "Без календаря", yes: "По таймеру" },
    demo: "Выдуманные записи: настоящие цепочки придут из логов следующим шагом.",
    empty: "Под этот отбор ничего не попало.",
    first: "Первая страница",
    last: "Последняя страница",
    map: { any: "Карта: всё равно", no: "Без меток", yes: "С метками на карте" },
    next: "Вперёд",
    open: "Открыть страницу в новой вкладке",
    page: "Страница {n} из {of}",
    perPage: "На странице",
    prev: "Назад",
    preview: "Показать здесь",
    previewClose: "Скрыть предпросмотр",
    reset: "Сбросить отбор",
    search: "Поиск по названию или метке",
    searchDo: "Найти",
    shown: "Показано {from}-{to} из {total}",
    sortNew: "Сначала новые",
    sortOld: "Сначала старые",
    status: { any: "Любое состояние", done: "Завершена", running: "В процессе" },
    steps: "сообщений: {n}",
  },
  menuTitle: "Telegram-бот",
  terminalLabel: "Терминал",
  openai: {
    badFormat: "Это не похоже на ключ OpenAI — они начинаются с sk-",
    balanceNote:
      "Остаток показать нельзя: OpenAI отдаёт его только браузерной сессии вашего кабинета или админскому ключу с правом api.usage.read. Обычный проектный ключ его не видит.",
    check: "Проверить",
    checking: "Проверяю…",
    consumerApp: "этот проект",
    consumerData: "слой данных",
    consumerGraph: "граф знаний",
    exists: "Ключ OpenAI существует",
    failed: "Действие не выполнено",
    funded: "Баланс положительный",
    fundsUnknown: "Про средства ответить не удалось — попробуйте позже",
    invalid: "OpenAI этот ключ не принял",
    keyLabel: "Ключ с platform.openai.com",
    keyPlaceholder: "sk-…",
    keyReplace: "Вставьте новый ключ, чтобы заменить сохранённый",
    lead: "Рекомендуется, но не обязателен. На этом ключе живёт память Fractera: векторная база и агентный RAG, то есть граф знаний. С ним бот помнит сказанное, ищет по смыслу и отвечает по вашим документам, а не по последним нескольким сообщениям — именно это делает работу с Telegram-ботом полноценной. Без ключа бот работает, просто своей памяти у него нет.",
    missing: "Ключ OpenAI не задан",
    noFunds: "Ключ рабочий, но на счёте кончились средства",
    partial: "Ключ доехал не до всех служб",
    restartNote:
      "Проект перезапускается, чтобы прочитать новый ключ; служба каналов читает его сразу.",
    save: "Сохранить",
    saved: "Ключ OpenAI сохранён",
    saving: "Сохраняю…",
    title: "Ключ OpenAI",
    valid: "Ключ верный",
  },
  pages: {
    about: {
      hint: "Зачем боту существовать в этом проекте и как он устроен.",
      title: "Описание",
    },
    logs: {
      hint: "Бот выбирает один из двух режимов. Быстрый и дешёвый — на реестре признаков, для большинства простых задач. Сложный, рекурсивно эволюционирующий — на агенте, наращивающем навыки, MCP, внешние API и ИИ-браузеры для исследований.",
      title: "Логи",
    },
    passport: {
      hint: "Что мы строим, зачем и как это устроено сегодня. Живой документ: правится по мере того, как решения принимаются.",
      title: "Паспорт",
    },
    settings: {
      hint: "Токен, связь и всё, без чего бот не отвечает.",
      title: "Настройки",
    },
  },

  parse: {
    colAction: "Следующее действие",
    colInstruction: "Инструкция",
    colKind: "Признак",
    colNo: "№",
    colSource: "Инструмент",
    colTime: "Время",
    colWhat: "Выход",
    details:
      "Строки появляются по мере готовности, а не разом. Первая — запрос как он пришёл, с точностью до миллисекунды. Затем, если было вложение, — что из него прочитано. Затем, если сообщение ссылается на сказанное раньше, — на что именно и почему выбрано оно. Затем план: какие признаки реестра в этом запросе есть. Затем по строке на признак: извлечённые значения и таблица, в которую они лягут.\n\nЗапись здесь всегда РОВНО ОДНА, и следующий запрос её заменяет — это рабочий материал, а не история. Вчерашний разбор не хранится: смысл экрана в том, чтобы видеть, как система думает сейчас, а позже эта запись разъедется по таблицам признаков и освободится под следующий разговор.\n\nВ сами таблицы пока ничего не пишется. Строка называет, куда значение легло бы, но не кладёт его туда.",
    emptyNoRequests:
      "Боту ещё никто не писал. Первое сообщение будет разобрано здесь.",
    emptyNotLinked:
      "Бот ещё не привязан к чату. Привяжите его в «Настройках», напишите ему — и разбор этого сообщения появится здесь.",
    emptyServiceDown:
      "Служба каналов не запущена — до бота ничего не доходит, и разбирать нечего.",
    intakeToolWhat:
      "Канал, которым пришло сообщение, и человек, который его прислал. Здесь ничего не интерпретируется: это сырьё, с которым сверяют всё остальное.",
    kinds: {
      evolve: "Эволюция реестра признаков",
      extract: "Прочитано из вложения",
      intake: "Сырой запрос",
      match: "Поиск признаков",
      plan: "План",
      resolve: "Поиск связи с предыдущим сообщением",
      reveal: "Признак",
      store: "Сохранение сообщения",
    },
    nextAfterIntake:
      "Узнать, каким элементам реестра признаков соответствует сообщение.",
    noWords: "Своих слов нет — сообщение пришло вложением.",
    sources: {
      http: "внешняя служба",
      map: "служба карт",
      model: "модель",
      none: "принято как есть",
      rag: "граф знаний",
      table: "база проекта",
      vector: "векторное хранилище",
    },
    summary:
      "Одно сообщение, разобранное у вас на глазах. Не итог, а ход рассуждения: что пришло, что из этого прочитано, какие признаки реестра в нём нашлись и чем каждый из них станет при сохранении.",
    title: "Разбор запроса",
    via: "{name}",
    viewAll: "Посмотреть всё",
  },
  settings: {
    addBot: "Добавить бота",
    addedBot: "Бот добавлен — впишите его токен",
    addingBot: "Добавляю…",
    answersFrom: "После привязки бот отвечает из базы знаний этого проекта.",
    botsTitle: "Telegram-боты: {n}",
    botUnnamed: "Бот {n} — без токена",
    channelOn: "Канал включён",
    confirmRemoveBot: "Нажмите ещё раз, чтобы убрать",
    connect: "Привязать свою учётную запись",
    currentBot: "Текущий бот:",
    failed: "Действие не выполнено",
    helpLabel: "Что такое канал и чем он не является",
    helpLink:
      "Ссылка открывается в мессенджере, где её видит всякий, кто видит экран. Код, работающий дважды, позволил бы кому-то другому привязать к вашему проекту свою учётную запись — поэтому он работает один раз и истекает.",
    helpLinkTitle: "Почему привязке нужен одноразовый код.",
    helpOff:
      "Переключатель останавливает ответы бота, не удаляя ни токен, ни привязку, — это удобно, пока вы меняете базу знаний и не хотите, чтобы кто-то получал недостроенные ответы.",
    helpOffTitle: "Что делает выключение канала.",
    helpWhat:
      "Дверь в ваш проект из мессенджера, а не из браузера. Человек пишет вашему боту и получает ответ, собранный из вашей же базы знаний, — без отдельного приложения и без страницы входа.",
    helpWhatTitle: "Что это даёт.",
    helpWhy:
      "Токен принадлежит боту, которого создали вы, поэтому разговор идёт между вашими посетителями и вашим сервером. Через нас не проходит ничего, а если вы переедете на другой сервер, бот переедет вместе с токеном.",
    helpWhyTitle: "Почему свой бот, а не наш.",
    linkExpired: "Код истёк — нажмите «Привязать» снова.",
    linkedTo: "привязано к {who}",
    linkedToast: "Привязано к",
    linkFailed: "Привязку начать не удалось.",
    linkTimeout: "Привязка не дождалась ответа — нажмите «Привязать» снова.",
    neverInvents:
      "Ответ он не выдумывает: если база пуста или служба выключена, он так и говорит.",
    noToken: "токен не задан",
    notLinked: "токен сохранён, учётная запись не привязана",
    openTelegram: "открыть Telegram",
    relink: "Привязать другую учётную запись",
    removeBot: "Убрать",
    removedBot: "Бот убран. Переписка сохранена.",
    removingBot: "Убираю…",
    save: "Сохранить",
    saved: "Токен бота сохранён",
    saving: "Сохраняю…",
    scheduleEvery: "Каждые {n} сек",
    scheduleHint:
      "Как часто у приложения спрашивают, не наступило ли напоминание. Напоминание обязано сработать, когда на сайт никто не смотрит, — значит кто-то должен постучать, и это он. «Выключено» означает, что напоминаний в проекте нет и платить за них не нужно.",
    scheduleLabel: "Расписание",
    scheduleOff: "Выключено",
    scheduleSaved: "Расписание сохранено",
    serviceDown:
      "Служба каналов не запущена, поэтому настроить здесь пока нечего.",
    tokenLabel: "Токен бота от @BotFather",
    tokenPlaceholder: "123456789:AA…",
    tokenRejected:
      "Токен сохранён, но Telegram его не узнаёт. Либо он набран с ошибкой, либо отозван в @BotFather — получите там новый и сохраните снова.",
    tokenReplace: "Вставьте новый токен, чтобы заменить сохранённый",
    waiting: "Жду нажатия «Старт» в Telegram…",
  },
  skeleton: {
    inProgress: "В процессе разработки",
    instructionLead:
      "Текст, который вы пишете сами, а бот исполняет вдобавок к своим правилам: ваши ограничения, ваш тон, ваша предметная область. Он добавляется к инструкции бота, а не заменяет её.",
    instructionTitle: "Ваша собственная инструкция боту",
    views: {
      automations: "Автоматизации",
      db: "База данных",
      media: "Медиатека",
      parse: "Разбор запроса",
      rag: "Агентный RAG",
      vectors: "Векторное хранилище",
    },
  },
  soonLead:
    "Место под него здесь, и оно намеренно пустое, а не спрятанное: раздел, появившийся потом из ниоткуда, заметить труднее, чем тот, который сам сказал, что он будет.",
  soonPanel:
    "вкладка «Каналы связи» панели управления — ссылка на неё в подвале сайта.",
  soonTitle: "Этот раздел ещё не построен",
  soonWhere: "Где это работает сегодня:",
  subtitle:
    "Личный инструмент архитектора: позволяет создавать самые разные автоматизации при помощи Claude Code и специальной памяти Fractera.",
  title: "Telegram-бот",
};

const DICT: Record<string, TelegramUi> = { en: EN, ru: RU };

export function telegramUi(lang: string): TelegramUi {
  return DICT[lang] ?? DICT.en;
}
