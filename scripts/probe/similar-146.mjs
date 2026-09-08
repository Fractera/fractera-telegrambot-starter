// ПРИБОР ШАГА 146 — «похожие автоматизации»: вектор ПРЕДЛАГАЕТ, SQL ОТБИРАЕТ.
//
// Проверяет на живом складе: саммари ложится и находится по смыслу другими
// словами · порог отсекает постороннее · повторное закрытие обновляет запись,
// а не плодит вторую · типизированное в вектор НЕ едет.
//
// 🛑 ПИШЕТ В ЖИВОЙ СКЛАД И УБИРАЕТ ЗА СОБОЙ.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_146==="
function machineEnv(key) {
  try {
    for (const line of readFileSync(process.env.FRACTERA_MACHINE_ENV || "/etc/fractera/secrets.env", "utf8").split("\n")) {
      const i = line.indexOf("=")
      if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, "")
    }
  } catch { /* нет файла — законное состояние */ }
  return ""
}
const dataUrl = process.env.REMOTE_DATA_URL || machineEnv("REMOTE_DATA_URL") || "http://localhost:3300"
const key = process.env.DATA_SECRET || machineEnv("DATA_SECRET") || ""
if (!key) { console.log(`${MARK} НЕТ КЛЮЧА СЛОЯ ДАННЫХ`); process.exit(2) }

let bad = 0
const say = (ok, what) => { if (!ok) bad += 1; console.log(`${ok ? "✓" : "✗"} ${what}`) }
const COLLECTION = "automation-summary"
const THRESHOLD = 0.33

async function post(path, body) {
  const r = await fetch(`${dataUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify(body),
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}
const sql = (text, params = []) => post("/db/migrate", { sql: text, params })

console.log(MARK)

// Кладём три саммари с заведомо большими номерами: прибор не смешивается с живыми.
const A = 990001, B = 990002, C = 990003
const put = (id, text) => post("/vectors", {
  id: `automation-${id}`, collection: COLLECTION, text,
  refTable: "automations", refId: String(id),
})

let r = await put(A, "Поставил напоминание вызвать такси до аэропорта за два часа до вылета")
say(r.status === 200 && r.json.ok !== false, `саммари A положено: HTTP ${r.status}`)
await put(B, "Записал расход сорок евро на продукты в супермаркете, категория личные")
await put(C, "Перевёл голосовое сообщение в текст и сохранил заметку о встрече с юристом")

// ── 1. Находится ДРУГИМИ словами — то, ради чего вектор и нужен ─────────────
const found = await post("/vectors/search", { collection: COLLECTION, query: "надо не забыть машину в аэропорт", k: 5 })
const hits = (found.json.results ?? []).filter(x => Number(x.ref_id) >= A && Number(x.ref_id) <= C)
const top = hits[0]
say(Boolean(top) && Number(top.ref_id) === A,
  `«надо не забыть машину в аэропорт» → №${top?.ref_id} (ждём ${A}), близость ${Number(top?.score ?? 0).toFixed(3)}`)

// ── 2. НЕГАТИВНЫЙ КОНТРОЛЬ: постороннее не проходит порог ──────────────────
const alien = await post("/vectors/search", { collection: COLLECTION, query: "правила игры в шахматы для начинающих", k: 5 })
const alienHits = (alien.json.results ?? [])
  .filter(x => Number(x.ref_id) >= A && Number(x.ref_id) <= C)
  .filter(x => Number(x.score) >= THRESHOLD)
say(alienHits.length === 0,
  `постороннее выше порога ${THRESHOLD}: ${alienHits.length} (ждём 0) — лучшее ${Number((alien.json.results ?? [])[0]?.score ?? 0).toFixed(3)}`)

// ── 3. Повторная запись ОБНОВЛЯЕТ, а не плодит вторую ──────────────────────
await put(A, "Поставил напоминание вызвать такси до аэропорта, время уточнено на час раньше")
const again = await post("/vectors/search", { collection: COLLECTION, query: "такси в аэропорт напоминание", k: 10 })
const sameId = (again.json.results ?? []).filter(x => Number(x.ref_id) === A).length
say(sameId === 1, `записей с номером ${A} в складе: ${sameId} (ждём 1) — общий id обновляет`)

// ── 4. Типизированное в вектор НЕ едет ─────────────────────────────────────
// 🔒 Ищем по тому, что живёт в колонках: охват, вердикт, состояние. Если оно
// туда попало бы, поиск нашёл бы его текстом — и мы получили бы вторую правду.
const typed = await post("/vectors/search", { collection: COLLECTION, query: "geo.city=madrid verdict_liked closed", k: 5 })
const typedHits = (typed.json.results ?? [])
  .filter(x => Number(x.ref_id) >= A && Number(x.ref_id) <= C)
  .filter(x => Number(x.score) >= THRESHOLD)
say(typedHits.length === 0, `типизированное в складе не находится: ${typedHits.length} совпадений выше порога`)

// ── Уборка ─────────────────────────────────────────────────────────────────
for (const id of [A, B, C]) {
  await fetch(`${dataUrl}/vectors/automation-${id}`, { method: "DELETE", headers: { "X-Data-Secret": key } })
}
const left = await post("/vectors/search", { collection: COLLECTION, query: "такси в аэропорт напоминание", k: 10 })
const still = (left.json.results ?? []).filter(x => Number(x.ref_id) >= A && Number(x.ref_id) <= C).length
say(still === 0, `после уборки записей прибора в складе: ${still}`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
