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
import { formatQuantity } from "@/lib/format";
import {
  EMPTY_PRODUCT_FORM,
  submitProductForm,
  type ProductFormErrors,
  type ProductFormValues,
} from "@/lib/product-form";
import { DEFAULT_HOUSEHOLD_ID, type Product, type Unit } from "@/lib/types";

const UNITS: Unit[] = ["шт", "г", "кг", "мл", "л"];

const DATALIST_ID = "product-categories";

type ProductDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  /** В режиме edit — редактируемый продукт; в create не используется. */
  product: Product | null;
  /** Существующие категории — подсказка в поле «Категория» (datalist). */
  categories: string[];
  /** Сохраняет продукт в storage; rejection означает ошибку записи. */
  onCreate: (product: Product) => Promise<void>;
  /** Сохраняет изменения продукта; rejection означает ошибку записи. */
  onUpdate: (product: Product) => Promise<void>;
};

// randomUUID есть только в защищённом контексте — нужен запасной вариант.
function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formValuesFromProduct(product: Product): ProductFormValues {
  return {
    name: product.name,
    unit: product.unit,
    stock: formatQuantity(product.stock),
    dailyRate:
      product.dailyRate === null ? "" : formatQuantity(product.dailyRate),
    category: product.category ?? "",
  };
}

function areSameValues(a: ProductFormValues, b: ProductFormValues): boolean {
  return (
    a.name === b.name &&
    a.unit === b.unit &&
    a.stock === b.stock &&
    a.dailyRate === b.dailyRate &&
    a.category === b.category
  );
}

function ProductDialogInner({
  open,
  onOpenChange,
  mode,
  product,
  categories,
  onCreate,
  onUpdate,
}: ProductDialogProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);

  // Компонент монтируется заново при каждом открытии (см. ProductDialog ниже),
  // поэтому начальное состояние формы задаётся ленивыми инициализаторами.
  const [initialValues] = useState<ProductFormValues>(() =>
    mode === "edit" && product !== null
      ? formValuesFromProduct(product)
      : EMPTY_PRODUCT_FORM
  );
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [errors, setErrors] = useState<ProductFormErrors>({});

  const isDirty = !areSameValues(values, initialValues);

  const close = () => onOpenChange(false);

  // Единственная точка закрытия: с изменёнными данными — только через подтверждение.
  const requestClose = () => {
    if (saving) return;
    if (isDirty) {
      setConfirmClose(true);
    } else {
      close();
    }
  };

  const clearError = (field: keyof ProductFormErrors) => {
    setErrors((prev) =>
      prev[field] === undefined ? prev : { ...prev, [field]: undefined }
    );
  };

  const updateValue = (field: keyof ProductFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (saving) return;

    const result = submitProductForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const parsed = result.value;
    const now = new Date().toISOString();

    setSaving(true);
    setStorageFailed(false);
    try {
      if (mode === "edit" && product !== null) {
        const updated: Product = {
          ...product,
          name: parsed.name,
          unit: parsed.unit,
          stock: parsed.stock,
          dailyRate: parsed.dailyRate,
          category: parsed.category,
          updatedAt: now,
        };
        const unchanged =
          updated.name === product.name &&
          updated.unit === product.unit &&
          updated.stock === product.stock &&
          updated.dailyRate === product.dailyRate &&
          updated.category === product.category;
        // Изменений нет — не пишем в storage и не трогаем updatedAt.
        if (!unchanged) {
          await onUpdate(updated);
        }
      } else {
        const created: Product = {
          id: createId(),
          householdId: DEFAULT_HOUSEHOLD_ID,
          name: parsed.name,
          unit: parsed.unit,
          stock: parsed.stock,
          dailyRate: parsed.dailyRate,
          category: parsed.category,
          createdAt: now,
          updatedAt: now,
          lastAutoDeductAt: null,
        };
        await onCreate(created);
      }
      close();
    } catch {
      // Не закрываем модалку: введённые данные должны остаться на месте.
      setStorageFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const isEdit = mode === "edit";

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
            <DialogTitle>
              {isEdit ? "Редактировать продукт" : "Новый продукт"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Изменения сразу появятся в списке остатков."
                : "Продукт появится в списке остатков."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="product-name">Название</Label>
            <Input
              id="product-name"
              ref={nameRef}
              value={values.name}
              onChange={(event) => {
                updateValue("name", event.target.value);
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
                value={values.unit}
                onValueChange={(value) => {
                  setValues((prev) => ({ ...prev, unit: value as Unit }));
                }}
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
              <Label htmlFor="product-stock">
                {isEdit ? "Остаток" : "Начальный остаток"}
              </Label>
              <Input
                id="product-stock"
                type="text"
                inputMode="decimal"
                value={values.stock}
                onChange={(event) => {
                  updateValue("stock", event.target.value);
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
              value={values.dailyRate}
              onChange={(event) => {
                updateValue("dailyRate", event.target.value);
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
              value={values.category}
              onChange={(event) => updateValue("category", event.target.value)}
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
              {isEdit
                ? "Не удалось сохранить изменения"
                : "Не удалось сохранить продукт"}
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

export function ProductDialog(props: ProductDialogProps) {
  // Ключ по open: при каждом открытии форма монтируется заново и заполняется
  // с нуля — без синхронизации состояния в эффекте.
  return <ProductDialogInner key={props.open ? "open" : "closed"} {...props} />;
}
