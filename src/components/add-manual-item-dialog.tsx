"use client";

import { useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseAmount } from "@/lib/product-form";
import type { ShoppingItem, Unit } from "@/lib/types";

const UNITS: Unit[] = ["шт", "г", "кг", "мл", "л"];

const EMPTY_FORM: FormValues = { name: "", quantity: "1", unit: "шт" };

type FormValues = { name: string; quantity: string; unit: Unit };

type FormErrors = { name?: string; quantity?: string };

/** Ввод пользователя: родитель создаёт пункт или увеличивает существующий. */
export type ManualItemInput = {
  name: string;
  quantity: number;
  unit: Unit;
  /** Задан — увеличить plannedQuantity этого пункта вместо создания нового. */
  increaseItem?: ShoppingItem;
};

type AddManualItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ручные пункты (productId === null) текущего списка — по ним ищем дубли. */
  manualItems: ShoppingItem[];
  /** Идёт запись в storage: кнопки блокируются. */
  saving: boolean;
  onSubmit: (input: ManualItemInput) => void;
};

function AddManualItemDialogInner({
  open,
  onOpenChange,
  manualItems,
  saving,
  onSubmit,
}: AddManualItemDialogProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [duplicate, setDuplicate] = useState<ShoppingItem | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const close = () => onOpenChange(false);

  const isDirty =
    values.name.trim() !== "" ||
    values.quantity !== EMPTY_FORM.quantity ||
    values.unit !== EMPTY_FORM.unit;

  // Единственная точка закрытия: с введёнными данными — через подтверждение.
  const requestClose = () => {
    if (saving) return;
    if (isDirty) {
      setConfirmClose(true);
    } else {
      close();
    }
  };

  const clearError = (field: keyof FormErrors) => {
    setErrors((prev) =>
      prev[field] === undefined ? prev : { ...prev, [field]: undefined }
    );
  };

  const submit = (increaseItem?: ShoppingItem) => {
    if (saving) return;
    const name = values.name.trim();
    const quantity = parseAmount(values.quantity);
    const nextErrors: FormErrors = {};
    if (name === "") nextErrors.name = "Введите название";
    if (quantity === null || quantity <= 0) {
      nextErrors.quantity = "Введите число больше 0";
    }
    if (nextErrors.name !== undefined || nextErrors.quantity !== undefined) {
      setErrors(nextErrors);
      return;
    }
    if (increaseItem === undefined) {
      const needle = name.toLowerCase();
      const found = manualItems.find(
        (item) =>
          item.productId === null &&
          (item.name ?? "").trim().toLowerCase() === needle
      );
      if (found !== undefined) {
        setDuplicate(found);
        return;
      }
    }
    onSubmit({ name, quantity, unit: values.unit, increaseItem });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(true);
        } else {
          requestClose();
        }
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          // Фокус сразу в «Название», как в форме продукта.
          event.preventDefault();
          nameRef.current?.focus();
        }}
      >
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Добавить вручную</DialogTitle>
            <DialogDescription>Пункт появится в списке покупок.</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="manual-item-name">Название</Label>
            <Input
              id="manual-item-name"
              ref={nameRef}
              value={values.name}
              placeholder="Например, Хлеб"
              onChange={(event) => {
                setValues((prev) => ({ ...prev, name: event.target.value }));
                clearError("name");
              }}
              aria-invalid={errors.name !== undefined}
              aria-describedby={
                errors.name !== undefined
                  ? "manual-item-name-error"
                  : undefined
              }
            />
            {errors.name !== undefined && (
              <p id="manual-item-name-error" className="text-xs text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="manual-item-quantity">Количество</Label>
              <Input
                id="manual-item-quantity"
                type="text"
                inputMode="decimal"
                value={values.quantity}
                onChange={(event) => {
                  setValues((prev) => ({
                    ...prev,
                    quantity: event.target.value,
                  }));
                  clearError("quantity");
                }}
                aria-invalid={errors.quantity !== undefined}
                aria-describedby={
                  errors.quantity !== undefined
                    ? "manual-item-quantity-error"
                    : undefined
                }
              />
              {errors.quantity !== undefined && (
                <p
                  id="manual-item-quantity-error"
                  className="text-xs text-destructive"
                >
                  {errors.quantity}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-item-unit">Единица измерения</Label>
              <Select
                value={values.unit}
                onValueChange={(value) => {
                  setValues((prev) => ({ ...prev, unit: value as Unit }));
                }}
              >
                <SelectTrigger
                  id="manual-item-unit"
                  aria-label="Единица измерения"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Добавление…" : "Добавить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <AlertDialog
        open={duplicate !== null}
        onOpenChange={(next) => {
          if (!next) setDuplicate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Такой пункт уже есть</AlertDialogTitle>
            <AlertDialogDescription>
              Увеличить количество?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const found = duplicate;
                setDuplicate(null);
                if (found !== null) submit(found);
              }}
            >
              Увеличить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Закрыть без сохранения?</AlertDialogTitle>
            <AlertDialogDescription>
              Введённые данные не будут сохранены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Продолжить редактирование</AlertDialogCancel>
            <AlertDialogAction onClick={close}>
              Закрыть без сохранения
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

export function AddManualItemDialog(props: AddManualItemDialogProps) {
  // Ключ по open: при каждом открытии форма монтируется заново с чистыми
  // значениями — без синхронизации состояния в эффекте.
  return (
    <AddManualItemDialogInner key={props.open ? "open" : "closed"} {...props} />
  );
}
