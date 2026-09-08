import type { RunFacts } from "./closing"
import { readAutomationRows } from "./rows"
import type { TaskRow } from "@/lib/task/types"

// ФАКТЫ ПРОГОНА СОБИРАЮТСЯ ИЗ ЗАПИСЕЙ, А НЕ ИЗ СЛОВ АГЕНТА (143-4).
//
// 🔒 ЭТО ИСПОЛНЕНИЕ ЗАКОНА §3е, А НЕ УЛУЧШЕНИЕ. Паспорт требует, чтобы условия
// закрытия считались **из фактов прогона, а не из впечатления модели**.
// ✗ ИЗМЕРЕНО 2026-09-08: дверь закрытия читала `body.messages`, `body.fact_keys`,
// `body.tools`, `body.missing_facts` — то есть верила агенту на слово. Модель,
// пересказывающая собственную работу, ошибается **в свою пользу**: «я звал
// инструменты» звучит убедительнее, чем «я ничего не сделал», и отзыв
// запрашивался бы у человека после пустого разговора.
//
// 🔒 ЧТО ОСТАЁТСЯ СО СЛОВ АГЕНТА И ПОЧЕМУ — НАЗВАНО ЗДЕСЬ, ЧТОБЫ СЛЕДУЮЩИЙ
// АГЕНТ НЕ «ДОЧИСТИЛ» И ЭТО:
//   • род закрытия (`step`/`whole`) — решение, а не факт: записи о нём быть не
//     может, потому что оно принимается в момент вызова;
//   • саммари — текст для человека, его никто, кроме модели, не напишет;
//   • срок следующей ступени — его называет человек, а не система.
// Всё остальное имеет след в ленте, и брать его со слов — значит спрашивать у
// свидетеля то, что записано в протоколе.

/** Строки, по которым видно, что инструмент действительно звали. */
const TOOL_ROWS = new Set(["resolve", "match", "extract", "store", "plan"])

/**
 * Собрать факты прогона по ленте номера.
 *
 * 🔒 ПУСТАЯ ЛЕНТА — ЭТО «НИЧЕГО НЕ СЛУЧИЛОСЬ», А НЕ ОТКАЗ. Автоматизация,
 * закрытая сразу после заведения, законна: человек передумал. Тогда все условия
 * дают «нет», и каждое объясняет почему — ровно то поведение, ради которого
 * решения возвращаются списком.
 */
export async function runFactsFromRows(
  automationId: number,
  known: {
    publicContract: string | null
    feedbackAsked: boolean
    hasNextStep: boolean
  },
): Promise<RunFacts> {
  const rows = await readAutomationRows(automationId)
  return {
    automationId,
    // 🔒 СООБЩЕНИЯ СЧИТАЮТСЯ ПО СТРОКАМ `intake`, А НЕ ПО ВСЕМ СТРОКАМ: один
    // разбор порождает несколько строк, и «сообщений» стало бы втрое больше.
    messages: Math.max(1, rows.filter(r => r.kind === "intake").length),
    factKeys: unique(rows.map(r => r.fact).filter(isNonEmpty)),
    tools: unique(rows.filter(r => TOOL_ROWS.has(r.kind)).map(toolName).filter(isNonEmpty)),
    // 🔒 ИЗВЛЕЧЕНИЕ ИЗ МЕДИА ВИДНО СТРОКОЙ `extract` — она появляется только
    // тогда, когда во вложении что-то прочитали.
    fromMedia: rows.some(r => r.kind === "extract"),
    hasNextStep: known.hasNextStep,
    publicContract: known.publicContract,
    feedbackAsked: known.feedbackAsked,
    // 🔒 НЕХВАТКА ПРИЗНАКА — ЭТО СТРОКА `reveal` С ПУСТЫМ КЛЮЧОМ, И ЭТО ЗАКОННЫЙ
    // ИСХОД (`no-fact`), а не потеря. Здесь она превращается в материал для
    // предложения (143-7); фраза строки говорит, чего именно не хватило.
    missingFacts: unique(
      rows.filter(r => r.kind === "reveal" && !isNonEmpty(r.fact)).map(r => r.phrase).filter(isNonEmpty),
    ),
  }
}

function toolName(row: TaskRow): string {
  return row.tool ?? row.kind
}

function isNonEmpty(v: string | undefined | null): v is string {
  return typeof v === "string" && v.trim().length > 0
}

function unique(list: string[]): string[] {
  return [...new Set(list)]
}
