"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ЭКРАН «ЧТО Я ЗНАЮ О ВАС» (158-5, замысел З17 — третий путь).
//
// 🔒 ЗАЧЕМ ОН СУЩЕСТВУЕТ. Путей, которыми знание о человеке попадает в систему,
// три: он сказал сам · агент вывел из работы · **он поправил рукой**. Без
// третьего неверно сохранённый факт невидим и неисправим, а снаружи это
// выглядит как «система уверенно врёт».
//
// 🔒 ТРИ СОСТОЯНИЯ СТРОКИ РАЗЛИЧИМЫ НА ВИД, А НЕ ТОЛЬКО В ОТВЕТЕ. Значение есть ·
// ещё не говорили · база молчит. ✗ иначе пустой список и мёртвая база выглядят
// одинаково и значат противоположное — закон, уже действующий у лент.
//
// 🛑 НИЧЕГО НЕ ПРИДУМЫВАЕТ ЗА ЧЕЛОВЕКА. Пустая строка показывает ПРИМЕР серым,
// а не подставляет его значением: выдуманное имя было бы ложью о том, что
// система знает.

type Row = {
  key: string;
  title: string;
  what: string;
  example: string | null;
  value: string | null;
  at: string | null;
  state: "known" | "empty" | "down";
  hint: string | null;
};

type Words = {
  lead: string;
  empty: string;
  down: string;
  since: string;
  save: string;
  clear: string;
  saving: string;
  failed: string;
  loading: string;
};

// 🔒 АДРЕС ДВЕРИ ОТНОСИТЕЛЬНЫЙ, КАК У ВСЕХ СОСЕДЕЙ ЭТОГО РАЗДЕЛА. Свой способ
// собирать базовый путь стал бы вторым, и разошёлся бы на первом переезде.
export function KnownAboutMe({ words }: { words: Words }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/fractera/known", { cache: "no-store" });
      if (!r.ok) {
        setRows([]);
        setFailed(`${words.failed} (${r.status})`);
        return;
      }
      const j = (await r.json()) as { items?: Row[] };
      setRows(j.items ?? []);
      setFailed(null);
    } catch {
      setRows([]);
      setFailed(words.failed);
    }
  }, [words.failed]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (key: string, value: string) => {
      setBusy(key);
      setFailed(null);
      try {
        const r = await fetch("/api/fractera/known", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { hint?: string } | null;
          // 🔒 ОТКАЗ НАЗЫВАЕТ ПРИЧИНУ, А НЕ ПРОСТО КРАСНЕЕТ. Человек правит своё
          // знание о себе; «не сохранилось» без причины он прочитает как потерю.
          setFailed(j?.hint ?? words.failed);
          return;
        }
        setDraft((d) => {
          const next = { ...d };
          delete next[key];
          return next;
        });
        await load();
      } catch {
        setFailed(words.failed);
      } finally {
        setBusy(null);
      }
    },
    [load, words.failed]
  );

  if (rows === null) {
    return <p className="text-muted-foreground text-sm">{words.loading}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{words.lead}</p>
      {failed ? (
        <p className="text-destructive text-sm" role="alert">
          {failed}
        </p>
      ) : null}
      <div className="flex flex-col divide-y divide-border rounded-md border border-border">
        {rows.map((row) => {
          const edited = draft[row.key];
          const shown = edited ?? row.value ?? "";
          const changed = edited !== undefined && edited !== (row.value ?? "");
          return (
            <div className="flex flex-col gap-2 p-3" key={row.key}>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-sm">{row.title}</span>
                <span className="text-muted-foreground text-xs">{row.what}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={row.title}
                  className="max-w-md"
                  disabled={row.state === "down" || busy === row.key}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [row.key]: e.target.value }))
                  }
                  placeholder={row.example ?? ""}
                  value={shown}
                />
                <Button
                  disabled={!changed || busy === row.key}
                  onClick={() => save(row.key, shown)}
                  size="sm"
                  type="button"
                >
                  {busy === row.key ? words.saving : words.save}
                </Button>
                {row.value ? (
                  <Button
                    disabled={busy === row.key}
                    onClick={() => save(row.key, "")}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {words.clear}
                  </Button>
                ) : null}
              </div>
              {/* Три состояния названы словами, а не цветом: цвет не читается
                  вслух и теряется у того, кто его не различает. */}
              {row.state === "known" && row.at ? (
                <span className="text-muted-foreground text-xs">
                  {words.since} {row.at}
                </span>
              ) : null}
              {row.state === "empty" ? (
                <span className="text-muted-foreground text-xs">{words.empty}</span>
              ) : null}
              {row.state === "down" ? (
                <span className="text-destructive text-xs">
                  {words.down}
                  {row.hint ? ` — ${row.hint}` : ""}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
