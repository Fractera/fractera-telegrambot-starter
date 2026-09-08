// ТАБЛИЦА АВТОМАТИЗАЦИЙ И ЕЁ НОМЕР (138-1).
//
// 🔒 НОМЕР — ЭТО ТО, ЧТО ЧЕЛОВЕК ПРОИЗНОСИТ ВСЛУХ. Слова владельца 2026-09-06:
// «простое число, которое начинается от единицы, на каждой новой автоматизации
// прибавляет одну цифру». Отсюда всё устройство ниже.
//
// 🔒 ОДНА ТАБЛИЦА НА АВТОМАТИЗАЦИЮ, И ВТОРОЙ НЕ БУДЕТ. Здесь она рождается с
// номером и состоянием подтверждения; шаг 144 ДОПИСЫВАЕТ в неё колонки
// лестницей `ALTER` — саммари, теги, охват, вердикты. Заведи 144 «главную
// таблицу» рядом — получилось бы две правды об одной автоматизации, и
// расходиться они начали бы с первой записи.
//
// 🔒 ФОРМА И ЕЁ ПОЧИНКА ЖИВУТ В ОДНОМ ФАЙЛЕ — тот же закон, что у таблиц
// признаков (`lib/facts/table.ts`): правящий образец обязан видеть лестницу,
// иначе следующая колонка приедет только на чистую машину.

export const AUTOMATIONS_TABLE = "automations"

/**
 * Форма таблицы.
 *
 * 🔒 `AUTOINCREMENT` ЗДЕСЬ ОБЯЗАТЕЛЕН, И ЭТО НЕ УКРАШЕНИЕ. Без него SQLite
 * выдаёт `max(id) + 1` и после удаления ПОСЛЕДНЕЙ строки **переиспользует её
 * номер**. Номер уже произнесён человеком — «отзыв 123», «после автоматизации
 * 3» — и второй жизни у него быть не может: ссылка молча начнёт указывать на
 * чужую работу. `AUTOINCREMENT` держит счётчик в `sqlite_sequence` и никогда не
 * идёт назад.
 *
 * 🔒 ИМЯ КОЛОНКИ — `confirm_state`, А НЕ `state`, И ЭТО РАЗВЕДЕНИЕ СДЕЛАНО ДО
 * СТОЛКНОВЕНИЯ. У автоматизации две независимые оси состояния: подтверждён ли
 * НОМЕР (§3а: «предварительно» / «подтверждено») и где она в РАБОЧЕМ ПОТОКЕ
 * (§3е: открыта · шаг закрыт · закрыта · ждёт инструмента). Оба зовутся
 * «состоянием»; сложи их в одну колонку — и «подтверждено» перестало бы
 * отличаться от «закрыто».
 */
export function automationsTableSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS ${AUTOMATIONS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      -- Подтверждён ли номер: 'draft' пока разбор не закончен, 'confirmed' после.
      confirm_state TEXT NOT NULL DEFAULT 'draft',
      -- С какого сообщения всё началось. Хранится идентификатором, не копией текста.
      first_message_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS ${AUTOMATIONS_TABLE}_created ON ${AUTOMATIONS_TABLE} (created_at);
    CREATE INDEX IF NOT EXISTS ${AUTOMATIONS_TABLE}_confirm ON ${AUTOMATIONS_TABLE} (confirm_state, created_at);
  `
}

/** Состояния подтверждения номера. Список первичен, тип выводится из него. */
export const AUTOMATION_CONFIRM_STATES = ["draft", "confirmed"] as const
export type AutomationConfirmState = (typeof AUTOMATION_CONFIRM_STATES)[number]

export function isAutomationConfirmState(v: unknown): v is AutomationConfirmState {
  return typeof v === "string" && (AUTOMATION_CONFIRM_STATES as readonly string[]).includes(v)
}

/**
 * Лестница поздних колонок — пустая, и это НЕ забывчивость.
 *
 * 🔒 ОНА ЗАВЕДЕНА ПУСТОЙ НАМЕРЕННО, ЧТОБЫ СЛЕДУЮЩИЙ ПОДШАГ НЕ ИЗОБРЁЛ ВТОРОЙ
 * МЕХАНИЗМ. `CREATE TABLE IF NOT EXISTS` на машине, где таблица уже есть, не
 * делает НИЧЕГО — значит колонки шага 144 приедут только сюда. Класс ошибки
 * оплачен в проекте дважды (2026-08-17 и 2026-08-18): колонка, объявленная в
 * образце, на работающем сервере не появилась.
 */
// 🔒 КОЛОНКИ 144-1 ПРИЕЗЖАЮТ ИМЕННО СЮДА, А НЕ В ОБРАЗЕЦ ВЫШЕ. Таблица уже
// создана подшагом 138-1 на работающем сервере, и `CREATE TABLE IF NOT EXISTS`
// ей не добавит ничего. Второй таблицы «главных полей» рядом не заводится: две
// правды об одной автоматизации разошлись бы с первой записи.
//
// 🔒 ВСЁ, ПО ЧЕМУ ОТБИРАЮТ И СОРТИРУЮТ, — КОЛОНКА, А НЕ ПОЛЕ ВНУТРИ JSON.
// Требование владельца: «сортировка должна быть без искусственного интеллекта».
// Значение, спрятанное в JSON, потребовало бы разбора на каждую строку выборки.
export const AUTOMATIONS_LATE_COLUMNS: readonly string[] = [
  // Короткий пересказ автоматизации. Пишется при закрытии (143-2), до того пусто.
  "summary",
  // Облако тегов — КЛЮЧИ РЕЕСТРА через `|`, а не свободные слова: иначе понять,
  // что «еда» и «питание» одно, смогла бы только модель.
  "tags",
  // Где автоматизация верна — тот же ключ, что у фактов (141-2).
  "scope_key",
  // Вердикты человека. ТРИ состояния: 'yes' · 'no' · пусто = «не спрашивали».
  // Молчание не равно одобрению — иначе память наполнится рекомендациями,
  // которых человек не давал.
  "verdict_liked",
  "verdict_needs_work",
  // Можно ли вставлять в конвейер (§3л). Выводится из договора, а не ставится
  // настроением; здесь — хранимый результат вывода.
  "reusable",
  // Имя публичного договора (§3д). Пусто — наружу не отвечает.
  "public_contract",
  // Слова человека к вердикту (143-6). Пусто — сказал только «да/нет», и это
  // законно: заставлять объяснять оценку значит не получить её вовсе.
  "feedback_note",
]

export function automationsTableAlters(): string[] {
  return AUTOMATIONS_LATE_COLUMNS.map(c => `ALTER TABLE ${AUTOMATIONS_TABLE} ADD COLUMN ${c} TEXT`)
}

/**
 * Колонки образца — по ним сверяется, что таблица построена стандартно.
 *
 * 🔒 ЧИСЛО ПРАВИТСЯ ВМЕСТЕ С ОБРАЗЦОМ ВЫШЕ. Список, разошедшийся с формой,
 * объявит исправную таблицу нестандартной — ровно то, что уже случилось в 81-2.
 * 🔒 СВЕРКА СРАВНИВАЕТ НАБОР, А НЕ ПОРЯДОК: `ALTER` дописывает в конец, поэтому
 * поднятая лестницей таблица и вновь созданная имеют один набор в разном порядке.
 */
export const AUTOMATIONS_TABLE_COLUMNS = [
  "id",
  "confirm_state",
  "first_message_id",
  "created_at",
  // ── Поздние колонки (144-1). Число правится ВМЕСТЕ со списком выше.
  "summary",
  "tags",
  "scope_key",
  "verdict_liked",
  "verdict_needs_work",
  "reusable",
  "public_contract",
  "feedback_note",
] as const


// ─────────────────────────────────────────────────────────────────────────────
// СОСТОЯНИЯ АВТОМАТИЗАЦИИ В РАБОЧЕМ ПОТОКЕ (143-1).
//
// 🔒 ЭТО ВТОРАЯ ОСЬ, А НЕ ПРОДОЛЖЕНИЕ ПЕРВОЙ. `confirm_state` выше отвечает на
// вопрос «подтверждён ли НОМЕР» (§3а); здесь — «где автоматизация в РАБОТЕ»
// (§3е). Разведены они в 138-1 до столкновения, и сливать их нельзя: иначе
// «подтверждено» перестанет отличаться от «закрыто».
//
// 🔒 ПЕРЕХОД ПИШЕТСЯ НОВОЙ СТРОКОЙ, А НЕ ПРАВКОЙ ПОЛЯ. Отдельная колонка
// «текущее состояние» была бы второй правдой и разошлась бы с историей молча —
// тот же закон, что у `lifecycle` признаков. Текущее читается как ПОСЛЕДНЯЯ
// строка.
//
// 🔒 СОРТИРОВКА ПО `id`, А НЕ ПО `created_at`, И ЭТО ОПЛАЧЕНО РАНЬШЕ: умолчание
// времени в базе печатает СЕКУНДЫ, и два перехода внутри одной секунды дали бы
// одинаковую метку — «последним» стал бы случайный.

export const AUTOMATION_STATES_TABLE = "automation_states"

/**
 * Где автоматизация находится в работе.
 *
 *   open          — идёт;
 *   step-closed   — закрыт ШАГ цепочки: дальше следующая ступень;
 *   closed        — закрыта ЦЕЛИКОМ: результат у человека;
 *   waiting-tool  — ждёт способности, которой в проекте нет (§3м, шаг 151).
 *
 * 🔒 ДВА РОДА ЗАКРЫТИЯ НЕ СВОДЯТСЯ ДРУГ К ДРУГУ (§3е): шаг, закрытый как
 * автоматизация, оборвёт цепочку; автоматизация, закрытая как шаг, никогда не
 * спросит отзыв.
 * 🛑 `waiting-tool` ОБЪЯВЛЕН ЗДЕСЬ ЗНАЧЕНИЕМ, НО НЕ НАПОЛНЕН: его механизм —
 * шаг 151. Объявлен намеренно, чтобы следующий агент не завёл рядом второй
 * список состояний.
 */
export const AUTOMATION_STATES = ["open", "step-closed", "closed", "waiting-tool"] as const
export type AutomationState = (typeof AUTOMATION_STATES)[number]

export function isAutomationState(v: unknown): v is AutomationState {
  return typeof v === "string" && (AUTOMATION_STATES as readonly string[]).includes(v)
}

/** Форма таблицы переходов. Починка — рядом, как и у соседей выше. */
export function automationStatesTableSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS ${AUTOMATION_STATES_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      automation_id INTEGER NOT NULL,
      state TEXT NOT NULL,
      -- Чем закрыто: шаг цепочки или автоматизация целиком. Пусто у не-закрытий.
      closing_kind TEXT,
      -- Почему перешли. Пусто — законно: причина известна не всегда.
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime(%Y-%m-%dT%H:%M:%SZ,now))
    );
    CREATE INDEX IF NOT EXISTS ${AUTOMATION_STATES_TABLE}_owner ON ${AUTOMATION_STATES_TABLE} (automation_id, id);
  `
}

export const AUTOMATION_STATES_LATE_COLUMNS: readonly string[] = []

export function automationStatesTableAlters(): string[] {
  return AUTOMATION_STATES_LATE_COLUMNS.map(
    c => `ALTER TABLE ${AUTOMATION_STATES_TABLE} ADD COLUMN ${c} TEXT`,
  )
}

export const AUTOMATION_STATES_TABLE_COLUMNS = [
  "id",
  "automation_id",
  "state",
  "closing_kind",
  "reason",
  "created_at",
] as const

// ─────────────────────────────────────────────────────────────────────────────
// ЛЕНТА ПРОГОНА — СТРОКИ РАЗБОРА, ПРИВЯЗАННЫЕ К НОМЕРУ (143-3)
// ─────────────────────────────────────────────────────────────────────────────
//
// 🔒 СТОЛ РАЗБОРА И ЛЕНТА ПРОГОНА — РАЗНЫЕ ВЕЩИ, И СКЛЕИВАТЬ ИХ НЕЛЬЗЯ.
// `task_current` (`lib/task/store.ts`) отвечает на вопрос «что происходит
// ПРЯМО СЕЙЧАС»: одна строка, живёт 30 минут, **заменяется следующим
// сообщением**. Лента отвечает на другой вопрос — «что случилось за прогон
// номера N» — и обязана пережить весь разговор, потому что по ней считаются
// условия закрытия (§3е).
// ✗ ИЗМЕРЕНО 2026-09-08 ПРИ ПЛАНИРОВАНИИ: `appendRows` не звал НИКТО — лента
// строк была построена целиком и не имела ни одного писателя. Закрытие при этом
// брало факты прогона **со слов агента**, то есть из впечатления модели.
//
// 🔒 ФОРМА СТРОКИ ОДНА НА ОБА ХРАНИЛИЩА — `TaskRow` из `lib/task/types.ts`.
// Вторая форма разошлась бы с первой на первой же правке, и экран человека начал
// бы показывать не то, по чему система принимает решения.
//
// 🔒 НАЧИНКА ЛОЖИТСЯ ОДНОЙ КОЛОНКОЙ JSON, А ПОИСКОВЫЕ ПОЛЯ — ОТДЕЛЬНЫМИ.
// `kind` и `fact` вынуты потому, что по ним спрашивают («сколько строк без
// признака»); всё остальное спрашивают целиком и никогда по частям.

export const AUTOMATION_ROWS_TABLE = "automation_rows"

/** Форма таблицы ленты. Починка — рядом, как у соседей выше. */
export function automationRowsTableSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS ${AUTOMATION_ROWS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      automation_id INTEGER NOT NULL,
      -- Вид строки: intake · store · match · evolve · extract · resolve · plan · reveal.
      kind TEXT NOT NULL,
      -- Ключ признака. ПУСТО у reveal значит no-fact: признака под это в реестре НЕТ,
      -- и это законный исход, а не потеря. По нему считается нехватка (143-7).
      fact TEXT,
      -- Строка целиком, как её видит экран: payload, phrase, next, rejected.
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime(%Y-%m-%dT%H:%M:%SZ,now))
    );
    CREATE INDEX IF NOT EXISTS ${AUTOMATION_ROWS_TABLE}_owner ON ${AUTOMATION_ROWS_TABLE} (automation_id, id);
  `
}

export const AUTOMATION_ROWS_LATE_COLUMNS: readonly string[] = []

export function automationRowsTableAlters(): string[] {
  return AUTOMATION_ROWS_LATE_COLUMNS.map(
    c => `ALTER TABLE ${AUTOMATION_ROWS_TABLE} ADD COLUMN ${c} TEXT`,
  )
}

export const AUTOMATION_ROWS_TABLE_COLUMNS = [
  "id",
  "automation_id",
  "kind",
  "fact",
  "payload",
  "created_at",
] as const
