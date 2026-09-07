"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// РЕДАКТОР `SOUL.md` — ХАРАКТЕР АГЕНТА (158-5в, замысел З15).
//
// 🔒 ОДНО ПОЛЕ MARKDOWN, А НЕ ТРИНАДЦАТЬ ЯЧЕЕК, И ЭТО РАЗБОР ВОПРОСА ВЛАДЕЛЬЦА
// 2026-09-08. Признаки `person.*` спрашивают ПО КЛЮЧУ — им нужны таблицы и
// поиск. `SOUL.md` читается ЦЕЛИКОМ и всегда. Разложи его по полям — человек
// начнёт укладывать характер в клетки, и первым исчезнет нюанс («отвечай
// коротко, но про архитектуру разворачивай»), ради которого файл и заводится.
//
// 🔒 ДИЗАЙН ПРИ ЭТОМ ОБЩИЙ С СОСЕДНИМ ЭКРАНОМ: та же карточка, та же кнопка, тот
// же порядок «объяснение — поле — действие». Одинаковый вид не требует
// одинаковой формы данных, и путать эти две вещи — обычная ошибка.
//
// 🛑 СЧЁТЧИК РАЗМЕРА ВИДЕН ВСЕГДА, А НЕ ТОЛЬКО ПРИ ОТКАЗЕ. Файл едет в контекст
// агента при каждом запуске: человек имеет право видеть цену того, что пишет.

type Words = {
  lead: string;
  saved: string;
  save: string;
  saving: string;
  failed: string;
  loading: string;
  size: string;
  restart: string;
};

export function SoulEditor({ words }: { words: Words }) {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [max, setMax] = useState(16_000);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch("/api/fractera/soul", { cache: "no-store" });
        if (!r.ok) {
          if (alive) {
            setText("");
            setFailed(`${words.failed} (${r.status})`);
          }
          return;
        }
        const j = (await r.json()) as { text?: string; max?: number };
        if (alive) {
          setText(j.text ?? "");
          setSaved(j.text ?? "");
          setMax(j.max ?? 16_000);
        }
      } catch {
        if (alive) {
          setText("");
          setFailed(words.failed);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [words.failed]);

  const save = useCallback(async () => {
    if (text === null) {
      return;
    }
    setBusy(true);
    setFailed(null);
    setNote(null);
    try {
      const r = await fetch("/api/fractera/soul", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = (await r.json().catch(() => null)) as
        | { hint?: string; note?: string }
        | null;
      if (!r.ok) {
        setFailed(j?.hint ?? words.failed);
        return;
      }
      setSaved(text);
      // 🔒 ПРАВКА НЕ ДЕЙСТВУЕТ ДО ПЕРЕЗАПУСКА СЕССИИ, И ЭТО СКАЗАНО ПОСЛЕ
      // КАЖДОГО СОХРАНЕНИЯ. Зелёная галочка без оговорки лжёт: человек ждал бы
      // нового поведения в следующем же сообщении боту.
      setNote(words.restart);
    } catch {
      setFailed(words.failed);
    } finally {
      setBusy(false);
    }
  }, [text, words.failed, words.restart]);

  if (text === null) {
    return <p className="text-muted-foreground text-sm">{words.loading}</p>;
  }

  const bytes = new TextEncoder().encode(text).length;
  const changed = text !== saved;
  const tooBig = bytes > max;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{words.lead}</p>
      <textarea
        aria-label={words.lead}
        className="min-h-64 w-full rounded-md border border-border bg-background p-3 font-mono text-sm"
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        value={text}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!changed || busy || tooBig} onClick={save} size="sm" type="button">
          {busy ? words.saving : words.save}
        </Button>
        <span className={tooBig ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>
          {words.size} {bytes} / {max}
        </span>
        {!changed && saved ? (
          <span className="text-muted-foreground text-xs">{words.saved}</span>
        ) : null}
      </div>
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
      {failed ? (
        <p className="text-destructive text-sm" role="alert">
          {failed}
        </p>
      ) : null}
    </div>
  );
}
