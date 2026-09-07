#!/usr/bin/env node
// ПРИБОР ПОДШАГА 157-5 — ЕДИНЫЙ ВХОД В РЕЕСТРЫ ПРОВЕРЯЕТСЯ ЦЕЛИКОМ.
//
// Запускать НА СЕРВЕРЕ, из /opt/fractera/telegrambot:
//   node development-docs/instruments/157-5-registry-access-probes.mjs
//
// 🔒 У КАЖДОГО СЛУЧАЯ НАЗВАН ОЖИДАЕМЫЙ ИСХОД, И ПРИБОР САМ СТАВИТ ВЕРДИКТ.
// Прибор, который просто печатает ответы, доказывает только то, что дверь
// отвечает: читать его выдачу глазами каждый раз никто не станет, и через месяц
// «я прогнал» будет значить «я запустил».
//
// 🔒 ПОЛОВИНА СЛУЧАЕВ — НЕГАТИВНЫЕ КОНТРОЛИ. Они обязаны ОТКАЗАТЬ; прибор, где
// всё зелёное только потому, что всё разрешено, зелёный по той же причине, что и
// сломанный.

import { readFileSync } from "node:fs";

const ENV = process.env.FRACTERA_MACHINE_ENV || "/etc/fractera/secrets.env";
const URL_ = process.env.REGISTRY_URL || "http://127.0.0.1:3600/api/agent/registry";

function machineSecret() {
  for (const line of readFileSync(ENV, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0 && line.slice(0, i).trim() === "DATA_SECRET") {
      return line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

const KEY = machineSecret();
if (!KEY) {
  console.error("нет DATA_SECRET — прибор не может постучаться в дверь");
  process.exit(1);
}

async function call(body, withKey = true) {
  const headers = { "Content-Type": "application/json" };
  if (withKey) headers["x-data-secret"] = KEY;
  const r = await fetch(URL_, { method: "POST", headers, body: JSON.stringify(body) });
  let json = null;
  try { json = await r.json(); } catch { json = null; }
  return { status: r.status, json };
}


/**
 * Сколько строк в журнале промахов.
 *
 * 🔒 ПЕТЛЯ ПРОВЕРЯЕТСЯ СЧЁТОМ СТРОК, А НЕ ТЕКСТОМ ОТВЕТА. ✗ оплачено в тот же
 * час: первая версия этого случая читала фразу «промах записан» из подсказки и
 * была ЗЕЛЁНОЙ, пока таблица оставалась пустой. Обещание в ответе и строка в
 * таблице — разные утверждения, и проверять надо второе.
 */
async function misses() {
  const r = await fetch(process.env.DATA_URL || 'http://localhost:3300/db/migrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Data-Secret': KEY },
    body: JSON.stringify({ sql: 'SELECT COUNT(*) AS n FROM registry_search_misses' }),
  });
  if (!r.ok) return -1;
  const j = await r.json();
  return Number(j?.rows?.[0]?.n ?? -1);
}

/** Случай: что шлём, чего ждём, и почему это важно. */
const CASES = [
  {
    name: "find: фраза человека находит признак места",
    body: { fn: "find", args: { corpus: "facts", query: "я на канарских островах" } },
    ok: (r) => r.json?.answer?.found === true && r.json.answer.items.some(i => i.key === "intent.where"),
  },
  {
    name: "find: просьба напомнить находит признак срока ПЕРВЫМ",
    body: { fn: "find", args: { corpus: "facts", query: "напомни мне через две минуты" } },
    ok: (r) => r.json?.answer?.items?.[0]?.key === "intent.schedule",
  },
  {
    name: "find: корпус инструментов ищет по разметке, а не по описанию",
    body: { fn: "find", args: { corpus: "tools", query: "куда падают сообщения" } },
    ok: (r) => r.json?.answer?.items?.[0]?.key === "inbox-store"
      && r.json.answer.items[0].tags.length > 0,
  },
  {
    name: "list: сужение тегом отдаёт только помеченные",
    body: { fn: "list", args: { corpus: "facts", tags: ["money"] } },
    ok: (r) => r.json?.answer?.found === true
      && r.json.answer.items.every(i => i.tags.includes("money")),
  },
  {
    name: "describe: тело записи и адрес происхождения",
    body: { fn: "describe", args: { corpus: "facts", key: "intent.where" } },
    ok: (r) => r.json?.answer?.found === true
      && typeof r.json.answer.where === "string"
      && r.json.answer.where.includes("registry-config.json#intent.where"),
  },
  {
    name: "recall: признак-ветвь честно говорит «не хранится»",
    body: { fn: "recall", args: { key: "intent.where" } },
    ok: (r) => r.json?.answer?.found === false
      && /не хранится|по устройству/.test(String(r.json.answer.hint)),
  },
  {
    name: "recall: признак-колонка отдаёт настоящие значения",
    body: { fn: "recall", args: { key: "field.money", limit: 3 } },
    ok: (r) => r.json?.answer?.found === true
      && r.json.answer.table === "tgdesk_messages"
      && Array.isArray(r.json.answer.items),
  },
  // ── НЕГАТИВНЫЕ КОНТРОЛИ ──────────────────────────────────────────────────
  {
    name: "НК: чужой корпус отвергается с перечислением",
    body: { fn: "find", args: { corpus: "vydumannyj", query: "что-нибудь" } },
    ok: (r) => r.json?.ok === false && r.json.error === "unknown-corpus",
  },
  {
    name: "НК: лишний параметр отвергается по имени",
    body: { fn: "find", args: { corpus: "facts", query: "деньги", subj: "кто-то" } },
    ok: (r) => r.json?.ok === false && r.json.error === "bad-args"
      && r.json.problems.some(p => p.includes("subj")),
  },
  {
    name: "НК: параметр не того типа отвергается",
    body: { fn: "find", args: { corpus: "facts", query: "деньги", limit: "много" } },
    ok: (r) => r.json?.ok === false && r.json.error === "bad-args",
  },
  {
    name: "НК: чужой примитив отвергается с перечислением известных",
    body: { fn: "delete", args: {} },
    ok: (r) => r.json?.ok === false && r.json.error === "unknown-fn"
      && Array.isArray(r.json.known),
  },
  {
    name: "НК: бессмыслица даёт промах, а не пустой успех",
    body: { fn: "find", args: { corpus: "facts", query: "квазиморфный блямс" } },
    ok: (r) => r.json?.answer?.found === false
      && Array.isArray(r.json.answer.searched) && r.json.answer.searched.length > 0,
  },
  {
    name: "НК: без ключа машины дверь отвечает 401",
    body: { fn: "list", args: { corpus: "facts" } },
    noKey: true,
    ok: (r) => r.status === 401,
  },
  {
    name: "НК: сужение по субъекту у признака-колонки отвергается с причиной",
    body: { fn: "recall", args: { key: "field.money", subject: "kto-to" } },
    ok: (r) => r.json?.answer?.found === false
      && /сужение/.test(String(r.json.answer.hint)),
  },
];


// ── ПЕТЛЯ ОБУЧЕНИЯ ПРОВЕРЯЕТСЯ ОТДЕЛЬНО: у неё есть ДО и ПОСЛЕ ──────────────
const beforeMisses = await misses();
const uniquePhrase = `квазиморфный блямс ${Date.now()}`;
await call({ fn: "find", args: { corpus: "facts", query: uniquePhrase } });
const afterMisses = await misses();
CASES.push({
  name: "петля обучения: строка ПОЯВИЛАСЬ в registry_search_misses",
  skipCall: true,
  ok: () => beforeMisses >= 0 && afterMisses === beforeMisses + 1,
  note: () => ` — было ${beforeMisses}, стало ${afterMisses}`,
});
CASES.push({
  name: "петля обучения: записана ИМЕННО промахнувшаяся фраза",
  skipCall: true,
  ok: async () => {
    const r = await fetch(process.env.DATA_URL || "http://localhost:3300/db/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Data-Secret": KEY },
      body: JSON.stringify({ sql: "SELECT COUNT(*) AS n FROM registry_search_misses WHERE query = ?", params: [uniquePhrase] }),
    });
    const j = await r.json();
    return Number(j?.rows?.[0]?.n ?? 0) === 1;
  },
});
let bad = 0;
for (const c of CASES) {
  let verdict = false;
  let note = "";
  try {
    const r = c.skipCall ? null : await call(c.body, !c.noKey);
    verdict = await c.ok(r);
    if (!verdict) note = c.note ? c.note() : ` — получено: ${String(JSON.stringify(r?.json ?? r?.status ?? "нет ответа")).slice(0, 160)}`;
  } catch (e) {
    note = ` — прибор упал: ${e.message}`;
  }
  if (!verdict) bad += 1;
  console.log(`${verdict ? "✓" : "✗"} ${c.name}${note}`);
}

console.log(`\n${bad === 0 ? "✓" : "✗"} случаев ${CASES.length}, провалено ${bad}`);
process.exit(bad === 0 ? 0 : 1);
