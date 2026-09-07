// ПОРОЖДЁННЫЙ УКАЗАТЕЛЬ ОБОИХ РЕЕСТРОВ (157-5, паспорт §3о и §4).
//
// 🔒 ЗАЧЕМ ОН СУЩЕСТВУЕТ. Тела записей лежат в конфигах и стоят дорого, если
// читать их ради вопроса «что у нас вообще есть». Указатель отвечает на этот
// вопрос строкой на запись: ключ · имя · теги · на какой вопрос отвечает ·
// слова человека · где лежит тело. Измерения — паспорт §4.
//
// 🔒 ГЕНЕРАТОР И СТОРОЖ — ОДИН ФАЙЛ, И ЭТО НЕ ЭКОНОМИЯ СТРОК. Две реализации
// одного расходятся молча: сторож начал бы считать свежим то, чего генератор уже
// не производит. Здесь `--check` пересобирает в памяти и сравнивает с диском.
//
// 🔒 ВЫВОД ДЕТЕРМИНИРОВАН: ни времени сборки, ни счётчиков прогонов. Метка
// времени в порождённом файле меняла бы его при каждой сборке — git показывал бы
// правку там, где ничего не менялось, а сравнение «свеж ли указатель»
// превратилось бы в сравнение часов.
//
// 🛑 РУКАМИ НЕ ПРАВИТЬ. Правка тела — в конфиге; указатель пересобирается
// `npm run build:index`.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/**
 * Оба корпуса описаны здесь и только здесь: имя, файл, как называются поля.
 *
 * 🔒 РАЗНЫЕ ИМЕНА ПОЛЕЙ У ДВУХ РЕЕСТРОВ (`key`/`id`, `title`/`name`) СВОДЯТСЯ
 * ЗДЕСЬ, А НЕ У ПОТРЕБИТЕЛЯ. Потребитель обязан видеть одну форму — иначе
 * «единый вход» существует только на словах.
 */
const CORPORA = [
  {
    corpus: "facts",
    source: "REGISTRY-CONFIG/registry-config.json",
    out: "REGISTRY-CONFIG/index.json",
    listKey: "facts",
    idField: "key",
    nameField: "title",
    whatField: "description",
  },
  {
    corpus: "tools",
    source: "TOOLS-CONFIG/tools-config.json",
    out: "TOOLS-CONFIG/index.json",
    listKey: "tools",
    idField: "id",
    nameField: "name",
    whatField: "what",
  },
];

/** Одна фраза «что это»: указатель не носит тел. */
function firstSentence(text) {
  const s = String(text ?? "").trim().replace(/\s+/g, " ");
  if (s === "") {
    return "";
  }
  const dot = s.search(/[.!?](\s|$)/);
  const cut = dot > 0 ? s.slice(0, dot + 1) : s;
  return cut.length > 80 ? `${cut.slice(0, 77)}…` : cut;
}

function buildOne(spec) {
  const cfg = JSON.parse(read(spec.source));
  const entries = (cfg[spec.listKey] ?? []).map((rec) => ({
    key: rec[spec.idField],
    name: rec[spec.nameField] ?? "",
    what: firstSentence(rec[spec.whatField]),
    tags: rec.tags ?? [],
    answers: rec.answers ?? [],
    triggers: rec.triggers ?? [],
  }));
  // 🔒 ПРОИСХОЖДЕНИЕ НЕ ПОВТОРЯЕТСЯ В КАЖДОЙ СТРОКЕ, И ЭТО ИЗМЕРЕНО. Закон ядра 2
  // требует, чтобы происхождение нёс ОТВЕТ примитива, а не файл: адрес тела
  // собирается из `source` заголовка и ключа. ✗ повтор занимал 13,5% указателя.
  const doc = {
    generated: true,
    doNotEdit: "порождается scripts/build-registry-index.mjs — правь исходный конфиг",
    corpus: spec.corpus,
    source: spec.source,
    count: entries.length,
    entries,
  };
  return { spec, text: `${JSON.stringify(doc, null, 2)}\n` };
}

const built = CORPORA.map(buildOne);
const checking = process.argv.includes("--check");

let stale = 0;
for (const { spec, text } of built) {
  if (!checking) {
    writeFileSync(join(root, spec.out), text);
    const bytes = Buffer.byteLength(text, "utf8");
    console.log(`✓ ${spec.out} — записей ${JSON.parse(text).count}, ${bytes} байт`);
    continue;
  }
  let onDisk = null;
  try {
    onDisk = read(spec.out);
  } catch {
    onDisk = null;
  }
  if (onDisk === null) {
    stale += 1;
    console.error(`✗ ${spec.out}: указателя нет вовсе`);
    continue;
  }
  if (onDisk !== text) {
    stale += 1;
    console.error(`✗ ${spec.out}: указатель устарел — конфиг правили, указатель не пересобрали`);
    continue;
  }
  console.log(`✓ ${spec.out} свеж`);
}

if (checking && stale) {
  console.error(`\n✗ указателей устарело: ${stale} — сборка остановлена`);
  console.error("  Лечение: npm run build:index, затем закоммитить оба указателя.");
  process.exit(1);
}
