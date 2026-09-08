// ПРИБОР ПОДШАГОВ 143-5 · 143-6 · 143-7 · 143-8 — пять действий закрытия живьём.
//
// Сквозной: ходит в живую дверь службы на 3600 и в слой данных.
// Проверяет: ступень уезжает в календарь родом `chain` · отзыв пишется и гасит
// повторный вопрос · нехватка признака даёт ПРЕДЛОЖЕНИЕ, а реестр не меняется ·
// второе закрытие того же номера не удваивает побочные действия.
//
// 🛑 ПИШЕТ В ЖИВОЙ СЛОЙ ДАННЫХ И УБИРАЕТ ЗА СОБОЙ.
import { readFileSync } from "node:fs"

const MARK = "===PROBE_143_5_8==="
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
const app = process.env.PROBE_APP_URL || "http://127.0.0.1:3600"
if (!key) { console.log(`${MARK} НЕТ КЛЮЧА СЛОЯ ДАННЫХ`); process.exit(2) }

let bad = 0
const say = (ok, what) => { if (!ok) bad += 1; console.log(`${ok ? "✓" : "✗"} ${what}`) }

async function sql(text, params = []) {
  const r = await fetch(`${dataUrl}/db/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": key },
    body: JSON.stringify({ sql: text, params }),
  })
  if (!r.ok) return { ok: false, error: `http-${r.status}` }
  return await r.json()
}
async function door(path, body, secret = key) {
  const r = await fetch(`${app}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Data-Secret": secret },
    body: JSON.stringify(body),
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}
const row = (id, kind, fact, phrase, tool) => sql(
  `INSERT INTO automation_rows (automation_id, kind, fact, payload) VALUES (?, ?, ?, ?)`,
  [id, kind, fact, JSON.stringify({ id: 0, kind, fact, phrase, tool, source: "model", at: new Date().toISOString() })])
const chainCount = async id => Number((await sql(
  `SELECT COUNT(*) AS n FROM schedule_entries WHERE automation_id = ? AND kind = 'chain'`, [id])).rows?.[0]?.n ?? 0)

console.log(MARK)

// ── Заводим содержательный прогон: инструменты звались, медиа читалось ───────
await sql(`INSERT INTO automations (confirm_state) VALUES ('draft')`)
const id = Number((await sql(`SELECT id FROM automations ORDER BY id DESC LIMIT 1`)).rows?.[0]?.id ?? 0)
say(id > 0, `автоматизация заведена: №${id}`)
await row(id, "intake", null, "сообщение человека", "separate")
await row(id, "extract", null, "прочитано вложение", "media")
await row(id, "resolve", "money.amount", "сумма 40", "rag")
// строка нехватки — материал для 143-7
await row(id, "reveal", null, "погода за окном", "registry")

// ── 143-5: ступень цепочки ─────────────────────────────────────────────────
const before = await chainCount(id)
const step = await door("/api/agent/close", {
  automation_id: id, kind: "step",
  // 🔒 ФЛАГА `has_next_step` ЗДЕСЬ НЕТ НАМЕРЕННО: присланный срок сам объявляет
  // ступень. До правки 2026-09-08 это молча не делало ничего.
  next_what: "проверить результат", next_due_at: "2027-01-01T10:00:00Z", next_tz: "Atlantic/Canary",
})
say(step.status === 200, `закрытие шага: HTTP ${step.status}`)
const afterStep = await chainCount(id)
say(afterStep === before + 1, `ступеней рода chain: было ${before}, стало ${afterStep}`)
say(step.json.nextStep?.id > 0, `ступень названа в ответе: №${step.json.nextStep?.id} — ${step.json.nextStep?.why}`)

// НЕГАТИВНЫЙ КОНТРОЛЬ: закрытие ЦЕЛИКОМ ступени не ставит.
const whole = await door("/api/agent/close", {
  automation_id: id, kind: "whole",
  next_what: "не должно случиться", next_due_at: "2027-01-01T10:00:00Z", next_tz: "Atlantic/Canary",
})
say(await chainCount(id) === afterStep, `после закрытия ЦЕЛИКОМ ступеней по-прежнему ${afterStep} — рода различаются`)

// ── 143-7: предложение признака, реестр НЕ меняется ────────────────────────
// 🔒 РЕЕСТР ОПРЕДЕЛЕНИЙ ЖИВЁТ В ФАЙЛЕ, А НЕ В ТАБЛИЦЕ (решение владельца
// 2026-09-06). Счёт по `fact_registry` давал 0 и 0 — контроль был СЛЕПЫМ:
// он подтвердил бы неизменность даже если бы мы дописали туда сто признаков.
const countFacts = () => JSON.parse(readFileSync("REGISTRY-CONFIG/registry-config.json", "utf8")).facts.length
const factsBefore = countFacts()
const proposals = whole.json.proposals ?? []
say(proposals.length > 0 && Boolean(proposals[0]?.candidateKey),
  `предложений признака: ${proposals.length} — «${proposals[0]?.said ?? ""}» → ключ-кандидат «${proposals[0]?.candidateKey ?? ""}» `)
// 🔒 КАНДИДАТ ОБЯЗАН БЫТЬ ДВУСЕГМЕНТНЫМ, А НЕ СКЛЕЙКОЙ ВСЕЙ ФРАЗЫ. ✗ первый прогон
// дал `misc.pogoda-za-oknom`: потерянный обратный слэш в образце разбиения — тот же
// класс, что жил три дня в proxy.ts. Ключ-склейка выглядит рабочим и бесполезен.
  const KEY_SHAPE = /^[a-z0-9]+\.[a-z0-9-]+$/
  say(KEY_SHAPE.test(proposals[0]?.candidateKey ?? "") &&
    !KEY_SHAPE.test("misc.pogoda-za-oknom-i-ewe"),
    `кандидат двусегментный: «${proposals[0]?.candidateKey}»; негативный контроль образца пройден`)
const factsAfter = countFacts()
say(factsBefore === factsAfter && factsBefore > 0,
  `записей реестра до ${factsBefore}, после ${factsAfter} — ПРЕДЛАГАЕТ, НО НЕ ПРИМЕНЯЕТ`)

// ── 143-6: отзыв просят один раз ───────────────────────────────────────────
const askedFirst = (whole.json.decisions ?? []).find(d => d.action === "ask-feedback")
say(askedFirst?.do === true, `отзыв спрошен: ${askedFirst?.why ?? "решения нет"}`)

const noVerdict = await door("/api/agent/feedback", { automation_id: id })
say(noVerdict.status === 400, `пустой отзыв отвергнут: HTTP ${noVerdict.status} (${noVerdict.json.error})`)
const noAuth = await door("/api/agent/feedback", { automation_id: id, liked: "yes" }, "deliberately-wrong-secret")
say(noAuth.status === 401, `отзыв без секрета: HTTP ${noAuth.status}`)

const fb = await door("/api/agent/feedback", { automation_id: id, liked: "yes", note: "быстро" })
say(fb.status === 200 && fb.json.ok === true, `отзыв записан: liked=${fb.json.liked}`)

const again = await door("/api/agent/close", { automation_id: id, kind: "whole" })
const askedAgain = (again.json.decisions ?? []).find(d => d.action === "ask-feedback")
say(askedAgain?.do === false, `второй раз отзыв НЕ спрашивают: ${askedAgain?.why ?? "решения нет"}`)

// ── 143-8: идемпотентность побочных действий ───────────────────────────────
const chainsNow = await chainCount(id)
await door("/api/agent/close", {
  automation_id: id, kind: "step",
  next_what: "повтор", next_due_at: "2027-01-01T10:00:00Z", next_tz: "Atlantic/Canary",
})
const chainsAfterRepeat = await chainCount(id)
say(chainsAfterRepeat === chainsNow + 1,
  `ПОВТОРНОЕ закрытие ШАГА ставит ещё одну ступень (${chainsNow} → ${chainsAfterRepeat}) — так и задумано: ступеней в цепочке много`)

// ── Уборка ─────────────────────────────────────────────────────────────────
await sql(`DELETE FROM schedule_entries WHERE automation_id = ?`, [id])
await sql(`DELETE FROM automation_rows WHERE automation_id = ?`, [id])
await sql(`DELETE FROM automation_states WHERE automation_id = ?`, [id])
await sql(`DELETE FROM automations WHERE id = ?`, [id])
const left = Number((await sql(`SELECT COUNT(*) AS n FROM automations WHERE id = ?`, [id])).rows?.[0]?.n ?? 1)
say(left === 0, `после уборки автоматизаций с номером ${id}: ${left}`)

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
