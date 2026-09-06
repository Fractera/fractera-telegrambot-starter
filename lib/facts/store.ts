import { factTableName } from "./table"
import {
  FACT_AGGREGATE,
  FACT_LEVELS,
  FACT_MODEL,
  FACT_ON_MISSING,
  FACT_SCHEDULES,
  FACT_SUBJECT,
  FACT_VALUE_TYPES,
} from "./types"
import type {
  Fact,
  FactAggregate,
  FactLevel,
  FactLifecycle,
  FactModel,
  FactOnMissing,
  FactProduces,
  FactSchedules,
  FactSubject,
  FactValueType,
} from "./types"
import file from "../../REGISTRY-CONFIG/registry-config.json"

// ЧИТАТЕЛЬ РЕЕСТРА — ЕДИНСТВЕННЫЙ ИСТОЧНИК ЗАПИСЕЙ (2026-09-06).
//
// 🎯 РЕШЕНИЕ ВЛАДЕЛЬЦА 2026-09-06: «сделай так, чтобы все наши существующие
// записи в реестре CONFIG существовали здесь… те данные, которые мы рисуем в
// настройках, читались именно отсюда».
//
// 🔒 ЗДЕСЬ ЛЕЖАТ ВСЕ ЗАПИСИ, ВКЛЮЧАЯ ВСТРОЕННЫЕ, И ЭТО ОТМЕНЯЕТ ПРЕЖНИЙ ПОРЯДОК.
// До этого дня 36 встроенных признаков собирались в коде (`builtin.ts`) из пяти
// списков, а реестр был «код плюс база». Теперь реестр — ОДИН файл, и код его
// читает. Прежний закон 81-1 «встроенные порождаются из кода, а не хранятся
// строками» отменён владельцем: записи создаёт агент, и место им там, где он их
// правит.
//
// 🔒 НО ПРИЧИНА ТОГО ЗАКОНА НЕ ИСЧЕЗЛА, И ОНА ЗАКРЫТА СТОРОЖЕМ, А НЕ ЗАБЫТА.
// Пять списков (`INTENTS`, `ENTRY_KINDS`, `ARTIFACT_KINDS`, `ARRIVAL_KINDS`,
// `INITIATORS`) остаются в коде: они объявлены `as const` и ПОРОЖДАЮТ ТИПЫ —
// перенеси их в JSON, и `Intent` станет обычным `string`, а опечатка в намерении
// перестанет ловиться проверкой типов. Чтобы список и реестр не разошлись молча,
// `scripts/check-registry.mjs` сверяет их и стоит в `prebuild`: добавили род в
// код, не описав в реестре, — сборка падает с именем недостающего ключа.
//
// 🔒 ПЕРЕЕХАЛИ ОПРЕДЕЛЕНИЯ, А НЕ ЗНАЧЕНИЯ. Значения фактов остаются в базе: их
// порождают сообщения, их много и они растут. Таблицы под них создаёт
// `lib/facts/ensure.ts` в рантайме, по одной на признак.
//
// 🔒 ФАЙЛ ВХОДИТ СТАТИЧЕСКИМ ИМПОРТОМ, А НЕ ЧТЕНИЕМ С ДИСКА. Правка приезжает
// коммитом и пересборкой — другого пути к ней нет с 137-13, — поэтому
// перечитывать файл на каждом запросе незачем. Импорт вдобавок гарантирует, что
// файл окажется в собранном приложении: чтение по пути отказывает МОЛЧА, пустым
// реестром, если сборщик не положил файл рядом.
//
// 🔒 ПРОВЕРЯЕМ МЫ, А НЕ ОБЕЩАЕТ АВТОР ФАЙЛА. Записи пишет агент руками, значит в
// них бывают опечатки. Закрытые списки сверяются здесь; чужое значение
// становится умолчанием, а не ложится в реестр правдоподобной ложью.

/** Запись файла. Все поля необязательны, кроме `key`: проверяем мы. */
type FileFact = {
  key?: unknown
  level?: unknown
  title?: unknown
  description?: unknown
  valueType?: unknown
  howToFind?: unknown
  storedIn?: unknown
  onMissing?: unknown
  fn?: unknown
  builtin?: unknown
  required?: unknown
  enabled?: unknown
  example?: unknown
  lost?: unknown
  produces?: unknown
  derivedFrom?: unknown
  derivedSlot?: unknown
  aggregate?: unknown
  unit?: unknown
  subject?: unknown
  lifecycle?: unknown
  schedules?: unknown
  model?: unknown
}

const str = (v: unknown): string => (typeof v === "string" ? v : "")
const opt = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined)

/** Значение из закрытого списка — или ничего. Чужое в реестре не живёт. */
function fromList<T extends string>(v: unknown, list: readonly T[]): T | undefined {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined
}

/**
 * Одна запись файла — в признак.
 *
 * 🔒 ИСПОРЧЕННОЕ ПОЛЕ — ЭТО ОТСУТСТВИЕ НАСТРОЙКИ, А НЕ ПАДЕНИЕ РЕЕСТРА. Одна
 * кривая запись не имеет права утащить за собой весь экран признаков.
 * 🔒 «ГДЕ ЖИВЁТ» БЕРЁТСЯ ИЗ ЗАПИСИ, ЕСЛИ НАЗВАНО, И ВЫВОДИТСЯ ИЗ КЛЮЧА ИНАЧЕ.
 * Встроенные ложатся в колонки уже существующих таблиц (`tgdesk_messages.bundle`),
 * и вывести такой адрес из ключа нельзя — его знает только тот, кто писал код.
 * 🔒 НЕДОПУСТИМЫЙ КЛЮЧ НЕ ПРЯЧЕТСЯ, А ОБЪЯВЛЯЕТСЯ СТРОКОЙ «где живёт». Признак,
 * которому некуда складывать значения, обязан выглядеть сломанным — молчание тут
 * читается как «работает».
 */
function fromFile(r: FileFact): Fact | null {
  const key = str(r.key).trim().toLowerCase()
  if (!key) return null

  return {
    key,
    level: fromList<FactLevel>(r.level, FACT_LEVELS) ?? "field",
    title: str(r.title),
    description: str(r.description),
    valueType: fromList<FactValueType>(r.valueType, FACT_VALUE_TYPES) ?? "text",
    howToFind: str(r.howToFind),
    storedIn: opt(r.storedIn) ?? factTableName(key) ?? "",
    onMissing: fromList<FactOnMissing>(r.onMissing, FACT_ON_MISSING) ?? "silent",
    // Описание внешнего вызова едет как есть: разбирает его исполнитель,
    // а читателю реестра знать его форму незачем.
    fn: opt(r.fn),
    builtin: r.builtin === true,
    required: r.required === true ? true : undefined,
    // 🔒 УМОЛЧАНИЕ — ВКЛЮЧЁН. Признак, описанный и не участвующий в разборе, —
    // это работа, сделанная и не действующая; выключение объявляется явным
    // `false`, а не забытым полем.
    enabled: r.enabled !== false,
    example: opt(r.example),
    lost: opt(r.lost),
    // ── Второй слой (83-1). Все восемь необязательны.
    produces: Array.isArray(r.produces) ? (r.produces as FactProduces[]) : undefined,
    derivedFrom: opt(r.derivedFrom),
    derivedSlot: opt(r.derivedSlot),
    aggregate: fromList<FactAggregate>(r.aggregate, FACT_AGGREGATE),
    unit: opt(r.unit),
    subject: fromList<FactSubject>(r.subject, FACT_SUBJECT),
    lifecycle:
      r.lifecycle && typeof r.lifecycle === "object" ? (r.lifecycle as FactLifecycle) : undefined,
    schedules: fromList<FactSchedules>(r.schedules, FACT_SCHEDULES),
    model: fromList<FactModel>(r.model, FACT_MODEL),
  }
}

/**
 * Весь реестр из конфига.
 *
 * 🔒 ПОВТОРНЫЙ КЛЮЧ ОТБРАСЫВАЕТСЯ, А НЕ ПЕРЕЗАПИСЫВАЕТ. Две записи с одним
 * ключом — это две правды об одном признаке; взяв последнюю, мы сделали бы выбор
 * за человека и молча. Первая остаётся, вторая не попадает никуда, и расхождение
 * видно тем, что описанного признака на экране нет.
 */
export function storedFacts(): Fact[] {
  const list = Array.isArray(file?.facts) ? (file.facts as FileFact[]) : []
  const seen = new Set<string>()
  const out: Fact[] = []
  for (const raw of list) {
    const fact = fromFile(raw)
    if (!fact || seen.has(fact.key)) continue
    seen.add(fact.key)
    out.push(fact)
  }
  return out
}
