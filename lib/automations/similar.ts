import { dataFetch } from "@/lib/fractera/data-service"
import { AUTOMATIONS_TABLE } from "./table"

// ПОХОЖИЕ АВТОМАТИЗАЦИИ — ВЕКТОР ПО САММАРИ (146, 2026-09-08).
//
// 🔒 ИЗМЕРЕНИЕ ПРЕДШЕСТВОВАЛО ПОСТРОЙКЕ И РАЗРЕШИЛО ЕЁ. `scripts/measure-summary-search.mjs`
// на 12 парах «саммари / как спросит человек»: **recall@1 = 100%**, худшая
// близость верной пары `0.379` против лучшей посторонней `0.286` — порог
// существует. Для сравнения: на коротких ключах реестра тот же приём давал
// `recall@10 = 56%` (106-4). **Корпус другой — и вывод другой; переносить старый
// было нельзя ни в ту, ни в другую сторону.**
// 🛑 КОРПУС ИЗМЕРЕНИЯ СИНТЕТИЧЕСКИЙ, и это названо: живых саммари почти нет.
// Вывод ограничен вопросом «различимы ли саммари в принципе».
//
// 🔒 ЧТО ЕДЕТ В ВЕКТОР: ТОЛЬКО САММАРИ — то, чего нет в колонках. Теги, охват,
// вердикты, состояние типизированы и отбираются SQL; продублировать их в вектор
// значит завести вторую правду и получить медленный ответ вместо быстрого.
//
// 🔒 ОТВЕТ ВЕКТОРА — ПРЕДЛОЖЕНИЕ, А НЕ ОТБОР. «Похоже на №118» человек
// подтверждает; `WHERE scope_key = 'geo.city=madrid'` подтверждения не требует.
// Поэтому здесь возвращается список с близостью и словом «похоже», а не «вот
// ваши автоматизации».

/** Общее имя набора. Один набор — один вопрос, к которому он относится. */
export const SUMMARY_COLLECTION = "automation-summary"

type Answer = { ok?: boolean; error?: string; rows?: Record<string, unknown>[]; results?: unknown }

async function post(path: string, body: unknown): Promise<{ ok: boolean; json: Answer }> {
  const r = await dataFetch(path, { method: "POST", body: JSON.stringify(body) })
  if (!r.ok) return { ok: false, json: { ok: false, error: `http-${r.status}` } }
  return { ok: true, json: (await r.json()) as Answer }
}

/**
 * Положить саммари автоматизации в векторный склад.
 *
 * 🔒 ЗОВЁТСЯ ПРИ ЗАКРЫТИИ, КОГДА САММАРИ ПОЯВИЛОСЬ, А НЕ ПО РАСПИСАНИЮ. До
 * закрытия его просто нет: пересказ пишется по итогу работы.
 * 🔒 ПУСТОЕ САММАРИ НЕ ЕДЕТ. Строка «Автоматизация № 12» ничего не значит и
 * оказалась бы похожей на все остальные такие же — то есть отравила бы поиск.
 * 🔒 ИДЕНТИФИКАТОР — НОМЕР, ПОЭТОМУ ПОВТОРНОЕ ЗАКРЫТИЕ ОБНОВЛЯЕТ ЗАПИСЬ, А НЕ
 * ПЛОДИТ ВТОРУЮ. Дверь склада умеет `ON CONFLICT DO UPDATE`; без общего id
 * одна автоматизация висела бы в поиске трижды.
 */
export async function rememberSummary(automationId: number, summary: string): Promise<{ ok: boolean; skipped?: string }> {
  const text = (summary ?? "").trim()
  if (!Number.isInteger(automationId) || automationId <= 0) return { ok: true, skipped: "no-automation" }
  if (text.length < 12) return { ok: true, skipped: "too-short" }

  const res = await post("/vectors", {
    id: `automation-${automationId}`,
    collection: SUMMARY_COLLECTION,
    text,
    refTable: AUTOMATIONS_TABLE,
    refId: String(automationId),
  })
  // 🔒 ОТКАЗ СКЛАДА НЕ ОТМЕНЯЕТ ЗАКРЫТИЕ: поиск похожего — удобство, а закрытие —
  // работа человека. Ключ OpenAI мог кончиться; закрывать от этого нельзя.
  return { ok: res.ok && res.json.ok !== false }
}

export type SimilarAutomation = {
  id: number
  summary: string
  /** Косинусная близость. Чем ближе к единице, тем вернее. */
  score: number
}

/**
 * Найти похожие по смыслу.
 *
 * 🔒 ПОРОГ НАЗВАН ЧИСЛОМ И ВЗЯТ ИЗ ИЗМЕРЕНИЯ, А НЕ ИЗ ГОЛОВЫ: посторонние тексты
 * давали не выше `0.286`, верные пары — не ниже `0.379`. Берём `0.33` — середину
 * между измеренными границами.
 * 🛑 ПОРОГ БЕЗ ИЗМЕРЕНИЯ — ЭТО ЧИСЛО, ПОХОЖЕЕ НА ЗНАНИЕ. Его нельзя ни защитить,
 * ни оспорить; поэтому здесь стоит ссылка на прибор, которым он получен.
 */
export const SIMILAR_THRESHOLD = 0.33

export async function findSimilar(
  text: string,
  opts: { exclude?: number; limit?: number } = {},
): Promise<{ ok: boolean; items: SimilarAutomation[]; hint?: string }> {
  const query = (text ?? "").trim()
  if (query.length < 6) return { ok: true, items: [], hint: "слишком короткий запрос" }

  const res = await post("/vectors/search", {
    collection: SUMMARY_COLLECTION,
    query,
    k: Math.max(1, Math.min(20, opts.limit ?? 5)),
  })
  if (!res.ok) return { ok: false, items: [], hint: "векторный склад не ответил" }

  const raw = Array.isArray(res.json.results) ? (res.json.results as Record<string, unknown>[]) : res.json.rows ?? []
  const items: SimilarAutomation[] = []
  for (const r of raw) {
    const refId = Number(r.ref_id ?? r.refId ?? 0)
    const score = Number(r.score ?? r.similarity ?? 0)
    if (!refId || refId === opts.exclude) continue
    if (score < SIMILAR_THRESHOLD) continue
    items.push({ id: refId, summary: String(r.text ?? ""), score })
  }
  return { ok: true, items }
}
