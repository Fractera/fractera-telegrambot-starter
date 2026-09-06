import {
  CalendarClock,
  CircleCheck,
  CircleDot,
  MapPin,
  Search,
  Tag,
} from "lucide-react"
import Link from "next/link"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination"
import { Small } from "@/components/ui/typography"
import type { Automation, AutomationPage, AutomationQuery } from "../_lib/automations"
import { PER_PAGE } from "../_lib/automations"
import { AutomationPreview, AutomationsFeed } from "./automation-preview.client"

// СПИСОК АВТОМАТИЗАЦИЙ — СЕРВЕРНАЯ ТАБЛИЦА С ОТБОРОМ И СТРАНИЦАМИ.
//
// 🎯 СЛОВА ВЛАДЕЛЬЦА 2026-09-06: «внизу сделаем пагинацию, это будет серверная
// пагинация» · «поиск по названию или по этим тегам, сортировку по дате вперёд
// назад, фильтр показать только завершённые или только активные…» · «у тебя есть
// кнопка показать страницу, а ещё нужна кнопка Preview, лучше это реализовать в
// виде иконок».
//
// 🔒 ВСЁ УПРАВЛЕНИЕ ТАБЛИЦЕЙ — ССЫЛКИ, А НЕ ОСТРОВОК. Отбор, сортировка и номер
// страницы живут в адресе: страницу можно послать другому человеку, вернуться к
// ней кнопкой «назад» браузера и открыть без единой строки JavaScript. Островок
// ради этого держал бы то же состояние в памяти вкладки и терял его на каждом
// обновлении.
// 🔒 ИСКЛЮЧЕНИЕ РОВНО ОДНО И НАЗВАНО: предпросмотр. Он ОТКРЫТ ИЛИ ЗАКРЫТ, это
// состояние экрана, а не запроса; уехав в адрес, он попал бы в чужую ссылку и
// открыл бы человеку рамку, которую тот не просил.
//
// 🔒 ФОРМА ПОИСКА — `GET`, А НЕ ДЕЙСТВИЕ СЕРВЕРА. Поиск не меняет ничего, и
// результат обязан быть адресуем.

type Words = {
  open: string
  preview: string
  previewClose: string
  steps: string
  empty: string
  demo: string
  search: string
  searchDo: string
  sortNew: string
  sortOld: string
  status: { any: string; done: string; running: string }
  calendar: { any: string; yes: string; no: string }
  map: { any: string; yes: string; no: string }
  perPage: string
  shown: string
  first: string
  prev: string
  next: string
  last: string
  page: string
  reset: string
}

/** Адрес того же экрана с изменённой частью запроса. */
function hrefWith(
  lang: string,
  query: AutomationQuery,
  patch: Partial<AutomationQuery>
): string {
  const next = { ...query, ...patch }
  const p = new URLSearchParams()
  p.set("section", "logs")
  p.set("view", "automations")
  if (next.q) {
    p.set("q", next.q)
  }
  if (next.status !== "any") {
    p.set("status", next.status)
  }
  if (next.calendar !== "any") {
    p.set("calendar", next.calendar)
  }
  if (next.map !== "any") {
    p.set("map", next.map)
  }
  if (next.sort !== "new") {
    p.set("sort", next.sort)
  }
  if (next.per !== PER_PAGE[0]) {
    p.set("per", String(next.per))
  }
  if (next.page > 1) {
    p.set("page", String(next.page))
  }
  return `/${lang}/settings?${p.toString()}`
}

/**
 * Один переключатель из нескольких значений — ряд ссылок.
 *
 * 🔒 РЯД ССЫЛОК, А НЕ ВЫПАДАЮЩИЙ СПИСОК. Значений у каждого фильтра два-три, и
 * они видны целиком: человек читает состояние отбора, не открывая ничего.
 */
function Choice<T extends string>({
  active,
  lang,
  options,
  query,
  field,
  mark,
}: {
  active: T
  lang: string
  options: { value: T; label: string }[]
  query: AutomationQuery
  field: keyof AutomationQuery
  mark: string
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border p-0.5" data-filter={mark}>
      {options.map((o) => (
        <Link
          aria-current={o.value === active ? "true" : undefined}
          className={
            o.value === active
              ? "rounded px-2 py-1 text-[length:var(--fs-small)] bg-muted font-medium text-foreground"
              : "rounded px-2 py-1 text-[length:var(--fs-small)] text-muted-foreground transition-colors hover:text-foreground"
          }
          href={hrefWith(lang, query, { [field]: o.value, page: 1 } as Partial<AutomationQuery>)}
          key={o.value}
        >
          {o.label}
        </Link>
      ))}
    </div>
  )
}

/** Метки карточки: состояние, календарь, карта, свободные теги. */
function Marks({ item, words }: { item: Automation; words: Words }) {
  const chip = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.75em]"

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* 🔒 СОСТОЯНИЕ ПЕРВЫМ И ЦВЕТОМ: это единственная метка, ради которой
          человек пробегает список глазами. Остальные — признаки, а не итог. */}
      {item.status === "done" ? (
        <span className={`${chip} border-border text-muted-foreground`} data-mark="done">
          <CircleCheck aria-hidden className="size-3" />
          {words.status.done}
        </span>
      ) : (
        <span className={`${chip} border-primary/40 text-primary`} data-mark="running">
          <CircleDot aria-hidden className="size-3" />
          {words.status.running}
        </span>
      )}

      {item.calendar && (
        <span className={`${chip} border-border text-muted-foreground`} data-mark="calendar">
          <CalendarClock aria-hidden className="size-3" />
          {words.calendar.yes}
        </span>
      )}

      {item.map && (
        <span className={`${chip} border-border text-muted-foreground`} data-mark="map">
          <MapPin aria-hidden className="size-3" />
          {words.map.yes}
        </span>
      )}

      {item.tags.map((t) => (
        <span className={`${chip} border-border text-muted-foreground`} data-tag={t} key={t}>
          <Tag aria-hidden className="size-3" />
          {t}
        </span>
      ))}
    </div>
  )
}

export function AutomationsView({
  lang,
  page,
  query,
  words,
}: {
  lang: string
  page: AutomationPage
  query: AutomationQuery
  words: Words
}) {
  const jump = (n: number) => hrefWith(lang, query, { page: n })
  const atFirst = page.page <= 1
  const atLast = page.page >= page.pages

  const navLink =
    "inline-flex items-center rounded-md border border-border px-2.5 py-1.5 text-[length:var(--fs-small)] transition-colors hover:bg-muted"
  const navOff = "pointer-events-none opacity-40"

  return (
    <div className="flex flex-col gap-4" data-automations={page.total}>
      <Small className="text-muted-foreground">{words.demo}</Small>

      {/* ── ПАНЕЛЬ УПРАВЛЕНИЯ ТАБЛИЦЕЙ ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
        <form action={`/${lang}/settings`} className="flex flex-wrap items-center gap-2" method="get">
          {/* Скрытые поля держат остальной отбор: поиск не имеет права его сбросить. */}
          <input name="section" type="hidden" value="logs" />
          <input name="view" type="hidden" value="automations" />
          <input name="status" type="hidden" value={query.status} />
          <input name="calendar" type="hidden" value={query.calendar} />
          <input name="map" type="hidden" value={query.map} />
          <input name="sort" type="hidden" value={query.sort} />
          <input name="per" type="hidden" value={String(query.per)} />

          <div className="relative min-w-[16rem] flex-1">
            <Search
              aria-hidden
              className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground"
            />
            <input
              className="h-9 w-full rounded-md border border-border bg-background pr-3 pl-8 text-[length:var(--fs-small)] text-foreground placeholder:text-muted-foreground"
              data-automations-search
              defaultValue={query.q}
              name="q"
              placeholder={words.search}
              type="search"
            />
          </div>

          <button className={navLink} type="submit">
            {words.searchDo}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <Choice
            active={query.sort}
            field="sort"
            lang={lang}
            mark="sort"
            options={[
              { label: words.sortNew, value: "new" },
              { label: words.sortOld, value: "old" },
            ]}
            query={query}
          />
          <Choice
            active={query.status}
            field="status"
            lang={lang}
            mark="status"
            options={[
              { label: words.status.any, value: "any" },
              { label: words.status.done, value: "done" },
              { label: words.status.running, value: "running" },
            ]}
            query={query}
          />
          <Choice
            active={query.calendar}
            field="calendar"
            lang={lang}
            mark="calendar"
            options={[
              { label: words.calendar.any, value: "any" },
              { label: words.calendar.yes, value: "yes" },
              { label: words.calendar.no, value: "no" },
            ]}
            query={query}
          />
          <Choice
            active={query.map}
            field="map"
            lang={lang}
            mark="map"
            options={[
              { label: words.map.any, value: "any" },
              { label: words.map.yes, value: "yes" },
              { label: words.map.no, value: "no" },
            ]}
            query={query}
          />

          <Link
            className="ml-auto text-[length:var(--fs-small)] text-muted-foreground underline-offset-4 hover:underline"
            href={`/${lang}/settings?section=logs&view=automations`}
          >
            {words.reset}
          </Link>
        </div>
      </div>

      {/* ── СТРОКИ ─────────────────────────────────────────────────────────── */}
      {page.items.length === 0 ? (
        <Small className="text-muted-foreground" data-automations-empty>
          {words.empty}
        </Small>
      ) : (
        <AutomationsFeed>
          {page.items.map((a) => (
            <AutomationPreview
              href={`/${lang}/automation/${a.id}`}
              id={a.id}
              key={a.id}
              words={{
                close: words.previewClose,
                open: words.open,
                preview: words.preview,
              }}
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium text-[length:var(--fs-body)] text-foreground">
                    {a.name}
                  </span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[length:var(--fs-small)] text-muted-foreground">
                    {a.at || "—"}
                  </code>
                  <Small className="text-muted-foreground">
                    {words.steps.replace("{n}", String(a.steps))}
                  </Small>
                </div>
                <Marks item={a} words={words} />
              </div>
            </AutomationPreview>
          ))}
        </AutomationsFeed>
      )}

      {/* ── СТРАНИЦЫ ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Small className="text-muted-foreground" data-automations-shown>
          {words.shown
            .replace("{from}", String(page.from))
            .replace("{to}", String(page.to))
            .replace("{total}", String(page.total))}
        </Small>

        {/* 🔒 РАЗМЕР СТРАНИЦЫ — ТОЖЕ ССЫЛКИ, а не выпадающий список: значений
            четыре, и выбор виден целиком, как у фильтров выше. */}
        <div className="flex items-center gap-2">
          <Small className="text-muted-foreground">{words.perPage}</Small>
          <Choice
            active={String(query.per) as string}
            field="per"
            lang={lang}
            mark="per"
            options={PER_PAGE.map((n) => ({ label: String(n), value: String(n) }))}
            query={query}
          />
        </div>

        <Pagination className="mx-0 w-auto">
          <PaginationContent data-automations-pager={`${page.page}/${page.pages}`}>
            <PaginationItem>
              <Link aria-label={words.first} className={`${navLink} ${atFirst ? navOff : ""}`} href={jump(1)}>
                ««
              </Link>
            </PaginationItem>
            <PaginationItem>
              <Link
                aria-label={words.prev}
                className={`${navLink} ${atFirst ? navOff : ""}`}
                href={jump(Math.max(1, page.page - 1))}
              >
                {words.prev}
              </Link>
            </PaginationItem>
            <PaginationItem>
              <Small className="px-2 text-muted-foreground">
                {words.page.replace("{n}", String(page.page)).replace("{of}", String(page.pages))}
              </Small>
            </PaginationItem>
            <PaginationItem>
              <Link
                aria-label={words.next}
                className={`${navLink} ${atLast ? navOff : ""}`}
                href={jump(Math.min(page.pages, page.page + 1))}
              >
                {words.next}
              </Link>
            </PaginationItem>
            <PaginationItem>
              <Link aria-label={words.last} className={`${navLink} ${atLast ? navOff : ""}`} href={jump(page.pages)}>
                »»
              </Link>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}
