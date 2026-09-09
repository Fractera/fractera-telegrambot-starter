#!/usr/bin/env node
//
// СТОРОЖ СХЕМ MCP: инструмент, чью схему отвергает API, недостижим для агента —
// и отказ этот НЕМОЙ.
//
// ✗ ЧЕМ ОПЛАЧЕН, ИЗМЕРЕНО 2026-09-09. `mcpToolFrom` клал наш внутренний тип
// `value` прямо в JSON Schema. API Anthropic отвергал инструмент целиком:
//   "schema/properties/what/type must be equal to one of the allowed values"
// Привратник исключал `memory_write` и `memory_mutate` из КАЖДОЙ сессии — сутки.
// Агент честно говорил владельцу «не могу записать», а тот читал это как
// поломку архитектуры.
//
// 🔒 ПОЧЕМУ НИ ОДИН ПРИБОР ЭТОГО НЕ ВИДЕЛ. Все спрашивали НАС: MCP-сервер отдавал
// `tools/list` со всеми двенадцатью, дверь памяти отвечала `ok:true`, типы
// сходились, сборка была зелёной. Отвергал схему **третий** — привратник между
// агентом и нами. **У инструмента для модели есть третья сторона, и её ответ
// измеряется отдельно.**
//
// 🔒 ЧТО СТЕРЕЖЁТ ЭТОТ ФАЙЛ: каждая порождённая схема состоит ТОЛЬКО из типов,
// которые есть в JSON Schema. Он не заменяет живую проверку привратником —
// та живёт в журнале сессии строкой «Unavailable MCP Tools», — но ловит
// **причину** до сборки, а не после доставки.

import { pathToFileURL } from "node:url"
import { join } from "node:path"

// Простые типы JSON Schema. Ничего сверх этого списка в схеме стоять не может.
const ALLOWED = new Set(["array", "boolean", "integer", "null", "number", "object", "string"])

const root = process.cwd()
const sources = [
  ["реестр", join(root, "lib", "registry", "access-decl.mjs"), "ACCESS_FUNCTIONS"],
  ["память", join(root, "lib", "memory", "decl.mjs"), "ALL_FUNCTIONS"],
]

let bad = 0
let checked = 0

for (const [label, path, exportName] of sources) {
  let mod
  try {
    mod = await import(pathToFileURL(path).href)
  } catch (e) {
    console.log(`🛑 ${label}: объявление не читается — ${e.message}`)
    bad += 1
    continue
  }

  // Объявления могут лежать под разными именами; берём названное, иначе первый
  // массив объявлений в модуле.
  const decls =
    mod[exportName] ||
    (typeof mod.liveFunctions === "function" ? mod.liveFunctions() : null) ||
    Object.values(mod).find((v) => Array.isArray(v) && v.length && v[0] && v[0].params)

  if (!Array.isArray(decls)) {
    console.log(`🛑 ${label}: не нашёл списка объявлений в ${path}`)
    bad += 1
    continue
  }

  for (const decl of decls) {
    let tool
    try {
      tool = mod.mcpToolFrom ? mod.mcpToolFrom(decl) : null
    } catch (e) {
      console.log(`🛑 ${label} · ${decl.name}: схема не строится — ${e.message}`)
      bad += 1
      continue
    }
    if (!tool) continue
    checked += 1
    const props = (tool.inputSchema && tool.inputSchema.properties) || {}
    for (const [name, spec] of Object.entries(props)) {
      const t = spec.type
      const list = Array.isArray(t) ? t : [t]
      for (const one of list) {
        if (ALLOWED.has(one)) continue
        console.log(
          `🛑 ${label} · ${decl.name} · параметр \`${name}\`: тип \`${String(one)}\` — не тип JSON Schema.`,
        )
        console.log(`   Привратник исключит этот инструмент МОЛЧА, и агент его не увидит.`)
        bad += 1
      }
    }
  }
}

if (bad === 0) {
  console.log(`✓ схемы MCP годны: проверено ${checked} инструментов, типов вне JSON Schema нет`)
  process.exit(0)
}
console.log("")
console.log("Лечение: перевести псевдотип в JSON Schema в `JSON_SCHEMA_TYPE` (lib/registry/access-decl.mjs).")
process.exit(1)
