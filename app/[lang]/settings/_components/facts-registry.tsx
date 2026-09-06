import { Layers } from "lucide-react"
import { Small } from "@/components/ui/typography"
import { SettingsCard } from "./settings-card"
import { SectionIntro } from "./section-intro.client"
import { FactsHandoff } from "./facts-handoff.client"
import { editFactRequest, newFactRequest } from "../_lib/facts-handoff-text"
import { allFacts } from "@/lib/facts/registry"
import { needsTable } from "@/lib/facts/table"
import { factDetail } from "@/lib/facts/detail"
import type { Fact, FactLevel } from "@/lib/facts/types"
import type { TelegramUi } from "../_i18n/telegram.i18n"

// КАРТОЧКА «РЕЕСТР ПРИЗНАКОВ» — четвёртой в разделе «Настройки» бота (81-3).
//
// 🔒 МЕСТО НАЗВАНО ВЛАДЕЛЬЦЕМ прямым ответом на прямой вопрос:
// `/{lang}/architect/telegram?section=settings`. Агент предлагал отдельный вход в
// слое архитектора и был поправлен.
//
// 🔒 ОПРЕДЕЛЕНИЕ ПОКАЗЫВАЕТСЯ ЧЕЛОВЕКУ, А НЕ ЖИВЁТ В КОММЕНТАРИИ. Правило,
// которое негде увидеть, исполняется по памяти — то есть не исполняется. Тот же
// закон, что у каталога модальных окон (шаг 62) и у карточек видов секций (51-1):
// комментарий читает тот, кто уже открыл файл, а карточку — каждый.
//
// 🔒 ПРИЗНАКИ ГРУППИРУЮТСЯ ПО УРОВНЮ, И УРОВЕНЬ ОТВЕЧАЕТ НА ВОПРОС «КОГДА ЭТО
// ИЗВЕСТНО». Плоский список из двадцати пяти строк ничего не объясняет: род входа
// известен до всякого разбора, намерение — после первого вызова модели, поле —
// после второго. Смешав их, мы обещали бы, что температура воздуха узнаётся так
// же, как «это голосовое».
//
// 🔒 КАРТОЧКА СЕРВЕРНАЯ, КЛИЕНТСКАЯ ТОЛЬКО ФОРМА (81-4). Список читается на
// сервере и приезжает готовой разметкой; в браузер уезжает лишь то, что обязано
// там жить, — поля ввода и обращение к двери. Тот же приём, что у ленты
// направлений: словари резолвятся на сервере, островок получает готовые строки.

// 🔒 ПОДПИСИ ОКНА СОБИРАЮТСЯ ЗДЕСЬ, НА СЕРВЕРЕ, И УЕЗЖАЮТ ОСТРОВКУ ПРОПСАМИ.
// Словарь читает сервер; отдай мы островку весь `ui`, в браузер уехало бы всё,
// включая слова разделов, которых на этом экране нет.
function handoffLabels(w: TelegramUi["facts"], edit = false) {
  return {
    advice: w.handoffAdvice,
    copied: w.handoffCopied,
    copy: w.handoffCopy,
    lead: w.handoffLead,
    title: edit ? w.handoffEditTitle : w.handoffTitle,
    trigger: edit ? w.handoffEditTrigger : w.handoffTrigger,
  }
}

const ORDER: FactLevel[] = ["material", "intent", "entity", "destination", "field"]

export async function FactsRegistrySection({ lang, ui }: { lang: string; ui: TelegramUi }) {
  const w = ui.facts
  const facts = await allFacts()
  const byLevel = new Map<FactLevel, Fact[]>()
  for (const f of facts) byLevel.set(f.level, [...(byLevel.get(f.level) ?? []), f])

  return (
    // 🔒 СЧЁТЧИК ПРИЗНАКОВ ОСТАЁТСЯ В ЗАГОЛОВКЕ (111): свёрнутая карточка обязана
    // говорить, сколько система умеет вынимать, — иначе складывание прячет саму
    // способность, а не только её список.
    <SettingsCard
      mark={{ "data-facts-registry": "ready" }}
      icon={<Layers className="size-4 text-muted-foreground" />}
      title={w.title}
      status={
        <Small data-facts-count className="text-muted-foreground">
          {w.counted.replace("{n}", String(facts.length))}
        </Small>
      }
      bodyClassName="flex flex-col gap-4 p-3"
    >
        <SectionIntro
          name="facts"
          summary={<Small className="leading-relaxed text-muted-foreground">{w.summary}</Small>}
          rest={<Small className="leading-relaxed text-muted-foreground">{w.rest}</Small>}
          moreLabel={w.more}
          lessLabel={w.less}
        />

        {/* 🔒 ЗДЕСЬ СТОЯЛА ФОРМА ЗАВЕДЕНИЯ ПРИЗНАКА — ЗАМЕНЕНА ПЕРЕДАЧЕЙ
            ЗАДАЧИ АГЕНТУ (137-13, слово владельца). Реестр правится через
            агента в Telegram: он строит и кладёт коммит, по которому правку
            можно откатить. Форма писала бы в хранилище мимо этого пути, и у
            определений оказалось бы два хозяина.
            🪦 Прежний порядок «справка → форма → список» описан в git. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Small className="text-muted-foreground">{w.handoffHint}</Small>
          <FactsHandoff labels={handoffLabels(w)} text={newFactRequest(lang)} />
        </div>

        {ORDER.map(level => {
          const rows = byLevel.get(level) ?? []
          if (!rows.length) return null
          return (
            <section key={level} data-facts-level={level} className="flex flex-col gap-2">
              <Small className="font-medium text-foreground">{w.levels[level]}</Small>
              <ul className="flex flex-col gap-2">
                {rows.map(f => (
                  <FactRow fact={f} key={f.key} lang={lang} w={w} />
                ))}
              </ul>
            </section>
          )
        })}
    </SettingsCard>
  )
}

/**
 * Одна запись реестра.
 *
 * 🔒 ПОКАЗЫВАЮТСЯ ВСЕ ПЯТЬ ЧАСТЕЙ, В ТОМ ЧИСЛЕ ИНСТРУКЦИЯ УЗНАВАНИЯ. Именно она
 * едет в модель и именно её человек будет писать сам — спрятав её, мы оставили бы
 * на экране красивый список без того, ради чего он существует.
 * 🔒 «ГДЕ ЖИВЁТ» НАЗЫВАЕТСЯ ВСЛУХ: у признака это его таблица, у связи — прямая
 * оговорка, что таблицы нет и почему.
 */
function FactRow({ fact, lang, w }: { fact: Fact; lang: string; w: TelegramUi["facts"] }) {
  return (
    <li
      data-facts-row={fact.key}
      className="flex flex-col gap-1 rounded-md border border-border p-2.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-[length:var(--fs-small)] text-foreground">{fact.title}</span>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[length:var(--fs-small)] text-muted-foreground">
          {fact.key}
        </code>
        {fact.builtin && (
          <Small data-facts-builtin className="text-muted-foreground">
            {w.builtin}
          </Small>
        )}
        {fact.required && (
          <Small data-facts-required className="text-muted-foreground">
            {w.required}
          </Small>
        )}

        {/* 🔒 ПРАВКА ЗАПРАШИВАЕТСЯ У АГЕНТА, А НЕ ДЕЛАЕТСЯ ЗДЕСЬ (137-13).
            Окно уносит СОСТОЯНИЕ этого признака вместе с просьбой: ключ без
            содержания — просьба вслепую, и человек не увидит, что именно просит
            изменить.
            🛑 У встроенного признака кнопки нет намеренно: он описывает то, что
            система делает по устройству, и меняется вместе с кодом, а не по
            заявке. Кнопка на нём обещала бы правку, которой не будет. */}
        {!fact.builtin && (
          <span className="ml-auto">
            <FactsHandoff
              labels={handoffLabels(w, true)}
              text={editFactRequest(lang, fact)}
            />
          </span>
        )}
      </div>

      {fact.description && (
        <Small className="leading-relaxed text-muted-foreground">{fact.description}</Small>
      )}

      <Small className="text-muted-foreground">
        {fact.howToFind}
      </Small>

      <Small data-facts-stored className="text-muted-foreground">
        {needsTable(fact) ? fact.storedIn : w.noTable}
      </Small>

      <FactDetails fact={fact} w={w} />
    </li>
  )
}

/**
 * РАСКРЫТИЕ КАРТОЧКИ — ПЯТЬ СТРОК (81-9).
 *
 * 🔒 ЗАКАЗ ВЛАДЕЛЬЦА 2026-09-02 И ЕГО ПРИЧИНА ДОСЛОВНО: «если честно я не понимаю
 * насколько много мы извлекли из этого с тобой понимание». Реестр показывает
 * двадцать пять встроенных записей ОДИНАКОВО, как будто все они одинаково живые.
 * Раскрытие показывает разницу.
 *
 * 🔒 БЕЗ ОСТРОВКА, НА `<details>`. Закон слоя велит сперва спросить, нужен ли JS:
 * здесь нужен показ и сокрытие, и браузер умеет это сам. Островок дал бы то же
 * самое ценой гидратации и работал бы хуже без скриптов.
 *
 * 🛑 ПЯТАЯ СТРОКА — «ЧТО ТЕРЯЕТСЯ» — ВЛАДЕЛЬЦЕМ НЕ ЗАКАЗЫВАЛАСЬ И ДОБАВЛЕНА
 * НАМЕРЕННО. Четыре заказанные рассказывают, что признак умеет, и молчат о том,
 * что он умеет и ВЫБРАСЫВАЕТ; а вопрос был именно про честный объём понимания.
 */
function FactDetails({ fact, w }: { fact: Fact; w: TelegramUi["facts"] }) {
  const d = factDetail(fact)

  return (
    <details data-facts-details={fact.key} className="mt-1">
      <summary className="cursor-pointer list-none text-[length:var(--fs-small)] text-muted-foreground underline underline-offset-2 hover:text-foreground">
        {w.detailsMore}
      </summary>

      <div className="mt-2 flex flex-col gap-2 border-l-2 border-border pl-3">
        {/* 🔒 ПУСТОЕ ГОВОРИТ, ЧТО ОНО ПУСТОЕ, А НЕ ИСЧЕЗАЕТ. Скрытая строка
            неотличима от несуществующей способности; «не описано» — это факт о
            нашей работе, и человек вправе его видеть. */}
        <Detail label={w.detailExample} lines={d.example ? [d.example] : []} empty={w.detailNotDescribed} />
        <Detail label={w.detailExtracts} lines={d.extracts} empty={w.detailNotDescribed} />
        <Detail label={w.detailTools} lines={d.tools} empty={w.detailNotDescribed} />
        <Detail label={w.detailFunctions} lines={d.functions} empty={w.detailNotDescribed} />
        <Detail label={w.detailLost} lines={d.lost ? [d.lost] : []} empty={w.detailNothingLost} />
      </div>
    </details>
  )
}

function Detail({ label, lines, empty }: { label: string; lines: string[]; empty: string }) {
  return (
    <div data-facts-detail className="flex flex-col gap-0.5">
      <Small className="font-medium text-foreground">{label}</Small>
      {lines.length === 0 ? (
        <Small data-facts-detail-empty className="text-muted-foreground">{empty}</Small>
      ) : (
        lines.map((l, i) => (
          <Small key={i} className="leading-relaxed text-muted-foreground">
            {l}
          </Small>
        ))
      )}
    </div>
  )
}
