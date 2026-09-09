#!/usr/bin/env node
//
// ПРИБОР 171-1, ВТОРАЯ ПЛОСКОСТЬ — ЦЕНА КАЖДОЙ ДВЕРИ НА СЛОВЕ «ПРИВЕТ».
//
// 🔒 ЗАЧЕМ ОН НУЖЕН РЯДОМ С ПРИБОРОМ ХОДОВ. Тот отвечает «сколько раз ходила
// модель», этот — «во что обошёлся каждый поход». Два разных вопроса: пятнадцать
// дешёвых ходов и три дорогих дают одну и ту же минуту, а чинятся по-разному.
//
// 🔒 ВСЕ ЗАМЕРЫ В ОДНОМ ЖИВОМ ПРОЦЕССЕ. ✗ оплачено 2026-09-09: замер через
// `execSync` мерил ХОЛОДНЫЙ СТАРТ NODE (1503 мс) и выдавал его за цену вызова.
//
// 🔒 НЕГАТИВНЫЙ КОНТРОЛЬ НАЗВАН ЗАРАНЕЕ: `memory_read` в том же прогоне обязан
// уложиться в 300 мс. Если медленным окажется ВСЁ, диагноз «дорога одна, а не
// система» неверен, и шаг 171 надо перепланировать. Контроль отличает больной
// орган от больного организма.

import { readFileSync } from "node:fs"
import http from "node:http"

const INTAKE_URL = "http://127.0.0.1:3000/api/intake"
const SEPARATE_URL = "http://127.0.0.1:3600/api/agent/separate"
const MEMORY_URL = "http://127.0.0.1:3600/api/agent/memory"

const CHAT_ID = "90413601"
const WORD = "привет"

function fromFile(path, name) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const i = line.indexOf("=")
      if (i > 0 && line.slice(0, i).trim() === name) {
        return line.slice(i + 1).trim().replace(/^["']|["']$/g, "")
      }
    }
  } catch {
    // законное состояние вне сервера
  }
  return ""
}

const MACHINE = fromFile("/etc/fractera/secrets.env", "DATA_SECRET")
const SLOT = fromFile("/opt/fractera/app/.env.local", "TELEGRAM_HOOK_SECRET")

function post(url, payload, header, key) {
  const started = Date.now()
  return new Promise((resolve) => {
    const u = new URL(url)
    const body = JSON.stringify(payload)
    const req = http.request(
      {
        headers: {
          "content-length": Buffer.byteLength(body),
          "content-type": "application/json",
          [header]: key,
        },
        hostname: u.hostname,
        method: "POST",
        path: u.pathname,
        port: u.port,
        timeout: 120000,
      },
      (res) => {
        let buf = ""
        res.on("data", (d) => { buf += d })
        res.on("end", () => {
          let parsed = null
          try { parsed = JSON.parse(buf) } catch { /* дверь ответила не JSON */ }
          resolve({ ms: Date.now() - started, status: res.statusCode, body: parsed, raw: buf.slice(0, 160) })
        })
      },
    )
    req.on("timeout", () => { req.destroy(); resolve({ ms: Date.now() - started, status: 0, body: null, raw: "timeout" }) })
    req.on("error", (e) => resolve({ ms: Date.now() - started, status: 0, body: null, raw: String(e.message) }))
    req.write(body)
    req.end()
  })
}

function line(name, r) {
  // 🔒 ЧИТАЕМ ТЕЛО, А НЕ КОД HTTP. Слой данных отвечает `200` с `{ok:false}` на
  // отвергнутый запрос — «прошло» молча (закон 161).
  const ok = r.body && r.body.ok === true ? "ok" : r.body ? "ОТКАЗ:" + String(r.body.error || "?") : "нет JSON:" + r.raw
  console.log(`  ${name.padEnd(22)} ${String(r.ms).padStart(7)} мс   ${String(r.status).padEnd(4)} ${ok}`)
  return r.ms
}

const round = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0)

console.log("=".repeat(78))
console.log("ЦЕНА ОДНОГО СЛОВА «" + WORD + "» ПО ДВЕРЯМ — замер ДО починки, шаг 171-1")
console.log("секрет машины:", MACHINE ? "есть" : "НЕТ", "· секрет слота:", SLOT ? "есть" : "НЕТ")
console.log("=".repeat(78))

// Прогрев: первый запрос к любой службе платит за ленивую сборку маршрута Next.
await post(SEPARATE_URL, { kind: "general" }, "x-data-secret", MACHINE)

console.log("")
console.log("1) separate, род general — 3600, наша служба")
const sep = []
for (let i = 0; i < 3; i++) sep.push(line("separate #" + (i + 1), await post(SEPARATE_URL, { kind: "general" }, "x-data-secret", MACHINE)))

console.log("")
console.log("2) memory_read — 3600, НЕГАТИВНЫЙ КОНТРОЛЬ (обязан быть быстрым)")
const mem = []
for (let i = 0; i < 3; i++) mem.push(line("memory read #" + (i + 1), await post(MEMORY_URL, { fn: "read", args: { limit: 20 } }, "x-data-secret", MACHINE)))

console.log("")
console.log("3) intake — 3000, ЧУЖОЙ СЛОЙ: внутри два вызова gpt-4o-mini, вектор и граф")
const int = []
for (let i = 0; i < 3; i++) {
  const r = await post(
    INTAKE_URL,
    { chatId: CHAT_ID, externalId: "probe-171-1-" + Date.now() + "-" + i, kind: "text", text: WORD, who: "probe" },
    "x-channel-secret",
    SLOT,
  )
  line("intake #" + (i + 1), r)
  // 🔒 ОТКАЗ — НЕ ЗАМЕР. ✗ первая редакция прибора приняла `401 forbidden` за
  // «5 мс» и напечатала отношение «0×»: неверный заголовок выглядел как
  // мгновенная дверь. Негативный контроль сам нуждается в негативном контроле.
  if (r.body && r.body.ok === true) int.push(r.ms)
}

console.log("")
console.log("-".repeat(78))
console.log(
  "СРЕДНЕЕ:  separate " + round(sep) + " мс  ·  memory_read " + round(mem) + " мс  ·  intake " +
    (int.length ? round(int) + " мс (удачных " + int.length + " из 3)" : "НЕ ИЗМЕРЕН — дверь отказала"),
)
console.log("-".repeat(78))
if (int.length === 0) {
  console.log("🛑 ЦЕНА ПРИЁМА НЕ СНЯТА: ни один вызов не дал ok. Вывод о ней делать НЕЛЬЗЯ.")
}

const control = round(mem)
if (control === 0) {
  console.log("🛑 КОНТРОЛЬ НЕ СНЯТ: память не ответила — вывод о «медленной дороге» делать НЕЛЬЗЯ.")
  process.exit(2)
} else if (control > 300) {
  console.log("🛑 КОНТРОЛЬ КРАСНЫЙ: память тоже медленная (" + control + " мс). Медленна СИСТЕМА, а не одна дорога — шаг 171 надо перепланировать.")
  process.exit(3)
} else {
  console.log("✓ КОНТРОЛЬ ЗЕЛЁНЫЙ: память отвечает за " + control + " мс. Значит медленна ДОРОГА, а не система.")
  if (int.length) {
    console.log("  Отношение intake / memory_read = " + Math.round(round(int) / control) + "×")
  }
}
