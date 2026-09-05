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
      className="-translate-x-1/2 fixed bottom-6 left-1/2 z-50 flex animate-bounce items-center gap-2 rounded-full bg-orange-500 px-4 py-2 font-medium text-[13px] text-white shadow-lg shadow-orange-500/40 ring-4 ring-orange-500/30 transition hover:bg-orange-600 sm:absolute sm:bottom-4"
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
  onClose,
  onLaunchChannel,
  onLogin,
  onPair,
}: Props) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const pairRef = useRef<HTMLElement | null>(null);
  const [pairVisible, setPairVisible] = useState(false);

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
      <DialogContent className="relative flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-lg">
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

        {note ? (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-600 dark:text-amber-300">
            {note}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
