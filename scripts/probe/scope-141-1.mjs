// ПРИБОР ПОДШАГА 141-1 — шестая строка раскрытия карточки признака.
//
// Идёт по ТОМУ ЖЕ пути, что и экран: `factDetail()` из `lib/facts/detail.ts` на
// настоящем реестре. Проверяет три случая, различающихся ответом.
//
// Запуск:  npx tsx scripts/probe/scope-141-1.mjs
import { allFacts } from "../../lib/facts/registry"
import { factDetail } from "../../lib/facts/detail"

const MARK = "===PROBE_141_1==="
console.log(MARK)

const all = allFacts()
console.log(`записей в реестре: ${all.length}`)

const withScope = all.filter(f => (f.scope ?? []).length > 0)
console.log(`с объявленным охватом: ${withScope.length} → ${withScope.map(f => f.key).join(", ") || "—"}`)

for (const f of withScope) {
  console.log(`  ${f.key} → «${factDetail(f, all).scope.join(" · ")}»`)
}

// Негативный контроль первый: признак БЕЗ охвата обязан дать пустую строку —
// экран скажет «зависимость не описана», а не «верен везде».
const without = all.find(f => (f.scope ?? []).length === 0)
console.log(`без охвата (${without?.key}): строк ${factDetail(without, all).scope.length}`)

// Негативный контроль второй: ссылка на несуществующий ключ обязана быть ВИДНА,
// а не выброшена молча. В реестр такое не попадёт — сборку остановит
// `check:registry`, — но показ обязан пережить и это.
const broken = { ...without, scope: ["field.no-such-key"] }
console.log(`сломанная ссылка → «${factDetail(broken, all).scope.join(" · ")}»`)

console.log(`${MARK}DONE`)
