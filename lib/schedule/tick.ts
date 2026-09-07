import { claimForFiring, dueNow, markMissed, type ScheduleEntry } from "./store"

// ТИКЕР — ЧТО ПРОИСХОДИТ, КОГДА ВРЕМЯ ПРИШЛО (148-2).
//
// 🔒 ТИКЕР ОБЯЗАН БЫТЬ РОВНО ОДИН — тот же закон, что у опрашивателя Telegram:
// два процесса выполнят каждое задание дважды и МОЛЧА. Здесь это держится не
// только дисциплиной запуска, но и конструкцией: строка забирается условным
// UPDATE, и второй читатель получит отказ, а не вторую копию работы.
//
// 🔒 МЕТКА СТАВИТСЯ ДО ДЕЙСТВИЯ. Падение процесса между меткой и действием теряет
// одно срабатывание; обратный порядок — повторяет рассылку при каждом падении.
// Из двух бед выбрана та, что видна: непришедшее напоминание человек заметит,
// пришедшее дважды подорвёт доверие ко всем следующим.

/** Насколько поздно ещё «поздно», а не «уже неважно». */
export const LATE_LIMIT_MS = 24 * 60 * 60 * 1000

export type Delivery = (entry: ScheduleEntry, late: boolean) => Promise<boolean> | boolean

export type TickReport = {
  seen: number
  fired: number
  missed: number
  skipped: number
  /** Что именно случилось с каждой строкой — для ленты и для прибора. */
  lines: string[]
}

/**
 * Один проход тикера.
 *
 * 🔒 ПРОПУЩЕННОЕ ВРЕМЯ — РЕШЕНИЕ ВЛАДЕЛЬЦА 2026-09-07, И ОНО РАЗНОЕ ДЛЯ ДВУХ
 * РОДОВ АДРЕСАТА:
 *   `human` — выполнить ПОЗДНО и с пометкой «должно было прийти в …»;
 *   `chain` — ПРОПУСТИТЬ и оставить строку «пропущено, срок прошёл».
 * Напоминание не портится от опоздания, а ступень цепочки, выполненная не
 * вовремя, тянет за собой остальные и может сделать работу дважды.
 *
 * 🛑 «ПРОПУСТИТЬ МОЛЧА» ОТВЕРГНУТО В ОБЕИХ ВЕТКАХ: пропуск без записи неотличим
 * от несработавшего тикера.
 *
 * 🔒 ПОТОЛОК ЗА ПРОХОД ОБЯЗАТЕЛЕН. Сервер, пролежавший сутки, иначе высыпет
 * человеку сотню сообщений разом — и это худший способ сообщить, что всё
 * починилось.
 */
export async function tickOnce(
  nowIso: string,
  deliver: Delivery,
  limit = 20,
): Promise<TickReport> {
  const report: TickReport = { seen: 0, fired: 0, missed: 0, skipped: 0, lines: [] }
  const now = Date.parse(nowIso)
  const entries = await dueNow(nowIso, limit)

  for (const entry of entries) {
    report.seen++
    const lateBy = now - Date.parse(entry.dueAt)
    const late = lateBy > 60_000

    if (late && entry.kind === "chain") {
      await markMissed(entry.id, `пропущено: срок прошёл ${Math.round(lateBy / 60000)} мин назад`)
      report.missed++
      report.lines.push(`№${entry.id} chain — пропущено, срок прошёл`)
      continue
    }

    if (late && lateBy > LATE_LIMIT_MS) {
      await markMissed(entry.id, "пропущено: опоздание больше суток")
      report.missed++
      report.lines.push(`№${entry.id} human — опоздание больше суток, пропущено`)
      continue
    }

    // 🔒 ЗАБРАТЬ СТРОКУ — И ТОЛЬКО ПОТОМ ДЕЙСТВОВАТЬ. Не забрал (её взял другой
    // проход или другой процесс) — работать по ней нельзя.
    const claimed = await claimForFiring(entry.id, nowIso)
    if (!claimed) {
      report.skipped++
      report.lines.push(`№${entry.id} — уже взята кем-то, пропускаю`)
      continue
    }

    await deliver(entry, late)
    report.fired++
    report.lines.push(`№${entry.id} ${entry.kind} — доставлено${late ? " ПОЗДНО, с пометкой" : ""}`)
  }
  return report
}

// 🪦 `lateNote()` ПЕРЕЕХАЛА В `late-note.ts` (148-2): она чистая, а этот модуль
// тянет дверь к данным и потому не запускается прибором. Восстанавливается из git.
export { lateNote } from "./late-note"
