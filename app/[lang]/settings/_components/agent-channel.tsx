import { Bot, CheckCircle2 } from "lucide-react"
import { Small } from "@/components/ui/typography"
import { readAgentChannel } from "@/lib/architect/agent-channel"
import { AgentBotForm } from "./agent-bot.client"
import { SettingsCard } from "./settings-card"
import type { TelegramUi } from "../_i18n/telegram.i18n"

// КАНАЛ АГЕНТА: TELEGRAM-БОТ (шаг 117, 2026-09-05; карточка подписки убрана 181-6).
//
// 🪦 «ПОДПИСКА СТОИТ ПЕРВОЙ КАРТОЧКОЙ» — ОТМЕНЕНО 2026-09-10 СЛОВОМ ВЛАДЕЛЬЦА:
// «remove |Подписка Claude Code вход выполнен claude.ai Этим бот и думает…|».
// Прежний довод (2026-09-05) был верен, пока входу негде было жить: «без входа в
// подписку не работает НИЧЕГО из того, что ниже». Теперь у входа есть своё место —
// пункт меню «Подписка Claude» и страница `/{lang}/claude-subscription` (181-2), а
// карточка была вторым входом к той же вещи.
//
// 🔒 УБРАНА ЦЕЛИКОМ, А НЕ СПРЯТАНА: вместе с ней удалены островок
// `claude-terminal.client.tsx`, расчёт `agentTerminalUrl()` (181-3) и девять слов
// словаря. Поверхность, вычеркнутая наполовину, оставляет код, который следующий
// агент примет за работающий.
//
// 🔒 БОТОВ РОВНО ДВА, И ВТОРОЙ ЗАВЕДЁН ПУСТЫМ НАМЕРЕННО (решение владельца
// 2026-09-05): №1 — агент автоматизации, №2 — агент разработки, «позже сделаем
// его». Место под второй стоит сразу, потому что переделка раскладки задним
// числом дороже пустой карточки, а «в процессе разработки» с ИМЕНЕМ того, чего
// ждать, — не заглушка, а честное обещание.
//
// 🛑 ЧАТ НЕ ОТВЕТИЛ — ЭТО СОСТОЯНИЕ, А НЕ ПОЛОМКА. На машине человека службы
// `:3600` нет вовсе, и карточка говорит это словами: молчащая форма читается как
// сломанная настройка.

export async function AgentChannelSection({ lang, ui }: { lang: string; ui: TelegramUi }) {
  const w = ui.agent
  const state = await readAgentChannel()

  return (
    <>
      {/* ── Бот №1 — агент автоматизации ─────────────────────────────── */}
      <SettingsCard
        mark={{ "data-agent-bot-card": "automation" }}
        icon={<Bot className="size-4 text-muted-foreground" />}
        title={w.botAutomationTitle}
        open={!state.telegram.present}
        status={
          state.telegram.present ? (
            <span
              data-agent-bot-state="configured"
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[length:var(--fs-small)] text-emerald-800 dark:text-emerald-200"
            >
              <CheckCircle2 className="size-3.5" />
              {w.bot.configured}
            </span>
          ) : (
            <span
              data-agent-bot-state="empty"
              className="text-[length:var(--fs-small)] text-muted-foreground"
            >
              {w.bot.notConfigured}
            </span>
          )
        }
        bodyClassName="flex flex-col gap-3 p-3"
      >
        <Small className="leading-relaxed text-muted-foreground">{w.botAutomationLead}</Small>

        <AgentBotForm
          labels={w.bot}
          masked={state.telegram.masked}
          present={state.telegram.present}
        />

        {/* 🔒 ЧИСЛА ПРИВЯЗКИ ПОКАЗАНЫ, А ИДЕНТИФИКАТОРЫ СОБЕСЕДНИКОВ — НЕТ.
            Наружу отдаётся ответ на вопрос «сколько», а не «кто»: закон 115-2. */}
        <Small className="text-muted-foreground">
          {w.allowed.replace("{n}", String(state.telegram.allowed))}
          {" · "}
          {w.pending.replace("{n}", String(state.telegram.pending))}
        </Small>
      </SettingsCard>

      {/* 🪦 ЗДЕСЬ БЫЛА КАРТОЧКА «Telegram-бот — агент разработки» С ПОМЕТКОЙ
          «позже» — УДАЛЕНА 2026-09-06 прямым словом владельца. Она показывала
          заглушку «в процессе разработки» и не делала ничего.
          🔒 УДАЛЕНА ЦЕЛИКОМ, А НЕ СПРЯТАНА: вместе с ней ушли её слова
          `botDevTitle`, `botDevLead`, `botDevSoon` из словаря. Пустая карточка,
          оставленная «чтобы место не пропало», читается как обещание срока,
          которого никто не давал. Восстанавливается из git.
          🔒 САМ ФАКТ ДВУХ БОТОВ ЭТИМ НЕ ОТМЕНЁН — он записан законом в
          федеральном `CLAUDE.md` и в комментарии выше; исчезла поверхность, а
          не решение. */}
    </>
  )
}
