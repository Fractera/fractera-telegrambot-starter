import { builtinFacts } from "./builtin"
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
import file from "./registry.json"

// ГДЕ ЛЕЖАТ ОПРЕДЕЛЕНИЯ ПРИЗНАКОВ — ФАЙЛ ДЕРЕВА СЛУЖБЫ, А НЕ ТАБЛИЦА.
//
// 🎯 РЕШЕНИЕ ВЛАДЕЛЬЦА 2026-09-06, ДОСЛОВНО: «всё, что в базе данных, — убрать»,
// «чтобы агент читал его прямо из репозитория, без слоя данных».
//
// 🔒 ЭТО СЛЕДСТВИЕ 137-13, А НЕ ОТДЕЛЬНАЯ ПРИХОТЬ. Пока реестр правился формой на
// экране, хранилищем ОБЯЗАНА была быть база: форма пишет в работающей системе, и
// файл репозитория ей недоступен. Как только правку у формы забрали и отдали
// агенту — писателем стал тот, кто правит ФАЙЛЫ и кладёт коммит. Хранилище
// обязано было переехать следом, иначе у определений остаются два хозяина:
// агент правит одно, база отдаёт другое, и разойдутся они молча.
//
// 🔒 ЧТО ПЕРЕЕХАЛО — ТОЛЬКО ОПРЕДЕЛЕНИЯ. Значения фактов остаются в базе: их
// порождают сообщения, их много и они растут. Определение — часть кода, значение
// — пользовательские данные; смешать их значит либо раздуть репозиторий, либо
// спрятать код в базу.
//
// 🔒 ФАЙЛ ВХОДИТ СТАТИЧЕСКИМ ИМПОРТОМ, А НЕ ЧТЕНИЕМ С ДИСКА, И ЭТО ИЗМЕРИМОЕ
// РАЗЛИЧИЕ, А НЕ ВКУС. Правка определений приезжает коммитом и сборкой — другого
// пути к ней нет по 137-13, — поэтому читать файл на каждом запросе незачем.
// Статический импорт вдобавок гарантирует, что файл окажется в собранном
// приложении: `fs.readFileSync` по пути внутри `lib/` зависит от того, что
// сборщик скопирует рядом, и отказывает МОЛЧА, пустым реестром.
// 🛑 Если однажды понадобится правка без пересборки — менять здесь, в одном
// месте: остальной код зовёт `storedFacts()` и не знает, откуда она берётся.
//
// 🔒 ПРОВЕРЯЕМ МЫ, А НЕ ОБЕЩАЕТ АВТОР ФАЙЛА. Файл пишет агент руками, значит в
// нём бывают опечатки. Закрытые списки сверяются здесь; чужое значение
// становится отсутствующим, а не ложится в реестр правдоподобной ложью.

/** Запись файла — те же поля, что у `Fact`, кроме выводимых. */
type FileFact = {
  key?: unknown
  level?: unknown
  title?: unknown
  description?: unknown
  valueType?: unknown
  howToFind?: unknown
  onMissing?: unknown
  fn?: unknown
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

/** Значение из закрытого списка — или ничего. Чужое в реестре не живёт. */
function fromList<T extends string>(v: unknown, list: readonly T[]): T | undefined {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined
}

/**
 * Одна запись файла — в признак.
 *
 * 🔒 ИСПОРЧЕННОЕ ПОЛЕ — ЭТО ОТСУТСТВИЕ НАСТРОЙКИ, А НЕ ПАДЕНИЕ РЕЕСТРА. Тот же
 * закон, что был у чтения из базы: одна кривая строка не имеет права утащить за
 * собой весь экран признаков.
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
    storedIn: factTableName(key) || "имя недопустимо: таблицы нет",
    onMissing: fromList<FactOnMissing>(r.onMissing, FACT_ON_MISSING) ?? "silent",
    // Описание внешнего вызова едет как есть: разбирает его исполнитель,
    // а читателю реестра знать его форму незачем.
    fn: typeof r.fn === "string" ? r.fn : undefined,
    builtin: false,
    // 🔒 УМОЛЧАНИЕ — ВКЛЮЧЁН. Признак, описанный в файле и не участвующий в
    // разборе, — это работа, сделанная и не действующая; выключение объявляется
    // явным `false`, а не забытым полем.
    enabled: r.enabled !== false,
    example: typeof r.example === "string" ? r.example : undefined,
    lost: typeof r.lost === "string" ? r.lost : undefined,
    // ── Второй слой (83-1)
    produces: Array.isArray(r.produces) ? (r.produces as FactProduces[]) : undefined,
    derivedFrom: typeof r.derivedFrom === "string" ? r.derivedFrom : undefined,
    derivedSlot: typeof r.derivedSlot === "string" ? r.derivedSlot : undefined,
    aggregate: fromList<FactAggregate>(r.aggregate, FACT_AGGREGATE),
    unit: typeof r.unit === "string" ? r.unit : undefined,
    subject: fromList<FactSubject>(r.subject, FACT_SUBJECT),
    lifecycle:
      r.lifecycle && typeof r.lifecycle === "object" ? (r.lifecycle as FactLifecycle) : undefined,
    schedules: fromList<FactSchedules>(r.schedules, FACT_SCHEDULES),
    model: fromList<FactModel>(r.model, FACT_MODEL),
  }
}

/**
 * Описанные человеком признаки — только они, без встроенных.
 *
 * 🔒 СТОЛКНОВЕНИЕ СО ВСТРОЕННЫМ РАЗРЕШАЕТСЯ В ПОЛЬЗУ ВСТРОЕННОГО, МОЛЧА И
 * НАМЕРЕННО. Встроенный описывает то, что система делает по устройству; запись в
 * файле с тем же ключом не может это изменить, а показать оба значило бы дать
 * человеку выбирать между правдой и её копией.
 */
export function storedFacts(): Fact[] {
  const list = Array.isArray(file?.facts) ? (file.facts as FileFact[]) : []
  const builtinKeys = new Set(builtinFacts().map(f => f.key))
  const seen = new Set<string>()
  const out: Fact[] = []
  for (const raw of list) {
    const fact = fromFile(raw)
    if (!fact) continue
    if (builtinKeys.has(fact.key) || seen.has(fact.key)) continue
    seen.add(fact.key)
    out.push(fact)
  }
  return out
}
