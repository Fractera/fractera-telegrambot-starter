"use client";

import {
  ArrowDownIcon,
  CheckIcon,
  KeyRoundIcon,
  LinkIcon,
  SendIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// ОКНО ПОДКЛЮЧЕНИЯ АГЕНТА — ОДНА КНОПКА, ОБЕ ПОЛОВИНЫ (шаг 115).
//
// Решение владельца дословно: «в нашей кнопке которая называется вход по
// подписке Claude Code расширим функционал и вставим дополнительное поле для
// Telegram-бота… Первый вариант для меня предпочтительнее».
//
// 🔒 ПОЧЕМУ ПОЛЕ, А НЕ НАБОР В ТЕРМИНАЛЕ. Его же слово: «кликни в чёрное поле —
// это совсем не тот вариант». И довод сильнее удобства: оболочка отражает
// набранное в ленту и кладёт строку в свою историю, то есть токен, введённый
// в терминал, остаётся на экране и на диске.
//
// 🔒 ПОРЯДОК ПОЛОВИН НЕ КОСМЕТИЧЕСКИЙ: канал требует входа по подписке, а не
// наоборот. Поэтому подписка сверху, и запуск канала недоступен, пока её нет —
// кнопка, которая нажимается и молча ничего не делает, читается как поломка.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const ENDPOINT = `${BASE}/api/fractera/agent-setup`;

/**
 * Дверь ключа OpenAI — ЧУЖАЯ И ЕДИНСТВЕННАЯ.
 *
 * 🔒 Она уже умеет всё: читает маску из файла слота, а пишет через
 * `POST /platform/openai-key` службы данных, которая одна знает список
 * потребителей. Своего хранения здесь нет и заводить его нельзя — второй путь
 * ключа разошёлся бы с первым молча (оплачено шагом 109-3).
 */
const KEY_ENDPOINT = `${BASE}/api/fractera/openai-key`;

type OpenAiState = { masked: string; present: boolean };

type Setup = {
  subscription: { loggedIn: boolean | null; method: string | null };
  telegram: {
    allowed: number;
    masked: string;
    pending: { code: string; expiresAt: number }[];
    present: boolean;
  };
};

/**
 * Как часто спрашиваем дверь, пока окно открыто.
 *
 * 🔒 ОПРОС ЕСТЬ ЧАСТЬ ЗАМЫСЛА, А НЕ ОПТИМИЗАЦИЯ. Человек пишет боту С ТЕЛЕФОНА,
 * и в этот момент на экране компьютера не происходит ничего. Без опроса ему
 * пришлось бы догадаться закрыть и открыть окно — то есть ровно та
 * неочевидность, ради устранения которой подшаг и заведён.
 */
const POLL_MS = 3000;

/**
 * Одна строка ожидающей привязки.
 *
 * Отдельным компонентом, а не стрелкой в пропсе: правило `noJsxPropsBind`
 * действует не из вкусовщины — новая функция на каждый рендер ломает
 * мемоизацию у всего, что ниже, а окно опрашивает дверь каждые три секунды.
 */
function PairRow({
  canPair,
  code,
  onPair,
}: {
  canPair: boolean;
  code: string;
  onPair: (code: string) => void;
}) {
  const handleClick = useCallback(() => {
    onPair(code);
  }, [code, onPair]);

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 rounded bg-background px-2 py-1.5 font-mono text-[13px]">
        {code}
      </code>
      <Button disabled={!canPair} onClick={handleClick} size="sm" type="button">
        <LinkIcon size={14} />
        Привязать
      </Button>
    </div>
  );
}

/**
 * Пульсирующая стрелка к четвёртому шагу.
 *
 * 🔒 РАЗДЕЛ, ПОЯВИВШИЙСЯ НИЖЕ ВИДИМОЙ ЧАСТИ, РАВЕН ОТСУТСТВУЮЩЕМУ. Окно
 * прокручиваемое (`max-h-[85vh] overflow-y-auto`), а четвёртый шаг возникает
 * САМ, когда бот получил сообщение, — человек в этот момент смотрит на третий
 * и не догадывается, что ниже что-то выросло.
 *
 * ✗ ОПЛАЧЕНО ВЛАДЕЛЬЦЕМ 2026-09-05: «когда появляется четвёртый шаг, его не
 * видно». Он ждал всплывающего окна с кодом и решил, что привязка сломалась, —
 * при том, что код лежал на экране, просто ниже края.
 *
 * 🛑 ЦВЕТ ВЗЯТ ЯНТАРНЫЙ, А НЕ ФИРМЕННЫЙ: фирменный уже носят кнопки шагов, и
 * ещё одна такая же не позвала бы взгляд. Здесь нужен именно чужой цвет.
 */
function ScrollHint({ onJump }: { onJump: () => void }) {
  return (
    <button
      className="-translate-x-1/2 fixed bottom-8 left-1/2 z-[60] flex animate-bounce items-center gap-2 rounded-full bg-orange-500 px-4 py-2 font-medium text-[13px] text-white shadow-lg shadow-orange-500/40 ring-4 ring-orange-500/30 transition hover:bg-orange-600"
      onClick={onJump}
      type="button"
    >
      <ArrowDownIcon className="animate-pulse" size={16} />
      Бот прислал код — подтвердите
    </button>
  );
}

type Props = {
  /** Идёт ли в этой вкладке сессия с каналом — команду привязки принимает она. */
  channelRunning: boolean;
  onClose: () => void;
  onLaunchChannel: () => void;
  onLogin: () => void;
  /** Отправить команду привязки в терминал вкладки. */
  onPair: (code: string) => void;
};

export function AgentSetupModal({
  channelRunning,
  lang,
  onClose,
  onLaunchChannel,
  onLogin,
  onPair,
}: Props & { lang: string }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const pairRef = useRef<HTMLElement | null>(null);
  const [pairVisible, setPairVisible] = useState(false);
  const [openai, setOpenai] = useState<OpenAiState | null>(null);
  const [openaiKey, setOpenaiKey] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyNote, setKeyNote] = useState("");
  // 🔒 ЯЗЫК ПРИХОДИТ ПРОПСОМ ИЗ МАРШРУТА, А НЕ УГАДЫВАЕТСЯ В БРАУЗЕРЕ
  // (2026-09-06). Пока страница жила вне `[lang]`, сервер языка не знал, и
  // хук `useUiLang()` выяснял его после разметки — первый проход всегда был
  // английским. Теперь язык известен до единого байта.
  const uiLang = lang;

  // 🔒 КЛЮЧ СПРАШИВАЕТСЯ ОДИН РАЗ, А НЕ КАЖДЫЕ ТРИ СЕКУНДЫ. Опрос нужен там, где
  // состояние меняется САМО — код привязки прилетает от бота, пока человек
  // смотрит на экран. Ключ меняет только он сам, здесь и сейчас.
  const loadKey = useCallback(async () => {
    try {
      const res = await fetch(KEY_ENDPOINT, { cache: "no-store" });
      if (res.ok) {
        setOpenai((await res.json()) as OpenAiState);
      }
    } catch {
      /* дверь недоступна — раздел просто покажет «не задан» */
    }
  }, []);

  useEffect(() => {
    loadKey();
  }, [loadKey]);

  const handleKeyChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setOpenaiKey(e.target.value);
    },
    []
  );

  const handleSaveKey = useCallback(async () => {
    const value = openaiKey.trim();
    if (value.length < 20) {
      return;
    }
    setKeyBusy(true);
    setKeyNote("");
    try {
      const res = await fetch(KEY_ENDPOINT, {
        body: JSON.stringify({ key: value }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        applied?: { chat?: boolean; project?: boolean };
        error?: string;
        masked?: string;
        reason?: string;
      };
      if (res.ok) {
        setOpenai({ masked: data.masked ?? "", present: true });
        setOpenaiKey("");
        // 🛑 «СОХРАНЁН» И «ПРИМЕНЁН» — РАЗНЫЕ УТВЕРЖДЕНИЯ, И ДВЕРЬ ГОВОРИТ ЭТО
        // ОТВЕТОМ. Разбор входящих подхватит ключ сразу — он читает файл на
        // каждом обращении; само приложение читает окружение при старте и до
        // пересборки работает со старым. Обещать обратное значило бы соврать.
        setKeyNote(
          data.applied?.project
            ? "Ключ сохранён и применён везде."
            : "Ключ сохранён. Разбор входящих подхватит сразу; само приложение — после ближайшей пересборки."
        );
        return;
      }
      setKeyNote(
        data.error === "bad-format"
          ? "Это не похоже на ключ OpenAI: ожидается вид sk-…"
          : `Не сохранён: ${data.reason ?? data.error ?? res.status}`
      );
    } catch {
      setKeyNote("Не сохранён: дверь недоступна.");
    } finally {
      setKeyBusy(false);
    }
  }, [openaiKey]);

  const jumpToPair = useCallback(() => {
    pairRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  /**
   * 🔒 ПРИВЯЗКА ЗАКРЫВАЕТ ОКНО, И ЭТО НЕ УКРАШЕНИЕ, А ПОЧИНКА.
   *
   * ✗ ОПЛАЧЕНО ВЛАДЕЛЬЦЕМ 2026-09-05: «когда мы нажимаем кнопку привязать,
   * очевидно, что что-то происходит, но непонятно что». Команда уходит в
   * терминал вкладки И СРАЗУ ИСПОЛНЯЕТСЯ — она отправляется с переводом строки,
   * как код входа по подписке. Но результат печатается в терминал, а терминал в
   * этот момент закрыт этим самым окном. Работа шла, видно её не было.
   *
   * 🛑 ДЕЙСТВИЕ, РЕЗУЛЬТАТ КОТОРОГО ЗАКРЫТ СОБСТВЕННЫМ ОКНОМ, НЕОТЛИЧИМО ОТ
   * БЕЗДЕЙСТВИЯ. Правило шире этой кнопки: всё, что пишет ответ в терминал,
   * обязано освободить его перед тем, как писать.
   */
  const handlePairAndClose = useCallback(
    (code: string) => {
      onPair(code);
      onClose();
    },
    [onClose, onPair]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      if (res.ok) {
        setSetup((await res.json()) as Setup);
        return;
      }
      setNote(
        res.status === 403
          ? "Подключать агента может только архитектор проекта."
          : `Дверь ответила ${res.status}.`
      );
    } catch {
      setNote("Дверь подключения недоступна.");
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const handleSave = useCallback(async () => {
    const value = token.trim();
    if (!value) {
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(ENDPOINT, {
        body: JSON.stringify({ token: value }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (res.ok) {
        setSetup((await res.json()) as Setup);
        setToken("");
        // 🛑 «Сохранён» — правда о файле и не правда о работе: плагин прочитает
        // токен только при запуске канала. Говорим ровно это.
        setNote("Токен сохранён. Проверить его сможет только запуск канала.");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setNote(
        data.error === "bad-format"
          ? "Это не похоже на токен BotFather: ожидается вид 123456789:AA…"
          : `Не сохранён: ${data.error ?? res.status}`
      );
    } catch {
      setNote("Не сохранён: дверь недоступна.");
    } finally {
      setBusy(false);
    }
  }, [token]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setToken(e.target.value);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );

  const loggedIn = setup?.subscription.loggedIn === true;
  const unknown = setup?.subscription.loggedIn === null;
  const hasToken = setup?.telegram.present === true;
  const pending = setup?.telegram.pending ?? [];
  const allowed = setup?.telegram.allowed ?? 0;
  const pendingCount = pending.length;

  // 🔒 СТРЕЛКА ГАСНЕТ САМА, КОГДА ЦЕЛЬ ВИДНА, И ЭТО ОБЯЗАТЕЛЬНО. Подсказка,
  // висящая поверх того, на что она указывает, перестаёт быть подсказкой и
  // становится помехой: она закрывает собой кнопку «Привязать».
  // 🛑 ВИДИМОСТЬ ИЗМЕРЯЕТСЯ НАБЛЮДАТЕЛЕМ, А НЕ ВЫСОТОЙ ОКНА. Раздел появляется
  // и исчезает сам, окно прокручивают руками, у людей разные экраны — считать
  // «влезло или нет» по числам значило бы угадывать.
  useEffect(() => {
    const el = pairRef.current;
    if (!(el && pendingCount > 0)) {
      setPairVisible(false);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setPairVisible(entry.isIntersecting),
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pendingCount]);

  return (
    <Dialog onOpenChange={handleOpenChange} open>
      {/* 🛑 СЮДА НЕЛЬЗЯ ДОБАВЛЯТЬ `relative`, И ЭТО ОПЛАЧЕНО (136-5, 2026-09-05).
          `DialogContent` центрируется классами `fixed top-1/2 left-1/2
          -translate-x-1/2 -translate-y-1/2` (`components/ui/dialog.tsx:64`).
          `relative` — та же группа `position`, и он перебивает `fixed`: сдвиг
          на −50% начинает считаться от потока страницы, и окно уезжает на
          пол-экрана вниз. Владелец: «оно открывается на 50% ниже нижней части
          экрана».
          🔒 Подсказке-стрелке позиционирующий предок НЕ НУЖЕН: она `fixed`,
          то есть привязана к окну просмотра, а не к диалогу. */}
      <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-lg">
        {pending.length > 0 && !pairVisible ? (
          <ScrollHint onJump={jumpToPair} />
        ) : null}
        <DialogHeader>
          <div className="mb-1 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <KeyRoundIcon className="text-primary" size={18} />
            </span>
            <div className="flex flex-col gap-0.5">
              <DialogTitle className="text-left">
                Подключение агента
              </DialogTitle>
              <DialogDescription className="text-left text-[12px]">
                Подписка Claude Code и бот, из которого вы будете ему писать.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* ── 1. подписка ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-[13px]">
              1. Подписка Claude Code
            </span>
            <span className="text-[12px] text-muted-foreground">
              {setup === null && "проверяем…"}
              {loggedIn && `подключена · ${setup?.subscription.method ?? ""}`}
              {setup !== null && !(loggedIn || unknown) && "не подключена"}
              {unknown && "состояние неизвестно"}
            </span>
          </div>
          <Button onClick={onLogin} size="sm" type="button" variant="outline">
            {loggedIn ? "Войти заново" : "Войти по подписке"}
          </Button>
        </section>

        {/* ── 2. бот ──────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-[13px]">2. Telegram-бот</span>
            <span className="font-mono text-[12px] text-muted-foreground">
              {hasToken ? setup?.telegram.masked : "не задан"}
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Токен от <strong className="text-foreground">@BotFather</strong>:
            команда <code>/newbot</code>.{" "}
            <strong className="text-foreground">
              Заведите отдельного бота
            </strong>{" "}
            — рабочего уже опрашивает служба каналов, а Telegram отдаёт каждое
            сообщение только одному читателю.
          </p>
          <div className="flex gap-2">
            <Input
              autoComplete="off"
              disabled={busy}
              onChange={handleChange}
              placeholder={hasToken ? "заменить токен" : "123456789:AA…"}
              type="password"
              value={token}
            />
            <Button
              disabled={busy || token.trim().length === 0}
              onClick={handleSave}
              type="button"
            >
              <CheckIcon size={14} />
              Сохранить
            </Button>
          </div>
        </section>

        {/* ── 3. запуск ───────────────────────────────────────────────── */}
        <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <span className="font-medium text-[13px]">3. Сессия агента</span>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Канал уже работает — он поднят при установке сервера и живёт сам.
            Кнопка <strong className="text-foreground">показывает</strong> его
            живой экран в этой вкладке.
            <br />
            Напишите боту с телефона —{" "}
            <strong className="text-foreground">
              код привязки появится здесь сам
            </strong>
            , переписывать его никуда не нужно.
            <br />
            <strong className="text-foreground">
              Закроете браузер — канал продолжит работать.
            </strong>{" "}
            Вкладка им не владеет.
          </p>
          <Button
            disabled={!(loggedIn && hasToken)}
            onClick={onLaunchChannel}
            type="button"
            variant={channelRunning ? "outline" : "default"}
          >
            <SendIcon size={14} />
            {channelRunning ? "Показать заново" : "Показать сессию агента"}
          </Button>
          {loggedIn && hasToken ? null : (
            <span className="text-[11px] text-muted-foreground">
              Доступно, когда подключены обе половины выше.
            </span>
          )}
        </section>

        {/* ── 4. привязка ─────────────────────────────────────────────────
            🔒 РАЗДЕЛ ПОЯВЛЯЕТСЯ САМ И САМ ЖЕ ИСЧЕЗАЕТ. Пока привязывать
            нечего, показывать нечего; пустой раздел «ожидание кода» на экране
            читался бы как незавершённая настройка. */}
        {pending.length > 0 ? (
          <section
            className="flex flex-col gap-2 rounded-lg border-2 border-orange-500/70 bg-orange-500/10 p-3"
            ref={pairRef}
          >
            <span className="font-medium text-[13px]">
              4. Бот получил сообщение — подтвердите, что это вы
            </span>
            {pending.map((p) => (
              <PairRow
                canPair={channelRunning}
                code={p.code}
                key={p.code}
                onPair={handlePairAndClose}
              />
            ))}
            {channelRunning ? (
              <span className="text-[11px] text-muted-foreground">
                Окно закроется, и команда выполнится в терминале сама —
                дописывать ничего не нужно. Ответ увидите там же.
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                Сначала нажмите «Показать сессию агента» выше: команду привязки
                принимает та сессия, в которой работает канал.
              </span>
            )}
          </section>
        ) : null}

        {allowed > 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Привязано собеседников: <strong>{allowed}</strong>. Пишите боту — он
            отвечает.
          </p>
        ) : null}

        {/* ── карточка «узнайте больше» ──────────────────────────────────────
            🎯 ЦЕЛЬ ВЛАДЕЛЬЦА: «если пользователь, которому не нужен сайт,
            придёт только на чат-бот, то ему будет достаточно всей информации».
            Отсюда карточка ведёт на страницу, переехавшую с порта 3000, — и
            человек, попавший в окно подключения, узнаёт, что у бота есть
            описание возможностей, а не только четыре шага настройки.

            🔒 ЯЗЫК В АДРЕСЕ БЕРЁТСЯ ТОТ ЖЕ, ЧТО У ИНТЕРФЕЙСА ОКНА. У страницы
            есть сегмент `[lang]`, у остального чата — нет; связывает их
            язык маршрута, переданный пропсом от страницы. */}
        <a
          className="flex items-center justify-between gap-3 rounded-lg border-2 border-orange-500/60 bg-orange-500/10 px-3 py-3 transition hover:bg-orange-500/15"
          href={`/${uiLang}/settings`}
          rel="noreferrer"
          target="_blank"
        >
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-[13px] text-foreground">
              Узнайте больше о возможностях вашего Telegram-бота
            </span>
            <span className="text-[12px] text-muted-foreground">
              Что он умеет и чего не умеет, журнал разбора сообщений, настройки
              и паспорт проекта — на отдельной странице.
            </span>
          </span>
          <ArrowDownIcon
            className="-rotate-90 shrink-0 text-orange-500"
            size={18}
          />
        </a>

        {/* ── 5. ключ OpenAI — НЕОБЯЗАТЕЛЬНО ────────────────────────────────
            🔒 РАЗДЕЛ ВНИЗУ И БЛЕДНЕЕ ОСТАЛЬНЫХ, ПОТОМУ ЧТО ОН НЕ НУЖЕН ДЛЯ
            РАБОТЫ БОТА. Бот отвечает по подписке владельца; ключ тратится
            только на разбор входящих — расшифровку речи, описание изображений
            и укладку в векторную память и граф знаний. Раздел, выглядящий как
            четыре обязательных шага выше, читался бы как пятое препятствие.

            🔒 ЭТО ДВЕРЬ К ОБЩЕМУ ХРАНИЛИЩУ, А НЕ ЕЩЁ ОДНО МЕСТО ХРАНЕНИЯ.
            Слово владельца: «во множестве мест вводим ключ, но если он хотя бы
            в одном месте введён — он виден везде». Так и устроено: запись идёт
            единственной дверью `POST /platform/openai-key` службы данных, и
            список потребителей знает она одна. ✗ шагом 109-3 оплачено обратное:
            чат писал файл слота сам, ключ доезжал только до приложения, а граф
            знаний и слой данных о нём не знали — и молчали об этом.

            🛑 ДВЕРЬ СУЩЕСТВОВАЛА С ШАГА 96 И НЕ ИМЕЛА НИ ОДНОГО ЭКРАНА.
            Способность была построена и заперта: ввести ключ отсюда было
            нельзя, хотя код для этого лежал готовым. */}
        <section className="flex flex-col gap-2 rounded-lg border border-border/60 border-dashed p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-[13px] text-muted-foreground">
              Ключ OpenAI — необязательно
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {openai?.present ? openai.masked : "не задан"}
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Боту он не нужен — тот отвечает по вашей подписке. Ключ тратится
            только на{" "}
            <strong className="text-foreground">разбор входящих</strong>:
            расшифровку голосовых, описание изображений и укладку в векторную
            память и граф знаний. Расход экономный — короткие вызовы по одному
            на сообщение, и только когда сообщение пришло.
          </p>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Ключ в проекте{" "}
            <strong className="text-foreground">один на всё</strong>: введённый
            здесь, он становится виден и приложению, и слою данных, и графу
            знаний. Если вы уже задавали его в другом месте — здесь он показан
            маской, вводить второй раз не нужно.
          </p>
          <div className="flex gap-2">
            <Input
              autoComplete="off"
              className="font-mono text-[13px]"
              onChange={handleKeyChange}
              placeholder="sk-…"
              type="password"
              value={openaiKey}
            />
            <Button
              disabled={keyBusy || openaiKey.trim().length < 20}
              onClick={handleSaveKey}
              type="button"
              variant="outline"
            >
              {keyBusy ? "…" : "Сохранить"}
            </Button>
          </div>
          {keyNote ? (
            <span className="text-[11px] text-muted-foreground">{keyNote}</span>
          ) : null}
        </section>

        {note ? (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-600 dark:text-amber-300">
            {note}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
