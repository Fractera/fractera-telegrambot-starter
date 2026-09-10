import { KeyRound, CheckCircle2, AlertTriangle } from "lucide-react"
import { Small } from "@/components/ui/typography"
import { SettingsCard } from "./settings-card"
import { OpenAiKeyForm } from "./openai-key.client"
import { readOpenAiKeyState } from "@/lib/architect/openai-key"

// КАРТОЧКА «КЛЮЧ OPENAI» — ОДНА НА ДВЕ СЛУЖБЫ, ПАМЯТЬ И ЧАТ, БАЙТ В БАЙТ (181-1).
//
// 🪦 СТОЯЛА В «НАСТРОЙКАХ» БОТА ВТОРОЙ КАРТОЧКОЙ (77-8, 2026-09-01) по слову
// владельца: «работа бота невозможна без работы ключа — значит в одной настройке мы
// должны пробросить сразу две». ОТМЕНЕНО ЕГО ЖЕ СЛОВОМ 2026-09-10: «Убери подписку
// OpenAI из настроек». Теперь у ключа своя вкладка «Подписка OpenAI» в левом меню
// обеих служб, прямо под «Подпиской Claude».
//
// 🔒 ФАЙЛ ОДИН И ТОТ ЖЕ В ДВУХ РЕПОЗИТОРИЯХ И ПОТОМУ НЕ ЗНАЕТ, ЧЕЙ ОН. Слова
// приходят словарём службы, а тип здесь структурный: карточке нужна ветка `openai`,
// и больше ничего. Импорт словаря одной службы сделал бы копию у другой
// несобираемой — и следующий перенос начался бы с правки «чужого» файла.
//
// 🔒 ЗЕЛЁНАЯ ПЛАШКА ТОЛЬКО ТОГДА, КОГДА КЛЮЧ ЕСТЬ У ВСЕХ ЖИВЫХ ПОТРЕБИТЕЛЕЙ. Их
// четверо: проект сайта, слой данных, граф знаний и склад секретов машины, откуда
// ключ читают память и бот (181-4). ✗ Панель оплатила днём отладки случай, когда
// ключ доехал до одного и не доехал до другого: приём документа отвечал 200 и молча
// ничего не встраивал. Поэтому при неполной раздаче плашка жёлтая и называет тех, у
// кого ключа нет.
//
// 🔒 «СЛУЖБЫ НЕТ» И «У СЛУЖБЫ НЕТ КЛЮЧА» — РАЗНЫЕ СОСТОЯНИЯ. Граф знаний может быть
// не установлен вовсе, и требовать от него ключ бессмысленно: такой потребитель в
// счёт не идёт.
//
// 🔒 НА СВОЕЙ ВКЛАДКЕ КАРТОЧКА РАСКРЫТА СРАЗУ. Свёрнутой её держала страница, где
// карточек было много; вкладку «Подписка OpenAI» открывают ради неё одной.

/** Слова карточки. Форму задаёт карточка, словари обеих служб ей подчиняются. */
export type OpenAiKeyWords = {
  title: string
  lead: string
  exists: string
  missing: string
  partial: string
  consumerApp: string
  consumerData: string
  consumerGraph: string
  consumerMachine: string
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

export async function OpenAiKeySection({ ui }: { ui: { openai: OpenAiKeyWords } }) {
  const w = ui.openai
  const state = await readOpenAiKeyState()

  const living = [
    { name: w.consumerApp, ...state.app },
    { name: w.consumerData, ...state.data },
    { name: w.consumerGraph, ...state.graph },
    { name: w.consumerMachine, ...state.machine },
  ].filter(c => c.present)

  const missing = living.filter(c => !c.configured).map(c => c.name)
  const anyKey = living.some(c => c.configured)
  const complete = anyKey && missing.length === 0

  // 🔒 ПЛАШКА СОСТОЯНИЯ СТОИТ В ЗАГОЛОВКЕ КАРТОЧКИ (111): даже свёрнутая карточка
  // обязана говорить, задан ключ или нет.
  const status = (
    <>
      {complete ? (
        <span
          data-openai-state="ok"
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[length:var(--fs-small)] text-emerald-800 dark:text-emerald-200"
        >
          <CheckCircle2 className="size-3.5" />
          {w.exists}
          {state.tail && <span className="font-mono opacity-70">…{state.tail}</span>}
        </span>
      ) : anyKey ? (
        <span
          data-openai-state="partial"
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[length:var(--fs-small)] text-amber-800 dark:text-amber-200"
        >
          <AlertTriangle className="size-3.5" />
          {w.partial}: {missing.join(", ")}
        </span>
      ) : (
        <span
          data-openai-state="missing"
          className="text-[length:var(--fs-small)] text-muted-foreground"
        >
          {w.missing}
        </span>
      )}
    </>
  )

  return (
    <SettingsCard
      mark={{ "data-openai-key": "" }}
      icon={<KeyRound className="size-4 text-muted-foreground" />}
      title={w.title}
      status={status}
      open
      bodyClassName="flex flex-col gap-3 p-3"
    >
      <Small className="leading-relaxed text-muted-foreground">{w.lead}</Small>

      <OpenAiKeyForm
        configured={anyKey}
        labels={{
          keyLabel: w.keyLabel,
          keyPlaceholder: w.keyPlaceholder,
          keyReplace: w.keyReplace,
          save: w.save,
          saving: w.saving,
          saved: w.saved,
          failed: w.failed,
          badFormat: w.badFormat,
          check: w.check,
          checking: w.checking,
          valid: w.valid,
          invalid: w.invalid,
          funded: w.funded,
          noFunds: w.noFunds,
          fundsUnknown: w.fundsUnknown,
          balanceNote: w.balanceNote,
          restartNote: w.restartNote,
        }}
      />
    </SettingsCard>
  )
}
