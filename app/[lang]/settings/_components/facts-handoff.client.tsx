"use client";

import { Check, Copy, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Small } from "@/components/ui/typography";

// ПЕРЕДАЧА ЗАДАЧИ АГЕНТУ ВМЕСТО ФОРМЫ ЗАПИСИ (137-13, 2026-09-06).
//
// 🎯 СЛОВО ВЛАДЕЛЬЦА: «так как мы только что разрешили разработку внутри этого
// репозитория, все эти инструменты следует удалить, а вместо этого при нажатии
// на кнопку добавить новый элемент реестра признаков или редактировать
// существующий — выводить модальное окно, в котором создавать информацию для
// агента и рекомендовать: скопируйте информацию об этом элементе и перейдите в
// Telegram-бот, чтобы отправить в разработку ваше обновление».
//
// 🔒 ЭКРАН СТАЛ ЧИТАЮЩИМ, И ЭТО СЛЕДСТВИЕ, А НЕ УПРОЩЕНИЕ. Пока правка реестра
// шла формой, у определений было ДВА хозяина: форма писала в хранилище, агент
// правил файлы — и они разошлись бы молча в первый же день, когда владелец
// сделал бы и то и другое. Теперь путь один: человек говорит словами, агент
// строит и кладёт коммит, по которому правку можно откатить.
//
// 🔒 ОКНО ОТДАЁТ ГОТОВЫЙ ТЕКСТ, А НЕ ФОРМУ ИЗ ПОЛЕЙ. Поля означали бы, что
// человек обязан знать устройство записи — ключ, тип значения, поведение при
// отсутствии. Ровно от этого знания продукт и избавляет: он говорит, чего хочет,
// своими словами, а разбирается агент.
//
// 🛑 ОТПРАВКИ ОТСЮДА НЕТ НАМЕРЕННО. Кнопка «отправить боту» потребовала бы
// держать здесь токен и знать чат человека — то есть завести второй путь к боту
// рядом с существующим. Человек копирует текст и отправляет сам, из своего
// Telegram: путь к агенту в проекте один.

type Labels = {
  /** Подпись кнопки, открывающей окно. */
  trigger: string;
  title: string;
  lead: string;
  /** Что сделать с текстом — рекомендация под ним. */
  advice: string;
  copy: string;
  copied: string;
};

export function FactsHandoff({
  labels,
  /** Готовый текст задачи. Собран на сервере: здесь его только показывают. */
  text,
}: {
  labels: Labels;
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // 🔒 БУФЕР МОЖЕТ БЫТЬ НЕДОСТУПЕН, И ЭТО НЕ ПОЛОМКА: браузер без
      // разрешения, страница без защищённого соединения. Текст остаётся на
      // экране и выделяется руками — поэтому отказ молчаливый, а не тревожный.
      setCopied(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Send className="size-3.5" />
          {labels.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.lead}</DialogDescription>
        </DialogHeader>

        {/* 🔒 ТЕКСТ ПОКАЗАН ЦЕЛИКОМ И ВЫДЕЛЯЕМ. Свёрнутый или укороченный, он
            заставил бы копировать вслепую — а человек отправляет его агенту и
            вправе прочитать, что именно отправляет. */}
        <pre
          className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-[length:var(--fs-small)] leading-relaxed"
          data-facts-handoff-text
        >
          {text}
        </pre>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Small className="max-w-[22rem] text-muted-foreground leading-relaxed">
            {labels.advice}
          </Small>
          <Button onClick={copy} size="sm" type="button">
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied ? labels.copied : labels.copy}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
