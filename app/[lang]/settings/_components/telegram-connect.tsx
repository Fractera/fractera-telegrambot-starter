import { Plug } from "lucide-react";
import { SettingsCard } from "./settings-card";
import { AgentChannelSection } from "./agent-channel";
import { BotActivation } from "./bot-activation.client";
import type { TelegramUi } from "../_i18n/telegram.i18n";

// ВКЛАДКА «ПОДКЛЮЧЕНИЕ TELEGRAM-БОТА» — ОБЕ ПОЛОВИНЫ В ОДНОМ МЕСТЕ (181-7).
//
// 🎯 СЛОВО ВЛАДЕЛЬЦА 2026-09-10, ДОСЛОВНО: «вместо того чтобы бот находился в
// одном месте мы его разорвали в две разные части найти его невозможно
// активировать непонятно». Первая половина — токен — жила в «Настройках», вторая
// — активация — в окне терминала. Теперь они стоят подряд, в порядке работы:
// сначала бот заводится, потом активируется.
//
// 🔒 ПОРЯДОК КАРТОЧЕК И ЕСТЬ ИНСТРУКЦИЯ. Без токена активировать нечего, поэтому
// токен сверху; кнопка активации недоступна, пока токена нет, и говорит об этом
// словами, а не молчит.
//
// 🔒 СЛОВА УЕЗЖАЮТ ОСТРОВКУ ПЕРЕЧИСЛЕННЫМИ ПОИМЁННО, а не словарём целиком: тип
// не сужает рантайм — по проводу уедет всё переданное, даже неотрисованное.

export function TelegramConnect({ lang, ui }: { lang: string; ui: TelegramUi }) {
  const w = ui.connect;
  return (
    <div className="flex flex-col gap-4" data-telegram-connect>
      {/* ── 1. Бот: токен ─────────────────────────────────────────────── */}
      <AgentChannelSection lang={lang} ui={ui} />

      {/* ── 2. Активация: живая сессия и подтверждение кода ────────────── */}
      <SettingsCard
        mark={{ "data-bot-activation-card": "" }}
        icon={<Plug className="size-4 text-muted-foreground" />}
        title={w.title}
        open
        bodyClassName="p-3"
      >
        <BotActivation
          labels={{
            allowed: w.allowed,
            closedWith: w.closedWith,
            lead: w.lead,
            loginHref: `/${lang}/claude-subscription`,
            loginLink: w.loginLink,
            needsLogin: w.needsLogin,
            needsToken: w.needsToken,
            none: w.none,
            pair: w.pair,
            pairFirst: w.pairFirst,
            pairHint: w.pairHint,
            pairTitle: w.pairTitle,
            reset: w.reset,
            show: w.show,
            showAgain: w.showAgain,
            statusClosed: w.statusClosed,
            statusConnected: w.statusConnected,
            statusConnecting: w.statusConnecting,
            statusIdle: w.statusIdle,
            ticketFailed: w.ticketFailed,
            ticketForbidden: w.ticketForbidden,
            ticketUnreachable: w.ticketUnreachable,
            title: w.title,
          }}
        />
      </SettingsCard>
    </div>
  );
}
