/** Единицы измерения продуктов. */
export type Unit = "шт" | "г" | "кг" | "мл" | "л";

/** Идентификатор домохозяйства: в MVP всегда "default". */
export const DEFAULT_HOUSEHOLD_ID = "default";

/** Даты во всех сущностях хранятся в формате ISO (UTC). */

export type Product = {
  id: string;
  householdId: string;
  name: string;
  unit: Unit;
  /** Текущий остаток в единицах `unit`. */
  stock: number;
  /** Среднесуточный расход в единицах `unit`; `null` — не задан. */
  dailyRate: number | null;
  /** Категория каталога; `null` — не задана. */
  category: string | null;
  createdAt: string;
  updatedAt: string;
  /** Дата последнего автосписания; `null` — списаний ещё не было. */
  lastAutoDeductAt: string | null;
};

export type ShoppingListStatus = "draft" | "active" | "completed";

export const SHOPPING_LIST_STATUS_LABELS: Record<ShoppingListStatus, string> = {
  draft: "Черновик",
  active: "В работе",
  completed: "Завершён",
};

export type ShoppingList = {
  id: string;
  householdId: string;
  status: ShoppingListStatus;
  createdAt: string;
  /** Дата завершения; `null` — список ещё не завершён. */
  completedAt: string | null;
};

export type ShoppingItemStatus = "pending" | "bought" | "unavailable";

export const SHOPPING_ITEM_STATUS_LABELS: Record<ShoppingItemStatus, string> = {
  pending: "Ожидает",
  bought: "Куплено",
  unavailable: "Нет в магазине",
};

export type ShoppingItem = {
  id: string;
  /** Список покупок, к которому относится пункт. */
  listId: string;
  /** Связанный продукт каталога; `null` — пункт введён вручную. */
  productId: string | null;
  /** Название ручного пункта; `null` — название берётся у продукта из каталога. */
  name: string | null;
  unit: Unit;
  /** Планируемое количество; `null` — количество не указано. */
  plannedQuantity: number | null;
  status: ShoppingItemStatus;
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = {
  /** Время окончания дня в формате HH:mm. */
  dayEndTime: string;
  /** Таймзона IANA; `null` — локальная таймзона устройства. */
  timezone: string | null;
};

export const DEFAULT_SETTINGS: AppSettings = {
  dayEndTime: "00:00",
  timezone: null,
};
