import {
  sameCompletionData,
  validateCompletionOperation,
} from "@/lib/shopping-completion";
import type {
  CompletionOperation,
  CompletionSnapshot,
} from "@/lib/shopping-completion";
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
 * Контракт обычного чтения: повреждённый или отсутствующий
 * JSON заменяется значениями по умолчанию (для продуктов — повторным сидом
 * каталога). Запись может бросить исключение (недоступный localStorage,
 * переполнение квоты) — вызывающий код решает, как показать проблему.
 * Ошибки восстановления журнала бросаются и при чтении: частично применённые
 * данные нельзя показывать или заменять значениями по умолчанию.
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
  recoverShoppingCompletion();
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
  recoverShoppingCompletion();
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
  const actual = parseNumber(value.actualQuantity);
  const actualQuantity =
    value.status === "bought" && actual !== null && actual > 0 ? actual : null;
  // Не выдумываем факт покупки: старый/повреждённый bought требует подтверждения.
  const status =
    value.status === "bought" && actualQuantity === null
      ? "pending"
      : value.status;
  return {
    id: value.id,
    listId: value.listId,
    productId: parseOptionalText(value.productId),
    name: parseOptionalText(value.name),
    unit: value.unit,
    plannedQuantity: parseNumber(value.plannedQuantity),
    status,
    actualQuantity,
    createdAt,
    updatedAt,
  };
}

/** Формат времени HH:mm (00:00–23:59): единая валидация для storage и UI. */
export const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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

function readProducts(): Product[] {
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
  writeJson(KEYS.products, products);
  return products;
}

export async function loadProducts(): Promise<Product[]> {
  return readProducts();
}

/** Один синхронный read/modify/write после восстановления; автосписание не пишет устаревший снимок. */
export async function updateProducts<T>(
  update: (products: Product[]) => {
    products: Product[];
    result: T;
    changed: boolean;
  }
): Promise<T> {
  recoverShoppingCompletion();
  const updated = update(readProducts());
  if (updated.changed) writeJson(KEYS.products, updated.products);
  return updated.result;
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

/**
 * Текущий черновик — последний по createdAt среди списков со статусом draft,
 * либо null. Входной массив не мутируется: фильтр возвращает копию.
 */
export async function loadDraftShoppingList(): Promise<ShoppingList | null> {
  const drafts = (await loadShoppingLists()).filter(
    (list) => list.status === "draft"
  );
  drafts.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return drafts[0] ?? null;
}

/** Активный список (status === "active"), либо null, если поход не начат. */
export async function loadActiveShoppingList(): Promise<ShoppingList | null> {
  const lists = await loadShoppingLists();
  return lists.find((list) => list.status === "active") ?? null;
}

export async function loadSettings(): Promise<AppSettings> {
  return parseSettings(readJson(KEYS.settings));
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  writeJson(KEYS.settings, settings);
}

/**
 * Полный сброс: удаляет все ключи приложения в localStorage (включая legacy v1),
 * заново сеет каталог продуктов и возвращает настройки к значениям по умолчанию.
 * Бросает исключение, если localStorage недоступен или запись не удалась.
 */
export async function resetAllData(): Promise<void> {
  const storage = getLocalStorage();
  if (!storage) throw new Error("localStorage недоступен");
  // Сначала собираем ключи: удаление во время перебора сдвигает индексы.
  const appKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null && key.startsWith("fridge.")) {
      appKeys.push(key);
    }
  }
  for (const key of appKeys) {
    storage.removeItem(key);
  }
  // После очистки loadProducts сам пересоздаёт и сохраняет каталог,
  // saveSettings записывает настройки по умолчанию.
  await loadProducts();
  await saveSettings({ ...DEFAULT_SETTINGS });
}

const COMPLETION_KEY = "fridge.shopping-completion.v1";
type DataKey = "products" | "lists" | "items";
const DATA_KEYS: Record<DataKey, string> = {
  products: KEYS.products,
  lists: KEYS.shoppingLists,
  items: KEYS.shoppingItems,
};
const DATA_NAMES: DataKey[] = ["products", "lists", "items"];
type CompletionJournal = {
  version: 2;
  operation: CompletionOperation;
  before: Record<DataKey, string | null>;
  after: Record<DataKey, string>;
};

function requireStorage(): Storage {
  const storage = getLocalStorage();
  if (!storage) throw new Error("Не удалось открыть хранилище");
  return storage;
}
function parseSnapshot(
  raw: Record<DataKey, string | null>
): CompletionSnapshot {
  function array<T>(key: DataKey, parse: (value: unknown) => T | null): T[] {
    const value: unknown = raw[key] === null ? [] : JSON.parse(raw[key]!);
    if (!Array.isArray(value))
      throw new Error("Повреждённые данные. Завершение заблокировано");
    return value.map((entry: unknown) => {
      const parsed = parse(entry);
      if (!parsed || !isRecord(entry))
        throw new Error("Повреждённая запись. Завершение заблокировано");
      if (
        key === "products" &&
        (typeof entry.stock !== "number" ||
          !Number.isFinite(entry.stock) ||
          entry.stock < 0)
      )
        throw new Error(
          "Некорректный остаток. Исправьте его перед завершением"
        );
      // Сохраняем также неизвестные поля; валидные чужие записи не теряются.
      return { ...entry, ...parsed };
    });
  }
  return {
    products: array("products", parseProduct),
    lists: array("lists", parseShoppingList),
    items: array("items", parseShoppingItem),
  };
}
function readData(storage: Storage): Record<DataKey, string | null> {
  return {
    products: storage.getItem(KEYS.products),
    lists: storage.getItem(KEYS.shoppingLists),
    items: storage.getItem(KEYS.shoppingItems),
  };
}

/**
 * Roll-forward по after-images. Никаких await между journal/данными/удалением.
 * Все обычные обращения проходят этот барьер ДО чтения/записи.
 * Если очистка не удалась, барьер остаётся закрыт: более новых записей ещё нет.
 * Проверка before/after дополнительно запрещает затирать посторонние изменения.
 * Гарантия: одна вкладка, включая перезапуск. Межвкладочной блокировки нет.
 */
export function recoverShoppingCompletion(): boolean {
  const storage = getLocalStorage();
  if (!storage) return false;
  const raw = storage.getItem(COMPLETION_KEY);
  if (raw === null) return false;
  const journal = validateCompletionJournal(() => JSON.parse(raw) as unknown);
  const current = readData(storage);
  for (const key of DATA_NAMES) {
    if (
      current[key] !== journal.before[key] &&
      current[key] !== journal.after[key]
    )
      throw new Error(
        "Данные изменились вне операции. Автоматическое восстановление заблокировано"
      );
  }
  // Присваивание уже рассчитанных значений идемпотентно, в том числе при сбое
  // сразу после записи любого ключа, до фиксации какого-либо отдельного флага.
  for (const key of DATA_NAMES) {
    if (current[key] !== journal.after[key])
      storage.setItem(DATA_KEYS[key], journal.after[key]);
  }
  const applied = readData(storage);
  if (DATA_NAMES.some((key) => applied[key] !== journal.after[key]))
    throw new Error(
      "Не удалось подтвердить сохранение похода. Журнал сохранён для безопасного повтора"
    );
  storage.removeItem(COMPLETION_KEY);
  return true;
}

export function hasPendingShoppingCompletion(): boolean {
  return requireStorage().getItem(COMPLETION_KEY) !== null;
}
export function loadCompletionSnapshot(): CompletionSnapshot {
  recoverShoppingCompletion();
  return parseSnapshot(readData(requireStorage()));
}
export function commitShoppingCompletion(
  build: (snapshot: CompletionSnapshot) => CompletionOperation
): void {
  recoverShoppingCompletion();
  const storage = requireStorage();
  const beforeRaw = readData(storage);
  const before = parseSnapshot(beforeRaw);
  const operation = build(before);
  const after = completionImages(beforeRaw, before, operation.after);
  const journal: CompletionJournal = {
    version: 2,
    operation,
    before: beforeRaw,
    after,
  };
  validateCompletionJournal(() => journal);
  // Первая запись: если она не удалась, основные ключи ещё не тронуты.
  storage.setItem(COMPLETION_KEY, JSON.stringify(journal));
  recoverShoppingCompletion();
}

/** Точные raw images: неизменённые legacy/чужие записи остаются исходными. */
function completionImages(
  beforeRaw: Record<DataKey, string | null>,
  before: CompletionSnapshot,
  result: CompletionSnapshot
): Record<DataKey, string> {
  const after = {} as Record<DataKey, string>;
  for (const key of DATA_NAMES) {
    const rawEntries =
      beforeRaw[key] === null ? [] : JSON.parse(beforeRaw[key]!);
    // Не переписываем нормализованные/legacy записи, которых операция не касалась.
    const rawById = new Map(
      rawEntries.map((entry: { id: string }) => [entry.id, entry])
    );
    const beforeById = new Map(before[key].map((entry) => [entry.id, entry]));
    after[key] = JSON.stringify(
      result[key].map((entry) =>
        sameCompletionData(entry, beforeById.get(entry.id))
          ? rawById.get(entry.id)
          : entry
      )
    );
  }
  return after;
}

/** Полностью проверяется до сравнения текущих данных и до первой записи/очистки. */
function validateCompletionJournal(read: () => unknown): CompletionJournal {
  try {
    const value = read();
    if (
      !isRecord(value) ||
      value.version !== 2 ||
      !isRecord(value.operation) ||
      !isRecord(value.before) ||
      !isRecord(value.after)
    )
      throw new Error("format");
    const journal = value as CompletionJournal;
    for (const key of DATA_NAMES) {
      if (
        (journal.before[key] !== null &&
          typeof journal.before[key] !== "string") ||
        typeof journal.after[key] !== "string"
      )
        throw new Error("images");
    }
    const before = parseSnapshot(journal.before);
    if (!sameCompletionData(before, journal.operation.before))
      throw new Error("before");
    validateCompletionOperation(journal.operation);
    const expected = completionImages(
      journal.before,
      before,
      journal.operation.after
    );
    for (const key of DATA_NAMES) {
      // Сравниваем исходные JSON-значения, а не нормализованный parseSnapshot(after):
      // иначе отсутствующие или противоречивые поля могли бы скрыться нормализацией.
      if (
        !sameCompletionData(
          JSON.parse(journal.after[key]),
          JSON.parse(expected[key])
        )
      )
        throw new Error("after");
    }
    return journal;
  } catch {
    // Старые журналы без replay-метаданных также остаются заблокированными.
    throw new Error(
      "Не удалось проверить данные завершения похода. Восстановление заблокировано; журнал и сохранённые данные оставлены без изменений"
    );
  }
}
