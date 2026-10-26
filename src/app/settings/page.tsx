import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { SettingsList } from "@/components/settings-list";

export const metadata: Metadata = {
  title: "Настройки",
};

export default function SettingsPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <AppHeader title="Настройки" backHref="/" />
      <main className="flex-1 px-4 py-6">
        <SettingsList />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Здесь появятся параметры приложения.
        </p>
      </main>
    </div>
  );
}
