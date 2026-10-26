"use client";

import { useEffect, useState } from "react";
import { loadSettings } from "@/lib/storage";
import type { ThemeSetting } from "@/lib/types";

const THEME_LABELS: Record<ThemeSetting, string> = {
  light: "Светлая",
  dark: "Тёмная",
  system: "Системная",
};

export function SettingsList() {
  const [theme, setTheme] = useState<ThemeSetting | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((settings) => {
        if (!cancelled) setTheme(settings.theme);
      })
      .catch(() => {
        if (!cancelled) setTheme(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = [
    { label: "Тема", value: theme ? THEME_LABELS[theme] : "—" },
    { label: "Версия", value: "0.1.0" },
  ];

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {rows.map((row) => (
        <li
          key={row.label}
          className="flex items-center justify-between px-4 py-3.5 text-sm"
        >
          <span>{row.label}</span>
          <span className="text-muted-foreground">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}
