import { Code2 } from "lucide-react";
import { Small } from "@/components/ui/typography";
import type { TelegramUi } from "../_i18n/telegram.i18n";

// КАРТОЧКА «ЭТО ВАШ СТАРТОВЫЙ ШАБЛОН» (137-15, 2026-09-06).
//
// 🎯 СЛОВО ВЛАДЕЛЬЦА: «в описании нужно сказать, что это ваш стартовый шаблон,
// который вы можете использовать сразу, а можете при помощи голосовых команд
// модернизировать, используя Claude Code: создавать новое меню, добавлять
// дашборды, строить интеграции. Весь исходный код вам полностью доступен».
//
// 🔒 ЗЕЛЁНЫЙ БЕРЁТСЯ ИЗ ПАЛИТРЫ ВЛАДЕЛЬЦА, А НЕ ЗАШИТ. `--primary` приезжает из
// `DESIGN-CONFIG` и меняется на экране дизайна без пересборки. Зашей я здесь
// `#16a34a`, карточка осталась бы зелёной в тот день, когда владелец сделает
// проект синим, — и выглядела бы чужой заплатой.
//
// 🔒 КАРТОЧКА СТОИТ ПОД СПРАВКОЙ, А НЕ НАД НЕЙ (место названо владельцем).
// Сперва человек читает, что это за бот, и только потом узнаёт, что бот —
// заготовка, которую можно переделать. Обратный порядок предлагал бы переделку
// раньше знакомства.
//
// 🔒 ТРИ ПРИМЕРА НАЗВАНЫ ПОИМЁННО — меню, дашборды, интеграции. «Можно всё» не
// значит ничего: человек не знает, с чего начать, и не начинает.

export function StarterCard({ ui }: { ui: TelegramUi }) {
  const w = ui.starter;

  return (
    <section
      className="flex gap-3 rounded-lg border border-primary/30 bg-primary/[0.06] p-3"
      data-starter-card
    >
      <Code2 className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="flex flex-col gap-1.5">
        <Small className="font-medium text-foreground">{w.title}</Small>
        <Small className="text-muted-foreground leading-relaxed">
          {w.body}
        </Small>
        <Small className="text-muted-foreground leading-relaxed">
          <strong className="text-foreground">{w.openTitle}</strong> {w.open}
        </Small>
      </div>
    </section>
  );
}
