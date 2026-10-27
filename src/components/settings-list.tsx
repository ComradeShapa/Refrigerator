"use client";

import { useEffect, useState } from "react";
import { loadSettings } from "@/lib/storage";
import type { AppSettings } from "@/lib/types";

export function SettingsList() {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((value) => {
        if (!cancelled) setSettings(value);
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = [
    { label: "Конец дня", value: settings?.dayEndTime ?? "—" },
    {
      label: "Таймзона",
      value: settings ? (settings.timezone ?? "Локальная") : "—",
    },
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
