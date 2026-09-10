"use client";

import { LinkIcon, Loader2, MonitorPlay, RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Small } from "@/components/ui/typography";
import {
  type XtermHandle,
  XtermTerminal,
} from "@/components/terminal/xterm-terminal.client";
import { createMouseFilter, MOUSE_OFF } from "@/lib/fractera/mouse-filter.mjs";

// АКТИВАЦИЯ БОТА — ВТОРАЯ ПОЛОВИНА ВКЛАДКИ «ПОДКЛЮЧЕНИЕ TELEGRAM-БОТА» (181-7).
//
// 🎯 СЛОВО ВЛАДЕЛЬЦА 2026-09-10: «вместо того чтобы бот находился в одном месте мы
// его разорвали в две разные части найти его невозможно активировать непонятно».
// Первая половина — токен — стоит карточкой выше; здесь то, что раньше жило в окне
// терминала: живая сессия агента и подтверждение кода привязки.
//
// 🔒 ПРИВЯЗКА УХОДИТ В ЖИВУЮ СЕССИЮ, А НЕ В ДВЕРЬ, И ЭТО ЗАКОН 115, А НЕ ЛЕНЬ.
// Привязку выполняет САМА сессия Claude Code: это её слэш-команда, и состояние
// ожидания живёт у неё в памяти. Дверь, дописавшая `access.json` в обход,
// разошлась бы с тем, что помнит плагин, — и разошлась бы молча. Отсюда следует
// всё устройство этого островка: активации нужен настоящий терминал, поэтому он
// встроен прямо во вкладку.
//
// 🔒 КНОПКА ПОДКЛЮЧАЕТ, А НЕ ЗАПУСКАЕТ (119). Набрать здесь `claude --channels`
// значило бы завести ВТОРОГО опрашивателя того же бота, а Telegram отдаёт каждое
// обновление ровно одному читателю: переписка владельца поделилась бы пополам,
// молча. `screen -r` показывает ТОТ ЖЕ экран, что живёт под pm2.
//
// 🔒 ОПРОС ЕСТЬ ЧАСТЬ ЗАМЫСЛА, А НЕ ОПТИМИЗАЦИЯ. Человек пишет боту С ТЕЛЕФОНА, и
// в этот момент на экране компьютера не происходит ничего. Без опроса ему пришлось
// бы догадаться перезагрузить страницу.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const ENDPOINT = `${BASE}/api/fractera/agent-setup`;
const POLL_MS = 3000;

// 🛑 БАЙТ ESC СОБИРАЕТСЯ КОДОМ, А НЕ ПИШЕТСЯ В ФАЙЛ: управляющий символ в
// исходнике невидим при чтении и теряется при перекодировке (114-7).
const ESC = String.fromCharCode(27);
const RESTORE_MODES = ["?1000l", "?1002l", "?1003l", "?1006l", "?1049l", "?2004l", "?25h"]
  .map((mode) => `${ESC}[${mode}`)
  .join("");

export type BotActivationLabels = {
  title: string;
  lead: string;
  show: string;
  showAgain: string;
  reset: string;
  needsToken: string;
  needsLogin: string;
  loginHref: string;
  loginLink: string;
  pairTitle: string;
  pair: string;
  pairFirst: string;
  pairHint: string;
  allowed: string;
  none: string;
  statusConnected: string;
  statusConnecting: string;
  statusClosed: string;
  statusIdle: string;
  ticketForbidden: string;
  ticketFailed: string;
  ticketUnreachable: string;
  closedWith: string;
};

type Setup = {
  subscription: { loggedIn: boolean | null; method: string | null };
  telegram: {
    allowed: number;
    masked: string;
    pending: { code: string; expiresAt: number }[];
    present: boolean;
  };
};

type Status = "closed" | "connected" | "connecting" | "idle";

/**
 * Одна строка ожидающей привязки.
 *
 * Отдельным компонентом, а не стрелкой в пропсе: новая функция на каждый рендер
 * ломает мемоизацию у всего, что ниже, а вкладка опрашивает дверь каждые три секунды.
 */
function PairRow({
  canPair,
  code,
  label,
  onPair,
}: {
  canPair: boolean;
  code: string;
  label: string;
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
        {label}
      </Button>
    </div>
  );
}

export function BotActivation({ labels }: { labels: BotActivationLabels }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);

  const termRef = useRef<XtermHandle>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sizeRef = useRef({ cols: 80, rows: 24 });
  const mouseRef = useRef(createMouseFilter());

  const load = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      if (res.ok) {
        setSetup((await res.json()) as Setup);
      }
    } catch {
      /* дверь недоступна — карточка просто покажет «не настроен» */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(
    () => () => {
      wsRef.current?.close();
    },
    []
  );

  const send = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const connect = useCallback(async () => {
    wsRef.current?.close();
    setStatus("connecting");
    setNote("");
    termRef.current?.reset();

    // 🔒 БИЛЕТ БЕРЁТСЯ ПЕРЕД КАЖДЫМ ОТКРЫТИЕМ: он одноразовый и живёт минуту.
    let ticket = "";
    try {
      const res = await fetch(`${BASE}/api/fractera/pty-ticket`, { method: "POST" });
      if (!res.ok) {
        setStatus("closed");
        setNote(res.status === 403 ? labels.ticketForbidden : `${labels.ticketFailed} ${res.status}`);
        return;
      }
      ticket = ((await res.json()) as { ticket?: string }).ticket ?? "";
    } catch {
      setStatus("closed");
      setNote(labels.ticketUnreachable);
      return;
    }

    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${scheme}://${window.location.host}${BASE}/pty`);
    wsRef.current = ws;

    ws.onopen = () => {
      // 🛑 `init` УХОДИТ ПЕРВЫМ ДЕЙСТВИЕМ, ДО ВСЕГО ОСТАЛЬНОГО (157-3): всё, что
      // стоит перед ним, способно бросить исключение и съесть его целиком —
      // мост тогда принимает соединение, ничего не получает и закрывает его.
      ws.send(JSON.stringify({ mode: "claude-channel", ticket, type: "init" }));
      ws.send(JSON.stringify({ type: "resize", ...sizeRef.current }));
      setStatus("connected");
      setRunning(true);
      mouseRef.current = createMouseFilter();
      termRef.current?.write(MOUSE_OFF);
      termRef.current?.focus();
    };

    ws.onmessage = (event) => {
      const chunk =
        typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data);
      termRef.current?.write(mouseRef.current(chunk));
    };

    ws.onclose = (event) => {
      setStatus("closed");
      setRunning(false);
      // 🔒 РЕЖИМЫ ВОЗВРАЩАЮТСЯ, ЛЕНТА ОСТАЁТСЯ: оборванный полноэкранный
      // интерфейс не выключает слежение за мышью за собой, и без этой строки
      // движение по тачпаду печатает мусор.
      termRef.current?.write(RESTORE_MODES);
      if (event.reason) {
        setNote(`${labels.closedWith} ${event.reason}`);
      }
    };
  }, [labels]);

  const handleData = useCallback(
    (data: string) => {
      send({ data, type: "stdin" });
    },
    [send]
  );

  const handleResize = useCallback(
    (size: { cols: number; rows: number }) => {
      sizeRef.current = size;
      send({ type: "resize", ...size });
    },
    [send]
  );

  const handlePair = useCallback(
    (code: string) => {
      send({ data: `/telegram:access pair ${code}\n`, type: "stdin" });
      termRef.current?.focus();
    },
    [send]
  );

  const handleReset = useCallback(() => {
    termRef.current?.reset();
    termRef.current?.focus();
  }, []);

  const hasToken = setup?.telegram.present === true;
  const loggedIn = setup?.subscription.loggedIn === true;
  const pending = setup?.telegram.pending ?? [];
  const allowed = setup?.telegram.allowed ?? 0;

  return (
    <div className="flex flex-col gap-3" data-bot-activation>
      <Small className="leading-relaxed text-muted-foreground">{labels.lead}</Small>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!(hasToken && loggedIn) || status === "connecting"}
          onClick={connect}
          size="sm"
          type="button"
          variant={running ? "outline" : "default"}
        >
          {status === "connecting" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <MonitorPlay size={14} />
          )}
          {running ? labels.showAgain : labels.show}
        </Button>

        {running ? (
          <Button onClick={handleReset} size="sm" type="button" variant="outline">
            <RotateCcwIcon size={14} />
            {labels.reset}
          </Button>
        ) : null}

        <span className="font-mono text-[11px] text-muted-foreground">
          {status === "connected" && labels.statusConnected}
          {status === "connecting" && labels.statusConnecting}
          {status === "closed" && labels.statusClosed}
          {status === "idle" && labels.statusIdle}
        </span>
      </div>

      {/* 🔒 НЕДОСТУПНАЯ КНОПКА ОБЪЯСНЯЕТ СЕБЯ И ДАЁТ ДОРОГУ ТУДА, ГДЕ ЭТО
          ПОПРАВИТЬ. Кнопка, которая не нажимается и молчит, читается как
          поломка — оплачено в проекте не раз. */}
      {hasToken && loggedIn ? null : (
        <Small className="leading-relaxed text-muted-foreground">
          {hasToken ? null : labels.needsToken}
          {hasToken || loggedIn ? null : " "}
          {loggedIn ? null : (
            <>
              {labels.needsLogin}{" "}
              <a className="underline" href={labels.loginHref} rel="noreferrer" target="_blank">
                {labels.loginLink}
              </a>
              .
            </>
          )}
        </Small>
      )}

      {note ? (
        <Small className="leading-relaxed text-amber-700 dark:text-amber-300">{note}</Small>
      ) : null}

      {/* 🔒 ТЕРМИНАЛ ПОЯВЛЯЕТСЯ ТОЛЬКО ПОСЛЕ НАЖАТИЯ. Живой процесс на сервере
          не держат открытым ради вкладки, на которую человек зашёл за токеном. */}
      {status === "idle" ? null : (
        <div className="h-[420px] rounded-md bg-[#0b0b0c] p-2">
          <XtermTerminal onData={handleData} onResize={handleResize} ref={termRef} />
        </div>
      )}

      {/* 🔒 РАЗДЕЛ ПРИВЯЗКИ ПОЯВЛЯЕТСЯ САМ И САМ ЖЕ ИСЧЕЗАЕТ: пока привязывать
          нечего, показывать нечего, а пустой раздел «ожидание кода» читается как
          незавершённая настройка. */}
      {pending.length > 0 ? (
        <section
          className="flex flex-col gap-2 rounded-lg border-2 border-orange-500/70 bg-orange-500/10 p-3"
          data-bot-pairing
        >
          <span className="font-medium text-[13px]">{labels.pairTitle}</span>
          {pending.map((p) => (
            <PairRow
              canPair={running}
              code={p.code}
              key={p.code}
              label={labels.pair}
              onPair={handlePair}
            />
          ))}
          <Small className="text-muted-foreground">
            {running ? labels.pairHint : labels.pairFirst}
          </Small>
        </section>
      ) : null}

      <Small className="text-muted-foreground">
        {allowed > 0 ? labels.allowed.replace("{n}", String(allowed)) : labels.none}
      </Small>
    </div>
  );
}
