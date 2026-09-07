import { dataFetch } from "@/lib/fractera/data-service"
import { allFacts } from "./registry"
import { ensureFactTables } from "./ensure"
import { factTableName } from "./table"

// ПИСАТЕЛЬ ЗНАЧЕНИЙ ПРИЗНАКА — ПЕРВЫЙ В ПРОЕКТЕ (158-5).
//
// ✗ ИЗМЕРЕНО 2026-09-07, И ЭТО НАХОДКА КРУПНЕЕ САМОГО ПОДШАГА: слой хранения
// значений был объявлен и НЕ ИСПОЛЬЗОВАН НИ РАЗУ. `ensureFactTables` не звал
// никто, кроме собственного файла; `INSERT` в таблицы признаков не было ни
// одного; `subject_key` не писал никто; признаков с объявленным субъектом было
// ноль. Все 35 записей реестра — встроенные, лежащие колонками чужих таблиц.
//
// 🔒 ЗНАЧИТ «РЕЕСТР ПОРОЖДАЕТ ТАБЛИЦЫ» БЫЛО ВЕРНО КАК МЕХАНИЗМ И ЛОЖНО КАК
// СОСТОЯНИЕ. Механизм проверялся прибором, вызывавшим его напрямую, — тот же
// класс, что «логика написана, а звать её некому» (157-1, тикер сроков).
//
// 🔒 ТАБЛИЦА СОЗДАЁТСЯ ПРИ ПЕРВОЙ ЗАПИСИ, А НЕ ПРИ РАЗВЁРТЫВАНИИ. Так устроен
// весь проект: `CREATE TABLE IF NOT EXISTS` в рантайме, никаких миграций. Цена —
// один лишний запрос на первую запись признака; выигрыш — новый признак начинает
// работать без пересборки, ради чего реестр и заведён.

export type WriteFact = {
  /** Ключ признака из реестра. Чужой ключ — отказ, а не создание таблицы. */
  key: string
  /** Значение словами. Пусто — нечего записывать. */
  value: string
  /** Чей это факт: ключ субъекта. Для `subject: self` — идентификатор человека. */
  subject?: string | null
  /** Где факт верен (охват). */
  scope?: string | null
  /** Откуда узнали: какой разбор, какое сообщение. */
  source?: string | null
  /** Сообщение, из которого добыт. */
  messageId?: string | null
}

export type WriteResult =
  | { ok: true; table: string; created: boolean }
  | { ok: false; error: string; hint: string }

/**
 * Записать значение признака.
 *
 * 🔒 ОТКАЗ НАЗЫВАЕТ ПРИЧИНУ И НЕ ПРИТВОРЯЕТСЯ УСПЕХОМ. Молчаливый `false` здесь
 * означал бы, что система «знает» то, чего не записала, — и человек увидел бы
 * пустой экран там, где ему обещали память.
 */
export async function writeFact(input: WriteFact): Promise<WriteResult> {
  const key = String(input.key ?? "").trim().toLowerCase()
  const value = String(input.value ?? "").trim()

  const fact = allFacts().find(f => f.key === key)
  if (!fact) {
    return {
      ok: false,
      error: "unknown-fact",
      hint: "признака с таким ключом в реестре нет — значение записывать некуда",
    }
  }
  if (value === "") {
    return { ok: false, error: "empty-value", hint: "пустое значение не записывается" }
  }

  // 🛑 ИМЯ ТАБЛИЦЫ СОБИРАЕТСЯ БЕЛЫМ СПИСКОМ, А НЕ ИЗ КЛЮЧА КАК ЕСТЬ (закон 81-2).
  // Ключ рождается из свободного описания человека через модель; попав в
  // `CREATE TABLE` без проверки, он перестаёт быть именем и становится SQL.
  const table = factTableName(key)
  if (!table) {
    return {
      ok: false,
      error: "bad-key",
      hint: "из ключа не собирается имя таблицы — признак не может хранить значения",
    }
  }

  // Таблица и лестница поздних колонок — общим механизмом, а не своим SQL:
  // вторая реализация формы таблицы разошлась бы с образцом на первой колонке.
  const ensured = await ensureFactTables([fact])
  if (ensured.failed.length > 0) {
    return {
      ok: false,
      error: "table-failed",
      hint: `таблица ${table} не создана: ${ensured.failed[0].error}`,
    }
  }

  // 🛑 КОЛОНКИ НАЗВАНЫ ПОИМЁННО. `INSERT` без списка колонок работает на чистой
  // машине и путает значения на обновлённой лестницей — то есть ломается ТОЛЬКО
  // у того, у кого система уже поработала (закон 83).
  const sql =
    `INSERT INTO ${table} (message_id, value_text, source, subject_key, scope_key, status) ` +
    "VALUES (?, ?, ?, ?, ?, ?)"
  const params = [
    input.messageId ?? null,
    value,
    input.source ?? null,
    input.subject ?? null,
    input.scope ?? null,
    "current",
  ]

  try {
    const r = await dataFetch("/db/migrate", {
      method: "POST",
      body: JSON.stringify({ sql, params }),
    })
    if (!r.ok) {
      return { ok: false, error: `http-${r.status}`, hint: "слой данных отказал при записи" }
    }
    const body = (await r.json()) as { ok?: boolean; error?: string }
    if (body.ok === false) {
      return { ok: false, error: body.error ?? "refused", hint: "слой данных отверг запись" }
    }
  } catch {
    return { ok: false, error: "unreachable", hint: "слой данных недоступен" }
  }

  return { ok: true, table, created: ensured.created.includes(table) }
}
