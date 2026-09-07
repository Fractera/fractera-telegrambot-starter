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
export const AUTOMATIONS_LATE_COLUMNS: readonly string[] = []

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
] as const
