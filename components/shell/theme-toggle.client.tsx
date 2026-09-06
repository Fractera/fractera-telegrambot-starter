"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/providers/theme-provider.client";

// Theme day/night toggle (step 160, footer). UI standard: shadcn Button + lucide icons.
// Cycles system → light → dark via cycleTheme() from the existing ThemeProvider; the
// icon names the CURRENT mode (Monitor=system, Sun=light, Moon=dark). JS-only by nature
// (theming is a client concern); without JS it simply does nothing.
export function ThemeToggle({
  labels,
}: {
  labels: { system: string; light: string; dark: string };
}) {
  const { mode, cycleTheme } = useTheme();
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  const label =
    mode === "light"
      ? labels.light
      : mode === "dark"
        ? labels.dark
        : labels.system;
  return (
    <Button
      aria-label={label}
      onClick={cycleTheme}
      size="icon"
      title={label}
      type="button"
      variant="ghost"
    >
      <Icon />
    </Button>
  );
}
