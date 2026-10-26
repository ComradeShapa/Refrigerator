import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = {
  title: "Настройки",
};

const rows = [
  { label: "Тема", value: "Светлая" },
  { label: "Версия", value: "0.1.0" },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <AppHeader title="Настройки" backHref="/" />
      <main className="flex-1 px-4 py-6">
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
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Здесь появятся параметры приложения.
        </p>
      </main>
    </div>
  );
}
