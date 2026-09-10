import { Mic, Search } from "lucide-react"
import { H4, Small } from "@/components/ui/typography"
import { OpenAiKeySection, type OpenAiKeyWords } from "./openai-key"

// ВКЛАДКА «ПОДПИСКА OpenAI» — ОДНА НА ДВЕ СЛУЖБЫ, ПАМЯТЬ И ЧАТ, БАЙТ В БАЙТ (181-1).
//
// 🎯 СЛОВО ВЛАДЕЛЬЦА 2026-09-10: «напиши, для чего мы используем подписку OpenAI —
// именно для транскрипции аудиозаписей, если будет использован голосовой набор, а
// также для создания векторов в агентном RAG и векторной базе; напиши это хорошими
// простыми словами, а готовые компоненты можешь забрать из чата».
//
// 🔒 ОБЪЯСНЕНИЕ СТОИТ ВЫШЕ КАРТОЧКИ КЛЮЧА, И ЭТО НЕ ОФОРМЛЕНИЕ. Человек, не
// понимающий, зачем ключ, не станет за него платить — или заплатит и решит, что
// OpenAI думает вместо Claude. Две работы названы поимённо, и сказано, что главное
// продолжит работать без ключа: иначе его отсутствие читается как поломка проекта.
//
// 🛑 «БЕЗ КЛЮЧА НЕ БУДЕТ ТОЛЬКО…» НЕ НАПИСАНО НАМЕРЕННО. Две работы — главные, но
// не обязательно единственные: слово «только» было бы обещанием, которое никто не
// проверял.
//
// 🔒 КАРТОЧКА ПИШЕТ ЧЕРЕЗ ЕДИНУЮ ДВЕРЬ ПЛАТФОРМЫ: ключ, введённый здесь, доезжает
// до всех потребителей, включая склад секретов машины (181-4). Своего хранилища
// ключа у служб нет и не будет — «одна учётная запись из любого места», слово
// владельца.

/** Слова объяснения. Форму задаёт вкладка, словари обеих служб ей подчиняются. */
export type OpenAiTabWords = {
  heading: string
  intro: string
  voiceTitle: string
  voice: string
  vectorsTitle: string
  vectors: string
  without: string
}

export function OpenAiTab({
  ui,
}: {
  ui: { openai: OpenAiKeyWords; openaiTab: OpenAiTabWords }
}) {
  const t = ui.openaiTab
  return (
    <div className="flex flex-col gap-6" data-openai-tab>
      <section className="flex flex-col gap-3">
        <H4>{t.heading}</H4>
        <Small className="leading-relaxed text-muted-foreground">{t.intro}</Small>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2 font-medium">
              <Mic className="size-4 text-muted-foreground" />
              {t.voiceTitle}
            </div>
            <Small className="leading-relaxed text-muted-foreground">{t.voice}</Small>
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2 font-medium">
              <Search className="size-4 text-muted-foreground" />
              {t.vectorsTitle}
            </div>
            <Small className="leading-relaxed text-muted-foreground">{t.vectors}</Small>
          </div>
        </div>

        <Small className="leading-relaxed text-muted-foreground">{t.without}</Small>
      </section>

      <OpenAiKeySection ui={ui} />
    </div>
  )
}
