"use client";

import { Plus } from "lucide-react";
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
  DialogTrigger,
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
import { DEFAULT_HOUSEHOLD_ID, type Product, type Unit } from "@/lib/types";

const UNITS: Unit[] = ["шт", "г", "кг", "мл", "л"];

const DATALIST_ID = "add-product-categories";

const NUMBER_ERROR = "Введите неотрицательное число";

type AddProductDialogProps = {
  /** Существующие категории — подсказка в поле «Категория» (datalist). */
  categories: string[];
  /** Сохраняет продукт в storage; rejection означает ошибку записи. */
  onCreate: (product: Product) => Promise<void>;
};

type FieldErrors = {
  name?: string;
  stock?: string;
  dailyRate?: string;
};

/** Строка → число ≥ 0; «1,5» и «1.5» равнозначны, иначе null. */
function parseAmount(raw: string): number | null {
  const value = Number(raw.trim().replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// randomUUID есть только в защищённом контексте — нужен запасной вариант.
function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AddProductDialog({ categories, onCreate }: AddProductDialogProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<Unit>("шт");
  const [stock, setStock] = useState("0");
  const [dailyRate, setDailyRate] = useState("");
  const [category, setCategory] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const resetForm = () => {
    setName("");
    setUnit("шт");
    setStock("0");
    setDailyRate("");
    setCategory("");
    setErrors({});
    setStorageFailed(false);
  };

  // Форма считается «грязной», если отличается от состояния по умолчанию.
  const isDirty =
    name.trim() !== "" ||
    category.trim() !== "" ||
    dailyRate.trim() !== "" ||
    (stock.trim() !== "0" && stock.trim() !== "") ||
    unit !== "шт";

  const close = () => {
    setOpen(false);
    resetForm();
  };

  // Единственная точка закрытия: с введёнными данными — только через подтверждение.
  const requestClose = () => {
    if (saving) return;
    if (isDirty) {
      setConfirmClose(true);
    } else {
      close();
    }
  };

  const clearError = (field: keyof FieldErrors) => {
    setErrors((prev) =>
      prev[field] === undefined ? prev : { ...prev, [field]: undefined }
    );
  };

  const handleSubmit = async () => {
    if (saving) return;

    const trimmedName = name.trim();
    const stockValue = stock.trim() === "" ? 0 : parseAmount(stock);
    const dailyRateRaw = dailyRate.trim();
    const dailyRateValue =
      dailyRateRaw === "" ? null : parseAmount(dailyRateRaw);

    const nextErrors: FieldErrors = {};
    if (trimmedName === "") nextErrors.name = "Введите название";
    if (stockValue === null) nextErrors.stock = NUMBER_ERROR;
    if (dailyRateRaw !== "" && dailyRateValue === null) {
      nextErrors.dailyRate = NUMBER_ERROR;
    }

    if (
      trimmedName === "" ||
      stockValue === null ||
      (dailyRateRaw !== "" && dailyRateValue === null)
    ) {
      setErrors(nextErrors);
      return;
    }

    const now = new Date().toISOString();
    const product: Product = {
      id: createId(),
      householdId: DEFAULT_HOUSEHOLD_ID,
      name: trimmedName,
      unit,
      stock: stockValue,
      dailyRate: dailyRateValue,
      category: category.trim() === "" ? null : category.trim(),
      createdAt: now,
      updatedAt: now,
      lastAutoDeductAt: null,
    };

    setSaving(true);
    setStorageFailed(false);
    try {
      await onCreate(product);
      close();
    } catch {
      // Не закрываем модалку: введённые данные должны остаться на месте.
      setStorageFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          resetForm();
          setOpen(true);
        } else {
          requestClose();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full">
          <Plus className="h-4 w-4" aria-hidden />
          Добавить продукт
        </Button>
      </DialogTrigger>
      <DialogContent
        onOpenAutoFocus={(event) => {
          // Фокус сразу в «Название», а не в первый попавшийся элемент.
          event.preventDefault();
          nameRef.current?.focus();
        }}
      >
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Новый продукт</DialogTitle>
            <DialogDescription>
              Продукт появится в списке остатков.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="product-name">Название</Label>
            <Input
              id="product-name"
              ref={nameRef}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                clearError("name");
              }}
              aria-invalid={errors.name !== undefined}
              aria-describedby={
                errors.name !== undefined ? "product-name-error" : undefined
              }
            />
            {errors.name !== undefined && (
              <p id="product-name-error" className="text-xs text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="product-unit">Единица измерения</Label>
              <Select
                value={unit}
                onValueChange={(value) => setUnit(value as Unit)}
              >
                <SelectTrigger id="product-unit" aria-label="Единица измерения">
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
            <div className="space-y-1.5">
              <Label htmlFor="product-stock">Начальный остаток</Label>
              <Input
                id="product-stock"
                type="text"
                inputMode="decimal"
                value={stock}
                onChange={(event) => {
                  setStock(event.target.value);
                  clearError("stock");
                }}
                aria-invalid={errors.stock !== undefined}
                aria-describedby={
                  errors.stock !== undefined ? "product-stock-error" : undefined
                }
              />
              {errors.stock !== undefined && (
                <p id="product-stock-error" className="text-xs text-destructive">
                  {errors.stock}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-daily-rate">
              Среднесуточный расход{" "}
              <span className="font-normal text-muted-foreground">
                (необязательно)
              </span>
            </Label>
            <Input
              id="product-daily-rate"
              type="text"
              inputMode="decimal"
              placeholder="Например, 0,5"
              value={dailyRate}
              onChange={(event) => {
                setDailyRate(event.target.value);
                clearError("dailyRate");
              }}
              aria-invalid={errors.dailyRate !== undefined}
              aria-describedby={
                errors.dailyRate !== undefined
                  ? "product-daily-rate-error"
                  : undefined
              }
            />
            {errors.dailyRate !== undefined && (
              <p
                id="product-daily-rate-error"
                className="text-xs text-destructive"
              >
                {errors.dailyRate}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-category">
              Категория{" "}
              <span className="font-normal text-muted-foreground">
                (необязательно)
              </span>
            </Label>
            <Input
              id="product-category"
              type="text"
              list={DATALIST_ID}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-describedby="product-category-hint"
            />
            <datalist id={DATALIST_ID}>
              {categories.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
            <p id="product-category-hint" className="text-xs text-muted-foreground">
              Выберите существующую или введите новую.
            </p>
          </div>

          {storageFailed && (
            <p role="alert" className="text-sm font-medium text-destructive">
              Не удалось сохранить продукт
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={requestClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

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
