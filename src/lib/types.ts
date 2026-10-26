/** Единицы измерения продуктов. */
export type Unit = "шт" | "г" | "кг" | "мл" | "л";

export type Product = {
  id: string;
  name: string;
  unit: Unit;
  /** Текущий остаток в единицах `unit`. */
  stock: number;
  /** Среднесуточный расход в единицах `unit`; `null` — не задан. */
  dailyRate: number | null;
  category: string;
  /** Даты в формате ISO (UTC). */
  createdAt: string;
  updatedAt: string;
};

export type ShoppingList = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ShoppingListItem = {
  id: string;
  /** Список покупок, к которому относится пункт. */
  listId: string;
  name: string;
  /** Сколько нужно купить; `null` — количество не указано. */
  quantity: number | null;
  unit: Unit;
  /** Отмечен как купленный. */
  checked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ThemeSetting = "light" | "dark" | "system";

export type AppSettings = {
  theme: ThemeSetting;
};

export const DEFAULT_SETTINGS: AppSettings = { theme: "light" };
