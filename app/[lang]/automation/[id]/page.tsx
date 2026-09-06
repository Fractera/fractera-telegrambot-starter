import { Breadcrumbs } from "@/components/nav/breadcrumbs.server"
import { Eyebrow, H1, Lead, Small } from "@/components/ui/typography"
import { automationById } from "../../settings/_lib/automations"
import { automationUi } from "./_i18n/automation.i18n"

// СТРАНИЦА ОДНОЙ АВТОМАТИЗАЦИИ — ШАБЛОН (2026-09-06).
//
// 🎯 СЛОВА ВЛАДЕЛЬЦА: «создать шаблон страницы, которая пока будет единственное
// что возвращать — это название автоматизации и время из названия файла» ·
// «используй такой же заголовок H1, как у тебя используется на вкладке settings
// Telegram Bot, используй там тоже описание, и в качестве дополнительного
// атрибута показывай название».
//
// 🔒 АНАТОМИЯ ЗАГОЛОВКА ВЗЯТА У `settings` ЦЕЛИКОМ: крошки → надзаголовок →
// `H1` → лид. Это и есть то общее, что делает страницы одним продуктом; тело у
// каждой своё.
//
// 🔒 ИМЯ И ВРЕМЯ РАЗБИРАЮТСЯ ИЗ ИМЕНИ ФАЙЛА, а не хранятся отдельно — механизм
// и причина в `settings/_lib/automations.ts`.
//
// 🛑 ДАННЫЕ СЕГОДНЯ ВЫДУМАННЫЕ, И СТРАНИЦА ГОВОРИТ ЭТО СЛОВАМИ, А НЕ МОЛЧИТ.
// Владелец просил отрисовать на фейковых данных, чтобы посмотреть; следующим
// шагом сюда придут настоящие записи логов. Заглушка, не объявившая себя
// заглушкой, выглядит работающей ровно до того дня, когда на неё обопрутся.
//
// 🛑 НАСТРОЕК СЕГМЕНТА ЗДЕСЬ НЕТ: у шаблона включён `cacheComponents`, и он
// несовместим с `runtime`/`dynamic`.

export default async function AutomationPage({
  params,
}: {
  params: Promise<{ id: string; lang: string }>
}) {
  const { id, lang } = await params
  const ui = automationUi(lang)
  const item = automationById(decodeURIComponent(id))

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-8 px-6 py-10 md:px-8">
      <div className="flex flex-col gap-4">
        <Breadcrumbs
          trail={[{ label: ui.layer }, { label: ui.title }, { label: item?.name ?? id }]}
        />

        <header className="flex flex-col gap-4 border-border border-b pb-8">
          <Eyebrow>{ui.layer}</Eyebrow>
          <H1>{ui.title}</H1>
          <Lead className="max-w-3xl">{ui.lead}</Lead>
        </header>
      </div>

      {item ? (
        <>
          {item.demo && (
            <p
              className="rounded-md border border-warning/40 bg-warning/10 p-3 text-[length:var(--fs-small)] text-warning"
              data-automation-demo
            >
              {ui.demo}
            </p>
          )}

          <dl className="flex flex-col gap-3" data-automation={item.id}>
            <Field label={ui.nameLabel} mark="name" value={item.name} />
            <Field label={ui.atLabel} mark="at" value={item.at} />
            <Field label={ui.stepsLabel} mark="steps" value={String(item.steps)} />
            <Field label={ui.fileLabel} mark="file" mono value={item.file} />
          </dl>
        </>
      ) : (
        <Small data-automation-missing className="text-muted-foreground">
          {ui.notFound}
        </Small>
      )}
    </main>
  )
}

/**
 * Одна строка «подпись — значение».
 *
 * 🔒 ПУСТОЕ ЗНАЧЕНИЕ ОСТАЁТСЯ ПУСТЫМ И ГОВОРИТ ОБ ЭТОМ ЧЕРТОЙ. Имя файла бывает
 * не по формату, и тогда времени в нём нет; подставить сюда «сегодня» значило бы
 * выдумать факт о цепочке.
 */
function Field({
  label,
  value,
  mark,
  mono,
}: {
  label: string
  value: string
  mark: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 border-border border-b pb-3">
      <dt className="min-w-[13rem] text-[length:var(--fs-small)] text-muted-foreground">{label}</dt>
      <dd
        className={
          mono
            ? "font-mono text-[length:var(--fs-small)] text-foreground"
            : "text-[length:var(--fs-body)] text-foreground"
        }
        data-automation-field={mark}
      >
        {value || "—"}
      </dd>
    </div>
  )
}
