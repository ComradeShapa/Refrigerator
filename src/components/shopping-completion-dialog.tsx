"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { CompletionPreview } from "@/lib/shopping-completion";
import { formatShoppingQuantity } from "@/lib/shopping-format";

export function ShoppingCompletionDialog({
  preview,
  saving,
  error,
  onCancel,
  onConfirm,
  onReturnFocus,
}: {
  preview: CompletionPreview;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (selected: string[]) => void;
  onReturnFocus: () => void;
}) {
  const [selected, setSelected] = useState(
    () => new Set(preview.shortages.map((entry) => entry.itemId))
  );
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onCancel();
      }}
    >
      <AlertDialogContent
        className="max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[calc(100%-2rem)] overflow-y-auto rounded-lg"
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onReturnFocus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {preview.shortages.length
              ? "Что добавить в следующий список?"
              : "Завершить поход?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {preview.shortages.length
              ? "Некоторые товары не удалось купить полностью. Выберите, что стоит докупить:"
              : `Куплено позиций: ${preview.boughtCount}. Фактически купленное количество пополнит остатки.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {preview.shortages.length > 0 && (
          <div className="space-y-3">
            {preview.shortages.map((entry) => (
              <label
                key={entry.itemId}
                className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"
              >
                <span className="relative mt-0.5 h-[18px] w-[18px] shrink-0">
                  <input
                    type="checkbox"
                    className="peer h-full w-full appearance-none rounded-[3px] border-2 border-foreground/60 checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                    disabled={saving}
                    checked={selected.has(entry.itemId)}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setSelected((current) => {
                        const next = new Set(current);
                        if (checked) next.add(entry.itemId);
                        else next.delete(entry.itemId);
                        return next;
                      });
                    }}
                  />
                  <Check
                    aria-hidden
                    className="pointer-events-none absolute inset-0 h-full w-full p-px text-primary-foreground opacity-0 peer-checked:opacity-100"
                  />
                </span>
                <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                  {entry.name}
                </span>
                <span className="shrink-0 whitespace-nowrap text-right text-muted-foreground">
                  {formatShoppingQuantity(entry.quantity)} {entry.unit}
                </span>
              </label>
            ))}
            <p className="text-sm text-muted-foreground">
              Эти товары попадут в следующий список. Купленные товары пополнят
              остатки.
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={saving}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={(event) => {
              event.preventDefault();
              onConfirm([...selected]);
            }}
          >
            {saving ? "Завершение…" : "Завершить поход"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
