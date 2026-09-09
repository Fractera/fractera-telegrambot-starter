"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// 🔒 ТОЛЬКО ИЗ ОБЩЕГО ФАЙЛА: серверный `known.ts` тянет чтение реестра и `node:fs`,
// а клиентский бандл внешних модулей не принимает — сборка падает целиком.
import { KNOWN_PER_PAGE, type KnownPage, type KnownQuery, type KnownRow } from "../_lib/known-shared";

// ТАБЛИЦА «ЧТО Я ЗНАЮ О ВАС» — ПОИСК СВЕРХУ, СТРАНИЦЫ СНИЗУ (2026-09-08).
//
// 🎯 РЕШЕНИЕ ВЛАДЕЛЬЦА: «таблица с горизонтальной прокруткой… дизайн пагинации и
// запросы серверу такой же как на странице история автоматизации… вверху есть
// поиск по названию или метки… внизу пагинация».
//
// 🔒 ПОЧЕМУ ТАБЛИЦА, А НЕ КАРТОЧКИ, — ЕГО ЖЕ ДОВОД: «наращивание данных в этой
// таблице будет происходить линейно практически при каждом обращении». Карточки
// читаются, пока их полтора десятка; сто карточек — это свиток, в котором ничего
// не найти, а сто строк таблицы — обычная таблица.
//
// 🔒 ГОРИЗОНТАЛЬНАЯ ПРОКРУТКА — У ТАБЛИЦЫ, А НЕ У СТРАНИЦЫ. Тело страницы
// прокручиваться вбок не имеет права: это ломает чтение всего остального.
//
// 🛑 ПРАВКА ОСТАЁТСЯ КЛИЕНТСКОЙ, А ОТБОР — СЕРВЕРНЫМ, И ЭТО НЕ ПОЛОВИНЧАТОСТЬ.
// Отбор живёт в адресе страницы: его можно дать ссылкой, он переживает
// перезагрузку и не растёт с числом строк. Правка значения — разговор с одной
// строкой, ей адрес не нужен.

type Words = {
  lead: string;
  empty: string;
  down: string;
  since: string;
  save: string;
  clear: string;
  saving: string;
  failed: string;
  search: string;
  searchDo: string;
  reset: string;
  colFact: string;
  colValue: string;
  colTags: string;
  colWhen: string;
  colWhat: string;
  filledAny: string;
  filledYes: string;
  filledNo: string;
  /** Что стоит на месте значения, когда бот об этом ещё не знает. */
  valueEmpty: string;
  found: string;
  page: string;
  prev: string;
  next: string;
  askBot: string;
  askBotTitle: string;
  askBotBody: string;
  askBotWhy: string;
  askBotClose: string;
};

export function KnownTable({ page, query, words }: { page: KnownPage; query: KnownQuery; words: Words }) {
  const router = useRouter();
  const params = useSearchParams();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const [needle, setNeedle] = useState(query.q);

  // 🔒 ЧУЖИЕ ПАРАМЕТРЫ АДРЕСА СОХРАНЯЮТСЯ. На этой же странице живёт запрос
  // автоматизаций; стерев его своим переходом, поиск по знаниям сбрасывал бы
  // чужой отбор — и человек не понял бы, почему.
  const go = useCallback(
    (patch: Partial<Record<"kq" | "kfilled" | "kpage" | "kper", string>>) => {
      const p = new URLSearchParams(params?.toString() ?? "");
      for (const [k, v] of Object.entries(patch)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      // 🔒 ЛЮБАЯ СМЕНА ОТБОРА ВОЗВРАЩАЕТ НА ПЕРВУЮ СТРАНИЦУ. Иначе человек ищет
      // и попадает на пустую седьмую — выглядит как «ничего не найдено».
      if (!("kpage" in patch)) p.delete("kpage");
      router.push(`?${p.toString()}`);
    },
    [params, router],
  );

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
        const d = (await r.json()) as { ok?: boolean; hint?: string };
        if (!d.ok) {
          setFailed(d.hint ?? words.failed);
        } else {
          setDraft(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          // 🔒 ПОСЛЕ ЗАПИСИ ПЕРЕЧИТЫВАЕМ С СЕРВЕРА, А НЕ ПРАВИМ СТРОКУ У СЕБЯ.
          // Показать своё значение вместо записанного значит однажды показать
          // то, чего в базе нет: отказ на полпути выглядел бы успехом.
          router.refresh();
        }
      } catch {
        setFailed(words.failed);
      } finally {
        setBusy(null);
      }
    },
    [router, words.failed],
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-[0.9em]">{words.lead}</p>

      {/* ── ПОИСК СВЕРХУ ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-full max-w-xs text-[0.9em]"
          onChange={e => setNeedle(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") go({ kq: needle });
          }}
          placeholder={words.search}
          value={needle}
        />
        <Button className="h-8" onClick={() => go({ kq: needle })} size="sm" variant="secondary">
          {words.searchDo}
        </Button>

        <select
          className="border-border bg-background h-8 rounded-md border px-2 text-[0.85em]"
          onChange={e => go({ kfilled: e.target.value === "any" ? "" : e.target.value })}
          value={query.filled}
        >
          <option value="any">{words.filledAny}</option>
          <option value="yes">{words.filledYes}</option>
          <option value="no">{words.filledNo}</option>
        </select>

        {(query.q || query.filled !== "any") && (
          <Button className="h-8" onClick={() => go({ kq: "", kfilled: "" })} size="sm" variant="ghost">
            {words.reset}
          </Button>
        )}

        <span className="text-muted-foreground ml-auto text-[0.8em]">
          {words.found.replace("{n}", String(page.total)).replace("{f}", String(page.filled))}
        </span>
      </div>

      {failed && <p className="text-[0.85em] text-amber-600">{failed}</p>}
      {page.down && <p className="text-[0.85em] text-amber-600">{words.down}</p>}

      {/* ── ТАБЛИЦА: ПРОКРУТКА У НЕЁ, А НЕ У СТРАНИЦЫ ────────────────────── */}
      <div className="border-border overflow-x-auto rounded-md border">
        <table className="w-full min-w-[52rem] border-collapse text-[0.85em]">
          <thead className="bg-muted/40">
            <tr className="text-muted-foreground text-left">
              <th className="px-3 py-2 font-medium">{words.colFact}</th>
              <th className="px-3 py-2 font-medium">{words.colValue}</th>
              <th className="px-3 py-2 font-medium">{words.colTags}</th>
              <th className="px-3 py-2 font-medium">{words.colWhen}</th>
              <th className="px-3 py-2 font-medium">{words.colWhat}</th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map(row => (
              <Line
                busy={busy === row.key}
                draft={draft[row.key]}
                key={row.key}
                onChange={v => setDraft(prev => ({ ...prev, [row.key]: v }))}
                onSave={() => save(row.key, draft[row.key] ?? "")}
                row={row}
                words={words}
              />
            ))}
            {page.rows.length === 0 && (
              <tr>
                <td className="text-muted-foreground px-3 py-6 text-center" colSpan={5}>
                  {words.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── СТРАНИЦЫ СНИЗУ ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="h-8"
          disabled={page.page <= 1}
          onClick={() => go({ kpage: String(page.page - 1) })}
          size="sm"
          variant="secondary"
        >
          {words.prev}
        </Button>
        <span className="text-muted-foreground text-[0.8em]">
          {words.page.replace("{p}", String(page.page)).replace("{t}", String(page.pages))}
        </span>
        <Button
          className="h-8"
          disabled={page.page >= page.pages}
          onClick={() => go({ kpage: String(page.page + 1) })}
          size="sm"
          variant="secondary"
        >
          {words.next}
        </Button>

        <select
          className="border-border bg-background ml-auto h-8 rounded-md border px-2 text-[0.85em]"
          onChange={e => go({ kper: e.target.value })}
          value={page.per}
        >
          {KNOWN_PER_PAGE.map(n => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <Button className="h-8" onClick={() => setAsk(true)} size="sm" variant="ghost">
          {words.askBot}
        </Button>
      </div>

      {ask && (
        <div className="border-border bg-muted/30 rounded-md border p-3 text-[0.85em]">
          <p className="font-medium">{words.askBotTitle}</p>
          <p className="text-muted-foreground mt-1">{words.askBotBody}</p>
          <p className="text-muted-foreground mt-1">{words.askBotWhy}</p>
          <Button className="mt-2 h-7" onClick={() => setAsk(false)} size="sm" variant="secondary">
            {words.askBotClose}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Одна строка таблицы. Правка живёт здесь и никуда не уезжает до нажатия. */
function Line({
  busy,
  draft,
  onChange,
  onSave,
  row,
  words,
}: {
  busy: boolean;
  draft: string | undefined;
  onChange: (v: string) => void;
  onSave: () => void;
  row: KnownRow;
  words: Words;
}) {
  const editing = draft !== undefined;
  return (
    <tr className="border-border border-t align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{row.title}</div>
        <div className="text-muted-foreground text-[0.9em]">{row.key}</div>
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              className="h-7 w-48 text-[0.95em]"
              onChange={e => onChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") onSave();
              }}
              value={draft}
            />
            <Button className="h-7" disabled={busy} onClick={onSave} size="sm">
              {busy ? words.saving : words.save}
            </Button>
          </div>
        ) : (
          <button
            className="text-left hover:underline"
            onClick={() => onChange(row.value ?? "")}
            type="button"
          >
            {/* 🔒 ПУСТОЕ ГОВОРИТ «ПОКА НЕ ЗНАЮ» И НИЧЕГО НЕ ПОКАЗЫВАЕТ.
                🪦 ЗДЕСЬ СТОЯЛ ПРИМЕР СЕРЫМ КУРСИВОМ, и рядом — комментарий, что
                это НЕ подстановка. Замысел был верен, а исполнение провалилось на
                единственной проверке, которая считается: владелец открыл экран
                2026-09-09, увидел в колонке значений своё имя, свой город и свой
                проект — и спросил, откуда данные, при ПУСТОЙ базе и счётчике
                «заполнено: 0». Примеры были написаны его подробностями, то есть
                досье уезжало в посевном каждому новому боту.
                🔒 УРОК ШИРЕ СЛУЧАЯ: серый курсив — это НЕ подпись. Отличать
                пример от данных обязана СТРУКТУРА (своя колонка, свой ярлык), а
                не оформление, которое читатель должен правильно истолковать.
                Пример жив и показывается там, где назван словом «Пример»:
                `facts-registry.tsx` и подсказкой внутри пустого поля ввода. */}
            {row.value ?? (
              <span className="text-muted-foreground italic">{words.valueEmpty}</span>
            )}
          </button>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {row.tags.map(t => (
            <span className="border-border rounded-full border px-1.5 py-0.5 text-[0.8em]" key={t}>
              {t}
            </span>
          ))}
        </div>
      </td>
      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
        {row.at ? `${words.since} ${row.at.slice(0, 16).replace("T", " ")}` : "—"}
      </td>
      <td className="text-muted-foreground max-w-[22rem] px-3 py-2">{row.what}</td>
    </tr>
  );
}
