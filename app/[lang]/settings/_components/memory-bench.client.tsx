"use client";

import { useRef } from "react";
import { MemoryTest } from "./memory-test.client";
import { MemoryTables, type MemoryTablesHandle } from "./memory-tables.client";

// СВЯЗУЮЩИЙ ОСТРОВОК СТЕНДА (176-3).
//
// 🔒 ОН СУЩЕСТВУЕТ ПО МЕХАНИЧЕСКОЙ ПРИЧИНЕ, А НЕ РАДИ СТРОЙНОСТИ: страница
// раздела СЕРВЕРНАЯ, а функцию обратного вызова серверный рендерер клиентскому
// островку передать не может. Значит «отправили → таблицы перечитались» обязано
// жить внутри одного клиентского дерева. Тот же закон уже записан у вида блока
// `chat`: обработчик отправки — функция, и через границу она не едет.
//
// 🔒 ТАБЛИЦЫ ПЕРЕЧИТЫВАЮТСЯ ПОСЛЕ ЗАПИСИ, А НЕ ПОСЛЕ ЛЮБОГО ВЫЗОВА. Чтение
// (`recall`) ничего не меняет, и обновлять после него значило бы гонять службу
// впустую — а стенд заведён в том числе затем, чтобы видеть её настоящую цену.

export function MemoryBench({
  tablesWords,
  testWords,
}: {
  tablesWords: React.ComponentProps<typeof MemoryTables>["words"];
  testWords: React.ComponentProps<typeof MemoryTest>["words"];
}) {
  const tables = useRef<MemoryTablesHandle>(null);

  return (
    <div className="space-y-8">
      <MemoryTest onSent={() => tables.current?.reload()} words={testWords} />
      <MemoryTables ref={tables} words={tablesWords} />
    </div>
  );
}
