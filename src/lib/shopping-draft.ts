import type { ShoppingItem, ShoppingList } from "@/lib/types";

export const DRAFT_ERROR_MESSAGES = {
  "list-missing": "Список больше не существует. Данные обновлены",
  "not-draft": "Список больше не является черновиком. Данные обновлены",
  "item-missing": "Пункт больше не находится в этом списке. Данные обновлены",
  "invalid-quantity": "Введите число больше 0",
  "empty-list": "Добавьте хотя бы один пункт перед началом похода",
  "active-exists": "Уже есть активный поход. Открыт текущий список",
} as const;

export class ShoppingDraftError extends Error {
  readonly code: keyof typeof DRAFT_ERROR_MESSAGES;

  constructor(code: keyof typeof DRAFT_ERROR_MESSAGES) {
    super(DRAFT_ERROR_MESSAGES[code]);
    this.name = "ShoppingDraftError";
    this.code = code;
  }
}

type DraftTarget = Pick<ShoppingList, "id" | "householdId">;

function requireDraft(
  lists: ShoppingList[],
  target: DraftTarget
): ShoppingList {
  const list = lists.find(
    (entry) =>
      entry.id === target.id && entry.householdId === target.householdId
  );
  if (!list) throw new ShoppingDraftError("list-missing");
  if (list.status !== "draft") throw new ShoppingDraftError("not-draft");
  return list;
}

function requireItem(
  items: ShoppingItem[],
  listId: string,
  itemId: string
): ShoppingItem {
  const item = items.find(
    (entry) => entry.id === itemId && entry.listId === listId
  );
  if (!item) throw new ShoppingDraftError("item-missing");
  return item;
}

/** Функции получают свежий снимок storage и не мутируют исходные данные. */
export function changeDraftQuantity(
  lists: ShoppingList[],
  items: ShoppingItem[],
  target: DraftTarget,
  itemId: string,
  quantity: number,
  now: string
): ShoppingItem[] {
  requireDraft(lists, target);
  const item = requireItem(items, target.id, itemId);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ShoppingDraftError("invalid-quantity");
  }
  if (item.plannedQuantity === quantity) return items;
  return items.map((entry) =>
    entry === item
      ? { ...entry, plannedQuantity: quantity, updatedAt: now }
      : entry
  );
}

export function removeDraftItem(
  lists: ShoppingList[],
  items: ShoppingItem[],
  target: DraftTarget,
  itemId: string
): ShoppingItem[] {
  requireDraft(lists, target);
  const item = requireItem(items, target.id, itemId);
  return items.filter((entry) => entry !== item);
}

export function startShoppingTrip(
  lists: ShoppingList[],
  items: ShoppingItem[],
  target: DraftTarget
): ShoppingList[] {
  const list = requireDraft(lists, target);
  if (
    lists.some(
      (entry) =>
        entry.householdId === target.householdId && entry.status === "active"
    )
  ) {
    throw new ShoppingDraftError("active-exists");
  }
  if (!items.some((item) => item.listId === target.id)) {
    throw new ShoppingDraftError("empty-list");
  }
  return lists.map((entry) =>
    entry === list ? { ...entry, status: "active" } : entry
  );
}
