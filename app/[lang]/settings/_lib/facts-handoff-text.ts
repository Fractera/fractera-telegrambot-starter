import type { Fact } from "@/lib/facts/types";

// ТЕКСТ ЗАДАЧИ АГЕНТУ — ЧИСТЫЕ ДАННЫЕ, БЕЗ ЗАВИСИМОСТЕЙ (137-13, 2026-09-06).
//
// 🔒 ФАЙЛ БЕЗ ИМПОРТОВ КРОМЕ ТИПА — по той же причине, что `telegram-sections.ts`
// рядом: текст нужен и серверной карточке, и островку окна. Живи он внутри
// клиентского компонента, серверная сторона не смогла бы его собрать.
//
// 🔒 ТЕКСТ ПИШЕТСЯ ЧЕЛОВЕКОМ ДЛЯ АГЕНТА, А НЕ МАШИНОЙ ДЛЯ МАШИНЫ. Это не JSON и
// не форма: человек отправит его боту своими словами, дополнив там, где стоят
// угловые скобки. Строгий формат заставил бы знать устройство записи — ровно то
// знание, от которого продукт избавляет.
//
// 🔒 ЗАДАЧА НАЗЫВАЕТ ПОРЯДОК РАБОТЫ, А НЕ ТОЛЬКО ПРЕДМЕТ. Агент, получивший
// «добавь признак», построит его как придётся; получивший ссылку на навык —
// заведёт шаг, докажет двумя плоскостями и положит коммит. Требование уезжает
// вместе с задачей, потому что читать его будет тот, кто строит.

const HOW_TO_WORK_RU = `Работай по навыку use-development-steps: заведи шаг, докажи двумя
плоскостями и положи коммит — правку должно быть чем откатить.`;

const HOW_TO_WORK_EN = `Follow the use-development-steps skill: open a step, prove it from two
planes, and commit — the change must be revertable.`;

/** Задача на НОВЫЙ элемент реестра признаков. */
export function newFactRequest(lang: string): string {
  if (lang === "en") {
    return `Please add a new entry to the fact registry of the Telegram bot project.

What should be extracted: <describe in your own words>
How a person says it: <a real phrase, not a task statement>
Why it is needed: <what it changes for me>
Where the value should live: <if you know; otherwise leave it to the agent>

${HOW_TO_WORK_EN}`;
  }

  return `Прошу добавить новый элемент в реестр признаков проекта Telegram-бота.

Что должно извлекаться: <опишите своими словами>
Как человек это говорит: <настоящая фраза, а не формулировка задачи>
Зачем это нужно: <что это меняет для меня>
Где должно храниться значение: <если знаете; иначе оставьте это агенту>

${HOW_TO_WORK_RU}`;
}

/** Задача на ПРАВКУ существующего признака: его состояние уезжает вместе с просьбой. */
export function editFactRequest(lang: string, fact: Fact): string {
  // 🔒 СОСТОЯНИЕ ПРИЗНАКА ВКЛАДЫВАЕТСЯ В ТЕКСТ ЦЕЛИКОМ, А НЕ ОДНИМ КЛЮЧОМ.
  // Агент прочитает реестр и сам, но человек, отправляя задачу, обязан видеть,
  // ЧТО именно он просит изменить: ключ без содержания — просьба вслепую.
  const facts =
    lang === "en"
      ? [
          `key: ${fact.key}`,
          `level: ${fact.level}`,
          `title: ${fact.title}`,
          `value type: ${fact.valueType}`,
          `how it is found: ${fact.howToFind}`,
          `stored in: ${fact.storedIn}`,
        ]
      : [
          `ключ: ${fact.key}`,
          `уровень: ${fact.level}`,
          `название: ${fact.title}`,
          `тип значения: ${fact.valueType}`,
          `как находится: ${fact.howToFind}`,
          `где хранится: ${fact.storedIn}`,
        ];

  if (lang === "en") {
    return `Please change an existing entry in the fact registry.

Current state:
${facts.join("\n")}

What to change: <describe in your own words>
Why: <what it changes for me>

${HOW_TO_WORK_EN}`;
  }

  return `Прошу изменить существующий элемент реестра признаков.

Как он выглядит сейчас:
${facts.join("\n")}

Что изменить: <опишите своими словами>
Почему: <что это меняет для меня>

${HOW_TO_WORK_RU}`;
}
