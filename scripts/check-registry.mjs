#!/usr/bin/env node
// СТОРОЖ РЕЕСТРА — СВЕРЯЕТ СПИСКИ КОДА С ЗАПИСЯМИ КОНФИГА.
//
// 🔒 ЗАЧЕМ ОН СУЩЕСТВУЕТ. 2026-09-06 записи реестра переехали из кода в
// `REGISTRY-CONFIG/registry-config.json`, и прежний закон «встроенные
// порождаются из кода» отменён владельцем. Но ПРИЧИНА того закона осталась:
// пять списков живут в коде, потому что объявлены `as const` и порождают типы
// (`Intent`, `EntryKind`, `ArrivalKind`). Перенеси их в JSON — и опечатка в
// намерении перестанет ловиться проверкой типов.
//
// Значит список и реестр — два места об одном, и они РАЗОЙДУТСЯ МОЛЧА: кто-то
// добавит род сущности в код, забудет описать его в реестре, и система начнёт
// делать то, чего в реестре нет. Этот сторож делает расхождение громким.
//
// 🔒 ТРИ ВЕРДИКТА, А НЕ ДВА. Законно · исключение (правило сюда не относится,
// причина названа ниже) · долг (относится, нарушено, решает владелец). Сторож с
// двумя вердиктами в доме, который строили до него, либо врёт зелёным, либо не
// включается вовсе.
//
// 🛑 ЗАПУСКАЕТСЯ В `prebuild`: расхождение обязано ронять сборку, а не
// печататься в лог, который никто не читает.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/** Достать `as const`-список из исходника по имени. Порядок не важен, состав — да. */
function listFrom(path, name) {
  const src = read(path);
  const at = src.indexOf(`export const ${name}`);
  if (at < 0) {
    throw new Error(`не найден список ${name} в ${path}`);
  }
  const open = src.indexOf("[", at);
  const close = src.indexOf("]", open);
  if (
    open < 0 ||
    close < 0 ||
    !src.slice(close, close + 40).includes("as const")
  ) {
    throw new Error(`${name} в ${path} не является as const-списком`);
  }
  // 🔒 РАЗБОР БЕЗ РЕГУЛЯРНЫХ ВЫРАЖЕНИЙ — НАМЕРЕННО. Шаблонная строка уже один
  // раз съела обратные слэши молча, и regexp превратился в другой regexp,
  // который исправно работал бы на чём-то другом. Скан по кавычкам не
  // экранируется вовсе, а значит и ломаться там нечему.
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

// Пара «список в коде → префикс ключа в реестре».
const PAIRS = [
  {
    name: "INITIATORS",
    path: "lib/products/telegram-desk/initiators.ts",
    prefix: "initiator",
  },
  {
    name: "ARRIVAL_KINDS",
    path: "lib/products/telegram-desk/arrival-kinds.ts",
    prefix: "material",
  },
  {
    name: "INTENTS",
    path: "lib/products/telegram-desk/route-intent.ts",
    prefix: "intent",
  },
  {
    name: "ENTRY_KINDS",
    path: "lib/products/telegram-desk/branches/capture.ts",
    prefix: "entity",
  },
  {
    name: "ARTIFACT_KINDS",
    path: "lib/products/telegram-desk/artifact-kinds.ts",
    prefix: "destination",
  },
];

// 🔒 ИСКЛЮЧЕНИЯ — С ПРИЧИНОЙ, А НЕ СПИСКОМ ПРОЩЁННЫХ. Уровень `field` описывает
// колонки таблицы сообщений: колонка — не список, из неё нельзя вывести смысл, и
// сверять её не с чем. Расхождение здесь ловится глазами: колонка есть, признака
// нет — значит поле заполняется и никем не объявлено.
const EXCEPTIONS = [
  "уровень `field` — колонки `tgdesk_messages`, списка-источника не существует",
];

// 🔒 ДОЛГИ — ПУСТОЙ СПИСОК С ОБЪЯСНЕНИЕМ, А НЕ ОТСУТСТВУЮЩИЙ МЕХАНИЗМ. Следующая
// находка встанет сюда, а не будет прощена исключением.
const DEBTS = [];

const cfg = JSON.parse(read("REGISTRY-CONFIG/registry-config.json"));
const keys = new Set((cfg.facts ?? []).map((f) => f.key));

let bad = 0;
for (const { name, path, prefix } of PAIRS) {
  const list = listFrom(path, name);
  const missing = list.filter((v) => !keys.has(`${prefix}.${v}`));
  const orphan = [...keys]
    .filter((k) => k.startsWith(`${prefix}.`))
    .map((k) => k.slice(prefix.length + 1))
    .filter((v) => !list.includes(v));

  if (missing.length) {
    bad += 1;
    console.error(`✗ ${name} (${path}): в коде есть, в реестре НЕТ —`);
    for (const v of missing) {
      console.error(`    ${prefix}.${v}`);
    }
    console.error(
      "  Лечение: описать запись в REGISTRY-CONFIG/registry-config.json (см. README)."
    );
  }
  if (orphan.length) {
    bad += 1;
    console.error(`✗ ${name} (${path}): в реестре есть, в коде НЕТ —`);
    for (const v of orphan) {
      console.error(`    ${prefix}.${v}`);
    }
    console.error(
      "  Лечение: либо добавить значение в список кода, либо убрать запись из реестра."
    );
  }
  if (!missing.length && !orphan.length) {
    console.log(`✓ ${name} — ${list.length} значений, все описаны в реестре`);
  }
}

// ОХВАТ ССЫЛАЕТСЯ НА СУЩЕСТВУЮЩИЙ КЛЮЧ РЕЕСТРА (141-1).
//
// 🔒 ПОЧЕМУ СБОРКА, А НЕ ЭКРАН. Охват — это часть КЛЮЧА, по которому факт потом
// ищут: `scope` на несуществующий признак даёт условие, которому никогда ничего
// не удовлетворит, и выглядит это как «данных нет», а не как опечатка. Отказ на
// сборке дешевле пустой выдачи через неделю.
//
// 🔒 ССЫЛКА НА САМОГО СЕБЯ ЗАПРЕЩЕНА ОТДЕЛЬНО: она формально существует и
// бессмысленна — факт, верный при самом себе, не сужает ничего.
for (const f of cfg.facts ?? []) {
  for (const key of f.scope ?? []) {
    if (key === f.key) {
      bad += 1;
      console.error(`✗ ${f.key}: охват ссылается сам на себя`);
      continue;
    }
    if (!keys.has(key)) {
      bad += 1;
      console.error(`✗ ${f.key}: охват ссылается на «${key}» — записи с таким ключом в реестре НЕТ`);
      console.error(
        "  Лечение: описать признак-измерение в реестре либо убрать ключ из scope."
      );
    }
  }
}

// Дубли ключей: две правды об одном признаке.
const all = (cfg.facts ?? []).map((f) => f.key);
const dup = all.filter((k, i) => all.indexOf(k) !== i);
if (dup.length) {
  bad += 1;
  console.error(
    `✗ повторяющиеся ключи в реестре: ${[...new Set(dup)].join(", ")}`
  );
}

// ── РАЗМЕТКА ЗАПИСИ: `tags`, `triggers`, `answers` (157-4, паспорт §3о) ──────
//
// 🔒 ЗАЧЕМ ОНА ПРОВЕРЯЕТСЯ СБОРКОЙ. По этим трём полям запись находит МАШИНА,
// без вызова модели. Пустое поле не ломает ничего сегодня и делает запись
// ненаходимой навсегда: её отыщет только тот, кто помнит ключ наизусть. Отказ
// на сборке дешевле, чем «система не знает» через месяц.
//
// 🔒 РАЗМЕТКА ОБЯЗАТЕЛЬНА ДЛЯ ВСЕХ ЗАПИСЕЙ БЕЗ ИСКЛЮЧЕНИЙ. Правило пришло
// реестр, где 35 записей заведены без него. Объявить их нарушителями значило бы
// уронить сборку в день введения правила; простить исключением — купить зелёный
// цвет. Поэтому они ДОЛГ: печатаются при каждом прогоне, с датой, и закрывает
// их владелец. Всё, что заведено ПОСЛЕ, обязано быть законным сразу.


// Словарь тегов берётся из кода тем же приёмом, что и остальные списки: он
// `as const`, из него порождаются типы, и опечатка ловится проверкой типов.
const TAGS = new Set(listFrom("lib/registry/tags.ts", "REGISTRY_TAGS"));

const nonEmptyStrings = (v) =>
  Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.trim().length > 0);


for (const f of cfg.facts ?? []) {
  const problems = [];
  if (!nonEmptyStrings(f.tags)) {
    problems.push("нет `tags` (1–3 из закрытого словаря)");
  } else {
    const alien = f.tags.filter((t) => !TAGS.has(t));
    if (alien.length) {
      // 🛑 ЧУЖОЙ ТЕГ — ВСЕГДА ОТКАЗ, ДАЖЕ У СТАРОЙ ЗАПИСИ. Отсутствие тега это
      // долг; выдуманный тег — уже расхождение со словарём, то есть фильтр,
      // который молча ничего не находит.
      bad += 1;
      console.error(`✗ ${f.key}: тег вне словаря — ${alien.join(", ")}`);
      console.error(`  Лечение: взять из lib/registry/tags.ts (${[...TAGS].join(" · ")}).`);
    }
  }
  if (!nonEmptyStrings(f.triggers)) {
    problems.push("нет `triggers` (слова, которыми это называет человек)");
  }
  if (!nonEmptyStrings(f.answers)) {
    problems.push("нет `answers` (на какой вопрос отвечает)");
  }
  if (problems.length === 0) {
    continue;
  }
  bad += 1;
  console.error(`✗ ${f.key}: запись заведена без разметки — ${problems.join("; ")}`);
  console.error("  Лечение: навык `create-registry-entry`, раздел 2.");
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
  console.error(
    `\n✗ реестр и код разошлись в ${bad} мест(ах) — сборка остановлена`
  );
  process.exit(1);
}
console.log(`\n✓ реестр и код сходятся: записей в реестре ${all.length}`);
