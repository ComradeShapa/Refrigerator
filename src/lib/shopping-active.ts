import type {
  ShoppingItem,
  ShoppingList,
  ShoppingItemStatus,
} from "@/lib/types";

export const ACTIVE_ERROR_MESSAGES = {
  "list-missing": "Список больше не существует. Данные обновлены",
  "not-active": "Поход больше не активен. Данные обновлены",
  "item-missing": "Пункт больше не находится в этом списке. Данные обновлены",
  stale: "Пункт изменился. Проверьте данные и повторите действие",
  "invalid-quantity": "Введите число больше 0",
} as const;

export class ShoppingActiveError extends Error {
  readonly code: keyof typeof ACTIVE_ERROR_MESSAGES;

  constructor(code: keyof typeof ACTIVE_ERROR_MESSAGES) {
    super(ACTIVE_ERROR_MESSAGES[code]);
    this.name = "ShoppingActiveError";
    this.code = code;
  }
}

export type ActiveChange =
  | { status: "bought"; quantity: number }
  | { status: "pending" | "unavailable" };

/** Свежий снимок обязателен; сравнение с показанным пунктом защищает от устаревших действий. */
export function changeActiveItem(
  lists: ShoppingList[],
  items: ShoppingItem[],
  target: Pick<ShoppingList, "id" | "householdId">,
  expected: ShoppingItem,
  change: ActiveChange,
  now: string
): ShoppingItem[] {
  const list = lists.find(
    (entry) =>
      entry.id === target.id && entry.householdId === target.householdId
  );
  if (!list) throw new ShoppingActiveError("list-missing");
  if (list.status !== "active") throw new ShoppingActiveError("not-active");
  const item = items.find(
    (entry) => entry.id === expected.id && entry.listId === target.id
  );
  if (!item || expected.listId !== target.id)
    throw new ShoppingActiveError("item-missing");
  if (
    item.status !== expected.status ||
    item.updatedAt !== expected.updatedAt ||
    item.actualQuantity !== expected.actualQuantity
  )
    throw new ShoppingActiveError("stale");
  const allowed: ShoppingItemStatus[] = ["pending", "bought", "unavailable"];
  if (!allowed.includes(change.status)) throw new ShoppingActiveError("stale");
  if (
    change.status === "bought" &&
    (!Number.isFinite(change.quantity) || change.quantity <= 0)
  )
    throw new ShoppingActiveError("invalid-quantity");
  return items.map((entry) =>
    entry === item
      ? {
          ...entry,
          status: change.status,
          actualQuantity: change.status === "bought" ? change.quantity : null,
          updatedAt: now,
        }
      : entry
  );
}

export function shoppingProgress(items: ShoppingItem[]) {
  return {
    processed: items.filter(
      (item) => item.status === "bought" || item.status === "unavailable"
    ).length,
    total: items.length,
  };
}

export function initialActualQuantity(item: ShoppingItem): string {
  const value =
    item.status === "bought" ? item.actualQuantity : item.plannedQuantity;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? String(value)
    : "";
}
