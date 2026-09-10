"use client";

import { useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Button } from "@/components/ui/button";

// НИЖНЯЯ ПОЛОВИНА РАЗДЕЛА — ЧТО ПАМЯТЬ ПОСТРОИЛА (176-3).
//
// 🔒 ТАБЛИЦЫ БЕРУТСЯ У САМОЙ ПАМЯТИ (`GET /v1/tables`), А НЕ ОБХОДОМ БАЗЫ.
// Способность у неё уже есть; свой обход завёл бы второго читателя её
// внутренностей — ровно то, от чего защищает закон о чёрном ящике.
//
// 🔒 «ТАБЛИЦ НЕТ» И «СЛУЖБА НЕ ОТВЕТИЛА» — РАЗНЫЕ СОСТОЯНИЯ, И ОБА НАЗЫВАЮТСЯ.
// Пустой список человек читает как «память ничего не построила»; отказ службы —
// совсем другое, и путать их значит показывать уверенную ложь. Тот же закон уже
// оплачен на соседнем экране этого раздела.
//
// 🛑 СМОТРИМ ТОЛЬКО НА `:3700`. Таблицы старой памяти сюда не попадают: смешав
// их, мы получили бы экран, по которому нельзя сказать, что помнит НОВАЯ память.

type Words = {
  title: string;
  lead: string;
  refresh: string;
  loading: string;
  empty: string;
  down: string;
  rows: string;
  columns: string;
  noRows: string;
  shown: string;
};

type TableInfo = {
  name: string;
  rows?: number;
};

type Loaded = {
  columns: string[];
  name: string;
  rows: Record<string, unknown>[];
  trouble: string | null;
};

/** Сколько строк одной таблицы показываем. Ограничение НАЗЫВАЕТСЯ, а не молчит. */
const LIMIT = 50;

export type MemoryTablesHandle = { reload: () => void };

export function MemoryTables({
  ref,
  words,
}: {
  ref?: React.Ref<MemoryTablesHandle>;
  words: Words;
}) {
  const [names, setNames] = useState<TableInfo[] | null>(null);
  const [tables, setTables] = useState<Loaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setTrouble(null);
    try {
      const r = await fetch("/api/fractera/memory-test?what=tables", { cache: "no-store" });
      const answer = (await r.json()) as {
        body?: { ok?: boolean; tables?: unknown };
        trouble?: string | null;
      };
      if (answer?.trouble) {
        setTrouble(answer.trouble);
        setNames(null);
        setTables([]);
        return;
      }
      const raw = answer?.body?.tables;
      const list: TableInfo[] = Array.isArray(raw)
        ? raw.map((t) =>
            typeof t === "string"
              ? { name: t }
              : { name: String((t as { name?: unknown }).name ?? ""), rows: (t as { rows?: number }).rows }
          )
        : [];
      setNames(list.filter((t) => t.name));

      // 🔒 СОДЕРЖИМОЕ КАЖДОЙ ТАБЛИЦЫ ТЯНЕМ ОТДЕЛЬНО, ПОТОМУ ЧТО ТАК УСТРОЕН
      // ДОГОВОР ПАМЯТИ: имена — одним запросом, строки — по имени.
      const loaded: Loaded[] = [];
      for (const t of list) {
        if (!t.name) continue;
        try {
          const one = await fetch(
            `/api/fractera/memory-test?what=table&name=${encodeURIComponent(t.name)}`,
            { cache: "no-store" }
          );
          const got = (await one.json()) as {
            body?: { columns?: unknown; ok?: boolean; rows?: unknown };
            trouble?: string | null;
          };
          if (got?.trouble || got?.body?.ok === false) {
            loaded.push({
              columns: [],
              name: t.name,
              rows: [],
              trouble: got?.trouble ?? words.down,
            });
            continue;
          }
          const cols = Array.isArray(got?.body?.columns)
            ? (got.body.columns as unknown[]).map((c) =>
                typeof c === "string" ? c : String((c as { name?: unknown })?.name ?? "")
              )
            : [];
          const rows = Array.isArray(got?.body?.rows)
            ? (got.body.rows as Record<string, unknown>[])
            : [];
          loaded.push({ columns: cols, name: t.name, rows, trouble: null });
        } catch (e) {
          loaded.push({
            columns: [],
            name: t.name,
            rows: [],
            trouble: String((e as Error).message),
          });
        }
      }
      setTables(loaded);
    } catch (e) {
      setTrouble(`${words.down}: ${String((e as Error).message)}`);
      setNames(null);
      setTables([]);
    } finally {
      setBusy(false);
    }
  }, [words.down]);

  useEffect(() => {
    void load();
  }, [load]);

  useImperativeHandle(ref, () => ({ reload: () => void load() }), [load]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[length:var(--fs-h3)] font-medium">{words.title}</h2>
        <Button disabled={busy} onClick={() => void load()} size="sm" type="button" variant="outline">
          {busy ? words.loading : words.refresh}
        </Button>
      </div>
      <p className="text-[length:var(--fs-small)] text-muted-foreground">{words.lead}</p>

      {trouble ? (
        <p className="rounded-md border border-destructive/40 px-3 py-2 text-[length:var(--fs-small)] text-destructive">
          {trouble}
        </p>
      ) : names === null ? (
        <p className="text-[length:var(--fs-small)] text-muted-foreground">{words.loading}</p>
      ) : names.length === 0 ? (
        <p className="rounded-md border border-dashed border-muted-foreground/30 px-3 py-4 text-[length:var(--fs-small)] text-muted-foreground">
          {words.empty}
        </p>
      ) : (
        <div className="space-y-4">
          {tables.map((t) => (
            <div className="rounded-md border border-muted-foreground/30" key={t.name}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-muted-foreground/20 px-3 py-2">
                <span className="font-mono text-[length:var(--fs-small)]">{t.name}</span>
                <span className="text-[length:var(--fs-small)] text-muted-foreground">
                  {t.columns.length} {words.columns} · {t.rows.length} {words.rows}
                </span>
              </div>

              {t.trouble ? (
                <p className="px-3 py-2 text-[length:var(--fs-small)] text-destructive">{t.trouble}</p>
              ) : t.rows.length === 0 ? (
                <p className="px-3 py-2 text-[length:var(--fs-small)] text-muted-foreground">
                  {words.noRows}
                </p>
              ) : (
                <>
                  {/* 🔒 ШИРОКАЯ ТАБЛИЦА ПРОКРУЧИВАЕТСЯ ВНУТРИ СЕБЯ, А НЕ ТЯНЕТ
                      СТРАНИЦУ ВБОК: колонок у памяти становится больше с каждым
                      новым родом значения, и это её нормальная жизнь. */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[length:var(--fs-small)]">
                      <thead>
                        <tr className="border-b border-muted-foreground/20">
                          {t.columns.map((c) => (
                            <th className="whitespace-nowrap px-3 py-1 font-mono font-medium" key={c}>
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {t.rows.slice(0, LIMIT).map((row, i) => (
                          <tr className="border-b border-muted-foreground/10" key={i}>
                            {t.columns.map((c) => (
                              <td className="max-w-[24ch] truncate px-3 py-1" key={c} title={String(row[c] ?? "")}>
                                {row[c] === null || row[c] === undefined ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  String(row[c])
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {t.rows.length > LIMIT && (
                    // 🛑 ОБРЕЗКА НАЗЫВАЕТСЯ, А НЕ ПРОИСХОДИТ МОЛЧА: невидимая
                    // потеря строк читается как «память их не сохранила».
                    <p className="px-3 py-1 text-[length:var(--fs-small)] text-muted-foreground">
                      {words.shown} {LIMIT} / {t.rows.length}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
