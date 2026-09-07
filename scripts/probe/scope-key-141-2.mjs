// ПРИБОР ПОДШАГА 141-2 — сборка ключа охвата белым списком.
//
// Идёт по тому же коду, что и запись факта: `scopeKey()` из `lib/facts/scope.ts`.
// Каждый случай выбран так, чтобы РАЗЛИЧАТЬ реализации, а не подтверждать любую.
//
// Запуск:  npx tsx scripts/probe/scope-key-141-2.mjs
import { scopeKey, scopeValue, scopeColumnDeclared, SCOPE_COLUMN } from "../../lib/facts/scope"
import { FACT_TABLE_COLUMNS, FACT_TABLE_LATE_COLUMNS, factTableSql } from "../../lib/facts/table"

const MARK = "===PROBE_141_2==="
console.log(MARK)

// [имя случая, вход, ожидаемый ключ]
const cases = [
  ["кириллица переводится таблицей", { "geo.city": "Мадрид" }, "geo-city=madrid"],
  ["латиница как есть", { "geo.city": "London" }, "geo-city=london"],
  ["две пары сортируются по имени", { lang: "ru", "geo.city": "Madrid" }, "geo-city=madrid|lang=ru"],
  ["тот же охват в другом порядке — ТОТ ЖЕ ключ", { "geo.city": "Madrid", lang: "ru" }, "geo-city=madrid|lang=ru"],
  ["пробелы склеиваются в дефис", { "geo.city": "Нижний Новгород" }, "geo-city=nizhnii-novgorod"],
  ["НЕГАТИВНЫЙ: попытка SQL", { "geo.city": "madrid'; DROP TABLE fact_x --" }, "geo-city=madrid-drop-table-fact-x"],
  ["НЕГАТИВНЫЙ: пустое значение", { "geo.city": "   " }, ""],
  ["НЕГАТИВНЫЙ: одна пара непригодна — ВЕСЬ ключ пуст", { "geo.city": "Мадрид", lang: "" }, ""],
  ["НЕГАТИВНЫЙ: имя измерения непригодно", { "!!!": "madrid" }, ""],
  ["охват не назван вовсе", {}, ""],
]

let bad = 0
for (const [name, input, want] of cases) {
  const got = scopeKey(input)
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? "✓" : "✗"} ${name}: «${got}»${ok ? "" : ` — ждали «${want}»`}`)
}

// 🔒 ЗАПРЕЩЁННЫЕ СИМВОЛЫ НЕ ДОЛЖНЫ ДОЖИВАТЬ ДО КЛЮЧА НИ В КАКОМ ВИДЕ.
const dirty = scopeKey({ "geo.city": "a'\"; --|=b" })
console.log(`кавычек и служебных знаков в ключе: ${/['"|;]/.test(dirty.replace(/\|/g, "")) ? "ЕСТЬ — ДЕФЕКТ" : "нет"} («${dirty}»)`)

console.log(`колонка ${SCOPE_COLUMN} объявлена в лестнице: ${scopeColumnDeclared() ? "да" : "НЕТ — ДЕФЕКТ"}`)
console.log(`колонок в образце: ${FACT_TABLE_COLUMNS.length}, поздних: ${FACT_TABLE_LATE_COLUMNS.length}`)
console.log(`scope_key в форме новой таблицы: ${/scope_key/.test(factTableSql("fact_probe")) ? "есть" : "НЕТ — ДЕФЕКТ"}`)
console.log(bad ? `${MARK} ОТКАЗ: ${bad} случаев не совпали` : `${MARK}DONE`)
process.exit(bad ? 1 : 0)
