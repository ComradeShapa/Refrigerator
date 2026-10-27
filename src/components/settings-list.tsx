"use client";

import { AlertCircle, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TIME_PATTERN,
  loadSettings,
  resetAllData,
  saveSettings,
} from "@/lib/storage";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/types";

const TIME_ERROR = "Введите время в формате ЧЧ:ММ (например, 22:00)";

function detectTimezone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && zone !== "" ? zone : null;
  } catch {
    return null;
  }
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4" role="status">
      <span className="sr-only">Загрузка…</span>
      <div className="rounded-xl border bg-card p-4" aria-hidden>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-11 w-full" />
        <Skeleton className="mt-5 h-4 w-24" />
        <Skeleton className="mt-3 h-11 w-full" />
      </div>
      <Skeleton className="h-11 w-full rounded-xl" aria-hidden />
      <Skeleton className="h-24 w-full rounded-xl" aria-hidden />
    </div>
  );
}

export function SettingsList() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [dayEndTime, setDayEndTime] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  // Ленивый инициализатор: таймзона не попадает в рендер до загрузки настроек,
  // поэтому вычисленное на клиенте значение не ломает гидратацию.
  const [deviceTimezone] = useState(detectTimezone);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const value = await loadSettings();
        if (!cancelled) {
          setSettings(value);
          setDayEndTime(value.dayEndTime);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setFailed(false);
    setAttempt((value) => value + 1);
  };

  const handleSave = async () => {
    if (settings === null || saving) return;
    const value = dayEndTime.trim();
    if (!TIME_PATTERN.test(value)) {
      setFieldError(TIME_ERROR);
      return;
    }
    setFieldError(null);
    setSaveError(false);
    setSaving(true);
    try {
      const next = { ...settings, dayEndTime: value };
      await saveSettings(next);
      setSettings(next);
      toast.success("Настройки сохранены");
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      await resetAllData();
      setSettings({ ...DEFAULT_SETTINGS });
      setDayEndTime(DEFAULT_SETTINGS.dayEndTime);
      setFieldError(null);
      setSaveError(false);
      toast.success("Данные сброшены");
    } catch {
      toast.error("Не удалось сбросить данные");
    } finally {
      setResetting(false);
    }
  };

  if (failed) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
      >
        <AlertCircle
          className="mx-auto h-7 w-7 text-destructive"
          strokeWidth={1.75}
          aria-hidden
        />
        <p className="mt-3 text-sm font-medium">Не удалось загрузить настройки</p>
        <p className="mx-auto mt-1 max-w-[260px] text-sm text-muted-foreground">
          Возможно, браузер запрещает этому сайту сохранять данные.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={retry}>
          Повторить
        </Button>
      </div>
    );
  }

  if (settings === null) return <SettingsSkeleton />;

  const timezone = settings.timezone ?? deviceTimezone ?? "Не определена";

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="settings-day-end">Время окончания дня</Label>
          <Input
            id="settings-day-end"
            type="time"
            value={dayEndTime}
            className="h-11 w-full"
            disabled={saving}
            aria-invalid={fieldError !== null}
            aria-describedby={
              fieldError !== null ? "settings-day-end-error" : undefined
            }
            onChange={(event) => {
              setDayEndTime(event.target.value);
              if (fieldError !== null) setFieldError(null);
            }}
          />
          {fieldError !== null && (
            <p
              id="settings-day-end-error"
              role="alert"
              className="text-xs text-destructive"
            >
              {fieldError}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium leading-none">Таймзона</p>
          <div className="flex h-11 w-full items-center rounded-md border bg-muted/40 px-3">
            <span className="truncate text-sm">{timezone}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Определяется автоматически
          </p>
        </div>
      </section>

      <div className="space-y-2">
        <Button type="submit" className="h-11 w-full" disabled={saving}>
          {saving ? "Сохранение…" : "Сохранить настройки"}
        </Button>
        {saveError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            Не удалось сохранить настройки
          </p>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={resetting}
        onClick={() => setConfirmReset(true)}
      >
        {resetting ? "Сброс…" : "Сбросить демо-данные"}
      </Button>

      <section
        aria-labelledby="settings-auto-deduct"
        className="rounded-xl border bg-card p-4"
      >
        <h2
          id="settings-auto-deduct"
          className="flex items-center gap-2 text-sm font-medium"
        >
          <Info
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          Справка по автосписанию
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Раз в день после указанного времени остатки продуктов уменьшаются на
          среднесуточный расход. Если приложение было закрыто несколько дней,
          списание досчитается при следующем открытии. Продукты без указанного
          расхода не списываются.
        </p>
      </section>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сбросить все данные?</AlertDialogTitle>
            <AlertDialogDescription>
              Продукты и списки покупок будут удалены, каталог восстановлен.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void handleReset();
              }}
            >
              Сбросить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
