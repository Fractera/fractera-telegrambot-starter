import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Eyebrow, H1, Lead, Small } from "@/components/ui/typography";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { fracteraRoles } from "@/lib/fractera/session";
import { InProgress } from "./_components/in-progress";
import { SectionIntro } from "./_components/section-intro.client";
import { TelegramAbout } from "./_components/telegram-about";
import { architectLayerUi } from "./_i18n/architect-layer.i18n";
import { telegramUi } from "./_i18n/telegram.i18n";
import {
  hrefOfTelegramSection,
  resolveTelegramSection,
  TELEGRAM_SECTIONS,
} from "./_lib/telegram-sections";

// СТРАНИЦА БОТА ПЕРЕЕХАЛА СЮДА С ПОРТА 3000 (шаг 137, 2026-09-05/06).
//
// 🎯 ЦЕЛЬ ВЛАДЕЛЬЦА, ДОСЛОВНО: «если пользователь, которому не нужен сайт,
// придёт только на чат-бот, то ему будет достаточно всей информации».
//
// 🔒 ЭТО ПЕРЕНОС, А НЕ НОВАЯ СТРАНИЦА, И ЗДЕСЬ ЭТО ОПЛАЧЕНО ЦЕЛЫМ ЗАХОДОМ.
// ✗ 137-1 собрал экран СВОЕЙ вёрсткой — `max-w-4xl`, ряд круглых ссылок вместо
// меню, самодельная жёлтая плашка. Слово владельца: «вместо того чтобы перенести
// один к одному тот, который существует, ты попытался создать свой собственный
// дизайн… немедленно прекратить создавать новые». Раскладка, меню, справка и
// заглушка теперь те же самые файлы, что на 3000, скопированные дословно:
// `WorkspaceShell`, `SectionIntro`, `InProgress`, `architect-layer.i18n`.
// 🔒 ЗАКОН, КОТОРЫЙ Я НАРУШИЛ, СТОИТ В КОРПУСЕ ДАВНО: «при переносе экрана
// копируется поведение и текст» (77-9), «максимальное перемещение с минимальной
// адаптацией». Вторая реализация того, что уже работает, — решение владельца,
// а не моё.
//
// 🔒 СЕГМЕНТ `[lang]` ЗАВЕДЁН ТОЛЬКО ДЛЯ ЭТОЙ СТРАНИЦЫ, И ЭТО НЕ ПРОТИВОРЕЧИТ
// ЗАКОНУ ЧАТА. `lib/fractera/i18n.ts` запрещает читать заголовки В КОРНЕВОЙ
// РАСКЛАДКЕ — при `cacheComponents` это делает динамическими все страницы разом.
// Здесь язык приходит ПАРАМЕТРОМ МАРШРУТА: корневая раскладка не тронута.
// Адрес назван владельцем: `chat.<домен>/ru/settings`.
//
// 🔒 НАБОР ЯЗЫКОВ ЗАКРЫТ ПРОВЕРКОЙ В КОДЕ, А НЕ `dynamicParams`. ✗ измерено
// сборкой: `dynamicParams` несовместим с `cacheComponents` шаблона. Поэтому
// неизвестный язык отсекает `notFound()`: `/xx/settings` обязан дать 404, а не
// молча показать английский.
//
// 🛑 ШАПКА СОБРАНА `H1`/`Lead`/`Eyebrow` ИЗ ТОГО ЖЕ `typography.tsx`, НО БЕЗ
// КРОШЕК, И ПРИЧИНА НАЗВАНА. На 3000 её рисует `PageHeader`, а он тянет
// `Breadcrumbs` → `APP-CONFIG`, `PLATFORM-CONFIG` и `lib/jsonld` — хранилища
// слота, которых на 3600 нет вовсе. Принести сюда конфиги слота значило бы
// перенести чужой слой ради трёх строк разметки. Разметка заголовка взята из
// `PageHeader` дословно; крошки и её JSON-LD не приехали — это названный долг,
// а не упущение.

const LANGS = ["en", "ru"] as const;

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

// ✗ ЗАМОК ЖИВЁТ ПОД `<Suspense>`, И ЭТО ОПЛАЧЕНО СБОРКОЙ, А НЕ ВЫВЕДЕНО.
// Первая версия спрашивала роли прямо в теле страницы, и сборка упала:
// «Uncached data was accessed outside of <Suspense>». Тот же приём и по той же
// причине стоит в `app/terminal/page.tsx` — здесь он повторён, а не изобретён.
export default function BotSettingsPage(props: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ section?: string; view?: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <BotSettingsGate {...props} />
    </Suspense>
  );
}

async function BotSettingsGate({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ section?: string; view?: string }>;
}) {
  const { lang } = await params;
  if (!(LANGS as readonly string[]).includes(lang)) {
    notFound();
  }

  // 🔒 ЗАМОК ТОТ ЖЕ, ЧТО У ОСТАЛЬНЫХ ДВЕРЕЙ ЧАТА: страница показывает состояние
  // бота владельца, а не публичный текст. Роль спрашивается у единственной
  // службы входа, как везде в этом репозитории.
  const roles = await fracteraRoles();
  if (!roles.includes("architect")) {
    notFound();
  }

  const { section: rawSection } = await searchParams;
  const active = resolveTelegramSection(rawSection);
  const t = architectLayerUi(lang);
  const ui = telegramUi(lang);

  return (
    <main className="min-h-screen bg-background">
      <div className="px-6 py-[var(--page-py-work)]" data-app-column>
        <header className="flex flex-col gap-4 border-border border-b pb-8">
          <Eyebrow>{t.layer}</Eyebrow>
          <H1>{ui.title}</H1>
          <Lead className="max-w-3xl">{ui.subtitle}</Lead>
        </header>

        <WorkspaceShell
          id="telegram"
          lead={ui.pages[active].hint}
          menu={TELEGRAM_SECTIONS.map((id) => ({
            active: id === active,
            href: hrefOfTelegramSection(lang, id),
            label: ui.pages[id].title,
          }))}
          menuTitle={ui.menuTitle}
          menuWord={t.menuTitle}
          title={ui.pages[active].title}
        >
          {/* 🔒 ПРИЗНАКИ СТОЯТ НА КОНТЕЙНЕРЕ РАЗДЕЛА, А НЕ ВНУТРИ ОСТРОВКА —
              как в источнике: островок появляется позже, а правда о том, какой
              раздел открыт, нужна разметке сразу. Признаков состояния службы
              (`data-channels-available` и соседние) здесь пока нет: их даёт
              `readChannels()`, и он приедет вместе с разделом «Настройки». */}
          <div
            className="flex min-w-0 flex-1 flex-col gap-6"
            data-telegram-page
            data-telegram-section={active}
          >
            {/* 🔒 «ОПИСАНИЕ» БЕРЁТ ОБЩУЮ СВЁРНУТУЮ СПРАВКУ, А НЕ СВОЮ — тот же
                островок, что у блоков и инструментов на 3000. Ключ — сам раздел:
                уход на другой раздел и обратно даёт снова свёрнутый вид.
                🔒 ВИДЕН ТОЛЬКО ПЕРВЫЙ АБЗАЦ (77-12, правка владельца): `summary`
                — это то, что читают ВСЕГДА, поэтому там ровно один абзац. */}
            {active === "about" && (
              <>
                <SectionIntro
                  key={active}
                  lessLabel={ui.helpLess}
                  moreLabel={ui.helpMore}
                  name="telegram-about"
                  rest={
                    <div className="flex flex-col gap-2">
                      <Small>
                        <strong className="text-foreground">
                          {ui.about.demoWriteTitle}
                        </strong>{" "}
                        {ui.about.demoWrite}
                      </Small>
                      <Small>
                        <strong className="text-foreground">
                          {ui.about.demoReadTitle}
                        </strong>{" "}
                        {ui.about.demoRead}
                      </Small>
                      <Small>{ui.about.demoWhy}</Small>
                      <Small>
                        <strong className="text-foreground">
                          {ui.about.whatTitle}
                        </strong>{" "}
                        {ui.about.what}
                      </Small>
                      <Small>
                        <strong className="text-foreground">
                          {ui.about.arrangedTitle}
                        </strong>{" "}
                        {ui.about.arranged}
                      </Small>
                    </div>
                  }
                  summary={
                    <Small>
                      <strong className="text-foreground">
                        {ui.about.demoTitle}
                      </strong>{" "}
                      {ui.about.demoWhat}
                    </Small>
                  }
                />
                <TelegramAbout ui={ui} />
              </>
            )}

            {/* 🔒 НЕПРИЕХАВШИЕ РАЗДЕЛЫ ГОВОРЯТ О СЕБЕ ТЕМ ЖЕ `InProgress`, ЧТО НА
                3000, А НЕ САМОДЕЛЬНОЙ ПЛАШКОЙ. ✗ 137-1 нарисовал свою жёлтую
                врезку, и она врала дважды: текст был хардкодом только по-русски
                на двуязычной странице, и он звал вернуться «туда, где было
                раньше», — а старый адрес уже переадресует сюда, то есть человек
                ходил бы по кольцу.
                🔒 Признак `data-in-progress` именует место: замер «заглушка на
                месте» иначе не отличает три заглушки друг от друга. */}
            {active !== "about" && (
              <InProgress
                label={ui.pages[active].title}
                lead={ui.skeleton.inProgress}
                where={`telegram-${active}`}
              />
            )}
          </div>
        </WorkspaceShell>
      </div>
    </main>
  );
}
