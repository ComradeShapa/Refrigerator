import { SEED_CATALOG } from "@/lib/catalog";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type Product,
  type ShoppingList,
  type ShoppingListItem,
  type ThemeSetting,
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

const KEYS = {
  products: "fridge.products.v1",
  shoppingLists: "fridge.shopping-lists.v1",
  shoppingListItems: "fridge.shopping-list-items.v1",
  settings: "fridge.settings.v1",
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
    name: value.name,
    unit: value.unit,
    stock: parseNumber(value.stock) ?? 0,
    dailyRate: parseNumber(value.dailyRate),
    category: typeof value.category === "string" ? value.category : "",
    createdAt,
    updatedAt,
  };
}

function parseShoppingList(value: unknown): ShoppingList | null {
  if (!isRecord(value)) return null;
  const createdAt = parseTimestamp(value.createdAt);
  const updatedAt = parseTimestamp(value.updatedAt);
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return { id: value.id, name: value.name, createdAt, updatedAt };
}

function parseShoppingListItem(value: unknown): ShoppingListItem | null {
  if (!isRecord(value)) return null;
  const createdAt = parseTimestamp(value.createdAt);
  const updatedAt = parseTimestamp(value.updatedAt);
  if (
    typeof value.id !== "string" ||
    typeof value.listId !== "string" ||
    typeof value.name !== "string" ||
    !isUnit(value.unit) ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    id: value.id,
    listId: value.listId,
    name: value.name,
    quantity: parseNumber(value.quantity),
    unit: value.unit,
    checked: value.checked === true,
    createdAt,
    updatedAt,
  };
}

function parseSettings(raw: unknown): AppSettings {
  if (!isRecord(raw)) return DEFAULT_SETTINGS;
  const theme: ThemeSetting =
    raw.theme === "light" || raw.theme === "dark" || raw.theme === "system"
      ? raw.theme
      : DEFAULT_SETTINGS.theme;
  return { theme };
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
    ...item,
    stock: 0,
    dailyRate: null,
    createdAt: now,
    updatedAt: now,
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

export async function loadShoppingListItems(): Promise<ShoppingListItem[]> {
  return parseArray(readJson(KEYS.shoppingListItems), parseShoppingListItem) ?? [];
}

export async function saveShoppingListItems(
  items: ShoppingListItem[]
): Promise<void> {
  writeJson(KEYS.shoppingListItems, items);
}

export async function loadSettings(): Promise<AppSettings> {
  return parseSettings(readJson(KEYS.settings));
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  writeJson(KEYS.settings, settings);
}
