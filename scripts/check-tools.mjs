// СТОРОЖ РЕЕСТРА ИНСТРУМЕНТОВ — РАЗМЕТКА И ОБЯЗАТЕЛЬНЫЕ ПОЛЯ (157-4).
//
// 🔒 ЗАЧЕМ ОН ЗАВЕДЁН. У реестра признаков сторож стоял внутри `build` с
// 2026-09-06, у реестра инструментов не было НИКАКОГО. Измерено 2026-09-07:
// два корпуса об одном и том же — «что у нас есть» — и правило только у одного.
// Правило, действующее на половину корпуса, читается как разрешение выбирать.
//
// 🔒 ТРИ ВЕРДИКТА, А НЕ ДВА (закон шага 64): законно · исключение · долг.
// Четыре записи заведены до правила о разметке; объявить их нарушителями значило
// бы уронить сборку в день его введения, простить исключением — купить зелёный
// цвет. Они ДОЛГ: печатаются при каждом прогоне и закрываются владельцем.
//
// 🛑 ЗАПУСКАЕТСЯ В `build`: расхождение обязано ронять сборку, а не печататься
// в лог, который никто не читает.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/**
 * Достать `as const`-список из исходника по имени.
 *
 * 🔒 РАЗБОР БЕЗ РЕГУЛЯРНЫХ ВЫРАЖЕНИЙ — приём взят у соседнего сторожа дословно,
 * а не изобретён: шаблонная строка там однажды съела обратные слэши молча.
 */
function listFrom(path, name) {
  const src = read(path);
  const at = src.indexOf(`export const ${name}`);
  if (at < 0) {
    throw new Error(`не найден список ${name} в ${path}`);
  }
  const open = src.indexOf("[", at);
  const close = src.indexOf("]", open);
  const body = src.slice(open + 1, close);
  const out = [];
  let i = 0;
  while (i < body.length) {
    const q = body.indexOf(String.fromCharCode(34), i);
    if (q < 0) {
      break;
    }
    const e = body.indexOf(String.fromCharCode(34), q + 1);
    if (e < 0) {
      break;
    }
    out.push(body.slice(q + 1, e));
    i = e + 1;
  }
  return out;
}

const EXCEPTIONS = [];

// 🔒 ДОЛГИ — ПУСТОЙ СПИСОК С ОБЪЯСНЕНИЕМ, А НЕ ОТСУТСТВУЮЩИЙ МЕХАНИЗМ.
const DEBTS = [];

// Записи, существовавшие в день введения правила о разметке.
const BASELINE = new Set([
  "inbox-store",
  "fact-matcher",
  "registry-evolution",
  "link-finder",
]);

const TAGS = new Set(listFrom("lib/registry/tags.ts", "REGISTRY_TAGS"));
const cfg = JSON.parse(read("TOOLS-CONFIG/tools-config.json"));
const tools = cfg.tools ?? [];

const nonEmptyStrings = (v) =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every((x) => typeof x === "string" && x.trim().length > 0);

let bad = 0;
let unmarked = 0;

// Дубли идентификаторов: две правды об одном инструменте.
const ids = tools.map((t) => t.id);
const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
if (dup.length) {
  bad += 1;
  console.error(`✗ повторяющиеся id: ${[...new Set(dup)].join(", ")}`);
}

for (const t of tools) {
  // Обязательное у любой записи: без имени и без «что это» инструмент не
  // отличим от соседнего ни человеком, ни машиной.
  for (const field of ["id", "name", "what"]) {
    if (typeof t[field] !== "string" || t[field].trim() === "") {
      bad += 1;
      console.error(`✗ ${t.id ?? "(без id)"}: нет обязательного поля \`${field}\``);
    }
  }

  const problems = [];
  if (!nonEmptyStrings(t.tags)) {
    problems.push("нет `tags` (1–3 из закрытого словаря)");
  } else {
    const alien = t.tags.filter((x) => !TAGS.has(x));
    if (alien.length) {
      // 🛑 ЧУЖОЙ ТЕГ — ВСЕГДА ОТКАЗ, ДАЖЕ У СТАРОЙ ЗАПИСИ. Отсутствие тега это
      // долг; выдуманный тег — уже расхождение со словарём, то есть фильтр,
      // который молча ничего не находит.
      bad += 1;
      console.error(`✗ ${t.id}: тег вне словаря — ${alien.join(", ")}`);
      console.error(`  Лечение: взять из lib/registry/tags.ts (${[...TAGS].join(" · ")}).`);
    }
  }
  if (!nonEmptyStrings(t.triggers)) {
    problems.push("нет `triggers` (слова, которыми это просит человек)");
  }
  if (!nonEmptyStrings(t.answers)) {
    problems.push("нет `answers` (какую задачу закрывает)");
  }
  if (problems.length === 0) {
    continue;
  }
  if (BASELINE.has(t.id)) {
    unmarked += 1;
    continue;
  }
  bad += 1;
  console.error(`✗ ${t.id}: запись заведена без разметки — ${problems.join("; ")}`);
  console.error("  Лечение: навык `create-registry-entry`, раздел 2.");
}

if (unmarked) {
  DEBTS.push(
    `разметка (tags/triggers/answers) отсутствует у ${unmarked} из ${BASELINE.size} инструментов, заведённых до 2026-09-07 — механическим поиском они не находятся`
  );
}

console.log(`\nисключения (${EXCEPTIONS.length}):`);
for (const e of EXCEPTIONS) {
  console.log(`  · ${e}`);
}
console.log(`долги (${DEBTS.length}):`);
for (const d of DEBTS) {
  console.log(`  ! ${d}`);
}

if (bad) {
  console.error(`\n✗ реестр инструментов нарушен в ${bad} мест(ах) — сборка остановлена`);
  process.exit(1);
}
console.log(`\n✓ реестр инструментов в порядке: записей ${tools.length}`);
