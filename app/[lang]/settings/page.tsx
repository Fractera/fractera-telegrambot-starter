import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { appDialogUi } from "@/components/dialog/app-dialog.i18n";
import { Breadcrumbs } from "@/components/nav/breadcrumbs.server";
import { Eyebrow, H1, Lead, Small } from "@/components/ui/typography";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { readChannels } from "@/lib/architect/channels";
import { fracteraRoles } from "@/lib/fractera/session";
import { AutoRefresh } from "./_components/auto-refresh.client";
import { AutomationsView } from "./_components/automations-view";
import { InProgress } from "./_components/in-progress";
import { PassportBody } from "./_components/passport-body.client";
import { SectionIntro } from "./_components/section-intro.client";
import { StarterCard } from "./_components/starter-card";
import { TaskParseSection } from "./_components/task-parse-section";
import { TelegramAbout } from "./_components/telegram-about";
import { TelegramSettings } from "./_components/telegram-settings";
import { architectLayerUi } from "./_i18n/architect-layer.i18n";
import { telegramUi } from "./_i18n/telegram.i18n";
import { queryAutomations, readAutomationQuery } from "./_lib/automations";
import { passportOutline } from "./_lib/passport-outline";
import {
  hrefOfTelegramLogView,
  hrefOfTelegramSection,
  resolveTelegramLogView,
  resolveTelegramSection,
  TELEGRAM_LOG_VIEWS,
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
  searchParams: Promise<Record<string, string | undefined>>;
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
  searchParams: Promise<Record<string, string | undefined>>;
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

  const sp = await searchParams;
  const { section: rawSection, view: rawView } = sp;
  const active = resolveTelegramSection(rawSection);
  const view = resolveTelegramLogView(rawView);
  const t = architectLayerUi(lang);
  const ui = telegramUi(lang);

  // 🔒 ПАСПОРТ ЧИТАЕТСЯ ФАЙЛОМ ПРОЕКТА (правка владельца 2026-09-02): он живёт
  // в `development-docs/PASSPORT.md`, правится обычной правкой файла, и второй
  // копии текста не существует. Файла может не быть — это законный исход, и
  // раздел скажет об этом словами.
  //
  // 🛑 ЗДЕСЬ ЭТО ФАЙЛ СЛУЖБЫ БОТА, А НЕ СЛОТА НА 3000, И РАЗНИЦА СОДЕРЖАТЕЛЬНА.
  // `process.cwd()` — `/opt/fractera/telegrambot`. Паспорт описывает проект, у
  // которого свой репозиторий; чей паспорт показывать на этом экране — решение
  // владельца, и пока читается свой, потому что читать чужую папку значило бы
  // молча связать две службы там, где связи никто не объявлял.
  let passport = "";
  if (active === "passport") {
    try {
      passport = await readFile(
        join(process.cwd(), "development-docs", "PASSPORT.md"),
        "utf8"
      );
    } catch {
      passport = "";
    }
  }
  // 🔒 ЗАГОЛОВКИ ПЕРВОГО УРОВНЯ СТАНОВЯТСЯ ЛИПКИМ МЕНЮ — той же полосой, что
  // виды раздела «Логи»: одна раскладка, один вид, никакого второго меню.
  const passportTabs = passportOutline(passport).map((i) => ({
    active: false,
    href: `#${i.id}`,
    label: i.title,
  }));

  // 🔒 ОДИН ВОПРОС СЛУЖБЕ НА СТРАНИЦУ, А НЕ ПО ОДНОМУ НА РАЗДЕЛ — как в
  // источнике. Служба ходит в Telegram за именем бота, то есть вызов не
  // бесплатный; и разделы обязаны показывать ОДНО состояние, а не каждый своё,
  // снятое в разные секунды.
  //
  // 🔒 ЭТО НЕ ЗАВИСИТ ОТ СЛОТА НА 3000, И В ЭТОМ ВЕСЬ СМЫСЛ ПЕРЕЕЗДА. Правда о
  // боте живёт в службе каналов `:3500` — своём процессе на этой же машине.
  // Удали кто-нибудь проект на 3000 целиком — настройки бота останутся живыми,
  // потому что читают не его.
  const channels = await readChannels();

  return (
    <main className="min-h-screen bg-background">
      <div className="px-6 py-[var(--page-py-work)]" data-app-column>
        {/* 🔒 ПОРЯДОК ШАПКИ ВЗЯТ У `PageHeader` ИСТОЧНИКА: крошки, затем
            заголовочный блок с чертой снизу. Крошки — свои, хардкодом (слово
            владельца): тамошние тянут имя сайта из `APP-CONFIG` и разметку для
            поисковика из `lib/jsonld`, а служба бота обязана жить и без слота
            на 3000. Причины расписаны в самом компоненте. */}
        <div className="flex flex-col gap-4">
          <Breadcrumbs
            trail={[
              { label: t.layer },
              { href: hrefOfTelegramSection(lang, "about"), label: ui.title },
              { label: ui.pages[active].title },
            ]}
          />

          <header className="flex flex-col gap-4 border-border border-b pb-8">
            <Eyebrow>{t.layer}</Eyebrow>
            <H1>{ui.title}</H1>
            <Lead className="max-w-3xl">{ui.subtitle}</Lead>
          </header>
        </div>

        <WorkspaceShell
          id="telegram"
          lead={ui.pages[active].hint}
          // 🔒 ТЕРМИНАЛ СТОИТ В МЕНЮ, НО РАЗДЕЛОМ НЕ ЯВЛЯЕТСЯ (2026-09-06, слово
          // владельца: «ниже чем кнопка логи добавь кнопку терминал, при нажатии
          // открывается терминал в соседней вкладке»). Он уводит на отдельную
          // страницу `/terminal` вне этого экрана, поэтому его нет в
          // `TELEGRAM_SECTIONS`: тот массив — единственный источник и меню, И
          // маршрутизации, и запись в нём означала бы раздел, которого нет.
          // Место названо владельцем — сразу под «Логами».
          menu={TELEGRAM_SECTIONS.flatMap((id) => {
            const item = {
              active: id === active,
              href: hrefOfTelegramSection(lang, id),
              label: ui.pages[id].title,
            };
            return id === "logs"
              ? [
                  item,
                  {
                    href: `/${lang}/terminal`,
                    label: ui.terminalLabel,
                    newTab: true,
                  },
                ]
              : [item];
          })}
          menuTitle={ui.menuTitle}
          menuWord={t.menuTitle}
          tabs={
            active === "passport"
              ? passportTabs
              : active === "logs"
                ? TELEGRAM_LOG_VIEWS.map((v) => ({
                    active: v === view,
                    href: hrefOfTelegramLogView(lang, v),
                    label: ui.skeleton.views[v],
                  }))
                : undefined
          }
          title={ui.pages[active].title}
        >
          {/* 🔒 ПРИЗНАКИ СТОЯТ НА КОНТЕЙНЕРЕ РАЗДЕЛА, А НЕ ВНУТРИ ОСТРОВКА —
              как в источнике: островок появляется позже, а правда о боте нужна
              разметке сразу. Без JS отсюда видно главное: жива ли служба
              каналов, сохранён ли токен, узнаёт ли его сам Telegram, привязан
              ли чат.
              🪦 Здесь стояло «признаков состояния службы пока нет — приедут с
              разделом Настройки». Они приехали тем же подшагом 137-3, и строка
              исправлена вместе с кодом: комментарий, переживший свой код, не
              падает и не краснеет — он просто врёт. */}
          <div
            className="flex min-w-0 flex-1 flex-col gap-6"
            data-channels-available={String(channels.available)}
            data-telegram-configured={String(
              Boolean(channels.telegram?.configured)
            )}
            data-telegram-linked={String(Boolean(channels.telegram?.chatId))}
            data-telegram-page
            data-telegram-reachable={String(
              Boolean(channels.telegram?.reachable)
            )}
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
                      {/* 🔒 СТРАНИЦА НА КАЖДЫЙ ЗАПРОС СТОИТ ПОСЛЕ «КАК ЧАСТИ
                          СОБИРАЮТСЯ», А НЕ ПЕРВОЙ: человек сперва понимает, что
                          вообще происходит с его фразой, и только потом — где
                          это можно увидеть и чем поделиться. Абзац, поставленный
                          раньше объяснения, читается как реклама. */}
                      <Small>
                        <strong className="text-foreground">
                          {ui.about.pageTitle}
                        </strong>{" "}
                        {ui.about.page}
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
                {/* 🔒 КАРТОЧКА ШАБЛОНА СТОИТ ПОД СПРАВКОЙ — место названо
                    владельцем. Сперва человек читает, что это за бот, и только
                    потом узнаёт, что бот — заготовка, которую он вправе
                    переделать. Обратный порядок предлагал бы переделку раньше
                    знакомства. */}
                <StarterCard ui={ui} />
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
            {/* 🔒 «НАСТРОЙКИ» ПЕРЕНЕСЕНЫ ЦЕЛИКОМ (137-3): справка сверху,
                состояние и форма ниже — тем же порядком и теми же файлами, что
                на 3000. Четыре блока справки объясняют ровно то, что на этом
                экране делают, и в источнике они лежали на той же странице. */}
            {active === "settings" && (
              <>
                <SectionIntro
                  key={active}
                  lessLabel={ui.helpLess}
                  moreLabel={ui.helpMore}
                  name="telegram-settings"
                  rest={
                    <div className="flex flex-col gap-2">
                      <Small>
                        <strong className="text-foreground">
                          {ui.settings.helpWhyTitle}
                        </strong>{" "}
                        {ui.settings.helpWhy}
                      </Small>
                      <Small>
                        <strong className="text-foreground">
                          {ui.settings.helpLinkTitle}
                        </strong>{" "}
                        {ui.settings.helpLink}
                      </Small>
                      <Small>
                        <strong className="text-foreground">
                          {ui.settings.helpOffTitle}
                        </strong>{" "}
                        {ui.settings.helpOff}
                      </Small>
                    </div>
                  }
                  summary={
                    <Small>
                      <strong className="text-foreground">
                        {ui.settings.helpWhatTitle}
                      </strong>{" "}
                      {ui.settings.helpWhat}
                    </Small>
                  }
                />
                <TelegramSettings lang={lang} state={channels} ui={ui} />
              </>
            )}

            {/* 🔒 ПОЛОСА ОБНОВЛЕНИЯ ЖИВЁТ В ПРАВОМ КОНТЕЙНЕРЕ, ПЕРВОЙ СТРОКОЙ
                ПОД ЛИДОМ РАЗДЕЛА, а не на общем холсте — прямая правка
                владельца. Она относится к таблице разбора, а не к странице: на
                холсте она обещала бы, что живая вся страница. */}
            {active === "logs" && view === "parse" && <AutoRefresh />}

            {/* 🔒 «ЛОГИ» — ЕДИНСТВЕННЫЙ РАЗДЕЛ ВХОДА, КОТОРЫЙ НЕ ПЕРЕНОС САМ ПО
                СЕБЕ (77-5): в панели такого экрана нет. Верхнее меню видов даёт
                РАСКЛАДКА (`tabs`), а не эта страница — полоса была в
                `WorkspaceShell` с самого начала. Построен первый вид, остальные
                честно называют себя. */}
            {active === "logs" &&
              (view === "automations" ? (
                <AutomationsView
                  lang={lang}
                  page={queryAutomations(readAutomationQuery(sp))}
                  query={readAutomationQuery(sp)}
                  words={ui.automations}
                />
              ) : view === "parse" ? (
                <TaskParseSection
                  dialogUi={appDialogUi(lang)}
                  state={channels}
                  ui={ui}
                />
              ) : (
                <InProgress
                  label={ui.skeleton.views[view]}
                  lead={ui.skeleton.inProgress}
                  where={`logs-${view}`}
                />
              ))}

            {active === "passport" &&
              (passport ? (
                <PassportBody text={passport} />
              ) : (
                <div className="rounded-md border border-muted-foreground/30 border-dashed p-6 text-[length:var(--fs-small)] text-muted-foreground">
                  {lang === "ru"
                    ? "Паспорт ещё не написан. Он лежит файлом development-docs/PASSPORT.md в самом проекте — создайте его, и он появится здесь."
                    : "The passport is not written yet. It lives as development-docs/PASSPORT.md in the project itself — create it and it will appear here."}
                </div>
              ))}
          </div>
        </WorkspaceShell>
      </div>
    </main>
  );
}
