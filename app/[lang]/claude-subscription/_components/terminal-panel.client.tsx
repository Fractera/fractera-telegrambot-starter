"use client";

import { KeyRoundIcon, RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthFlowModal } from "./auth-flow-modal.client";
import {
  type XtermHandle,
  XtermTerminal,
} from "./xterm-terminal.client";
import { Button } from "@/components/ui/button";
import { createMouseFilter, MOUSE_OFF } from "@/lib/fractera/mouse-filter.mjs";
import { extractAuthUrl } from "@/lib/fractera/terminal-auth.mjs";

// ПАНЕЛЬ ТЕРМИНАЛА — ВЫЖИМКА ИЗ `coding-window-shell.client.tsx` (шаг 114-4).
//
// Оригинал на `e1e7ff0^` — 1525 строк, и терминала в нём меньше десятой части:
// остальное панели развёртывания, медиатеки, домена и пользователей. Сюда
// перенесены ровно четыре его способности: сокет, чтение буфера на предмет
// ссылки входа, модалка и возврат кода в stdin.
//
// 🔒 ФАЙЛ ОДИН НА ДВЕ СТРАНИЦЫ ВХОДА В ПОДПИСКУ CLAUDE — ПАМЯТИ (`/terminal`, 180) И
// ЧАТА (`/claude-subscription`, 181-2), БАЙТ В БАЙТ. Учётка Claude одна на сервер,
// и страница входа у обеих служб — одна и та же вещь; две разные копии разошлись
// бы на первой же правке.
//
// 🔒 СЫРЬЁ КОПИТСЯ БЕЗ ЧИСТКИ, И ЭТО НЕ НЕБРЕЖНОСТЬ. Основная дверь распознавания
// (`extractAuthUrl`) ищет гиперссылку OSC-8, а она И ЕСТЬ управляющая
// последовательность: почистив буфер заранее, мы отрезали бы себе лучший из двух
// путей и остались бы с угадыванием конца ссылки по тексту.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Сколько сырья держим. Ссылка входа длиной ~450 символов, запас десятикратный. */
const BUFFER_LIMIT = 8000;

/** Пауза перед разбором: вывод PTY приезжает кусками, ссылка бывает разорвана. */
const DETECT_DELAY_MS = 300;

// ✗ ВОЗВРАТ РЕЖИМОВ ПОСЛЕ ОБОРВАННОГО TUI — ОПЛАЧЕНО ЖИВЬЁМ (114-7).
//
// ИЗМЕРЕНО НА СЕРВЕРЕ, А НЕ ВЫВЕДЕНО: полный интерфейс `claude` включает
// слежение за мышью (`?1000h ?1002h ?1003h ?1006h`), дополнительный экран
// (`?1049h`) и скобочную вставку (`?2004h`) — и НЕ выключает их, когда его
// обрывают. `claude auth login` не включает ничего: проверено 35 секундами
// ожидания кода, ноль последовательностей.
//
// 🛑 МЕХАНИЗМ ПОЛОМКИ. PTY у новой сессии свой, а терминал в браузере ТОТ ЖЕ,
// и его состояние переезжает. Поработав в режиме «Claude Code» и уйдя в другой,
// человек получал терминал со ВКЛЮЧЁННОЙ мышью: каждое движение по тачпаду
// уезжает в stdin управляющей последовательностью, оболочка печатает её как
// набранный текст — «случайные символы». Та же последовательность, попавшая в
// приглашение «Paste code here», портит код, и вход отвечает ошибкой, хотя
// человек всё сделал верно.
//
// 🔒 ЛЕЧЕНИЕ ДВУСЛОЙНОЕ, И СЛОИ РАЗНЫЕ ПО СМЫСЛУ: при закрытии сокета режимы
// возвращаются, а лента ОСТАЁТСЯ — человеку надо прочитать, чем кончилось;
// при открытии новой сессии терминал сбрасывается целиком.
// 🛑 БАЙТ ESC СОБИРАЕТСЯ КОДОМ, А НЕ ПИШЕТСЯ В ФАЙЛ. Управляющий символ в
// исходнике невидим при чтении и молча теряется при любой перекодировке — а
// потерянный, он превращает лечение в печать мусора на экран.
const ESC = String.fromCharCode(27);
const RESTORE_MODES = [
  "?1000l",
  "?1002l",
  "?1003l",
  "?1006l",
  "?1049l",
  "?2004l",
  "?25h",
]
  .map((mode) => `${ESC}[${mode}`)
  .join("");

type Mode = "claude-check" | "claude-login" | "system";

type Status = "closed" | "connected" | "connecting" | "idle";

export function TerminalPanel({ lang }: { lang: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [note, setNote] = useState("");
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  const termRef = useRef<XtermHandle>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bufRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalOpenRef = useRef(false);
  const sizeRef = useRef({ cols: 80, rows: 24 });

  // 🔒 ФИЛЬТР МЫШИ — СВОЙ НА КАЖДОЕ СОЕДИНЕНИЕ. У него есть память о
  // незавершённой последовательности на границе куска; перенеси эту память в
  // новую сессию — и первый её кусок склеился бы с хвостом предыдущей.
  const mouseRef = useRef(createMouseFilter());

  const send = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const scan = useCallback(() => {
    if (modalOpenRef.current) {
      return;
    }
    const found = extractAuthUrl(bufRef.current);
    if (found) {
      modalOpenRef.current = true;
      setAuthUrl(found.url);
    }
  }, []);

  const connect = useCallback(
    async (next: Mode) => {
      wsRef.current?.close();
      bufRef.current = "";
      setStatus("connecting");
      setNote("");
      // 🔒 НОВАЯ СЕССИЯ — ЧИСТЫЙ ТЕРМИНАЛ. PTY у неё свой, а терминал в
      // браузере тот же, и без сброса в неё переезжают режимы предыдущей.
      termRef.current?.reset();

      // 🔒 БИЛЕТ БЕРЁТСЯ ПЕРЕД КАЖДЫМ ОТКРЫТИЕМ. Он одноразовый и живёт минуту:
      // переключение режима — это новое соединение, значит и новый билет.
      let ticket = "";
      try {
        const res = await fetch(`${BASE}/api/fractera/pty-ticket`, {
          method: "POST",
        });
        if (!res.ok) {
          setStatus("closed");
          setNote(
            res.status === 403
              ? "Терминал доступен только архитектору проекта."
              : `Дверь билета ответила ${res.status}.`
          );
          return;
        }
        ticket = ((await res.json()) as { ticket?: string }).ticket ?? "";
      } catch {
        setStatus("closed");
        setNote("Дверь билета недоступна.");
        return;
      }

      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(
        `${scheme}://${window.location.host}${BASE}/pty`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        // 🛑 `init` УХОДИТ ПЕРВЫМ ДЕЙСТВИЕМ, ДО ВСЕГО ОСТАЛЬНОГО (157-3).
        // ✗ ОПЛАЧЕНО ВЕЧЕРОМ 2026-09-07: до этой правки перед ним стояли три
        // вызова — состояние, фильтр мыши, запись в xterm. Любой из них,
        // бросив исключение, съедал `init` целиком: мост принимал соединение,
        // ничего не получал и закрывал его, а человек видел чёрный экран и
        // «соединение закрыто». Журнал моста показал это прямо: «соединение
        // открыто» без единой строки «входящее».
        //
        // 🔒 ПРАВИЛО ШИРЕ СЛУЧАЯ: то, без чего соединение бессмысленно, идёт
        // первым. Всё, что можно сделать после, делается после.
        ws.send(JSON.stringify({ mode: next, ticket, type: "init" }));
        ws.send(JSON.stringify({ type: "resize", ...sizeRef.current }));
        setStatus("connected");
        // 🔒 ФИЛЬТР РОЖДАЕТСЯ ЗАНОВО ВМЕСТЕ С СОЕДИНЕНИЕМ, а уже включённое
        // слежение гасится строкой: фильтр не даёт включить мышь ВПЕРЁД, а
        // `MOUSE_OFF` убирает то, что успело включиться раньше — например, в
        // сессии агента, которая живёт на сервере с прошлой версии страницы.
        mouseRef.current = createMouseFilter();
        termRef.current?.write(MOUSE_OFF);
        termRef.current?.focus();
      };

      ws.onmessage = (event) => {
        const chunk =
          typeof event.data === "string"
            ? event.data
            : new TextDecoder().decode(event.data);
        // 🔒 В ТЕРМИНАЛ — ОТФИЛЬТРОВАННОЕ, В БУФЕР РАСПОЗНАВАНИЯ — СЫРОЕ.
        // Фильтр снимает только включение слежения за мышью, и ссылки входа он
        // не трогает; но буфер существует ради поиска в СЫРЬЕ (закон в шапке
        // файла), и кормить его чем-то обработанным значило бы завести вторую
        // правду о том, что пришло из PTY.
        termRef.current?.write(mouseRef.current(chunk));
        bufRef.current = (bufRef.current + chunk).slice(-BUFFER_LIMIT);
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(scan, DETECT_DELAY_MS);
      };

      ws.onclose = (event) => {
        setStatus("closed");
        // 🔒 РЕЖИМЫ ВОЗВРАЩАЮТСЯ, ЛЕНТА ОСТАЁТСЯ. Оборванный TUI не успевает
        // выключить слежение за мышью и дополнительный экран за собой — без
        // этой строки терминал остаётся отравленным: движение по тачпаду
        // печатает мусор. Полный сброс здесь был бы хуже: он стёр бы вывод,
        // по которому человек читает, ЧЕМ кончилось.
        termRef.current?.write(RESTORE_MODES);
        // 🛑 ПРИЧИНА ЗАКРЫТИЯ ПОКАЗЫВАЕТСЯ ЧЕЛОВЕКУ. Молчаливо погасший терминал
        // неотличим от сломанного, и чинить пойдут не то.
        if (event.reason) {
          setNote(`Соединение закрыто: ${event.reason}`);
        }
      };

      ws.onerror = () => {
        setNote("Обрыв соединения с терминалом.");
      };
    },
    [scan]
  );

  // 🔒 ОТКРЫТИЕ ВКЛАДКИ ВХОДИТ ТОЛЬКО ЕСЛИ НАДО. `claude auth login` не умеет
  // спрашивать, вошли ли уже (измерено 114-8: начинает обмен безусловно), и
  // вкладка, просящая вход у давно вошедшего, читается как «вход не сохранился».
  useEffect(() => {
    connect("claude-check");
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

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

  // 🔒 КНОПКА ВХОДИТ ВСЕГДА, В ОТЛИЧИЕ ОТ ОТКРЫТИЯ ВКЛАДКИ. Вошедшему она нужна
  // ровно затем, зачем нажимают такую кнопку: сменить учётную запись или
  // переделать вход, который он считает испорченным.
  // 🪦 В ТЕРМИНАЛЕ ЧАТА ТАКАЯ КНОПКА ОТКРЫВАЛА ОКНО НАСТРОЙКИ АГЕНТА — ТОКЕН БОТА,
  // КЛЮЧ OpenAI, ПОДПИСКА, ПРИВЯЗКА КАНАЛА. Странице входа из всего окна нужна одна
  // строка — вход в подписку, поэтому кнопка входит сразу (180-3). С шага 181 вход
  // из терминала чата убран вовсе и живёт только на страницах «Подписка Claude».
  const handleLogin = useCallback(() => {
    connect("claude-login");
  }, [connect]);

  // 🔒 РУЧНОЙ СБРОС — НЕ ЛИШНЯЯ КНОПКА, А ПРИЗНАНИЕ ГРАНИЦЫ. Программа внутри
  // живого PTY способна испортить состояние терминала и не умереть при этом, и
  // заметить такое из браузера нечем. Тогда человеку нужна не догадка, а кнопка.
  const handleReset = useCallback(() => {
    termRef.current?.reset();
    termRef.current?.focus();
  }, []);

  const handleCloseModal = useCallback(() => {
    modalOpenRef.current = false;
    setAuthUrl(null);
    // Буфер чистится вместе с окном: та же ссылка иначе откроет его снова.
    bufRef.current = "";
    termRef.current?.focus();
  }, []);

  const handleSendCode = useCallback(
    (code: string) => {
      send({ data: `${code}\n`, type: "stdin" });
    },
    [send]
  );

  // 🔒 ЦВЕТ КНОПОК ЗАДАН ЯВНО И НЕ ЗАВИСИТ ОТ ТЕМЫ — ПОТОМУ ЧТО ФОН ПОД НИМИ ТОЖЕ
  // ОТ НЕЁ НЕ ЗАВИСИТ (128, 2026-09-05). Панель терминала всегда тёмная
  // (`#0b0b0c`): это цвет оболочки, а не оформления страницы. Кнопки же были
  // просто `variant="ghost"` и брали `text-foreground` из темы — то есть в одной
  // из тем красились под светлый фон, которого здесь нет никогда, и пропадали.
  // ✗ владелец: «в дневной теме они выглядят хорошо, а в ночной их не видно».
  //
  // 🔒 ПРАВИЛО ШИРЕ СЛУЧАЯ: элемент на фоне, не подчинённом теме, обязан иметь
  // собственный цвет. Токен темы поверх фиксированного фона — это ставка на то,
  // что тема угадает чужой фон, и половину времени ставка проигрывает.
  return (
    <div className="flex h-dvh w-full flex-col bg-[#0b0b0c]">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-white/10 border-b px-3 py-2">
        {/* 🔒 ОДНА КНОПКА — РЕШЕНИЕ ВЛАДЕЛЬЦА (114-8). «Оболочка» и «Claude Code»
            убраны: вкладка существует ради одного — подключить подписку. Оболочка
            под ней та же самая, и набрать в ней `claude` по-прежнему можно. */}
        {/* 🔒 КНОПКА ВЫГЛЯДИТ КНОПКОЙ: ФОН И РАМКА (181-5). Слово владельца
            2026-09-10: «сама кнопка выполнено с прозрачным background и выглядит
            как заголовок а не как кнопка. Оформи её как кнопку с бэкграундом и
            бордюром». Цвета заданы явно по закону выше: фон панели от темы не
            зависит. «Сбросить» остаётся прозрачной намеренно — это служебное
            действие, а не то, ради чего страницу открывают. */}
        <Button
          onClick={handleLogin}
          className="border border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          size="sm"
          title="Войти в подписку Claude Code — для всего сервера"
          variant="ghost"
        >
          <KeyRoundIcon size={14} />
          Вход по подписке Claude Code
        </Button>

        <Button
          className="ml-auto text-white/80 hover:bg-white/10 hover:text-white"
          onClick={handleReset}
          size="sm"
          title="Вернуть терминал в исходное состояние: мышь, экран, курсор"
          variant="ghost"
        >
          <RotateCcwIcon size={14} />
          Сбросить
        </Button>

        <span className="font-mono text-[11px] text-white/50">
          {status === "connected" && "терминал подключён"}
          {status === "connecting" && "подключение…"}
          {status === "closed" && "соединение закрыто"}
          {status === "idle" && "ожидание"}
        </span>
      </header>

      {note ? (
        <p className="shrink-0 border-white/10 border-b bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-200">
          {note}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 p-2">
        <XtermTerminal
          onData={handleData}
          onResize={handleResize}
          ref={termRef}
        />
      </div>

      {authUrl ? (
        <AuthFlowModal
          onClose={handleCloseModal}
          onSendCode={handleSendCode}
          url={authUrl}
        />
      ) : null}
    </div>
  );
}
