// 🛑 ПРОИСХОЖДЕНИЕ — `fractera-next-starter`; сюда файл пришёл через чат (137-3) и
// теперь ОДИН НА ДВЕ СЛУЖБЫ, ПАМЯТЬ И ЧАТ, БАЙТ В БАЙТ (181-1). От источника он
// отличается тремя вещами, и каждая названа, чтобы `diff` с FNS не читался как порча:
// 1. АДРЕС ДВЕРИ — `/api/fractera/openai-key`. У служб своя дверь, и пишет она через
//    единственную дверь слоя данных: вторая дверь к одному хранилищу — ровно та
//    ошибка, за которую заплачено шагом 109-3.
// 2. ОТВЕТ НА СОХРАНЕНИЕ — СТРОКОЙ ПОД ФОРМОЙ, А НЕ ВСПЛЫВАЮЩИМ ОКНОМ. ✗ Измерено
//    2026-09-10: `<Toaster/>` не смонтирован в чате ни в одном файле, а у памяти нет
//    и самого пакета — `toast()` звался в пустоту, и «Ключ сохранён» не видел никто.
//    Строка на месте не зависит от раскладки службы.
// 3. КОД ОТКАЗА ПО ФОРМЕ — ТОТ, ЧТО ОТДАЁТ НАША ДВЕРЬ (`bad-format`); код двери FNS
//    (`bad-key-format`) понимается тоже. ✗ Прежде подпись «не похоже на ключ» не
//    показывалась никогда: человек видел голый код.
// 🔒 ОТВЕТ ЧИТАЕТСЯ ПО СОДЕРЖИМОМУ, А НЕ ПО КОДУ HTTP. Привратник отказывает
// ПЕРЕАДРЕСАЦИЕЙ: с истёкшей сессией `fetch` приходит на страницу приветствия с кодом
// 200, и форма, верящая коду, объявила бы несохранённый ключ сохранённым.
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Small } from "@/components/ui/typography"

// ВВОД И ПРОВЕРКА КЛЮЧА OPENAI (77-8, 2026-09-01).
//
// 🔒 ОСТРОВОК НЕИЗБЕЖЕН ПО ТОЙ ЖЕ ПРИЧИНЕ, ЧТО У ТОКЕНА БОТА: сюда вводят СЕКРЕТ,
// и форма без JS отправила бы его перезагрузкой, оставив в истории навигации.
//
// 🔒 ПРОВЕРКА НЕ ШЛЁТ КЛЮЧ. Она просит сервер проверить ТОТ ключ, что уже лежит
// у него: иначе кнопка «Проверить» стала бы способом гонять чужие ключи через
// наш сервер, а значение секрета ездило бы по проводу без нужды.
//
// 🔒 ДВА ВОПРОСА, А НЕ ОДИН, И ОТВЕТЫ РАЗНЫЕ. «Ключ верный» — это `/v1/models`;
// «деньги есть» — настоящий вызов, потому что список моделей отвечает `200` и на
// пустом счёте. Показывать одно вместо двух значит соврать в самый частый момент:
// ключ живой, а бот молчит.

export type OpenAiKeyLabels = {
  keyLabel: string
  keyPlaceholder: string
  keyReplace: string
  save: string
  saving: string
  saved: string
  failed: string
  badFormat: string
  check: string
  checking: string
  valid: string
  invalid: string
  funded: string
  noFunds: string
  fundsUnknown: string
  balanceNote: string
  restartNote: string
}

type CheckResult = { valid: boolean; funded: boolean | null; reason: string | null }

/** Коды отказа, означающие «это не ключ OpenAI»: нашей двери и двери FNS. */
const BAD_FORMAT = new Set(["bad-format", "bad-key-format"])

export function OpenAiKeyForm({
  configured,
  labels,
}: {
  configured: boolean
  labels: OpenAiKeyLabels
}) {
  const router = useRouter()
  const [key, setKey] = useState("")
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const r = await fetch("/api/fractera/openai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      })
      const d = await r.json().catch(() => ({}))
      // 🔒 УСПЕХ — ЭТО `present: true` В ТЕЛЕ, А НЕ `200` В СТАТУСЕ (см. шапку).
      if (!r.ok || d.present !== true) {
        setError(
          BAD_FORMAT.has(d.error)
            ? labels.badFormat
            : `${labels.failed}: ${String(d.reason ?? d.error ?? r.status)}`
        )
        return
      }
      setKey("")
      setResult(null)
      setSaved(true)
      router.refresh()
    } catch (e) {
      setError(`${labels.failed}: ${String((e as Error).message ?? e)}`)
    } finally {
      setSaving(false)
    }
  }

  async function check() {
    setChecking(true)
    setError(null)
    setResult(null)
    setSaved(false)
    try {
      const r = await fetch("/api/fractera/openai-key?check=1", { method: "POST" })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || typeof d.valid !== "boolean") {
        setError(`${labels.failed}: ${String(d.error ?? r.status)}`)
        return
      }
      setResult({ valid: d.valid, funded: d.funded ?? null, reason: d.reason ?? null })
    } catch (e) {
      setError(`${labels.failed}: ${String((e as Error).message ?? e)}`)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div data-openai-key-form className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="text-[length:var(--fs-small)] text-muted-foreground">{labels.keyLabel}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder={configured ? labels.keyReplace : labels.keyPlaceholder}
            autoComplete="off"
            className="h-9 min-w-0 flex-1 font-mono"
          />
          <Button variant="outline" size="sm" onClick={save} disabled={saving || !key.trim()}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {saving ? labels.saving : labels.save}
          </Button>
          {configured && (
            <Button variant="outline" size="sm" onClick={check} disabled={checking}>
              {checking && <Loader2 className="size-3.5 animate-spin" />}
              {checking ? labels.checking : labels.check}
            </Button>
          )}
        </div>
      </div>

      {saved && (
        <span data-openai-saved className="flex items-center gap-1.5">
          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          <Small className="text-emerald-700 dark:text-emerald-300">{labels.saved}</Small>
        </span>
      )}

      {result && (
        <div data-openai-check className="flex flex-col gap-1.5 rounded-md border border-border p-2.5">
          <span className="flex items-center gap-1.5">
            {result.valid ? (
              <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="size-3.5 text-destructive" />
            )}
            <Small className={result.valid ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}>
              {result.valid ? labels.valid : labels.invalid}
            </Small>
          </span>

          {result.valid && (
            <span className="flex items-center gap-1.5">
              {result.funded === true ? (
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : result.funded === false ? (
                <XCircle className="size-3.5 text-destructive" />
              ) : (
                <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
              )}
              <Small
                className={
                  result.funded === true
                    ? "text-emerald-700 dark:text-emerald-300"
                    : result.funded === false
                      ? "text-destructive"
                      : "text-amber-700 dark:text-amber-300"
                }
              >
                {result.funded === true
                  ? labels.funded
                  : result.funded === false
                    ? labels.noFunds
                    : labels.fundsUnknown}
              </Small>
            </span>
          )}

          {/* 🔒 ОБЪЯСНЕНИЕ ПРО ОСТАТОК СТОИТ РЯДОМ С ОТВЕТОМ, А НЕ ВМЕСТО НЕГО.
              Пустая строка «остаток: —» читается как поломка; сказанная причина —
              как устройство OpenAI, которым оно и является. */}
          <Small className="leading-relaxed text-muted-foreground">{labels.balanceNote}</Small>
        </div>
      )}

      {error && (
        <Small className="leading-relaxed break-words text-destructive">{error}</Small>
      )}

      <Small className="text-muted-foreground">{labels.restartNote}</Small>
    </div>
  )
}
