"use client";

import { Keyboard, Refrigerator, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AddItemSourceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPickCatalog: () => void;
  onPickManual: () => void;
};

function SourceOption({
  icon: Icon,
  title,
  hint,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {hint}
        </span>
      </span>
    </button>
  );
}

/**
 * Выбор способа добавления пункта: крупные строки вместо выпадающего меню,
 * чтобы на телефоне попасть в опцию было легко.
 */
export function AddItemSourceDialog({
  open,
  onOpenChange,
  onPickCatalog,
  onPickManual,
}: AddItemSourceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить пункт</DialogTitle>
          <DialogDescription>
            Откуда добавить пункты в список?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <SourceOption
            icon={Refrigerator}
            title="Из каталога"
            hint="Продукты со страницы «Остатки»"
            onClick={onPickCatalog}
          />
          <SourceOption
            icon={Keyboard}
            title="Вручную"
            hint="Ввести название и количество"
            onClick={onPickManual}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
