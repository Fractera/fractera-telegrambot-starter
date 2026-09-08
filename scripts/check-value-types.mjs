#!/usr/bin/env node
// СТОРОЖ ТИПОВ ЗНАЧЕНИЙ: тип признака не меняется НИКОГДА (145, 2026-09-08).
//
// 🔒 ЗАЧЕМ ОН НУЖЕН — ЭТО ЕДИНСТВЕННОЕ, ЧЕМ РОСТ СХЕМЫ СПОСОБЕН УРОНИТЬ
// РАБОТАЮЩЕЕ. Новая таблица и новая колонка аддитивны: они не ломают ни одного
// существующего запроса. Ломает ровно одно — **изменение смысла того, что уже
// лежит**. Признак «расход», объявленный текстом и ставший числом, делает
// негодными все прежние строки: сравнение, сумма и сортировка начинают врать у
// того, у кого система уже поработала, — и молча.
//
// 🔒 ПОЭТОМУ СМЕНА ТИПА — ЭТО НОВЫЙ ПРИЗНАК, А НЕ ПРАВКА (§3ж). Заведи новый
// ключ; прежний остаётся со своими данными, потому что определение принадлежит
// нам, а данные — человеку.
//
// 🔒 ЗАМОК ЛЕЖИТ В GIT, А НЕ В БАЗЕ, И ЭТО ВЫБОР. База знает только ту машину, на
// которой стоит; замок в репозитории ловит правку **до** того, как она доедет
// хоть до одной машины. Файл порождается, а не пишется руками: рукописный список
// разошёлся бы с реестром молча — закон, оплаченный в этом проекте трижды.
//
// Прогон: `node scripts/check-value-types.mjs` (стоит в `prebuild`).
// Обновить замок осознанно: `node scripts/check-value-types.mjs --write`.

import { readFileSync, writeFileSync, existsSync } from "node:fs"

const REGISTRY = "REGISTRY-CONFIG/registry-config.json"
const LOCK = "REGISTRY-CONFIG/value-types.lock.json"

const write = process.argv.includes("--write")

const facts = JSON.parse(readFileSync(REGISTRY, "utf8")).facts ?? []
const now = Object.fromEntries(facts.map(f => [f.key, f.valueType ?? "unknown"]))

if (!existsSync(LOCK)) {
  // 🔒 ПЕРВЫЙ ПРОГОН СОЗДАЁТ ЗАМОК И НЕ РОНЯЕТ СБОРКУ. Сторож, упавший при своём
  // появлении, был бы наказанием за собственное рождение.
  writeFileSync(LOCK, JSON.stringify(now, null, 2) + "\n")
  console.log(`✓ замок типов создан впервые: ключей ${Object.keys(now).length}`)
  process.exit(0)
}

const was = JSON.parse(readFileSync(LOCK, "utf8"))

const changed = []
const added = []
const gone = []
for (const [key, type] of Object.entries(now)) {
  if (!(key in was)) added.push(`${key} (${type})`)
  else if (was[key] !== type) changed.push(`${key}: было «${was[key]}», стало «${type}»`)
}
for (const key of Object.keys(was)) if (!(key in now)) gone.push(key)

if (write) {
  writeFileSync(LOCK, JSON.stringify(now, null, 2) + "\n")
  console.log(`✓ замок типов обновлён осознанно: +${added.length} −${gone.length} ~${changed.length}`)
  process.exit(0)
}

// 🔒 ИСЧЕЗНОВЕНИЕ КЛЮЧА — НЕ ОТКАЗ, А ДОЛГ. Признак могли выключить; его таблица
// и строки при этом остаются, и уронить сборку из-за этого значило бы запретить
// выключение. Печатается, чтобы не пропало.
if (gone.length > 0) {
  console.log(`долг: ключей исчезло из реестра — ${gone.length}: ${gone.join(", ")}`)
  console.log("  их таблицы и данные остаются; замок обновляется флагом --write")
}
if (added.length > 0) {
  console.log(`новых признаков: ${added.length} — ${added.join(", ")}`)
  console.log("  замок обновляется флагом --write, и это обычная работа")
}

if (changed.length === 0) {
  console.log(`✓ типы значений не менялись: ключей ${Object.keys(now).length}`)
  process.exit(0)
}

console.log("")
console.log("✗ ТИП ЗНАЧЕНИЯ ПРИЗНАКА ИЗМЕНЁН — СБОРКА ОСТАНОВЛЕНА:")
for (const line of changed) console.log(`  ${line}`)
console.log("")
console.log("  Смена типа делает негодными ВСЕ прежние строки этого признака, и ломается")
console.log("  это только у того, у кого система уже поработала.")
console.log("  Лечение: завести НОВЫЙ ключ с нужным типом. Прежний остаётся со своими")
console.log("  данными. Если тип правится осознанно и данных ещё нет —")
console.log("  `node scripts/check-value-types.mjs --write`, и объяснить это в итоге шага.")
process.exit(1)
