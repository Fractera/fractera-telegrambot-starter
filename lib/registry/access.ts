import factsIndex from "../../REGISTRY-CONFIG/index.json"
import toolsIndex from "../../TOOLS-CONFIG/index.json"
import { dataFetch } from "@/lib/fractera/data-service"
import { allFacts } from "@/lib/facts/registry"
import { existingFactTables } from "@/lib/facts/ensure"
import { factTableName } from "@/lib/facts/table"
import { allTools } from "@/lib/tools/store"
import { stems } from "./text.mjs"

// ЕДИНЫЙ ВХОД В ОБА РЕЕСТРА — ЧЕТЫРЕ ПРИМИТИВА (157-5, паспорт §3о).
//
// 🔒 ИХ ЧЕТЫРЕ, А НЕ ПЯТЬ, И КОРПУС У НИХ ПАРАМЕТР. Отдельная дверь «есть ли
// инструмент под задачу» — это `find` по другому корпусу; заведи её отдельно, и
// через месяц у двух дверей разошлась бы форма ответа.
//
// 🔒 ФОРМА ОТВЕТА ОДНА НА ОБА КОРПУСА. У признаков поля зовутся `key`/`title`/
// `description`, у инструментов — `id`/`name`/`what`. Сводится это здесь, а не у
// потребителя: иначе «единый вход» существует только на словах.
//
// 🔒 ПРОМАХ — ИСХОД, А НЕ ПУСТОТА (закон ядра 3). `found: false` называет, по
// каким словам искали. Пустой результат и сломанный поиск обязаны выглядеть
// по-разному — тот же закон, что у лент (`db` · `empty` · `down`).
//
// 🔒 У КАЖДОГО ОТВЕТА ПОТОЛОК (закон ядра 4): плохой запрос стоит ограниченно,
// а не всё окно. `total` при этом называется всегда — обрезанный ответ, молчащий
// о том, что он обрезан, лжёт.

export const CORPORA = ["facts", "tools"] as const
export type Corpus = (typeof CORPORA)[number]

export function isCorpus(v: unknown): v is Corpus {
  return typeof v === "string" && (CORPORA as readonly string[]).includes(v)
}

/** Строка указателя: то, что возвращают `list` и `find`. Тел не носит. */
export type Pointer = {
  key: string
  name: string
  /** Уровень записи: различает род сообщения и факт о человеке. */
  level: string
  what: string
  tags: string[]
  answers: string[]
  /** Происхождение: файл и ключ. Закон ядра 2 — ответ обязан быть проверяемым. */
  where: string
}

export type Hit = Pointer & {
  /** Чем именно совпало — строки триггеров и вопросов, а не «релевантность». */
  why: string[]
}

export type Found<T> = {
  found: true
  corpus: Corpus
  /** Сколько подошло всего, до потолка. */
  total: number
  /** Обрезан ли ответ потолком. */
  truncated: boolean
  items: T[]
}

export type Miss = {
  found: false
  corpus: Corpus
  /** По каким словам искали — вход для дописывания триггера. */
  searched: string[]
  hint: string
}

export type Answer<T> = Found<T> | Miss

// 🔒 ПОТОЛКИ ЗАПРОСА — ЗАЩИТА ОКНА МОДЕЛИ, А НЕ СЕРВЕРА (158-2).
/** Сколько символов запроса вообще разбирается. */
const QUERY_CAP = 2000
/** Сколько основ берётся в работу после разбора. */
const STEMS_CAP = 40
/** Сколько промахов держим: журнал — рабочий список, а не архив. */
const MISSES_CAP = 200

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

const SOURCE: Record<Corpus, string> = {
  facts: "REGISTRY-CONFIG/registry-config.json",
  tools: "TOOLS-CONFIG/tools-config.json",
}

function cap(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT
  }
  return Math.min(Math.floor(limit), MAX_LIMIT)
}

type IndexEntry = {
  key: string
  name: string
  level: string
  what: string
  tags: string[]
  answers: string[]
  triggers: string[]
}

const INDEX: Record<Corpus, IndexEntry[]> = {
  facts: (factsIndex as { entries: IndexEntry[] }).entries,
  tools: (toolsIndex as { entries: IndexEntry[] }).entries,
}

/**
 * Все записи корпуса — ИЗ ПОРОЖДЁННОГО УКАЗАТЕЛЯ, а не из конфига.
 *
 * ✗ ОПЛАЧЕНО ЖИВЫМ ЗАМЕРОМ 2026-09-07: первая версия примитивов читала конфиги
 * напрямую, и указатель, ради которого всё затевалось, не читал НИКТО. Внешне
 * работало — и именно поэтому дефект прожил бы долго.
 *
 * 🔒 УКАЗАТЕЛЬ — ЕДИНСТВЕННЫЙ ИСТОЧНИК ФОРМЫ ДЛЯ `list` И `find`. Он порождён,
 * его свежесть стережёт сборка, и он уже свёл разные имена полей двух реестров
 * к одной форме. Тела записей живут в конфигах, и за ними ходит `describe`.
 */
function pointers(corpus: Corpus): IndexEntry[] {
  return INDEX[corpus] ?? []
}

function withWhere(corpus: Corpus, e: IndexEntry): Pointer & { triggers: string[] } {
  return { ...e, where: `${SOURCE[corpus]}#${e.key}` }
}

function bare(p: Pointer & { triggers: string[] }): Pointer {
  return {
    key: p.key,
    name: p.name,
    level: p.level,
    what: p.what,
    tags: p.tags,
    answers: p.answers,
    where: p.where,
  }
}

// Сравнение слов живёт в `./text.mjs` — общем с сборщиком указателя: две
// реализации нормализации разошлись бы, и указатель искался бы иначе, чем
// строился.

// ── ПРИМИТИВ 1: `list` — что вообще существует ─────────────────────────────

export function list(
  corpus: Corpus,
  opts: { tags?: string[]; limit?: number } = {}
): Answer<Pointer> {
  const limit = cap(opts.limit)
  const asked = opts.tags ?? []
  const want = asked.filter(t => typeof t === "string" && t !== "")
  // 🛑 ОТБРОШЕННЫЙ ТЕГ — ОТКАЗ, А НЕ МОЛЧАЛИВОЕ РАСШИРЕНИЕ ВЫДАЧИ.
  // ✗ НАЙДЕНО МЕТОДИКОЙ `stress-test-capability`, класс 6 (2026-09-07): `tags: [1, 2]`
  // отфильтровывалось в пустой список, сужение молча исчезало, и человек получал
  // ВЕСЬ корпус вместо отказа — то есть уверенный ответ «все 35 записей помечены
  // этими тегами». Просили сузить — обязаны либо сузить, либо объяснить, почему нет.
  if (asked.length > 0 && want.length === 0) {
    return {
      found: false,
      corpus,
      searched: asked.map(t => String(t)),
      hint: "теги обязаны быть строками из словаря lib/registry/tags.ts — сужение не применено",
    }
  }
  const all = pointers(corpus)
  const matched = want.length === 0 ? all : all.filter(p => want.some(t => p.tags.includes(t)))
  if (matched.length === 0) {
    return {
      found: false,
      corpus,
      searched: want,
      hint:
        want.length === 0
          ? "корпус пуст"
          : `ни одна запись не помечена этими тегами; словарь тегов — lib/registry/tags.ts`,
    }
  }
  return {
    found: true,
    corpus,
    total: matched.length,
    truncated: matched.length > limit,
    items: matched.slice(0, limit).map(e => bare(withWhere(corpus, e))),
  }
}

// ── ПРИМИТИВ 2: `find` — какие ключи отвечают этим словам ──────────────────

export function find(
  corpus: Corpus,
  query: string,
  opts: { limit?: number } = {}
): Answer<Hit> {
  const limit = cap(opts.limit)
  // 🛑 У ЗАПРОСА ЕСТЬ ПОТОЛОК, И ОН ЗАЩИЩАЕТ НЕ СЕРВЕР, А ОКНО МОДЕЛИ.
  // ✗ НАЙДЕНО МЕТОДИКОЙ `stress-test-capability`, класс 7 (2026-09-07): запрос в
  // 187 КБ отрабатывал за 0,167 с и возвращал в `searched` СЕМНАДЦАТЬ ТЫСЯЧ основ.
  // Сервер выстоял; ответ съел бы контекст агента целиком — то есть отказ выглядел
  // бы успехом и стоил дороже отказа.
  // 🔒 ОБРЕЗАЕТСЯ И ВХОД, И ОТЧЁТ О НЁМ: длинный запрос разбирается по первым
  // словам, а `searched` называет не больше `STEMS_CAP` — этого хватает, чтобы
  // дописать триггер, и не хватает, чтобы залить окно.
  const asked = stems(String(query ?? "").slice(0, QUERY_CAP)).slice(0, STEMS_CAP)
  if (asked.length === 0) {
    return {
      found: false,
      corpus,
      searched: [],
      hint: "в запросе нет слов длиннее двух букв — искать нечем",
    }
  }
  const scored: { hit: Hit; score: number }[] = []
  for (const e of pointers(corpus)) {
    const p = withWhere(corpus, e)
    // 🔒 ДВЕ ПОВЕРХНОСТИ, А НЕ ОДНА, И ВЕС У НИХ РАЗНЫЙ. Триггеры и вопросы
    // ПИСАЛИСЬ как поисковая мишень; имя и описание — как объяснение человеку.
    // ✗ измерено 2026-09-07: без разделения запрос «напомни через две минуты»
    // цеплял признак «когда это случилось» словом «минуту» из чужого описания.
    const strong = [...e.triggers, ...e.answers]
    const weak = [e.name, e.what]
    const why: string[] = []
    const hitStrong = new Set<string>()
    const hitWeak = new Set<string>()
    for (const s of strong) {
      const hay = new Set(stems(s))
      const common = asked.filter(a => hay.has(a))
      if (common.length === 0) continue
      if (why.length < 5) why.push(s)
      for (const c of common) hitStrong.add(c)
    }
    for (const s of weak) {
      const hay = new Set(stems(s))
      const common = asked.filter(a => hay.has(a))
      if (common.length === 0) continue
      for (const c of common) hitWeak.add(c)
    }
    // 🛑 ПОРОГ: либо совпало по словам человека, либо по объяснению — но не
    // одним словом. Одно случайное слово в описании — это шум, и выглядит он
    // как работающий поиск, что хуже пустой выдачи.
    const passes = hitStrong.size > 0 || hitWeak.size >= 2
    if (!passes) continue
    if (why.length === 0) {
      why.push(...weak.filter(w => w).slice(0, 1))
    }
    scored.push({ hit: { ...bare(p), why }, score: hitStrong.size * 2 + hitWeak.size })
  }
  if (scored.length === 0) {
    // 🔒 ПРОМАХ ЗАПИСЫВАЕТ ДВЕРЬ, А НЕ ЭТА ФУНКЦИЯ, И ЭТО НЕ МЕЛОЧЬ РАЗМЕЩЕНИЯ.
    // ✗ ОПЛАЧЕНО ИЗМЕРЕНИЕМ 2026-09-07: первая версия звала запись отсюда через
    // `void` — обещание в ответе печаталось, а строк в таблице не появлялось
    // НИ ОДНОЙ: незавершённое обещание умирает вместе с ответом. `list`, `find`
    // и `describe` — чистые функции над указателем, и ввод-вывод им не место.
    // Паспорт §3о объявляет порядок «поиск → промах → модель → фраза уезжает в
    // `triggers`». Без записи промаха последний шаг делать некому: фраза
    // исчезает вместе с разговором, и через месяц «без модели» значит «модель
    // зовётся всегда, просто позже».
    // 🛑 ЗАПИСЬ НЕ ПРАВИТ РЕЕСТР САМА. Дописать триггер — работа автора записи по
    // навыку `create-registry-entry`; система, правящая собственную поисковую
    // поверхность, перестала бы быть проверяемой.
    return {
      found: false,
      corpus,
      searched: asked.slice(0, STEMS_CAP),
      hint:
        "механический поиск промахнулся. Дальше — модель, а промахнувшуюся фразу " +
        "дописать в `triggers` нужной записи (навык create-registry-entry). " +
        "Промах записан в registry_search_misses.",
    }
  }
  // Больше совпавших основ — выше; при равенстве порядок ключа, чтобы выдача
  // была воспроизводимой, а не зависела от порядка файла.
  scored.sort((a, b) => b.score - a.score || a.hit.key.localeCompare(b.hit.key))
  return {
    found: true,
    corpus,
    total: scored.length,
    truncated: scored.length > limit,
    items: scored.slice(0, limit).map(s => s.hit),
  }
}

/**
 * Записать промах поиска, чтобы фразе было куда попасть.
 *
 * 🔒 ОТКАЗ ЗАПИСИ НЕ ЛОМАЕТ ПОИСК. Промах уже случился, ответ человеку от этого
 * не зависит; уронить `find` из-за того, что не удалось записать наблюдение,
 * значило бы обменять способность на дневник.
 * 🔒 ТАБЛИЦА СОЗДАЁТСЯ ПРИ ПЕРВОЙ ЗАПИСИ — так же, как таблицы признаков: ни
 * миграций, ни отдельного шага развёртывания.
 */
export async function rememberMiss(corpus: Corpus, query: string, asked: string[]): Promise<void> {
  const text = String(query ?? "").slice(0, 500)
  if (text.trim() === "") return
  try {
    await dataFetch("/db/migrate", {
      method: "POST",
      body: JSON.stringify({
        sql:
          "CREATE TABLE IF NOT EXISTS registry_search_misses (" +
          "id INTEGER PRIMARY KEY AUTOINCREMENT, corpus TEXT, query TEXT, stems TEXT, " +
          "times INTEGER DEFAULT 1, last_at TEXT, " +
          "created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
      }),
    })
    // 🔒 ОДНА ФРАЗА — ОДНА СТРОКА, А ПОВТОР СЧИТАЕТСЯ ЧИСЛОМ. ✗ долг, названный в
    // 157-5: журнал рос без границы, и десять одинаковых промахов выглядели
    // десятью разными задачами. Повтор — это не новый промах, а **вес** старого:
    // фраза, промахнувшаяся десять раз, важнее десяти разных, промахнувшихся по разу.
    // 🛑 КОЛОНКА — НЕ ТАБЛИЦА (закон проекта, оплаченный дважды). У журнала,
    // созданного 157-5, колонок счёта нет, и `CREATE TABLE IF NOT EXISTS` их не
    // добавит НИКОГДА. Лестница исполняется всегда; «колонка уже есть» —
    // нормальный исход второго прогона, а не отказ.
    for (const col of ["times INTEGER DEFAULT 1", "last_at TEXT"]) {
      await dataFetch("/db/migrate", {
        method: "POST",
        body: JSON.stringify({
          sql: `ALTER TABLE registry_search_misses ADD COLUMN ${col}`,
        }),
      })
    }

    const bump = await dataFetch("/db/migrate", {
      method: "POST",
      body: JSON.stringify({
        sql:
          "UPDATE registry_search_misses SET times = COALESCE(times, 1) + 1, " +
          "last_at = CURRENT_TIMESTAMP WHERE corpus = ? AND query = ?",
        params: [corpus, text],
      }),
    })
    const changed = bump.ok
      ? ((await bump.json()) as { changes?: number }).changes ?? 0
      : 0
    if (changed === 0) {
      await dataFetch("/db/migrate", {
        method: "POST",
        body: JSON.stringify({
          sql:
            "INSERT INTO registry_search_misses (corpus, query, stems, times, last_at) " +
            "VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)",
          params: [corpus, text, asked.join(" ")],
        }),
      })
      // 🛑 ГРАНИЦА РОСТА НАЗВАНА В КОДЕ, А НЕ В НАМЕРЕНИИ. Журнал — рабочий
      // список того, что стоит дописать в триггеры, а не архив: разросшийся до
      // тысяч строк, он перестаёт читаться и потому перестаёт работать.
      // Уходят самые редкие и самые старые — у них меньше всего шансов
      // превратиться в триггер.
      await dataFetch("/db/migrate", {
        method: "POST",
        body: JSON.stringify({
          sql:
            "DELETE FROM registry_search_misses WHERE id NOT IN " +
            `(SELECT id FROM registry_search_misses ORDER BY COALESCE(times, 1) DESC, id DESC LIMIT ${MISSES_CAP})`,
        }),
      })
    }
  } catch {
    /* наблюдение не записалось — поиск от этого не страдает */
  }
}

// ── ПРИМИТИВ 3: `describe` — полное определение одной записи ───────────────

export type Described = {
  found: true
  corpus: Corpus
  where: string
  record: Record<string, unknown>
}

export function describe(corpus: Corpus, key: string): Described | Miss {
  const wanted = String(key ?? "").trim().toLowerCase()
  const rec =
    corpus === "facts"
      ? allFacts().find(f => f.key === wanted)
      : allTools().find(t => t.id === wanted)
  if (!rec) {
    return {
      found: false,
      corpus,
      searched: [wanted],
      hint: "записи с таким ключом нет; ключи берут из `list` или `find`",
    }
  }
  return {
    found: true,
    corpus,
    where: `${SOURCE[corpus]}#${wanted}`,
    record: rec as unknown as Record<string, unknown>,
  }
}

// ── ПРИМИТИВ 4: `recall` — что об этом уже известно ────────────────────────
//
// 🛑 `SELECT *` ПО ТАБЛИЦАМ ПРИЗНАКОВ ЗАПРЕЩЁН (закон 83): поднятая лестницей
// таблица и вновь созданная имеют один набор колонок в разном порядке, и
// позиционное чтение ломается ТОЛЬКО у того, у кого система уже поработала.
// Поэтому колонки названы поимённо.

export type Value = {
  id: number
  value: string | number | null
  subject: string | null
  scope: string | null
  status: string | null
  at: string | null
}

export type Recalled =
  | { found: true; key: string; table: string; total: number; truncated: boolean; items: Value[] }
  | (Miss & { key: string })
  | { found: false; corpus: "facts"; key: string; error: string; hint: string; searched: string[] }

export async function recall(
  key: string,
  opts: { subject?: string; scope?: string; limit?: number } = {}
): Promise<Recalled> {
  const wanted = String(key ?? "").trim().toLowerCase()
  const fact = allFacts().find(f => f.key === wanted)
  if (!fact) {
    return {
      found: false,
      corpus: "facts",
      key: wanted,
      searched: [wanted],
      hint: "признака с таким ключом в реестре нет; ключи берут из `find`",
    }
  }
  // ── ГДЕ У ЭТОГО ПРИЗНАКА ЖИВУТ ЗНАЧЕНИЯ ─────────────────────────────────
  //
  // ✗ ОПЛАЧЕНО ЖИВЫМ ЗАМЕРОМ 2026-09-07, И ЭТО БЫЛ САМЫЙ ДОРОГОЙ ИЗ ДЕФЕКТОВ
  // ЭТОГО ШАГА. Первая версия спрашивала таблицу `fact_<ключ>` у любого признака.
  // Измерено: таких таблиц в базе НЕТ НИ ОДНОЙ, все 35 признаков встроенные, и
  // `storedIn` у них указывает на колонку чужой таблицы либо прямо говорит «в
  // базе не хранится». То есть примитив отвечал «слой данных не ответил» там, где
  // ответ должен был быть «этот признак значений не хранит» — уверенная ложь
  // вместо честного «нечего вспоминать».
  //
  // 🔒 ИМЕНА ТАБЛИЦ И КОЛОНОК ПРОВЕРЯЮТСЯ БЕЛЫМ СПИСКОМ. `storedIn` пишет агент
  // в конфиг; попав в запрос без проверки, оно перестало бы быть адресом и стало
  // бы SQL — тот же закон, что у имени таблицы признака (81-2).
  const stored = String(fact.storedIn ?? "").trim()
  const NAME = /^[a-z][a-z0-9_]*$/
  const own = factTableName(wanted)
  let table = ""
  let column = ""
  if (own && stored === own) {
    table = own
  } else {
    const dot = stored.split(".")
    if (dot.length === 2 && NAME.test(dot[0]) && NAME.test(dot[1])) {
      table = dot[0]
      column = dot[1]
    }
  }
  if (!table) {
    return {
      found: false,
      corpus: "facts",
      key: wanted,
      searched: [wanted],
      // 🔒 «НЕ ХРАНИТСЯ» — ЗАКОННЫЙ ОТВЕТ, А НЕ ОТКАЗ. Признак бывает ветвью
      // разбора: он влияет на поведение и значения после себя не оставляет.
      hint: stored
        ? `значений у признака нет по устройству: ${stored}`
        : "у признака не назван адрес хранения — вспоминать нечего",
    }
  }
  // 🛑 ТАБЛИЦЫ ЕЩЁ НЕТ — ЭТО «ЗНАЧЕНИЙ НЕ БЫЛО», А НЕ ОТКАЗ СЛОЯ ДАННЫХ.
  // ✗ НАЙДЕНО ЖИВЬЁМ 2026-09-07 на первом же незаполненном признаке личности:
  // `recall(person.name)` отвечал `http-500` и подсказкой «слой данных не
  // ответил». Для тринадцати пустых ячеек это был бы ЕДИНСТВЕННЫЙ ответ —
  // то есть человек видел бы поломку там, где просто ещё ничего не говорил.
  // 🔒 ПРОВЕРЯЕТСЯ СПИСКОМ ТАБЛИЦ, А НЕ ТЕКСТОМ ОШИБКИ: разбирать сообщение
  // чужой службы значит привязаться к её формулировке, которая изменится молча.
  if (!column) {
    const have = await existingFactTables()
    if (!have.has(table)) {
      return {
        found: false,
        corpus: "facts",
        key: wanted,
        searched: [wanted],
        hint: "признак описан, но значений у него ещё не было — таблица появится с первой записью",
      }
    }
  }
  const limit = cap(opts.limit)
  const where: string[] = []
  const params: unknown[] = []
  if (column) {
    // Значение лежит колонкой чужой таблицы: сужать по субъекту и охвату нечем —
    // этих колонок там нет. Молчаливое игнорирование сужения было бы ответом «по
    // всем данным», который человек примет за ответ по своим.
    if (opts.subject || opts.scope) {
      return {
        found: false,
        corpus: "facts",
        key: wanted,
        searched: [wanted, opts.subject ?? "", opts.scope ?? ""].filter(Boolean),
        hint: `значения лежат колонкой ${stored} — сужение по субъекту и охвату там невозможно`,
      }
    }
    where.push(`${column} IS NOT NULL`)
  } else {
    if (opts.subject) {
      where.push("subject_key = ?")
      params.push(opts.subject)
    }
    if (opts.scope) {
      where.push("scope_key = ?")
      params.push(opts.scope)
    }
  }
  const clause = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""
  const sql = column
    ? `SELECT id, ${column} AS value_text, created_at FROM ${table}${clause} ` +
      `ORDER BY id DESC LIMIT ${limit + 1}`
    : `SELECT id, value_text, value_num, subject_key, scope_key, status, created_at ` +
      `FROM ${table}${clause} ORDER BY id DESC LIMIT ${limit + 1}`
  let rows: Record<string, unknown>[] = []
  try {
    const r = await dataFetch("/db/migrate", {
      method: "POST",
      body: JSON.stringify({ sql, params }),
    })
    if (!r.ok) {
      return {
        found: false,
        corpus: "facts",
        key: wanted,
        error: `http-${r.status}`,
        searched: [wanted],
        // 🔒 «СЛОЙ ДАННЫХ МОЛЧИТ» И «ЗНАЧЕНИЙ НЕТ» — РАЗНЫЕ ОТВЕТЫ. Слить их
        // значило бы уверенно сказать «не знаю» там, где просто не спросили.
        hint: "слой данных не ответил — это не «значений нет», это отказ",
      }
    }
    const body = (await r.json()) as { rows?: Record<string, unknown>[] }
    rows = Array.isArray(body.rows) ? body.rows : []
  } catch {
    return {
      found: false,
      corpus: "facts",
      key: wanted,
      error: "unreachable",
      searched: [wanted],
      hint: "слой данных недоступен — это не «значений нет», это отказ",
    }
  }
  if (rows.length === 0) {
    return {
      found: false,
      corpus: "facts",
      key: wanted,
      searched: [wanted, opts.subject ?? "", opts.scope ?? ""].filter(Boolean),
      hint: "признак описан, но значений у него ещё нет",
    }
  }
  // 🔒 `total` ЗНАЧИТ ОДНО И ТО ЖЕ У ВСЕХ ПРИМИТИВОВ: сколько подошло ВСЕГО, а не
  // сколько показано. ✗ первая версия возвращала здесь длину показанного, и
  // «всего 20» при тысяче строк было бы уверенной ложью — та же форма ответа,
  // другое значение поля. Цена честности — один счётный запрос.
  const truncated = rows.length > limit
  let total = rows.length
  if (truncated) {
    try {
      const cr = await dataFetch("/db/migrate", {
        method: "POST",
        body: JSON.stringify({ sql: `SELECT COUNT(*) AS n FROM ${table}${clause}`, params }),
      })
      if (cr.ok) {
        const cb = (await cr.json()) as { rows?: { n?: number }[] }
        total = Number(cb.rows?.[0]?.n ?? rows.length)
      }
    } catch {
      // Счёт не добыт — оставляем известное и честно говорим об обрезании.
      total = rows.length
    }
  }
  const items: Value[] = rows.slice(0, limit).map(r => ({
    id: Number(r.id ?? 0),
    value: (r.value_text as string | null) ?? (r.value_num as number | null) ?? null,
    subject: (r.subject_key as string | null) ?? null,
    scope: (r.scope_key as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    at: (r.created_at as string | null) ?? null,
  }))
  return { found: true, key: wanted, table, total, truncated, items }
}
