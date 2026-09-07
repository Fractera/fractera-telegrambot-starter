// СРОК — ЗАПИСЬ О ТОМ, ЧТО ДОЛЖНО СЛУЧИТЬСЯ ПОЗЖЕ (148-1).
//
// 🔒 ТРИ ВРЕМЕНИ, И СМЕШИВАТЬ ИХ НЕЛЬЗЯ (§3и):
//   said_at  — когда человек это сказал: без него не восстановить, что значило «завтра»;
//   due_at   — когда должно сработать;
//   fired_at — когда фактически сработало.
//
// 🔒 ТРЕТЬЕ — САМОЕ ЦЕННОЕ И САМОЕ ЗАБЫВАЕМОЕ. Без него «не сработало» неотличимо
// от «сработало, и человек не заметил»: молчаливый отказ выглядит как успех.
//
// 🔒 ЧАСОВОЙ ПОЯС — ЭТО ОХВАТ, А НЕ ПОЛЕ ФОРМЫ (141). Вечер в Мадриде и вечер в
// Лондоне — разное время; время без зоны есть та же ложь, что цена без города.

export const SCHEDULE_TABLE = "schedule_entries"

/**
 * Кому адресовано срабатывание.
 *
 * 🔒 ОТ ЭТОГО ЗАВИСИТ ПОВЕДЕНИЕ ПРИ ПРОПУСКЕ — решение владельца 2026-09-07:
 * человеку выполнить ПОЗДНО и с пометкой, машинной ступени — ПРОПУСТИТЬ с
 * записью. Один род на двоих сделал бы одно из двух неверным.
 */
export const SCHEDULE_KINDS = ["human", "chain"] as const
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number]

/**
 * Состояние срока.
 *
 * 🔒 `missed` СУЩЕСТВУЕТ ОТДЕЛЬНО ОТ `fired`, ПОТОМУ ЧТО ПРОПУСК — ЭТО СОБЫТИЕ.
 * «Пропустить молча» отвергнуто в обеих ветках решения владельца: пропуск без
 * строки истории неотличим от несработавшего тикера.
 */
export const SCHEDULE_STATES = ["planned", "fired", "missed", "cancelled"] as const
export type ScheduleState = (typeof SCHEDULE_STATES)[number]

export function isScheduleKind(v: unknown): v is ScheduleKind {
  return typeof v === "string" && (SCHEDULE_KINDS as readonly string[]).includes(v)
}
export function isScheduleState(v: unknown): v is ScheduleState {
  return typeof v === "string" && (SCHEDULE_STATES as readonly string[]).includes(v)
}

export function scheduleTableSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS ${SCHEDULE_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      automation_id INTEGER,
      kind TEXT NOT NULL DEFAULT 'human',
      state TEXT NOT NULL DEFAULT 'planned',
      payload TEXT,
      scope_key TEXT,
      tz TEXT,
      said_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      due_at TEXT NOT NULL,
      fired_at TEXT,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS ${SCHEDULE_TABLE}_due ON ${SCHEDULE_TABLE} (state, due_at);
    CREATE INDEX IF NOT EXISTS ${SCHEDULE_TABLE}_owner ON ${SCHEDULE_TABLE} (automation_id, id);
  `
}

export const SCHEDULE_LATE_COLUMNS: readonly string[] = []

export function scheduleTableAlters(): string[] {
  return SCHEDULE_LATE_COLUMNS.map(c => `ALTER TABLE ${SCHEDULE_TABLE} ADD COLUMN ${c} TEXT`)
}

export const SCHEDULE_TABLE_COLUMNS = [
  "id",
  "automation_id",
  "kind",
  "state",
  "payload",
  "scope_key",
  "tz",
  "said_at",
  "due_at",
  "fired_at",
  "note",
] as const
