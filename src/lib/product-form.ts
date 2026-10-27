import type { Unit } from "@/lib/types";

export const NUMBER_ERROR = "Введите неотрицательное число";

/**
 * Непустая строка → число ≥ 0. «1,5» и «1.5» равнозначны.
 * Пустая строка — не число (вызывающий код решает, что она означает).
 */
export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Сырые значения формы продукта: строки полей как их ввёл пользователь. */
export type ProductFormValues = {
  name: string;
  unit: Unit;
  /** Пустая строка означает остаток 0. */
  stock: string;
  /** Пустая строка означает dailyRate = null. */
  dailyRate: string;
  /** Пустая строка означает категорию null. */
  category: string;
};

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: "",
  unit: "шт",
  stock: "0",
  dailyRate: "",
  category: "",
};

export type ProductFormErrors = {
  name?: string;
  stock?: string;
  dailyRate?: string;
};

export type ParsedProductForm = {
  name: string;
  unit: Unit;
  stock: number;
  dailyRate: number | null;
  category: string | null;
};

export type ProductFormResult =
  | { ok: true; value: ParsedProductForm }
  | { ok: false; errors: ProductFormErrors };

/**
 * Валидация и разбор формы продукта. Единственная точка правды для
 * создания и редактирования: сообщения об ошибках и правила разбора
 * чисел (запятая как десятичный разделитель) заданы здесь.
 */
export function submitProductForm(values: ProductFormValues): ProductFormResult {
  const errors: ProductFormErrors = {};

  const name = values.name.trim();
  if (name === "") errors.name = "Введите название";

  let stock = 0;
  const stockRaw = values.stock.trim();
  if (stockRaw !== "") {
    const parsed = parseAmount(stockRaw);
    if (parsed === null) errors.stock = NUMBER_ERROR;
    else stock = parsed;
  }

  let dailyRate: number | null = null;
  const dailyRateRaw = values.dailyRate.trim();
  if (dailyRateRaw !== "") {
    const parsed = parseAmount(dailyRateRaw);
    if (parsed === null) errors.dailyRate = NUMBER_ERROR;
    else dailyRate = parsed;
  }

  if (
    errors.name !== undefined ||
    errors.stock !== undefined ||
    errors.dailyRate !== undefined
  ) {
    return { ok: false, errors };
  }

  const category = values.category.trim();
  return {
    ok: true,
    value: {
      name,
      unit: values.unit,
      stock,
      dailyRate,
      category: category === "" ? null : category,
    },
  };
}
