"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// СТЕНД ПАМЯТИ — ВЕРХНЯЯ ПОЛОВИНА РАЗДЕЛА (176-2).
//
// 🔒 ЗАЧЕМ ОН ЕСТЬ: ЧТОБЫ ИЗМЕРЯТЬ ПАМЯТЬ, А НЕ СУММУ «ПАМЯТЬ ПЛЮС АГЕНТ».
// ✗ оплачено разбором 2026-09-10: на вопрос «что ты знаешь обо мне» от нажатия
// «отправить» до ответа прошло 2 мин 13 с, и к самой памяти относились СЕКУНДЫ.
// Остальное съели перезапуск агента и два его промаха с именами инструментов.
// Пока в цепочке стоит агент, измеряется не память.
//
// 🔒 ОТВЕТ ПОКАЗЫВАЕТСЯ ДОСЛОВНО, А НЕ ПЕРЕСКАЗОМ. Сводка вместо тела ответа —
// ровно та потеря, из-за которой цепочку пришлось восстанавливать по журналу
// сессии: видимого следа не осталось нигде.
//
// 🔒 ВРЕМЯ СТОИТ РЯДОМ С ОТВЕТОМ. Разбор фразы идёт 6–10 секунд, потому что
// думает Opus; без числа это неотличимо от зависшей страницы.

type Words = {
  lead: string;
  say: string;
  ask: string;
  raw: string;
  sayHint: string;
  askHint: string;
  rawHint: string;
  rawMethod: string;
  rawBody: string;
  send: string;
  sending: string;
  inputTitle: string;
  answerTitle: string;
  nothingYet: string;
  nothingSent: string;
  volatile: string;
  failed: string;
  took: string;
  status: string;
};

type Mode = "say" | "ask" | "raw";

type Shot = {
  /** Что ушло — то, что человек набрал, а не то, что мы из этого собрали. */
  asked: string;
  at: string;
  /** Ответ службы как есть; `null`, когда до неё не дошли. */
  body: unknown;
  id: number;
  method: string;
  ms: number;
  status: number;
  trouble: string | null;
};

/** Показать тело ответа так, как оно пришло. Строку не трогаем вовсе. */
function show(body: unknown): string {
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

export function MemoryTest({
  onSent,
  words,
}: {
  /** Стенд сообщает соседу внизу, что состав таблиц мог измениться (176-3). */
  onSent?: () => void;
  words: Words;
}) {
  const [mode, setMode] = useState<Mode>("say");
  const [text, setText] = useState("");
  const [method, setMethod] = useState("recall");
  const [rawBody, setRawBody] = useState('{\n  "who": "bench-1"\n}');
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);

  const send = useCallback(async () => {
    if (busy) return;

    // 🔒 ЧТО ИМЕННО УЕДЕТ — РЕШАЕТСЯ ЗДЕСЬ И ПОКАЗЫВАЕТСЯ ЧЕЛОВЕКУ. Стенд, в
    // котором не видно отправленного, отвечает на вопрос «что вернулось» и
    // молчит о том, «на что».
    let sendMethod = method;
    let sendBody: unknown = {};
    let asked = "";

    if (mode === "say") {
      if (!text.trim()) return;
      sendMethod = "remember";
      sendBody = { text: text.trim() };
      asked = text.trim();
    } else if (mode === "ask") {
      sendMethod = "recall";
      sendBody = text.trim() ? { text: text.trim() } : {};
      asked = text.trim() || "(без вопроса — всё, что известно)";
    } else {
      try {
        sendBody = rawBody.trim() ? JSON.parse(rawBody) : {};
      } catch {
        // 🛑 КРИВОЙ JSON — ОТВЕТ СТЕНДА, А НЕ МОЛЧАНИЕ. Пропущенная отправка без
        // следа читается как «служба не ответила», и виноватой выглядит память.
        setShots((s) => [
          {
            asked: rawBody.slice(0, 200),
            at: new Date().toLocaleTimeString(),
            body: null,
            id: nextId.current++,
            method: sendMethod,
            ms: 0,
            status: 0,
            trouble: "тело запроса — не JSON, до памяти не отправляли",
          },
          ...s,
        ]);
        return;
      }
      asked = `${sendMethod} ← ${rawBody.trim().replace(/\s+/g, " ").slice(0, 120)}`;
    }

    setBusy(true);
    const started = Date.now();
    try {
      const r = await fetch("/api/fractera/memory-test", {
        body: JSON.stringify({ body: sendBody, method: sendMethod }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      // 🛑 ЧИТАЕМ ТЕЛО, А НЕ КОД: и наша дверь, и память отвечают `200` с
      // `ok:false`. Довериться коду значило бы объявить успехом отказ.
      const text_ = await r.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text_);
      } catch {
        parsed = { raw: text_.slice(0, 2000) };
      }
      const answer = parsed as {
        body?: unknown;
        ms?: number;
        status?: number;
        trouble?: string | null;
      };
      setShots((s) => [
        {
          asked,
          at: new Date().toLocaleTimeString(),
          body: answer?.body ?? parsed,
          id: nextId.current++,
          method: sendMethod,
          ms: typeof answer?.ms === "number" ? answer.ms : Date.now() - started,
          status: typeof answer?.status === "number" ? answer.status : r.status,
          trouble: answer?.trouble ?? null,
        },
        ...s,
      ]);
      if (mode !== "ask") onSent?.();
    } catch (e) {
      setShots((s) => [
        {
          asked,
          at: new Date().toLocaleTimeString(),
          body: null,
          id: nextId.current++,
          method: sendMethod,
          ms: Date.now() - started,
          status: 0,
          trouble: `${words.failed}: ${String((e as Error).message)}`,
        },
        ...s,
      ]);
    } finally {
      setBusy(false);
    }
  }, [busy, method, mode, onSent, rawBody, text, words.failed]);

  const modeButton = (id: Mode, label: string) => (
    <button
      className={`rounded-md border px-3 py-1 text-[length:var(--fs-small)] transition-colors ${
        mode === id
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/30 hover:bg-muted"
      }`}
      onClick={() => setMode(id)}
      type="button"
    >
      {label}
    </button>
  );

  const hint =
    mode === "say" ? words.sayHint : mode === "ask" ? words.askHint : words.rawHint;

  return (
    <section className="space-y-3">
      <p className="text-[length:var(--fs-small)] text-muted-foreground">{words.lead}</p>

      {/* 🔒 ВЫСОТА ОГРАНИЧЕНА У СТЕНДА, А ПРОКРУТКА ЖИВЁТ ВНУТРИ КОЛОНОК.
          Заказ владельца дословно: «максимальной высотой 600 пикселей и
          внутренней прокруткой». Прокрути мы страницу целиком — ввод уезжал бы
          за край ровно тогда, когда нужен: при чтении длинного ответа. */}
      <div className="grid gap-3 md:grid-cols-2" style={{ maxHeight: 600 }}>
        {/* ЛЕВАЯ КОЛОНКА — ВВОД И ЛЕНТА ОТПРАВЛЕННОГО */}
        <div className="flex min-h-0 flex-col rounded-md border border-muted-foreground/30">
          <div className="border-b border-muted-foreground/20 px-3 py-2 text-[length:var(--fs-small)] font-medium">
            {words.inputTitle}
          </div>

          <div className="space-y-2 border-b border-muted-foreground/20 p-3">
            <div className="flex flex-wrap gap-2">
              {modeButton("say", words.say)}
              {modeButton("ask", words.ask)}
              {modeButton("raw", words.raw)}
            </div>
            <p className="text-[length:var(--fs-small)] text-muted-foreground">{hint}</p>

            {mode === "raw" ? (
              <div className="space-y-2">
                <input
                  aria-label={words.rawMethod}
                  className="w-full rounded-md border border-muted-foreground/30 bg-transparent px-2 py-1 font-mono text-[length:var(--fs-small)]"
                  onChange={(e) => setMethod(e.target.value)}
                  placeholder={words.rawMethod}
                  value={method}
                />
                <textarea
                  aria-label={words.rawBody}
                  className="h-28 w-full resize-y rounded-md border border-muted-foreground/30 bg-transparent px-2 py-1 font-mono text-[length:var(--fs-small)]"
                  onChange={(e) => setRawBody(e.target.value)}
                  spellCheck={false}
                  value={rawBody}
                />
              </div>
            ) : (
              <textarea
                aria-label={words.inputTitle}
                className="h-24 w-full resize-y rounded-md border border-muted-foreground/30 bg-transparent px-2 py-1 text-[length:var(--fs-small)]"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send();
                }}
                value={text}
              />
            )}

            <div className="flex items-center gap-2">
              <Button disabled={busy} onClick={() => void send()} size="sm" type="button">
                {busy ? words.sending : words.send}
              </Button>
              <span className="text-[length:var(--fs-small)] text-muted-foreground">
                ⌘/Ctrl + Enter
              </span>
            </div>
          </div>

          {/* 🔒 ЛЕНТА ЖИВЁТ В БРАУЗЕРЕ, И ЭТО СКАЗАНО СЛОВАМИ. Молчаливая
              пропажа проб после перезагрузки читается как дефект. */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {shots.length === 0 ? (
              <p className="text-[length:var(--fs-small)] text-muted-foreground">
                {words.nothingSent}
              </p>
            ) : (
              <ol className="space-y-2">
                {shots.map((s) => (
                  <li
                    className="rounded-md border border-muted-foreground/20 px-2 py-1"
                    key={s.id}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-[length:var(--fs-small)] text-muted-foreground">
                        {s.method}
                      </span>
                      <span className="text-[length:var(--fs-small)] text-muted-foreground">
                        {s.at}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap break-words text-[length:var(--fs-small)]">
                      {s.asked}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="border-t border-muted-foreground/20 px-3 py-1 text-[length:var(--fs-small)] text-muted-foreground">
            {words.volatile}
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА — ОТВЕТ ПАМЯТИ ДОСЛОВНО */}
        <div className="flex min-h-0 flex-col rounded-md border border-muted-foreground/30">
          <div className="border-b border-muted-foreground/20 px-3 py-2 text-[length:var(--fs-small)] font-medium">
            {words.answerTitle}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {shots.length === 0 ? (
              <p className="text-[length:var(--fs-small)] text-muted-foreground">
                {words.nothingYet}
              </p>
            ) : (
              <ol className="space-y-3">
                {shots.map((s) => (
                  <li key={s.id}>
                    <div className="mb-1 flex flex-wrap items-baseline gap-x-3 text-[length:var(--fs-small)] text-muted-foreground">
                      <span>
                        {words.status}: {s.status || "—"}
                      </span>
                      <span>
                        {words.took}: {s.ms} мс
                      </span>
                      <span>{s.at}</span>
                    </div>
                    {s.trouble ? (
                      <p className="rounded-md border border-destructive/40 px-2 py-1 text-[length:var(--fs-small)] text-destructive">
                        {s.trouble}
                      </p>
                    ) : (
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted px-2 py-1 font-mono text-[length:var(--fs-small)]">
                        {show(s.body)}
                      </pre>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
