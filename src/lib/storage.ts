import { SEED_CATALOG } from "@/lib/catalog";
import {
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_SETTINGS,
  type AppSettings,
  type Product,
  type ShoppingItem,
  type ShoppingItemStatus,
  type ShoppingList,
  type ShoppingListStatus,
  type Unit,
} from "@/lib/types";

/**
 * Асинхронное хранилище приложения. Экраны работают только с этим модулем,
 * поэтому localStorage позже можно заменить на backend без правок интерфейса.
 *
 * Контракт: чтение не бросает исключений — повреждённый или отсутствующий
 * JSON заменяется значениями по умолчанию (для продуктов — повторным сидом
 * каталога). Запись может бросить исключение (недоступный localStorage,
 * переполнение квоты) — вызывающий код решает, как показать проблему.
 */

// Ключи v2: форма данных изменилась (householdId, статусы, новая Settings),
// старые записи v1 намеренно не мигрируют.
const KEYS = {
  products: "fridge.products.v2",
  shoppingLists: "fridge.shopping-lists.v2",
  shoppingItems: "fridge.shopping-items.v2",
  settings: "fridge.settings.v2",
} as const;

function getLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    // Например, доступ к localStorage запрещён настройками браузера.
    return null;
  }
}

function readJson(key: string): unknown {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as unknown;
  } catch (error) {
    console.error(`Не удалось прочитать «${key}» из localStorage`, error);
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  const storage = getLocalStorage();
  if (!storage) throw new Error("localStorage недоступен");
  storage.setItem(key, JSON.stringify(value));
}

const UNITS: readonly string[] = ["шт", "г", "кг", "мл", "л"];

function isUnit(value: unknown): value is Unit {
  return typeof value === "string" && UNITS.includes(value);
}

const LIST_STATUSES: readonly string[] = ["draft", "active", "completed"];

function isShoppingListStatus(value: unknown): value is ShoppingListStatus {
  return typeof value === "string" && LIST_STATUSES.includes(value);
}

const ITEM_STATUSES: readonly string[] = ["pending", "bought", "unavailable"];

function isShoppingItemStatus(value: unknown): value is ShoppingItemStatus {
  return typeof value === "string" && ITEM_STATUSES.includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTimestamp(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function parseNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseHouseholdId(value: unknown): string {
  return typeof value === "string" && value !== ""
    ? value
    : DEFAULT_HOUSEHOLD_ID;
}

function parseOptionalText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function parseProduct(value: unknown): Product | null {
  if (!isRecord(value)) return null;
  const createdAt = parseTimestamp(value.createdAt);
  const updatedAt = parseTimestamp(value.updatedAt);
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !isUnit(value.unit) ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    id: value.id,
    householdId: parseHouseholdId(value.householdId),
    name: value.name,
    unit: value.unit,
    stock: parseNumber(value.stock) ?? 0,
    dailyRate: parseNumber(value.dailyRate),
    category: parseOptionalText(value.category),
    createdAt,
    updatedAt,
    lastAutoDeductAt: parseTimestamp(value.lastAutoDeductAt),
  };
}

function parseShoppingList(value: unknown): ShoppingList | null {
  if (!isRecord(value)) return null;
  const createdAt = parseTimestamp(value.createdAt);
  if (
    typeof value.id !== "string" ||
    !isShoppingListStatus(value.status) ||
    !createdAt
  ) {
    return null;
  }
  return {
    id: value.id,
    householdId: parseHouseholdId(value.householdId),
    status: value.status,
    createdAt,
    completedAt: parseTimestamp(value.completedAt),
  };
}

function parseShoppingItem(value: unknown): ShoppingItem | null {
  if (!isRecord(value)) return null;
  const createdAt = parseTimestamp(value.createdAt);
  const updatedAt = parseTimestamp(value.updatedAt);
  if (
    typeof value.id !== "string" ||
    typeof value.listId !== "string" ||
    !isUnit(value.unit) ||
    !isShoppingItemStatus(value.status) ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    id: value.id,
    listId: value.listId,
    productId: parseOptionalText(value.productId),
    name: parseOptionalText(value.name),
    unit: value.unit,
    plannedQuantity: parseNumber(value.plannedQuantity),
    status: value.status,
    createdAt,
    updatedAt,
  };
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function parseSettings(raw: unknown): AppSettings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS };
  const dayEndTime =
    typeof raw.dayEndTime === "string" && TIME_PATTERN.test(raw.dayEndTime)
      ? raw.dayEndTime
      : DEFAULT_SETTINGS.dayEndTime;
  return {
    dayEndTime,
    timezone: parseOptionalText(raw.timezone),
  };
}

function parseArray<T>(
  raw: unknown,
  parseItem: (value: unknown) => T | null
): T[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.flatMap((value) => {
    const item = parseItem(value);
    return item === null ? [] : [item];
  });
}

export async function loadProducts(): Promise<Product[]> {
  const parsed = parseArray(readJson(KEYS.products), parseProduct);
  if (parsed) return parsed;

  // Первый запуск или повреждённые данные: создаём базовый каталог.
  const now = new Date().toISOString();
  const products: Product[] = SEED_CATALOG.map((item) => ({
    id: item.id,
    householdId: DEFAULT_HOUSEHOLD_ID,
    name: item.name,
    unit: item.unit,
    stock: 0,
    dailyRate: null,
    category: item.category,
    createdAt: now,
    updatedAt: now,
    lastAutoDeductAt: null,
  }));
  await saveProducts(products);
  return products;
}

export async function saveProducts(products: Product[]): Promise<void> {
  writeJson(KEYS.products, products);
}

export async function loadShoppingLists(): Promise<ShoppingList[]> {
  return parseArray(readJson(KEYS.shoppingLists), parseShoppingList) ?? [];
}

export async function saveShoppingLists(lists: ShoppingList[]): Promise<void> {
  writeJson(KEYS.shoppingLists, lists);
}

export async function loadShoppingItems(): Promise<ShoppingItem[]> {
  return parseArray(readJson(KEYS.shoppingItems), parseShoppingItem) ?? [];
}

export async function saveShoppingItems(items: ShoppingItem[]): Promise<void> {
  writeJson(KEYS.shoppingItems, items);
}

export async function loadSettings(): Promise<AppSettings> {
  return parseSettings(readJson(KEYS.settings));
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  writeJson(KEYS.settings, settings);
}
