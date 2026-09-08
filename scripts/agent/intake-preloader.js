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
const FEEDBACK_URL =
  process.env.FEEDBACK_URL || "http://127.0.0.1:3600/api/agent/feedback";
// 🔒 ОДНА ДВЕРЬ НА ЧЕТЫРЕ ПРИМИТИВА (157-5): имя примитива едет полем, а не
// адресом. Четыре адреса — четыре места, где разойдётся форма ответа.
const REGISTRY_URL =
  process.env.REGISTRY_URL || "http://127.0.0.1:3600/api/agent/registry";
// 🔒 ЯЩИК ПАМЯТИ — ОТДЕЛЬНАЯ ДВЕРЬ, А НЕ ПЯТЫЙ ПРИМИТИВ РЕЕСТРА (161-1). Реестр
// отвечает про ОПРЕДЕЛЕНИЯ (что система умеет вынуть), ящик — про ПАМЯТЬ о
// человеке (что известно, запиши, поправь, забудь). Другой предмет и другие
// глаголы; закон 158-5а запрещает вторую дверь к ТОМУ ЖЕ вопросу, а не к другому.
const MEMORY_URL =
  process.env.MEMORY_URL || "http://127.0.0.1:3600/api/agent/memory";
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
    "Закрытие не наступает само: молчание человека закрытием НЕ является. " +
    "О своей работе рассказывать НЕ НУЖНО: сколько было сообщений, какие признаки сработали и " +
    "какие инструменты звались, система берёт из СВОИХ записей о прогоне, а не с твоих слов (143-4).",
  inputSchema: {
    properties: {
      automation_id: { description: "Номер автоматизации", type: "number" },
      has_next_step: { description: "Объявлена ли следующая ступень цепочки", type: "boolean" },
      kind: { description: "step | whole", type: "string" },
      next_due_at: { description: "Когда должна случиться следующая ступень, ISO. Называет человек", type: "string" },
      next_tz: { description: "Часовой пояс ступени. Не сказан — вспомним сами, и только потом спросим", type: "string" },
      next_what: { description: "Что должно случиться на следующей ступени — словами человека", type: "string" },
      summary: { description: "Короткий пересказ работы своими словами", type: "string" },
    },
    required: ["automation_id", "kind"],
    type: "object",
  },
  name: "close",
};

// 🔒 ОТЗЫВ — ОТДЕЛЬНЫЙ ИНСТРУМЕНТ, А НЕ ПОЛЕ ЗАКРЫТИЯ (143-6). Закрытие лишь
// РЕШАЕТ, что отзыв уместен; спрашивает человека агент словами, и ответ
// приходит позже — иногда через несколько сообщений. Поле в закрытии заставило
// бы предсказать ответ до вопроса.
const TOOL_FEEDBACK = {
  description:
    "Записать отзыв человека о работе автоматизации: понравилось (liked) и/или нужно доработать " +
    "(needs_work), значения yes|no. Спрашивать отзыв нужно ТОЛЬКО когда закрытие вернуло решение " +
    "ask-feedback ДА. Второй раз за тот же номер не спрашивают: система это помнит.",
  inputSchema: {
    properties: {
      automation_id: { description: "Номер автоматизации", type: "number" },
      liked: { description: "Понравилось: yes | no", type: "string" },
      needs_work: { description: "Нужно доработать: yes | no", type: "string" },
      note: { description: "Слова человека к вердикту, если он их сказал", type: "string" },
    },
    required: ["automation_id"],
    type: "object",
  },
  name: "feedback",
};

async function runFeedback(a) {
  const r = await postOwn(FEEDBACK_URL, a);
  if (r?.ok !== true) {
    return 'Отзыв НЕ записан: ' + String(r?.error || 'нет ответа');
  }
  // 🔒 ГОВОРИМ ВСЛУХ, ЧТО ВОПРОС ЗАКРЫТ: иначе агент спросит ещё раз из вежливости.
  return 'Отзыв записан по автоматизации № ' + r.automationId +
    '. Понравилось: ' + String(r.liked ?? '—') + ', нужно доработать: ' + String(r.needsWork ?? '—') +
    '. Повторно спрашивать не нужно.';
}

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
  // 🔒 ИСХОД ПОБОЧНОГО ДЕЙСТВИЯ ПРОИЗНОСИТСЯ, А НЕ МОЛЧИТ (143-5). Решение «ДА
  // next-step» и заведённая ступень — разные утверждения: между ними стоит
  // часовой пояс, которого может не быть.
  if (r.nextStep) {
    lines.push(r.nextStep.id
      ? 'Следующая ступень № ' + r.nextStep.id + ' — ' + r.nextStep.why
      : 'Следующая ступень НЕ заведена: ' + r.nextStep.why);
  }
  // 🔒 ПРЕДЛОЖЕНИЕ ПРИЗНАКА ПРОИЗНОСИТСЯ ЧЕЛОВЕКУ, А НЕ ПРИМЕНЯЕТСЯ (143-7).
  // Реестр меняет он; наше дело — сказать, чего системе не хватило.
  for (const pr of r.proposals || []) {
    lines.push('Не хватило признака: «' + pr.said + '»' +
      (pr.candidateKey ? ' — предлагаю ключ ' + pr.candidateKey : ' — ключ придумать словами') +
      (pr.near && pr.near.length ? ' (рядом уже есть: ' + pr.near.join(', ') + ')' : '') +
      '. Завести? Реестр меняешь ты, не я.');
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

// ── ЕДИНЫЙ ВХОД В РЕЕСТРЫ: ЧЕТЫРЕ ПРИМИТИВА У АГЕНТА (157-5, паспорт §3о) ────
//
// 🔒 СХЕМЫ ИНСТРУМЕНТОВ ПОРОЖДАЮТСЯ ИЗ ОБЪЯВЛЕНИЯ, А НЕ ПИШУТСЯ ЗДЕСЬ. Единственный
// источник — `lib/registry/access-decl.mjs`; ту же проверку параметров исполняет
// дверь. Схема, написанная рядом с объявлением, разошлась бы с ним на первой
// правке параметра.
//
// 🔒 ЗАГРУЗКА ЛЕНИВАЯ, ЧЕРЕЗ `import()`: объявление — модуль ESM, а этот файл
// CommonJS. Переписать объявление под CommonJS значило бы либо потерять
// потребителя на TypeScript, либо завести вторую копию.
// 🔒 ТРИ ПРИМИТИВА РЕЕСТРА АГЕНТУ БОЛЬШЕ НЕ ПОКАЗЫВАЮТСЯ (161-6). Они живы и
// работают: их зовут экраны, приборы и разработка через дверь напрямую. Но у
// АГЕНТА к памяти остаётся один путь — четыре метода ящика.
// 🔒 ПРИЧИНА НЕ В ЧИСТОТЕ СПИСКА, А В ЦЕНЕ ВЫБОРА. Два пути к одному делу — это
// ход модели на решение «каким», причём решение с молчаливой ошибкой: записал
// старым способом — данные легли, но без рода записи и без маршрутизации.
// 🛑 ЭТО НЕ УДАЛЕНИЕ СПОСОБНОСТИ. Способность за дверью цела, и это проверяется
// приборами 161-2 и 161-4-5, которые зовут `registry_recall` и `registry_describe`.
const MEMORY_SUPERSEDED = ["registry_recall", "registry_remember", "registry_remember_many"];

let ACCESS = null;
async function accessModule() {
  if (!ACCESS) {
    const { pathToFileURL } = require("node:url");
    const path = require("node:path");
    const href = pathToFileURL(
      path.join(__dirname, "..", "..", "lib", "registry", "access-decl.mjs")
    ).href;
    const mod = await import(href);
    const shown = mod.ACCESS_FUNCTIONS.filter((d) => !MEMORY_SUPERSEDED.includes(d.name));
    ACCESS = {
      decls: mod.ACCESS_FUNCTIONS,
      tools: shown.map(mod.mcpToolFrom),
      validate: mod.validateArgs,
    };
  }
  return ACCESS;
}

// ── ЯЩИК ПАМЯТИ: ЧЕТЫРЕ МЕТОДА У АГЕНТА (161-1, стандарт памяти §10) ────────
//
// 🔒 В `tools/list` УЕЗЖАЮТ ТОЛЬКО ПОСТРОЕННЫЕ (`state: "live"`). Инструмент,
// который агент видит и не может использовать, хуже отсутствующего: он тратит
// ход модели на вызов и ход на разбор отказа.
//
// ✗ ЧЕМ ОПЛАЧЕНА ЭТА РЕГИСТРАЦИЯ. Дверь знаний 160-6 работала сутки, а
// инструмента `mcp__intake__knowledge`, который инструкция велела звать, здесь
// НЕ БЫЛО ВОВСЕ — прибор был зелёным, потому что звал дверь напрямую.
// 🔒 ПРИЁМ, КОТОРЫЙ ЭТО ЛОВИТ: спрашивать «кто её зовёт», а не «есть ли она», —
// и задавать этот вопрос про саму дверь, а не только про функцию за ней.
let MEMORY = null;
async function memoryModule() {
  if (!MEMORY) {
    const { pathToFileURL } = require("node:url");
    const path = require("node:path");
    const href = pathToFileURL(
      path.join(__dirname, "..", "..", "lib", "memory", "decl.mjs")
    ).href;
    const mod = await import(href);
    const live = mod.liveFunctions();
    MEMORY = {
      decls: live,
      tools: live.map(mod.mcpToolFrom),
      validate: mod.validateArgs,
    };
  }
  return MEMORY;
}

async function runMemory(name, args) {
  const m = await memoryModule();
  const decl = m.decls.find((d) => d.name === name);
  if (!decl) {
    return "Такого метода памяти нет: " + name;
  }
  const checked = m.validate(decl, args);
  if (!checked.ok) {
    return "Параметры не приняты:" + String.fromCharCode(10) +
      checked.problems.map((p) => "  · " + p).join(String.fromCharCode(10));
  }
  const r = await postOwn(MEMORY_URL, { args: checked.args, fn: decl.fn });
  if (!r || typeof r !== "object") {
    return "Память не ответила.";
  }
  if (r.ok !== true) {
    // 🔒 ОТКАЗ ПАМЯТИ ПЕРЕДАЁТСЯ СЛОВАМИ, А НЕ КОДОМ. Агент читает это как
    // указание, что делать дальше: назвать ключ, назвать якорь, пересказать
    // словами. Код ошибки ему сказать нечего.
    const bits = ["Не записано."];
    if (r.hint) bits.push(String(r.hint));
    if (Array.isArray(r.problems) && r.problems.length) {
      bits.push(r.problems.join("; "));
    }
    return bits.join(String.fromCharCode(10));
  }
  if (decl.fn === "write") {
    const where = r.where === "surroundings"
      ? "в знание об окружении"
      : "в личную память человека";
    const tail = r.hint ? String.fromCharCode(10) + r.hint : "";
    return "Записано " + where + "." + tail;
  }
  if (decl.fn === "read") {
    // 🔒 ОТВЕТ ЧИТАЕТСЯ ГЛАЗАМИ, А НЕ РАЗБИРАЕТСЯ ИЗ JSON. Модель, получившая
    // структуру, тратит ход на её пересказ себе; строка «ключ — значение (род)»
    // готова к употреблению сразу.
    const a = r.answer || {};
    const NL = String.fromCharCode(10);
    if (a.found !== true) {
      const lines = ["Пока ничего об этом не записано."];
      if (a.hint) lines.push(a.hint);
      if (a.deeper && a.deeper.available) {
        lines.push("Глубже: " + a.deeper.what + " — около " + a.deeper.cost_seconds + " с. " +
          "Спроси человека, ждать ли, и позови ещё раз с budget=deep.");
      }
      return lines.join(NL);
    }
    const rows = (a.items || []).map((v) => {
      // 🛑 РОД ЗАПИСИ ПЕЧАТАЕТСЯ ВСЕГДА, КОГДА ОН ЕСТЬ. Предположение, поданное
      // как факт, — это ровно та ложь, ради устранения которой заведён 161-2.
      const mark = v.claim === "guess"
        ? " [предположение: " + (v.basis || "основание не названо") + "]"
        : "";
      return "  " + (v.title || v.key) + ": " + JSON.stringify(v.value) + mark;
    });
    const head = "Известно (" + a.total + "):";
    const foot = a.deeper && a.deeper.available
      ? NL + "Глубже: " + a.deeper.what + " — около " + a.deeper.cost_seconds + " с (budget=deep)."
      : "";
    return [head].concat(rows).join(NL) + foot;
  }
  return JSON.stringify(r, null, 2);
}

/** Указатель одной строкой: ключ, имя, теги — и чем совпало, если это поиск. */
function pointerLine(p) {
  const bits = ["  " + p.key + " — " + p.name];
  if (p.tags && p.tags.length) {
    bits.push("[" + p.tags.join(" ") + "]");
  }
  if (p.why && p.why.length) {
    bits.push("← совпало: " + p.why.slice(0, 3).join(" · "));
  }
  return bits.join(" ");
}

async function runAccess(name, args) {
  const a = await accessModule();
  const decl = a.decls.find((d) => d.name === name);
  if (!decl) {
    return "Такого примитива нет: " + name;
  }
  // 🔒 ПРОВЕРКА НА ГРАНИЦЕ, ТЕМ ЖЕ ОБЪЯВЛЕНИЕМ, ЧТО И У ДВЕРИ. Отказ называет
  // причину: молчаливо отброшенный параметр выглядит как честный ответ по всем
  // данным, хотя сужение просто не применилось.
  const checked = a.validate(decl, args);
  if (!checked.ok) {
    return "Параметры не приняты:" + String.fromCharCode(10) +
      checked.problems.map((p) => "  · " + p).join(String.fromCharCode(10));
  }
  const r = await postOwn(REGISTRY_URL, { args: checked.args, fn: decl.fn });
  if (r?.ok !== true) {
    const extra = Array.isArray(r?.problems) ? " — " + r.problems.join("; ") : "";
    return "Реестр не ответил: " + String(r?.error || "нет ответа") + extra;
  }
  const ans = r.answer || {};
  if (ans.found !== true) {
    // 🔒 ПРОМАХ — ИСХОД, А НЕ ПУСТОТА: агент обязан увидеть, ПО ЧЕМУ искали, и
    // что делать дальше. Пустая строка читалась бы как «система не знает».
    const lines = ["Не найдено."];
    if (ans.searched && ans.searched.length) {
      lines.push("Искали по: " + ans.searched.join(", "));
    }
    if (ans.hint) {
      lines.push(ans.hint);
    }
    return lines.join(String.fromCharCode(10));
  }
  if (decl.fn === "describe") {
    return "Запись " + ans.where + String.fromCharCode(10) +
      JSON.stringify(ans.record, null, 2);
  }
  if (decl.fn === "recall") {
    const head = "Известно по признаку " + ans.key + " (таблица " + ans.table + "), всего " +
      ans.total + (ans.truncated ? ", показаны не все" : "");
    const rows = ans.items.map((v) =>
      "  #" + v.id + " " + JSON.stringify(v.value) +
      (v.subject ? " · чей: " + v.subject : "") +
      (v.scope ? " · где верно: " + v.scope : "") +
      (v.status ? " · " + v.status : "") +
      (v.at ? " · " + v.at : "")
    );
    return [head].concat(rows).join(String.fromCharCode(10));
  }
  const head = "Найдено " + ans.total + " в корпусе " + ans.corpus +
    (ans.truncated ? " (показаны не все — сузь запрос или подними limit)" : "");
  return [head].concat(ans.items.map(pointerLine)).join(String.fromCharCode(10));
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
    // 🔒 ЧЕТЫРЕ ПРИМИТИВА ДОСТУПА ПРИХОДЯТ ПОРОЖДЁННЫМИ ИЗ ОБЪЯВЛЕНИЯ (157-5),
    // а не перечисляются здесь: перечисление рядом с объявлением разошлось бы
    // с ним на первой правке параметра.
    const a = await accessModule();
    const mem = await memoryModule();
    return ok(m.id, {
      tools: [TOOL, TOOL_REQUEST, TOOL_SEPARATE, TOOL_CLOSE, TOOL_FEEDBACK]
        .concat(a.tools)
        .concat(mem.tools),
    });
  }
  if (m.method === "tools/call") {
    const p = m.params || {};
    const access = await accessModule();
    const memory = await memoryModule();
    const ACCESS_NAMES = access.tools.map((t) => t.name);
    const MEMORY_NAMES = memory.tools.map((t) => t.name);
    const KNOWN = [TOOL.name, TOOL_REQUEST.name, TOOL_SEPARATE.name, TOOL_CLOSE.name, TOOL_FEEDBACK.name]
      .concat(ACCESS_NAMES)
      .concat(MEMORY_NAMES);
    if (!KNOWN.includes(p.name)) {
      return fail(m.id, `unknown tool: ${p.name}`);
    }
    inFlight += 1;
    try {
      const args = p.arguments || {};
      const text = MEMORY_NAMES.includes(p.name)
        ? await runMemory(p.name, args)
        : ACCESS_NAMES.includes(p.name)
        ? await runAccess(p.name, args)
        : p.name === TOOL_REQUEST.name
          ? await runRequest(args)
          : p.name === TOOL_SEPARATE.name
            ? await runSeparate(args)
            : p.name === TOOL_CLOSE.name
              ? await runClose(args)
              : p.name === TOOL_FEEDBACK.name
                ? await runFeedback(args)
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
