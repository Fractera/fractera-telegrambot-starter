"use client";

import { useTheme as useNextTheme } from "next-themes";
import type { ReactNode } from "react";
import { useCallback } from "react";

// МОСТ К ЕДИНСТВЕННОМУ ХОЗЯИНУ ТЕМЫ (137-5, 2026-09-06).
//
// ✗ ЭТОТ ФАЙЛ ПРИЕХАЛ ИЗ СТАРТЕРА ДОСЛОВНО И УРОНИЛ СТРАНИЦУ. Владелец открыл
// `https://chat.aifa.dev/ru/settings` и увидел «This page couldn't load»; в
// логе — `Error: useTheme must be used inside ThemeProvider`, три раза подряд.
// Причина: переключатель темы в подвале зовёт `useTheme` ОТСЮДА, а корневая
// раскладка чата оборачивает дерево СВОИМ провайдером — `next-themes`. Контекст
// не найден, компонент бросил, серверный рендер упал целиком.
//
// 🔒 ЛЕЧЕНИЕ — ОДИН ХОЗЯИН ТЕМЫ, А НЕ ВТОРОЙ ПРОВАЙДЕР РЯДОМ. Обернуть сегмент
// ещё и этим провайдером было проще всего, и это была бы ловушка: класс на
// `<html>` ставили бы двое, состояние жило бы в двух местах — в `localStorage`
// под своим ключом и в `next-themes`, — и переключатели разошлись бы МОЛЧА.
// Тот же класс ошибки, что две двери к одному хранилищу (109-3) и две
// реализации ленты сообщений (шаг 80).
//
// 🔒 ПОЭТОМУ ЗДЕСЬ ПЕРЕХОДНИК: наружу торчит прежнее API (`ThemeMode`,
// `useTheme`, `cycleTheme`), внутри работает `next-themes` чата. Перенесённые
// компоненты не правлены ни одной строкой — они и не знают, что хозяин сменился.
//
// 🛑 `ThemeProvider` ОСТАВЛЕН ПУСТОЙ ОБЁРТКОЙ НАМЕРЕННО. Он ничего не делает,
// но существует: файл стартера экспортирует его, и завтрашний перенос может
// притащить компонент, который его зовёт. Обёртка, ничего не меняющая, честнее
// отсутствующего экспорта, который упадёт на сборке в чужих руках.

export type ThemeMode = "system" | "light" | "dark";

const THEME_CYCLE: ThemeMode[] = ["system", "light", "dark"];

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useTheme(): { mode: ThemeMode; cycleTheme: () => void } {
  const { theme, setTheme } = useNextTheme();
  const mode = (
    THEME_CYCLE.includes(theme as ThemeMode) ? theme : "system"
  ) as ThemeMode;

  const cycleTheme = useCallback(() => {
    const next =
      THEME_CYCLE[(THEME_CYCLE.indexOf(mode) + 1) % THEME_CYCLE.length];
    setTheme(next);
  }, [mode, setTheme]);

  return { cycleTheme, mode };
}
