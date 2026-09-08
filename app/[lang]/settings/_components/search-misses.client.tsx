"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// ЖУРНАЛ ПРОМАХОВ ПОИСКА — ЧТО БОТ НЕ ПОНЯЛ (158-7, поверхность 2026-09-08).
//
// 🔒 КАЖДАЯ СТРОКА — ГОТОВЫЙ КАНДИДАТ В `triggers`. Промах это фраза, которой
// человек назвал то, чего система не нашла; счётчик повторов говорит, какая из
// них важнее. Невидимый журнал копит этот материал и никому не отдаёт.
//
// 🛑 ЭКРАН НЕ ПРАВИТ РЕЕСТР. Писатель реестра ровно один — агент, правящий конфиг
// коммитом. Дописать триггер человек просит у бота словами: тем же путём, что и
// всё остальное. Форма здесь стала бы вторым писателем одного файла.
//
// 🔒 ТРИ СОСТОЯНИЯ РАЗЛИЧИМЫ НА ВИД: есть промахи · их нет · база молчит. Пустой
// журнал и мёртвая база выглядели бы одинаково и значат противоположное.

type Miss = { id: number; corpus: string; query: string; times: number; at: string };

type Words = {
  title: string;
  lead: string;
  howTo: string;
  empty: string;
  down: string;
  times: string;
  drop: string;
  loading: string;
  failed: string;
};

export function SearchMisses({ words }: { words: Words }) {
  const [items, setItems] = useState<Miss[] | null>(null);
  const [state, setState] = useState<"some" | "empty" | "down">("empty");
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/fractera/misses", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as
        | { items?: Miss[]; state?: "some" | "empty" | "down" }
        | null;
      if (!r.ok || !j) {
        setItems([]);
        setState("down");
        return;
      }
      setItems(j.items ?? []);
      setState(j.state ?? "empty");
    } catch {
      setItems([]);
      setState("down");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const drop = useCallback(
    async (id: number) => {
      setBusy(id);
      try {
        await fetch("/api/fractera/misses", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        await load();
      } finally {
        setBusy(null);
      }
    },
    [load]
  );

  if (items === null) {
    return <p className="text-muted-foreground text-sm">{words.loading}</p>;
  }

  return (
    <div className="flex flex-col gap-3" data-search-misses={state}>
      <p className="text-muted-foreground text-sm">{words.lead}</p>
      {state === "down" ? (
        <p className="text-destructive text-sm" role="alert">
          {words.down}
        </p>
      ) : null}
      {state === "empty" ? (
        <p className="text-muted-foreground text-sm">{words.empty}</p>
      ) : null}
      {items.length > 0 ? (
        <>
          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            {items.map((m) => (
              <div className="flex flex-wrap items-center gap-3 px-3 py-2" key={m.id}>
                {/* Счётчик первым: он говорит, какая фраза важнее остальных. */}
                <span className="min-w-8 text-right font-mono text-muted-foreground text-xs">
                  {m.times}
                  {words.times}
                </span>
                <span className="flex-1 text-sm">{m.query}</span>
                <span className="font-mono text-muted-foreground text-xs">{m.corpus}</span>
                <Button
                  disabled={busy === m.id}
                  onClick={() => drop(m.id)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {words.drop}
                </Button>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">{words.howTo}</p>
        </>
      ) : null}
    </div>
  );
}
