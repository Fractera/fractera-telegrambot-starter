import Link from "next/link";

// ХЛЕБНЫЕ КРОШКИ СЛУЖБЫ БОТА (137-5, 2026-09-06).
//
// 🎯 СЛОВО ВЛАДЕЛЬЦА: «крошки создай как хардкод». Прямое указание после того,
// как 137-3 привёз шапку без них и назвал причину: на 3000 крошки рисует
// `Breadcrumbs`, а он тянет `metaForLang()` из `APP-CONFIG` и
// `buildBreadcrumbSchema()` из `lib/jsonld` — то есть конфиги слота и весь
// разметочный слой для поисковика.
//
// 🔒 РАЗМЕТКА ВЗЯТА ИЗ ИСТОЧНИКА ДОСЛОВНО — те же теги, классы, `aria-current`,
// то же поведение на узком экране: сжимается ТОЛЬКО последняя крошка, чтобы
// длинный заголовок не выдавил строку за край и не породил горизонтальную
// прокрутку. Отличий ровно два, и оба по слову владельца.
//
// 1. ПЕРВАЯ КРОШКА — КОНСТАНТА, А НЕ ИМЯ САЙТА ИЗ НАСТРОЕК. В источнике там
//    `metaForLang(lang).siteName`. Здесь имя зашито: служба бота обязана
//    работать, даже если проект на 3000 удалён целиком, — прямое требование
//    владельца, и имя, взятое из чужого конфига, стало бы пустым ровно в тот
//    день. 🔒 Захотите читать его из настроек — это одна строка, и `config/
//    app-config.ts` в этом репозитории уже лежит.
//
// 2. РАЗМЕТКИ `BreadcrumbList` ЗДЕСЬ НЕТ, И ЭТО НЕ ПОТЕРЯ. Она нужна, чтобы
//    поисковик показывал путь вместо голого адреса; страница бота стоит за
//    замком и не индексируется никем. Разметка, объявляющая путь, которого
//    поисковик не увидит, — вторая копия правды без единого читателя.
//
// 🛑 ССЫЛКА ПЕРВОЙ КРОШКИ ВЕДЁТ НА КОРЕНЬ ЭТОЙ СЛУЖБЫ, А НЕ НА САЙТ 3000.
// Адрес сайта здесь неизвестен без его же конфига — того самого, от которого
// эта страница намеренно не зависит.

export type Crumb = { label: string; href?: string };

/** Имя проекта в первой крошке — зашито намеренно, см. пункт 1 выше. */
const ROOT_LABEL = "Fractera";

export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  const items: Crumb[] = [{ href: "/", label: ROOT_LABEL }, ...trail];

  return (
    <nav aria-label="Breadcrumb" className="text-muted-foreground text-xs">
      <ol className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li
              className={`flex items-center gap-1.5 ${last ? "min-w-0" : "shrink-0"}`}
              key={c.label}
            >
              {c.href && !last ? (
                <Link
                  className="whitespace-nowrap hover:text-foreground"
                  href={c.href}
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  aria-current="page"
                  className="block min-w-0 truncate text-foreground"
                >
                  {c.label}
                </span>
              )}
              {!last && (
                <span aria-hidden className="shrink-0 text-muted-foreground">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
