#!/usr/bin/env node
// ПРИБОРЫ ПОДШАГА 157-3 — ЧЕМ ЛОВИТСЯ МОЛЧАЛИВЫЙ ОБРЫВ WebSocket `/pty`.
//
// Разбор: development-docs/reports/
//   errors-terminal-socket-killed-by-next-upgrade-handler-and-resizeobserver-self-wake.md
//
// Запускать НА СЕРВЕРЕ, из /opt/fractera/telegrambot:
//   node development-docs/instruments/157-3-pty-upgrade-probes.mjs plain
//   node development-docs/instruments/157-3-pty-upgrade-probes.mjs badticket
//   node development-docs/instruments/157-3-pty-upgrade-probes.mjs loopback
//
// 🔒 ПОРЯДОК ЗАПУСКА — ЧАСТЬ ПРИБОРА, А НЕ ПОЖЕЛАНИЕ. Дефект, ради которого это
// писалось, перемежающийся: Next вешает свой обработчик `upgrade` из обработчика
// ПЕРВОГО HTTP-запроса. Значит проба сразу после `pm2 reload` проходит, а та же
// проба после загрузки страницы — нет. Чтобы мерить то, что видит человек:
//
//   curl -s -o /dev/null http://127.0.0.1:3600/ru     # прогреть, как браузер
//   node ... plain                                     # и только потом мерить
//
// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ ВСТРОЕН: `plain` НЕ шлёт `init` и обязан закрыться по
// сторожевому сроку — `1008 no-init` через ~10 000 мс. Ответ `1006` раньше срока
// значит, что сокет рвёт кто-то посторонний. Ответ «жив вечно» значит, что сломан
// сам сторожевой срок.

import WebSocket from "/opt/fractera/telegrambot/node_modules/ws/index.js";

const KIND = process.argv[2] || "plain";
const TARGETS = {
  badticket: "wss://chat.aifa.dev/pty",
  loopback: "ws://127.0.0.1:3600/pty",
  plain: "wss://chat.aifa.dev/pty",
};
const target = TARGETS[KIND] || TARGETS.plain;

const t0 = Date.now();
const log = [];
const at = (m) => log.push("+" + (Date.now() - t0) + "мс " + m);

const ws = new WebSocket(target);
const done = () => {
  console.log(KIND.padEnd(10) + target.padEnd(30) + " => " + log.join(" | "));
  process.exit(0);
};

ws.on("open", () => {
  at("OPEN");
  if (KIND === "plain") {
    at("init НЕ шлю — жду сторожевой срок");
    return;
  }
  // Заведомо негодный билет: мост обязан назвать причину в журнале и закрыть
  // соединение кодом 1008. Это проверка того, что кадры клиент→сервер доходят.
  ws.send(JSON.stringify({ mode: "system", ticket: "ZAVEDOMO-PLOHOJ", type: "init" }));
  at("init с негодным билетом послан");
});
ws.on("message", (d) => at("MSG " + String(d).length + "б"));
ws.on("error", (e) => at("ОШИБКА " + e.message));
ws.on("close", (c, r) => {
  at("CLOSE code=" + c + " reason=" + (r && r.length ? r.toString() : "нет"));
  done();
});
setTimeout(done, 12_000);

// ── КАК ЧИТАТЬ ОТВЕТ ────────────────────────────────────────────────────────
//
// plain, здоровая служба:      OPEN | MSG 28б | +10 2xx мс CLOSE 1008 no-init
// plain, сокет рвёт чужой:     OPEN | MSG 28б | +3…30 мс   CLOSE 1006 нет
// badticket, здоровая служба:  OPEN | MSG 28б | CLOSE 1008 bad-ticket
// badticket, кадры не доходят: OPEN | MSG 28б | CLOSE 1006 нет   ← сравнить с loopback
//
// Журнал моста в ту же минуту:
//   grep "\[pty\]" /root/.pm2/logs/fractera-telegrambot-error.log | tail -12
// Строка «входящее N байт» отвечает на вопрос «дошёл ли кадр клиента»;
// её отсутствие при живом соединении и есть тот самый молчаливый отказ.
//
// ── ЛОВУШКА НА ЗАКРЫВАЮЩЕГО (в код НЕ возвращать, ставить временно) ─────────
//
// В `server.mjs`, в ветке `/pty` ДО `wss.handleUpgrade`:
//
//   const nm = (t) => process.stderr.write("[pty] СОКЕТ " + t + ": " +
//     new Error("trace").stack.split("\n").slice(1, 7).join(" << ") + "\n");
//   const origEnd = socket.end.bind(socket);
//   socket.end = (...a) => { nm("end"); return origEnd(...a); };
//   const origDestroy = socket.destroy.bind(socket);
//   socket.destroy = (...a) => { nm("destroy"); return origDestroy(...a); };
//
// 🛑 Снимать сразу, как назвала имя: она подменяет методы сокета в основании
// службы. Именно она за одну попытку показала `NextCustomServer.upgradeHandler`
// там, где пять версий подряд ошибались.
