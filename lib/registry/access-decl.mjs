// ОБЪЯВЛЕНИЕ ПРИМИТИВОВ ДОСТУПА — ОДНО НА ВСЕХ ПОТРЕБИТЕЛЕЙ (157-5, §3о).
//
// 🔒 ТРЕБОВАНИЕ ВЛАДЕЛЬЦА 2026-09-07 ДОСЛОВНО: «это должно быть типизировано и
// валидировано на уровне функций; функции должны быть описаны и объявлены в ядре
// так же, как и параметры, с которыми они применяются».
//
// 🔒 ОБРАЗЕЦ ВЗЯТ У `FactFn` (lib/facts/fn-types.ts, решение владельца
// 2026-09-01), а не изобретён: закрытый список, объявленное поведение, типы.
// Оттуда же переносится главный запрет — **описание, а не код**: `eval` и
// `new Function` здесь не появятся никогда.
//
// 🔒 ФАЙЛ `.mjs`, А НЕ `.ts`, И ЭТО НЕ НЕБРЕЖНОСТЬ. Его читают ДВА потребителя:
// дверь на TypeScript и приёмник инструментов агента на голом JS. Объявление на
// TypeScript пришлось бы либо порождать в JSON, либо переписывать рядом — то
// есть завести второй источник, который разойдётся с первым молча. Приём в
// проекте уже принят: `pty-ticket.mjs` и `mouse-filter.mjs` читаются обоими.
//
// 🛑 ДОБАВИЛ ПРИМИТИВ — ДОБАВЬ ЕГО ЗДЕСЬ, И ТОЛЬКО ЗДЕСЬ. Схема инструмента
// агента порождается из этого списка; описанная в двух местах, она разойдётся
// на первой правке.

//
// 🔒 ПРИМИТИВОВ СТАЛО ПЯТЬ, И ЭТО НЕ ОТМЕНЯЕТ ЗАКОНА «ИХ ЧЕТЫРЕ» (158-5а).
// Тот закон запрещал заводить ОТДЕЛЬНУЮ ДВЕРЬ ДЛЯ ТОГО ЖЕ ВОПРОСА по другому
// корпусу: «есть ли инструмент под задачу» — это `find`, а не новый примитив.
// `remember` — ДРУГОЙ ГЛАГОЛ: он меняет состояние, а не отвечает на вопрос.
// Четыре читают, пятый пишет, и складывать их в один счёт бессмысленно.
//
// 🛑 ПИШЕТ ТОЛЬКО ФАКТЫ О ЧЕЛОВЕКЕ, И ГРАНИЦУ СТЕРЕЖЁТ ДВЕРЬ, А НЕ ОБЪЯВЛЕНИЕ.
// Ключ приходит от модели; без проверки `subject === self` этот примитив стал
// бы способом дописать что угодно в любую таблицу признаков.
/** Потолок ответа общий у всех примитивов: см. `lib/registry/access.ts`. */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

const CORPUS_PARAM = {
  name: "corpus",
  type: "string",
  required: true,
  about: "Какой корпус спрашиваем: facts (признаки — что система умеет вынуть) или tools (инструменты — что система умеет сделать)",
};

const LIMIT_PARAM = {
  name: "limit",
  type: "number",
  required: false,
  about: `Сколько строк вернуть. По умолчанию ${DEFAULT_LIMIT}, потолок ${MAX_LIMIT}. Ответ всегда называет total и truncated`,
};

export const ACCESS_FUNCTIONS = [
  {
    name: "registry_list",
    fn: "list",
    title: "Что вообще есть в реестре",
    about:
      "Перечисляет записи корпуса: ключ, имя, одна фраза «что это», теги и на какие вопросы отвечает. " +
      "Тел записей НЕ возвращает — за телом идти в registry_describe. Можно сузить тегами.",
    params: [
      CORPUS_PARAM,
      {
        name: "tags",
        type: "array",
        required: false,
        about: "Сузить по тегам из закрытого словаря: time · place · person · money · media · text · system · external",
      },
      LIMIT_PARAM,
    ],
    returns: "Указатели: key, name, what, tags, answers, where",
    onMiss: "found:false и список тегов, по которым искали",
  },
  {
    name: "registry_find",
    fn: "find",
    title: "Какие записи отвечают этим словам",
    about:
      "Ищет по словам человека механически, БЕЗ вызова модели: сравнивает основы слов с триггерами, " +
      "вопросами, именем и описанием записи. Возвращает ключи и то, ЧЕМ совпало. " +
      "Зови это ПЕРВЫМ, прежде чем спрашивать человека о том, что система может уже знать.",
    params: [
      CORPUS_PARAM,
      {
        name: "query",
        type: "string",
        required: true,
        about: "Слова человека как они есть — не термин и не ключ. Например «я на канарских островах»",
      },
      LIMIT_PARAM,
    ],
    returns: "Указатели плюс why — строки, по которым совпало",
    onMiss:
      "found:false, чем искали и указание: дальше модель, а промахнувшуюся фразу дописать в triggers нужной записи",
  },
  {
    name: "registry_describe",
    fn: "describe",
    title: "Полное определение одной записи",
    about:
      "Отдаёт запись целиком по ключу и адрес, где она лежит. Ключ берут из registry_find или registry_list — " +
      "угадывать ключ не надо.",
    params: [
      CORPUS_PARAM,
      { name: "key", type: "string", required: true, about: "Ключ записи, например intent.where" },
    ],
    returns: "Запись целиком и where — файл и ключ",
    onMiss: "found:false: записи с таким ключом нет",
  },
  {
    name: "registry_recall",
    fn: "recall",
    title: "Что об этом уже известно",
    about:
      "Значения признака, которые уже накоплены: последние сверху. " +
      "🔒 НА ВОПРОС «ЧТО ТЫ ЗНАЕШЬ ОБО МНЕ» ЗОВИ ОДИН РАЗ С subject=self И БЕЗ key: " +
      "вернётся всё известное сразу. Тринадцать вызовов по ключам стоят тринадцати ходов рассуждения. " +
      "Отказ слоя данных и «значений нет» — РАЗНЫЕ ответы.",
    params: [
      { name: "key", type: "string", required: false, about: "Ключ одного признака. НЕ УКАЗЫВАЙ его, если спрашиваешь всё о человеке — тогда хватит одного subject" },
      { name: "subject", type: "string", required: false, about: "Чей факт. Одного subject БЕЗ key достаточно, чтобы получить ВСЁ известное о человеке ОДНИМ вызовом — так и отвечают на «что ты знаешь обо мне»" },
      { name: "scope", type: "string", required: false, about: "Охват: где факт верен, например geo-city=madrid" },
      LIMIT_PARAM,
    ],
    returns: "Значения: id, value, subject, scope, status, at — и имя таблицы",
    onMiss: "found:false с причиной: признака нет · значений ещё нет · слой данных не ответил",
  },
  {
    name: "registry_remember",
    fn: "remember",
    title: "Запомнить факт о человеке",
    about:
      "Записывает то, что человек сказал О СЕБЕ: как его зовут, как обращаться, какой тон, " +
      "часовой пояс, чего не делать. Ключ берут из registry_find по его словам. " +
      "Зови СРАЗУ, как услышал: незаписанное придётся спрашивать второй раз, и это " +
      "единственное, чего человек не прощает.",
    params: [
      { name: "key", type: "string", required: true, about: "Ключ признака о человеке, например person.name" },
      { name: "value", type: "string", required: true, about: "Значение его словами. Пустое не записывается" },
      { name: "source", type: "string", required: false, about: "Откуда узнал: короткая фраза человека" },
    ],
    returns: "ok и имя таблицы, либо причина отказа",
    onMiss: "ok:false — ключ не признак о человеке · значение пусто · слой данных отказал",
  },
];

/**
 * Схема инструмента MCP, порождённая из объявления.
 *
 * 🔒 ПОРОЖДАЕТСЯ, А НЕ ПИШЕТСЯ РЯДОМ. Схема, написанная руками возле объявления,
 * разойдётся с ним на первой правке параметра — тот же закон, что у чисел в
 * инструкциях, оплаченный в проекте четырежды.
 */
export function mcpToolFrom(decl) {
  const properties = {};
  const required = [];
  for (const p of decl.params) {
    properties[p.name] = { description: p.about, type: p.type };
    if (p.required) {
      required.push(p.name);
    }
  }
  return {
    description: `${decl.title}. ${decl.about} Возвращает: ${decl.returns}. Промах: ${decl.onMiss}.`,
    inputSchema: { properties, required, type: "object" },
    name: decl.name,
  };
}

/** Проверка параметров на границе: чужое и лишнее не проходит. */
export function validateArgs(decl, args) {
  const a = args && typeof args === "object" ? args : {};
  const out = {};
  const problems = [];
  for (const p of decl.params) {
    const v = a[p.name];
    if (v === undefined || v === null) {
      if (p.required) {
        problems.push(`нет обязательного параметра \`${p.name}\` — ${p.about}`);
      }
      continue;
    }
    const ok =
      p.type === "number"
        ? typeof v === "number" && Number.isFinite(v)
        : p.type === "array"
          ? Array.isArray(v)
          : typeof v === "string";
    if (!ok) {
      problems.push(`параметр \`${p.name}\` должен быть ${p.type}, а пришло ${typeof v}`);
      continue;
    }
    out[p.name] = v;
  }
  // 🛑 ЛИШНИЙ ПАРАМЕТР — ОТКАЗ, А НЕ МОЛЧАЛИВОЕ ИГНОРИРОВАНИЕ. Опечатка в имени
  // («subj» вместо «subject») иначе выглядит как честный ответ по всем данным,
  // хотя сужение просто не применилось.
  for (const name of Object.keys(a)) {
    if (!decl.params.some(p => p.name === name)) {
      problems.push(`неизвестный параметр \`${name}\``);
    }
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, args: out };
}
