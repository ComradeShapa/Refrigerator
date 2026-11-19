import type { Product, ShoppingItem, ShoppingList } from "@/lib/types";

export type CompletionSnapshot = {
  products: Product[];
  lists: ShoppingList[];
  items: ShoppingItem[];
};
export type CompletionTarget = Pick<ShoppingList, "id" | "householdId">;
export type Shortage = {
  itemId: string;
  name: string;
  quantity: number;
  unit: ShoppingItem["unit"];
};
export type CompletionPreview = {
  target: CompletionTarget;
  fingerprint: string;
  shortages: Shortage[];
  boughtCount: number;
};
export type CompletionOperation = {
  version: 2;
  /** Подтверждённое время и порядок выданных ID нужны для точного повторного расчёта. */
  completedAt: string;
  generatedIds: string[];
  id: string;
  target: CompletionTarget;
  selected: string[];
  before: CompletionSnapshot;
  after: CompletionSnapshot;
};
export class ShoppingCompletionError extends Error {
  readonly code: string;
  readonly itemId?: string;
  constructor(code: string, message: string, itemId?: string) {
    super(message);
    this.name = "ShoppingCompletionError";
    this.code = code;
    this.itemId = itemId;
  }
}
function fail(code: string, message: string, itemId?: string): never {
  throw new ShoppingCompletionError(code, message, itemId);
}
export function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
const normalized = (name: string) => name.trim().toLowerCase();

/** Десятичная арифметика по канонической записи number, без округления до фиксированных знаков. */
function decimal(value: number): { integer: bigint; scale: number } {
  const [coefficient, exponent = "0"] = String(value).split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  return {
    integer: BigInt(whole + fraction),
    scale: fraction.length - Number(exponent),
  };
}
export function decimalSum(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b))
    fail("quantity", "Количество должно быть конечным числом");
  const left = decimal(a),
    right = decimal(b);
  const scale = Math.max(left.scale, right.scale);
  const result = Number(
    `${left.integer * BigInt(10) ** BigInt(scale - left.scale) + right.integer * BigInt(10) ** BigInt(scale - right.scale)}e${-scale}`
  );
  if (!Number.isFinite(result))
    fail(
      "overflow",
      "Слишком большое количество. Уменьшите количество перед завершением"
    );
  return result;
}
export function shortageQuantity(planned: number, actual: number): number {
  if (actual >= planned) return 0;
  const difference = decimalSum(planned, -actual);
  // Убираем только шум на уровне точности number относительно этих величин.
  return difference <=
    Math.max(Math.abs(planned), Math.abs(actual)) * Number.EPSILON * 2
    ? 0
    : difference;
}
function uniqueIds(entries: { id: string }[]) {
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
    fail(
      "duplicates",
      "В сохранённых данных повторяются идентификаторы. Завершение заблокировано"
    );
}
export function previewCompletion(
  snapshot: CompletionSnapshot,
  target: CompletionTarget
): CompletionPreview {
  uniqueIds(snapshot.lists);
  uniqueIds(snapshot.products);
  uniqueIds(snapshot.items);
  const list = snapshot.lists.find(
    (entry) =>
      entry.id === target.id && entry.householdId === target.householdId
  );
  if (!list || list.status !== "active")
    fail("not-active", "Этот поход больше не активен. Обновите список");
  const items = snapshot.items.filter((item) => item.listId === target.id);
  if (!items.length) fail("empty", "Пустой поход нельзя завершить");
  if (items.some((item) => item.status === "pending"))
    fail("pending", "Сначала обработайте все пункты списка");
  const shortages: Shortage[] = [];
  for (const item of items) {
    if (!positive(item.plannedQuantity))
      fail(
        "plan",
        "Плановое количество повреждено. Укажите корректный план для этого пункта",
        item.id
      );
    if (item.status !== "bought" && item.status !== "unavailable")
      fail("status", "Некорректный статус пункта", item.id);
    if (item.status === "bought" && !positive(item.actualQuantity))
      fail("actual", "Подтвердите фактически купленное количество", item.id);
    if (item.status === "unavailable" && item.actualQuantity !== null)
      fail("actual", "Некорректное количество отсутствующего товара", item.id);
    const product =
      item.productId === null
        ? null
        : snapshot.products.find((entry) => entry.id === item.productId);
    if (
      item.productId !== null &&
      (!product || product.householdId !== target.householdId)
    )
      fail(
        "link",
        "Связанный продукт удалён или относится к другому домохозяйству. Восстановите связь с каталогом перед завершением",
        item.id
      );
    if (product && product.unit !== item.unit)
      fail(
        "unit",
        "Единицы пункта и продукта различаются. Исправьте единицу продукта в «Остатках»",
        item.id
      );
    if (!product && !item.name?.trim())
      fail(
        "name",
        "У ручного пункта отсутствует название. Исправьте данные перед завершением",
        item.id
      );
    if (item.status === "bought" && item.productId === null) {
      const matches = snapshot.products.filter(
        (entry) =>
          entry.householdId === target.householdId &&
          entry.unit === item.unit &&
          normalized(entry.name) === normalized(item.name!)
      );
      if (matches.length > 1)
        fail(
          "ambiguous",
          `В каталоге несколько продуктов «${item.name}» с одной единицей. Устраните дубли в «Остатках»`,
          item.id
        );
    }
    const quantity =
      item.status === "unavailable"
        ? item.plannedQuantity
        : shortageQuantity(item.plannedQuantity, item.actualQuantity!);
    if (quantity > 0)
      shortages.push({
        itemId: item.id,
        name: product?.name ?? item.name!,
        quantity,
        unit: item.unit,
      });
  }
  return {
    target,
    fingerprint: JSON.stringify(snapshot),
    shortages,
    boughtCount: items.filter((item) => item.status === "bought").length,
  };
}

export function prepareCompletion(
  snapshot: CompletionSnapshot,
  preview: CompletionPreview,
  selected: string[],
  now: string,
  createId: () => string
): CompletionOperation {
  const fresh = previewCompletion(snapshot, preview.target);
  if (fresh.fingerprint !== preview.fingerprint)
    fail(
      "stale",
      "Данные изменились. Проверьте обновлённое предложение и подтвердите его снова"
    );
  const selectedIds = new Set(selected);
  if (
    selectedIds.size !== selected.length ||
    selected.some((id) => !fresh.shortages.some((entry) => entry.itemId === id))
  )
    fail("selection", "Выбор переноса устарел. Откройте подтверждение снова");
  if (!Number.isFinite(Date.parse(now)))
    fail("time", "Не удалось определить время завершения");
  let products = [...snapshot.products];
  const listItems = snapshot.items.filter(
    (item) => item.listId === preview.target.id
  );
  const usedIds = new Set(
    [...snapshot.products, ...snapshot.lists, ...snapshot.items].map(
      (entry) => entry.id
    )
  );
  const generatedIds: string[] = [];
  const newId = () => {
    const id = createId();
    if (!id || usedIds.has(id))
      fail("id", "Не удалось создать идентификатор. Повторите попытку");
    usedIds.add(id);
    generatedIds.push(id);
    return id;
  };
  for (const item of listItems.filter((entry) => entry.status === "bought")) {
    let product =
      item.productId === null
        ? products.find(
            (entry) =>
              entry.householdId === preview.target.householdId &&
              entry.unit === item.unit &&
              normalized(entry.name) === normalized(item.name!)
          )
        : products.find((entry) => entry.id === item.productId);
    if (!product) {
      product = {
        id: newId(),
        householdId: preview.target.householdId,
        name: item.name!.trim(),
        unit: item.unit,
        stock: item.actualQuantity!,
        dailyRate: null,
        category: null,
        createdAt: now,
        updatedAt: now,
        lastAutoDeductAt: null,
      };
      products.push(product);
    } else {
      if (!Number.isFinite(product.stock) || product.stock < 0)
        fail(
          "stock",
          "Остаток продукта повреждён. Исправьте его в «Остатках»",
          item.id
        );
      const stock = decimalSum(product.stock, item.actualQuantity!);
      products = products.map((entry) =>
        entry === product ? { ...entry, stock, updatedAt: now } : entry
      );
    }
  }
  let lists = snapshot.lists.map((entry) =>
    entry.id === preview.target.id
      ? { ...entry, status: "completed" as const, completedAt: now }
      : entry
  );
  let items = [...snapshot.items];
  const transfers = fresh.shortages.filter((entry) =>
    selectedIds.has(entry.itemId)
  );
  if (transfers.length) {
    let draft = lists
      .filter(
        (entry) =>
          entry.householdId === preview.target.householdId &&
          entry.status === "draft"
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    if (!draft) {
      draft = {
        id: newId(),
        householdId: preview.target.householdId,
        status: "draft",
        createdAt: now,
        completedAt: null,
      };
      lists = [...lists, draft];
    }
    for (const transfer of transfers) {
      const original = listItems.find((entry) => entry.id === transfer.itemId)!;
      const duplicates = items.filter(
        (entry) =>
          entry.listId === draft.id &&
          (original.productId !== null
            ? entry.productId === original.productId
            : entry.productId === null &&
              entry.unit === original.unit &&
              normalized(entry.name ?? "") === normalized(original.name!))
      );
      if (duplicates.length > 1)
        fail(
          "draft-duplicates",
          "В следующем черновике несколько одинаковых пунктов. Устраните дубли перед завершением"
        );
      const duplicate = duplicates[0];
      if (duplicate) {
        if (
          duplicate.unit !== original.unit ||
          duplicate.status !== "pending" ||
          duplicate.actualQuantity !== null ||
          !positive(duplicate.plannedQuantity)
        )
          fail(
            "draft",
            "Совпадающий пункт следующего черновика повреждён. Исправьте его перед завершением"
          );
        const plannedQuantity = decimalSum(
          duplicate.plannedQuantity,
          transfer.quantity
        );
        items = items.map((entry) =>
          entry === duplicate
            ? { ...entry, plannedQuantity, updatedAt: now }
            : entry
        );
      } else
        items.push({
          ...original,
          id: newId(),
          listId: draft.id,
          plannedQuantity: transfer.quantity,
          status: "pending",
          actualQuantity: null,
          createdAt: now,
          updatedAt: now,
        });
    }
  }
  return {
    version: 2,
    completedAt: now,
    generatedIds,
    id: `shopping-completion:${preview.target.id}`,
    target: preview.target,
    selected: [...selected],
    before: snapshot,
    after: { products, lists, items },
  };
}

/** Сравнение JSON без зависимости от порядка полей и без нормализации повреждений. */
export function sameCompletionData(left: unknown, right: unknown): boolean {
  if (typeof left === "number" || typeof right === "number")
    return (
      typeof left === "number" &&
      typeof right === "number" &&
      Number.isFinite(left) &&
      Number.isFinite(right) &&
      left === right
    );
  if (left === null || right === null) return left === right;
  if (typeof left === "string" || typeof left === "boolean")
    return left === right;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => sameCompletionData(entry, right[index]))
    );
  if (typeof left !== "object" || typeof right !== "object") return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  return (
    keys.length === Object.keys(rightRecord).length &&
    keys.every(
      (key) =>
        Object.hasOwn(rightRecord, key) &&
        sameCompletionData(leftRecord[key], rightRecord[key])
    )
  );
}

/** Проверяем всю операцию повторным чистым расчётом; after не является источником истины. */
export function validateCompletionOperation(
  operation: CompletionOperation
): void {
  const invalid = () =>
    fail(
      "journal",
      "Не удалось проверить данные завершения. Восстановление заблокировано; данные сохранены"
    );
  if (
    operation.version !== 2 ||
    typeof operation.completedAt !== "string" ||
    !Number.isFinite(Date.parse(operation.completedAt)) ||
    new Date(operation.completedAt).toISOString() !== operation.completedAt ||
    !Array.isArray(operation.generatedIds) ||
    operation.generatedIds.some(
      (id) => typeof id !== "string" || id.length === 0
    ) ||
    !Array.isArray(operation.selected) ||
    operation.selected.some((id) => typeof id !== "string") ||
    !operation.target ||
    typeof operation.target.id !== "string" ||
    !operation.target.id ||
    typeof operation.target.householdId !== "string" ||
    !operation.target.householdId ||
    operation.id !== `shopping-completion:${operation.target.id}`
  )
    invalid();
  const source = operation.before.lists.find(
    (entry) => entry.id === operation.target.id
  );
  if (
    source?.status !== "active" ||
    source.completedAt !== null ||
    source.householdId !== operation.target.householdId
  )
    invalid();
  let index = 0;
  const expected = prepareCompletion(
    operation.before,
    previewCompletion(operation.before, operation.target),
    operation.selected,
    operation.completedAt,
    () => {
      if (index >= operation.generatedIds.length) invalid();
      return operation.generatedIds[index++];
    }
  );
  if (
    index !== operation.generatedIds.length ||
    !sameCompletionData(expected, operation)
  )
    invalid();
}
