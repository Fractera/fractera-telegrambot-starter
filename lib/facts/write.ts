import { checkDepth, valueToCell } from "./depth-guard"
import { indexFact } from "./index-table"
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
  /**
   * Значение: строка или объект глубины 1.
   *
   * 🔒 ОБЪЕКТ ДОПУСКАЕТСЯ ТОЛЬКО ОДНОУРОВНЕВЫЙ, И ЭТО ПРОВЕРЯЕТ СТОРОЖ. Вложенный
   * объект — это атрибут ЧУЖОЙ сущности, то есть глубина 2; такому место в графе
   * с якорем, а не в личной таблице (§3п, стандарт памяти).
   */
  value: string | Record<string, unknown>
  /** Чей это факт: ключ субъекта. Для `subject: self` — идентификатор человека. */
  subject?: string | null
  /** Где факт верен (охват). */
  scope?: string | null
  /** Откуда узнали: какой разбор, какое сообщение. */
  source?: string | null
  /** Сообщение, из которого добыт. */
  messageId?: string | null
  /**
   * Номер автоматизации, в прогоне которой признак сработал (145).
   *
   * 🔒 НЕОБЯЗАТЕЛЕН, И ЭТО СОДЕРЖАТЕЛЬНО. Факт о человеке — часовой пояс, имя —
   * верен всегда и ничьим прогоном не порождён: у него нет автоматизации, и
   * выдумывать её нельзя. Указатель отвечает на вопрос «что было в прогоне
   * номер N»; у такого факта ответа на этот вопрос попросту нет.
   */
  automationId?: number | null
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
  // 🔒 ЗНАЧЕНИЕ ПРИВОДИТСЯ К ЯЧЕЙКЕ ОДНИМ МЕСТОМ, А НЕ КАЖДЫМ ВЫЗЫВАЮЩИМ.
  // Объект уезжает JSON-строкой в ту же колонку: колонка на каждое поле означала
  // бы `ALTER TABLE` на каждую фразу человека и таблицу, формы которой никто не знает.
  const value = valueToCell(input.value)

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

  // ── СТОРОЖ ГЛУБИНЫ (160-4) ───────────────────────────────────────────────
  //
  // 🎯 ТРЕБОВАНИЕ ВЛАДЕЛЬЦА 2026-09-08: «нужно чётко установить правила сторожа:
  // не пропускать в личную таблицу данные с глубиной больше единицы».
  //
  // 🔒 СТОИТ ЗДЕСЬ, А НЕ У ВЫЗЫВАЮЩЕГО, ПОТОМУ ЧТО ЗДЕСЬ ЕДИНСТВЕННОЕ МЕСТО, ГДЕ
  // ЗНАЧЕНИЕ ЛОЖИТСЯ В ТАБЛИЦУ. Сторож у двери пропустил бы запись из соседнего
  // кода, а запрет, который можно обойти, — это не запрет.
  //
  // 🔒 ПОРЯДОК СУБЪЕКТА СЕГОДНЯ ВЫЧИСЛЯЕТСЯ ПРОСТО, И ГРАНИЦА ЭТОГО НАЗВАНА:
  // субъекты второго порядка в проекте не заводятся вовсе — `subject` у всех
  // признаков либо `self`, либо не объявлен. Значит проверка срабатывает только
  // на явной попытке записать факт о чужой сущности, и это честно: сторож не
  // умеет того, чего в системе ещё нет, и не притворяется, что умеет.
  const verdict = checkDepth(input.value, {
    valueType: fact.valueType,
    subjectIsFirstOrder: fact.subject === undefined || fact.subject === "self",
  })
  if (!verdict.ok) {
    return { ok: false, error: verdict.reason, hint: verdict.hint }
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

  // 🔒 ID СТРОКИ НУЖЕН УКАЗАТЕЛЮ, И БЕРЁТСЯ ОН ОТДЕЛЬНЫМ ЗАПРОСОМ ПОСЛЕ ВСТАВКИ.
  // `last_insert_rowid()` в SQLite относится к соединению; слой данных держит
  // одно, и второй запрос подряд возвращает нужное. Не сошлось — пишем `null`:
  // строка указателя без id всё равно отвечает на «какие признаки были».
  let insertedId: number | null = null

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
    const back = await dataFetch("/db/migrate", {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT last_insert_rowid() AS id", params: [] }),
    })
    if (back.ok) {
      const got = (await back.json()) as { rows?: { id?: unknown }[] }
      const raw = got.rows?.[0]?.id
      insertedId = typeof raw === "number" ? raw : Number(raw ?? Number.NaN) || null
    }
  } catch {
    return { ok: false, error: "unreachable", hint: "слой данных недоступен" }
  }

  // ── УКАЗАТЕЛЬ: ГДЕ ЛЕЖИТ ЭТО ЗНАЧЕНИЕ (145) ────────────────────────────
  //
  // 🔒 ПИШЕТСЯ ЗДЕСЬ, А НЕ У ВЫЗЫВАЮЩЕГО, ПОТОМУ ЧТО ЗДЕСЬ ЕДИНСТВЕННОЕ МЕСТО,
  // ГДЕ ЗНАЧЕНИЕ ЛОЖИТСЯ В ТАБЛИЦУ. Указатель, заполняемый вызывающими, отстал
  // бы от данных на первом же новом потребителе — и молча.
  // 🔒 ОТКАЗ УКАЗАТЕЛЯ НЕ ОТМЕНЯЕТ ЗАПИСЬ ФАКТА: значение человека важнее
  // нашего оглавления. Мост можно построить заново, данные — нет.
  await indexFact({
    automationId: input.automationId ?? null,
    factKey: key,
    table,
    rowId: insertedId,
  })

  return { ok: true, table, created: ensured.created.includes(table) }
}
