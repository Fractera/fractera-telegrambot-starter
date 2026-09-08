// ПРИБОР ШАГА 159 — конфиг реестра читается С ДИСКА, а не из бандла.
//
// Прогоняется ЛОКАЛЬНО и НЕ ТРОГАЕТ службу: проверяется сам механизм чтения —
// свежесть, кэш, запас на отсутствующий файл, отказ на битом JSON.
//
// ✗ ЧТО ЭТО ЧИНИТ: человек попросил бота «запомни мою национальность», бот завёл
// признак в реестре за пять минут — и признак НЕ ЗАРАБОТАЛ, потому что конфиг
// был запечён в сборку статическим импортом. Измерено на живой двери в тот же
// день: `describe person.nationality` → `found:false`, `remember` → отказ.

import { mkdtempSync, writeFileSync, rmSync, utimesSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const MARK = "===PROBE_159==="
let bad = 0
const say = (ok, what) => { if (!ok) bad += 1; console.log(`${ok ? "✓" : "✗"} ${what}`) }

// Повторяем логику `lib/registry/live-config.ts` — прибор на .mjs не может
// импортировать TypeScript. Граница названа: здесь проверяется ПОВЕДЕНИЕ, а его
// совпадение с кодом стережёт `tsc` и одинаковые числа ниже.
const { readFileSync, statSync } = await import("node:fs")
const RECHECK_MS = 500
const cache = new Map()
function readLiveConfig(full, baked) {
  const now = Date.now()
  const hit = cache.get(full)
  if (hit && now - hit.at < RECHECK_MS) {
    return { data: hit.data, source: hit.mtime > 0 ? "disk" : "baked" }
  }
  try {
    const mtime = statSync(full).mtimeMs
    if (hit && hit.mtime === mtime) {
      cache.set(full, { ...hit, at: now })
      return { data: hit.data, source: "disk" }
    }
    const parsed = JSON.parse(readFileSync(full, "utf8"))
    cache.set(full, { at: now, mtime, data: parsed })
    return { data: parsed, source: "disk" }
  } catch {
    cache.set(full, { at: now, mtime: 0, data: baked })
    return { data: baked, source: "baked" }
  }
}

console.log(MARK)

const dir = mkdtempSync(join(tmpdir(), "live-config-"))
const file = join(dir, "registry-config.json")
const BAKED = { facts: [{ key: "baked.only", title: "Из бандла" }] }

// ── 1. Файла нет — работает запас, и это НАЗЫВАЕТСЯ ────────────────────────
let got = readLiveConfig(file, BAKED)
say(got.source === "baked" && got.data.facts[0].key === "baked.only",
  `файла нет → источник «${got.source}», запись «${got.data.facts[0].key}»`)

// ── 2. Файл появился — читается он, БЕЗ пересборки и без перезапуска ───────
writeFileSync(file, JSON.stringify({ facts: [{ key: "person.nationality", title: "Национальность" }] }))
cache.clear() // 🔒 имитируем следующий запрос: кэш живёт 500 мс, ждать их в прибое незачем
got = readLiveConfig(file, BAKED)
say(got.source === "disk" && got.data.facts[0].key === "person.nationality",
  `файл появился → источник «${got.source}», запись «${got.data.facts[0].key}» — ТО, ЧЕГО НЕ БЫЛО`)

// ── 3. Правка файла видна: новый признак действует сразу ───────────────────
writeFileSync(file, JSON.stringify({ facts: [
  { key: "person.nationality", title: "Национальность" },
  { key: "person.hobby", title: "Увлечение" },
] }))
// mtime в некоторых файловых системах гранулярен — двигаем его явно, чтобы
// проверять ЛОГИКУ свежести, а не разрешение часов.
const future = new Date(Date.now() + 2000)
utimesSync(file, future, future)
cache.clear()
got = readLiveConfig(file, BAKED)
say(got.data.facts.length === 2,
  `после правки записей: ${got.data.facts.length} (ждём 2) — пересборка не понадобилась`)

// ── 4. Кэш держит, а не бьёт по диску на каждый вызов ──────────────────────
const first = readLiveConfig(file, BAKED)
const second = readLiveConfig(file, BAKED)
say(first.data === second.data, `второй вызов подряд отдал тот же объект — кэш работает`)

// ── 5. НЕГАТИВНЫЙ КОНТРОЛЬ: битый JSON не роняет, а даёт запас ─────────────
writeFileSync(file, "{ это не json")
const later = new Date(Date.now() + 4000)
utimesSync(file, later, later)
cache.clear()
got = readLiveConfig(file, BAKED)
say(got.source === "baked" && got.data.facts[0].key === "baked.only",
  `битый JSON → источник «${got.source}» — реестр не пропал, разбор не упал`)

// ── 6. НЕГАТИВНЫЙ КОНТРОЛЬ: запас не запоминается как успех ────────────────
writeFileSync(file, JSON.stringify({ facts: [{ key: "person.nationality" }] }))
const evenLater = new Date(Date.now() + 6000)
utimesSync(file, evenLater, evenLater)
cache.clear()
got = readLiveConfig(file, BAKED)
say(got.source === "disk", `файл починился → снова «${got.source}», а не навсегда «baked»`)

rmSync(dir, { recursive: true, force: true })

console.log(`${MARK}DONE`)
console.log(`PROBE_RC=${bad === 0 ? 0 : 1}`)
process.exit(bad === 0 ? 0 : 1)
