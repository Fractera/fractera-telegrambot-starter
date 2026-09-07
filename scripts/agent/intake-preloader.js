#!/usr/bin/env node

//
// intake-preloader — MCP-сервер приёма входящих (шаг 133, 2026-09-05).
//
// ЧТО ОН ДЕЛАЕТ. Даёт агенту один инструмент: `intake`. Агент, получив от плагина
// каналов файл или сообщение, зовёт его вместо того, чтобы читать файл самому.
// Инструмент стучится в дверь `/api/intake` слота, та кладёт исходник в
// медиатеку, переводит его в текст внешней моделью, пишет в три хранилища — и
// возвращает агенту ГОТОВЫЙ ТЕКСТ. Байтов агент не видит.
//
// 🔒 ЗАЧЕМ ТАК, СЛОВА ВЛАДЕЛЬЦА: «чтобы Telegram нативно переопределял эту задачу
// в OpenAI и вызвал процесс, который вернёт: пользователь загрузил аудио, которое
// после транскрибации внешней моделью вернуло такой текст…». Три довода, каждый
// самостоятельный: лимит подписки не тратится на разбор медиа · у агента ровно
// один входной формат — текст · каждый инструмент делает своё.
//
// 🔒 БЕЗ ЕДИНОЙ ЗАВИСИМОСТИ, И ЭТО НЕ ЩЕГОЛЬСТВО. MCP по stdio — это построчный
// JSON-RPC; трёх методов (`initialize`, `tools/list`, `tools/call`) достаточно.
// Взять SDK из папки чужого плагина значило бы привязать нашу способность к его
// версии: он обновится в СОСЕДНЮЮ папку, и сервер молча перестанет запускаться.
//
// 🛑 ЗАПРЕТ, ПОВТОРЁННЫЙ ЗДЕСЬ НАМЕРЕННО: этот сервер НИЧЕГО не отвечает человеку
// и не трогает Telegram. Он только принимает. Ответ — следующий шаг, и дверь, в
// которую он стучится, тоже не умеет отвечать (`/api/intake`, а не `hook`).

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

const INTAKE_URL = process.env.INTAKE_URL || "http://127.0.0.1:3000/api/intake";
const REQUEST_URL =
  process.env.REQUEST_URL || "http://127.0.0.1:3000/api/intake/request";
const SECRET_FILE =
  process.env.INTAKE_SECRET_FILE || "/opt/fractera/app/.env.local";
const SECRET_NAME = "TELEGRAM_HOOK_SECRET";

// ── ДВЕРИ СВОЕЙ СЛУЖБЫ (155-7) ───────────────────────────────────────────────
//
// 🔒 ЭТИ ДВЕ ДВЕРИ ЖИВУТ НА 3600, А НЕ НА 3000, И ЭТО НЕ МЕЛОЧЬ РАЗМЕЩЕНИЯ.
// Приём выше (`INTAKE_URL`) до сих пор ходит на порт 3000 и читает секрет из
// `.env.local` СЛОТА — долг «дверь приёма переезжает внутрь службы» назван в
// паспорте 2026-09-06. Новое кладём на своей стороне: служба обязана работать,
// когда слота нет вовсе.
// 🔒 СЕКРЕТ — ОБЩИЙ КЛЮЧ МАШИНЫ, а не новый: ключ, заведённый ради одной двери,
// надо кому-то выдавать и когда-то менять.
const SEPARATE_URL =
  process.env.SEPARATE_URL || "http://127.0.0.1:3600/api/agent/separate";
const CLOSE_URL =
  process.env.CLOSE_URL || "http://127.0.0.1:3600/api/agent/close";
const MACHINE_ENV_FILE =
  process.env.FRACTERA_MACHINE_ENV || "/etc/fractera/secrets.env";

function machineSecret() {
  try {
    for (const line of fs.readFileSync(MACHINE_ENV_FILE, "utf8").split(String.fromCharCode(10))) {
      const i = line.indexOf("=");
      if (i > 0 && line.slice(0, i).trim() === "DATA_SECRET") {
        return line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch (e) {
    // Файла нет — законное состояние на машине разработчика.
  }
  return "";
}

// 🔒 СВОЙ ОТПРАВИТЕЛЬ, А НЕ ПРАВКА `postJson`. Тот требует секрет СЛОТА и
// обслуживает работающий путь приёма; добавив туда ветку, я тронул бы то, что
// сегодня носит все сообщения владельца, ради двух новых дверей.
function postOwn(url, payload) {
  return new Promise((resolve) => {
    const key = machineSecret();
    if (!key) {
      return resolve({ ok: false, error: "no-machine-secret" });
    }
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const body = JSON.stringify(payload);
    const req = lib.request(
      {
        headers: {
          "content-length": Buffer.byteLength(body),
          "content-type": "application/json",
          "x-data-secret": key,
        },
        hostname: u.hostname,
        method: "POST",
        path: u.pathname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
      },
      (res) => {
        let buf = "";
        res.on("data", (d) => { buf += d; });
        res.on("end", () => {
          try { resolve(JSON.parse(buf)); }
          catch { resolve({ ok: false, error: "bad-answer", status: res.statusCode }); }
        });
      },
    );
    req.on("error", (e) => resolve({ ok: false, error: String(e.message) }));
    req.write(body);
    req.end();
  });
}

/**
 * Секрет читается ИЗ ФАЙЛА, а не из окружения процесса.
 *
 * 🔒 ИЗМЕРЕНО, А НЕ ВЫВЕДЕНО: слот собран отдельным процессом и `.env.local` в
 * `process.env` не подтягивает — тот же приём уже применён в `parsePaused()` и в
 * чтении ключа OpenAI. Сервер MCP запускается агентом, у которого окружения слота
 * нет вовсе.
 * 🔒 БЕЗ КЭША: секрет могут сменить между сообщениями, и закэшированное значение
 * означало бы перезапуск ради галочки.
 */
function secret() {
  try {
    const raw = fs.readFileSync(SECRET_FILE, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${SECRET_NAME}\\s*=\\s*(.*)$`));
      if (m) {
        return m[1].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* файла нет — законный исход на чужой машине */
  }
  return "";
}

function postJson(url, payload) {
  return new Promise((resolve) => {
    const key = secret();
    if (!key) {
      return resolve({
        error: "no-secret",
        ok: false,
        reason: `TELEGRAM_HOOK_SECRET не найден в ${SECRET_FILE}`,
      });
    }

    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const body = JSON.stringify(payload);
    const req = lib.request(
      {
        headers: {
          "content-length": Buffer.byteLength(body),
          "content-type": "application/json",
          "x-channel-secret": key,
        },
        hostname: u.hostname,
        method: "POST",
        path: u.pathname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
      },
      (res) => {
        let buf = "";
        res.on("data", (d) => {
          buf += d;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(buf));
          } catch {
            resolve({
              error: "bad-answer",
              ok: false,
              reason: buf.slice(0, 300),
            });
          }
        });
      }
    );
    // 🔒 ТАЙМАУТ ЩЕДРЫЙ: внутри двери зрение или расшифровка, и девяносто секунд
    // там — законное время, а не признак поломки.
    req.setTimeout(180_000, () => {
      req.destroy();
      resolve({ error: "timeout", ok: false });
    });
    req.on("error", (e) =>
      resolve({ error: "network", ok: false, reason: String(e.message) })
    );
    req.write(body);
    req.end();
  });
}

// ---------- инструмент ----------

const TOOL = {
  description:
    "Принять входящее сообщение или файл во все хранилища проекта и получить обратно готовый текст. " +
    "ВЫЗЫВАЙ ЭТО ВМЕСТО ЧТЕНИЯ ФАЙЛА: голос будет расшифрован, изображение описано, документ прочитан " +
    "внешней моделью, исходник ляжет в медиатеку, а событие — в векторную память и граф знаний. " +
    "Возвращает текст для тебя; отвечать человеку этот инструмент не умеет и не должен.",
  inputSchema: {
    properties: {
      chat_id: {
        description: 'Идентификатор чата из тега <channel chat_id="...">',
        type: "string",
      },
      forwarded_from: {
        description: "Автор слов, если сообщение переслано",
        type: "string",
      },
      kind: {
        description:
          "text | voice | photo | document — чем сообщение было до разбора",
        type: "string",
      },
      message_id: {
        description: "message_id из тега — по нему повтор не задваивается",
        type: "string",
      },
      path: {
        description:
          "Путь к присланному файлу на диске (image_path или ответ download_attachment)",
        type: "string",
      },
      text: {
        description: "Текст сообщения. Для файла — подпись к нему, если была",
        type: "string",
      },
      who: {
        description: "Имя пользователя из того же тега, без @",
        type: "string",
      },
    },
    required: ["chat_id"],
    type: "object",
  },
  name: "intake",
};

async function runIntake(a) {
  const payload = {
    chatId: String(a.chat_id || ""),
    kind: String(a.kind || (a.path ? "document" : "text")),
    text: String(a.text || ""),
    who: String(a.who || ""),
  };
  if (a.message_id) {
    payload.externalId = `tg-${a.message_id}`;
  }
  if (a.forwarded_from) {
    payload.forwardedFrom = String(a.forwarded_from);
  }

  if (a.path) {
    let bytes;
    try {
      bytes = fs.readFileSync(a.path);
    } catch (e) {
      return `Файл не прочитан: ${String(e.message)}. Приём не выполнен.`;
    }
    // 🛑 ИМЯ ФАЙЛА — ЕДИНСТВЕННЫЙ ИСТОЧНИК РОДА на той стороне: по расширению
    // решается, звать ли зрение, расшифровку или чтение документа.
    payload.fileName = a.path.split("/").pop() || "file";
    payload.fileBase64 = bytes.toString("base64");
  }

  const r = await postJson(INTAKE_URL, payload);
  if (r?.ok !== true) {
    // 🔒 ОТКАЗ НАЗЫВАЕТСЯ ПРИЧИНОЙ. Агент прочитает это и скажет человеку, что
    // именно не сохранилось, вместо бодрого «готово».
    return (
      "Приём НЕ выполнен: " +
      String((r && (r.error || r.reason)) || "нет ответа") +
      (r?.reason ? ` (${String(r.reason).slice(0, 200)})` : "")
    );
  }
  return String(r.forAgent || "(дверь не вернула текст)");
}

const TOOL_REQUEST = {
  description:
    "Записать заявку на РАЗРАБОТКУ в приёмную проекта и получить её номер. " +
    "ВЫЗЫВАЙ ЭТО ВСЕГДА, когда человек просит что-то построить, изменить или починить в самом " +
    "приложении: страницу, кнопку, службу, отчёт. Разрабатывать тебе запрещено — ты записываешь " +
    "просьбу дословно и возвращаешь человеку имя файла, чтобы он запустил её через бота агента " +
    "разработки. Ничего при этом не строится и не начинается.",
  inputSchema: {
    properties: {
      text: {
        description: "Дословные слова человека о том, что он хочет",
        type: "string",
      },
      who: {
        description: 'Имя пользователя из тега <channel user="...">',
        type: "string",
      },
    },
    required: ["text"],
    type: "object",
  },
  name: "request_development",
};

async function runRequest(a) {
  const r = await postJson(REQUEST_URL, {
    channel: "Telegram",
    text: String(a.text || ""),
    who: String(a.who || ""),
  });
  if (r?.ok !== true) {
    return (
      "Заявка НЕ записана: " +
      String((r && (r.error || r.detail)) || "нет ответа") +
      ". Скажи человеку прямо, что просьба НЕ сохранена."
    );
  }
  // 🔒 ИМЯ ФАЙЛА — ГЛАВНОЕ В ОТВЕТЕ. Им человек называет заявку боту агента
  // разработки; ответ без имени превращает «записал» в обещание без следа.
  // 🔒 ТЕКСТ ЧЕЛОВЕКУ — ФОРМУЛИРОВКА ВЛАДЕЛЬЦА, ДОСЛОВНО (шаг 136, 2026-09-05).
  // В прежней редакции не было главного, что он потребовал сказать прямо:
  // «запустить разработку внутри этого чата вы не можете». Без этой фразы ответ
  // звучит как принятая к работе задача, и человек ждёт результата, которого не
  // будет.
  return [
    `Заявка записана: ${r.file}`,
    `В очереди заявок: ${r.pending === undefined ? "?" : r.pending}.`,
    "",
    "Скажи человеку ДОСЛОВНО это:",
    "Запустить разработку внутри этого чата вы не можете. Ваше задание перемещено в специальную",
    "папку, где хранятся предварительные заказы на разработку. Чтобы попросить агента-программиста",
    "принять этот документ в работу, перейдите в Telegram-бот агента разработки Fractera.",
    `Номер заявки: ${r.file}`,
    "",
    "Сам ты ничего не строил и не начинал.",
    // 🛑 ПЕРЕВОД СТРОКИ СОБИРАЕТСЯ КОДОМ, А НЕ ПИШЕТСЯ ESCAPE-ПОСЛЕДОВАТЕЛЬНОСТЬЮ.
    // ✗ оплачено четырежды за день: этот файл правился скриптом через цепочку
    // оболочек, и каждая съедала обратный слэш по-своему — в литерал попадал
    // НАСТОЯЩИЙ перевод строки, и файл переставал разбираться. Тот же приём уже
    // стоит в `envelope()` конвейера по той же причине.
  ].join(String.fromCharCode(10));
}

// ---------- инструменты первичной сепарации (155-7) ----------
//
// 🔒 РАЗБОР ДЕЛАЕТ АГЕНТ, А ИНСТРУМЕНТ ЗАПИСЫВАЕТ. Модель уже прочитала
// сообщение; второй разбор на стороне службы стоил бы второго вызова ради
// ответа, который есть, — и разошёлся бы с первым.
const TOOL_SEPARATE = {
  description:
    "ПЕРВЫМ ДЕЛОМ на каждое сообщение человека: назови его род. Возвращает строку о категории, " +
    "а для родов automation-read и automation-write — НОМЕР автоматизации, который назови человеку. " +
    "Повтор с тем же message_id второй автоматизации не заводит. " +
    "ЕСЛИ человек отвечает на ТВОЙ вопрос или уточняет уже заведённую работу — передай continues " +
    "с её номером: уточнение продолжает автоматизацию, а не заводит новую.",
  inputSchema: {
    properties: {
      kind: {
        description:
          "general (общий вопрос) | automation-read (вопрос к памяти) | automation-write (запрос на запись) | dev-request (просьба построить) | unparsed (разобрать не удалось)",
        type: "string",
      },
      continues: {
        description:
          "Номер уже заведённой автоматизации, если это сообщение — уточнение к ней или ответ на твой вопрос. Тогда охват и срок лягут в НЕЁ, а новая не заведётся. Несуществующий номер даст отказ.",
        type: "number",
      },
      lang: { description: "ru или en", type: "string" },
      message_id: { description: "message_id из тега — по нему повтор не задваивается", type: "string" },
      remind: {
        description:
          "Отложенное действие, если человек попросил напомнить: {text, due_at (UTC, ISO), tz (IANA, например Europe/Madrid)}. Без tz срок НЕ создаётся — спроси зону у человека.",
        type: "object",
      },
      scope: {
        description:
          "От чего зависит истинность: {\"geo.city\": \"Мадрид\"}. Назови, если человек указал место или другое условие.",
        type: "object",
      },
    },
    required: ["kind"],
    type: "object",
  },
  name: "separate",
};

const TOOL_CLOSE = {
  description:
    "Объявить, что работа закончена: род step (закрыт шаг цепочки) или whole (закрыта целиком). " +
    "Возвращает список решений с причинами — что система сделает и чего не станет делать. " +
    "Закрытие не наступает само: молчание человека закрытием НЕ является.",
  inputSchema: {
    properties: {
      automation_id: { description: "Номер автоматизации", type: "number" },
      fact_keys: { description: "Ключи сработавших признаков реестра", type: "array" },
      from_media: { description: "Было ли извлечение из фото, голоса или видео", type: "boolean" },
      has_next_step: { description: "Объявлена ли следующая ступень цепочки", type: "boolean" },
      kind: { description: "step | whole", type: "string" },
      messages: { description: "Сколько сообщений было в цепочке", type: "number" },
      missing_facts: { description: "Каких признаков не хватило при разборе", type: "array" },
      summary: { description: "Короткий пересказ работы своими словами", type: "string" },
      tools: { description: "Какие инструменты звались", type: "array" },
    },
    required: ["automation_id", "kind"],
    type: "object",
  },
  name: "close",
};

async function runSeparate(a) {
  const r = await postOwn(SEPARATE_URL, {
    continues: typeof a.continues === 'number' ? a.continues : undefined,
    kind: String(a.kind || ''),
    lang: a.lang === 'en' ? 'en' : 'ru',
    message_id: a.message_id ? String(a.message_id) : undefined,
    remind: a.remind || undefined,
    scope: a.scope || undefined,
  });
  // 🔒 ОТКАЗ НАЗЫВАЕТСЯ ПРИЧИНОЙ, а не превращается в бодрое «готово».
  if (r?.ok !== true) {
    return 'Сепарация НЕ выполнена: ' + String(r?.error || 'нет ответа');
  }
  const out = [r.line];
  if (r.automationId) {
    // 🔒 ТРИ ИСХОДА НАЗЫВАЮТСЯ РАЗНЫМИ СЛОВАМИ. «Продолжена» человеку надо
    // сказать иначе, чем «заведена»: иначе он решит, что у него две работы.
    const mark = r.continued ? ' (продолжена, та же работа)'
      : r.repeat ? ' (уже была заведена)'
      : ' (предварительно)';
    out.push('Автоматизация № ' + r.automationId + mark);
  }
  if (r.scopeKey) { out.push('Охват: ' + r.scopeKey); }
  if (r.scopeRefused) { out.push('Охват назван неполно — ключ не собран; спроси недостающее у человека.'); }
  if (r.scheduleId) { out.push('Напоминание поставлено, № ' + r.scheduleId); }
  if (r.scheduleRefused === 'no-tz') { out.push('Напоминание НЕ поставлено: не назван часовой пояс. Спроси, где человек находится.'); }
  if (r.scheduleRefused === 'no-due') { out.push('Напоминание НЕ поставлено: не назван срок.'); }
  return out.join(String.fromCharCode(10));
}

async function runClose(a) {
  const r = await postOwn(CLOSE_URL, a);
  if (r?.ok !== true) {
    return 'Закрытие НЕ выполнено: ' + String(r?.error || 'нет ответа');
  }
  const lines = ['Состояние: ' + r.state + '.'];
  for (const d of r.decisions || []) {
    lines.push((d.do ? 'ДА  ' : 'нет ') + d.action + ' — ' + d.why);
  }
  return lines.join(String.fromCharCode(10));
}
// ---------- MCP по stdio: построчный JSON-RPC ----------

// 🔒 СЧЁТЧИК ЖИВЫХ ВЫЗОВОВ — НЕ УКРАШЕНИЕ, А ЗАЩИТА ОТ ОБОРВАННОГО ПРИЁМА.
// ✗ измерено 2026-09-05: сервер выходил по закрытию stdin немедленно, и разбор,
// шедший в этот момент, обрывался на середине — файл уже лёг в медиатеку, а
// текст не вернулся никому. Разбор изображения идёт десятки секунд, и закрытие
// входа в эту секунду — обычное дело, а не редкость.
let inFlight = 0;
let stdinClosed = false;
function maybeExit() {
  if (stdinClosed && inFlight === 0) {
    process.exit(0);
  }
}

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}
function ok(id, result) {
  send({ id, jsonrpc: "2.0", result });
}
function fail(id, message) {
  send({ error: { code: -32_603, message }, id, jsonrpc: "2.0" });
}

async function handle(m) {
  // Уведомления идут без `id` и ответа НЕ ждут: ответить на них значит нарушить
  // протокол и получить разрыв соединения.
  if (m.id === undefined || m.id === null) {
    return;
  }

  if (m.method === "initialize") {
    return ok(m.id, {
      capabilities: { tools: {} },
      protocolVersion: m.params?.protocolVersion || "2024-11-05",
      serverInfo: { name: "intake-preloader", version: "1.0.0" },
    });
  }
  if (m.method === "tools/list") {
    return ok(m.id, { tools: [TOOL, TOOL_REQUEST, TOOL_SEPARATE, TOOL_CLOSE] });
  }
  if (m.method === "tools/call") {
    const p = m.params || {};
    const KNOWN = [TOOL.name, TOOL_REQUEST.name, TOOL_SEPARATE.name, TOOL_CLOSE.name];
    if (!KNOWN.includes(p.name)) {
      return fail(m.id, `unknown tool: ${p.name}`);
    }
    inFlight += 1;
    try {
      const args = p.arguments || {};
      const text =
        p.name === TOOL_REQUEST.name
          ? await runRequest(args)
          : p.name === TOOL_SEPARATE.name
            ? await runSeparate(args)
            : p.name === TOOL_CLOSE.name
              ? await runClose(args)
              : await runIntake(args);
      ok(m.id, { content: [{ text, type: "text" }] });
    } catch (e) {
      ok(m.id, {
        content: [{ text: `Приём упал: ${String(e?.message)}`, type: "text" }],
        isError: true,
      });
    } finally {
      inFlight -= 1;
      maybeExit();
    }
    return;
  }
  if (m.method === "ping") {
    return ok(m.id, {});
  }
  return fail(m.id, `method not found: ${m.method}`);
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  // 🔒 РАЗБОР ПОСТРОЧНЫЙ И С ХВОСТОМ: сообщение приезжает кусками, и половина
  // строки в конце куска — обычное дело, а не ошибка.
  let i = buf.indexOf("\n");
  while (i >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    i = buf.indexOf("\n");
    if (!line) {
      continue;
    }
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      continue;
    }
    handle(m);
  }
});
// 🔒 ЗАКРЫЛСЯ ВХОД — ДОЖДАТЬСЯ НЕЗАВЕРШЁННОГО И ТОЛЬКО ПОТОМ ВЫЙТИ. Ждать нового
// уже некого, но приём, начатый секунду назад, обязан дойти до конца: файл в
// медиатеке без записи в хранилищах — половина работы, и худшая её половина.
process.stdin.on("end", () => {
  stdinClosed = true;
  maybeExit();
});
