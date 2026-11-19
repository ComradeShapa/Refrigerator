import type { ShoppingItem, Unit } from "@/lib/types";

export type ManualItemInput = {
  name: string;
  quantity: number;
  unit: Unit;
  /** Увеличение разрешено только после подтверждения пользователя. */
  increaseItem?: ShoppingItem;
};

export function findManualDuplicate(
  items: ShoppingItem[],
  name: string,
  unit: Unit
): ShoppingItem | undefined {
  const needle = name.trim().toLowerCase();
  return items.find(
    (item) =>
      item.productId === null &&
      item.unit === unit &&
      (item.name ?? "").trim().toLowerCase() === needle
  );
}

/** Подготовка записи по свежим данным storage, без изменения исходного массива. */
export function addManualShoppingItem(
  items: ShoppingItem[],
  listId: string,
  input: ManualItemInput,
  id: string,
  now: string
): ShoppingItem[] {
  const name = input.name.trim();
  if (!name || !Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Введите название и число больше 0");
  }
  const duplicate = findManualDuplicate(
    items.filter((item) => item.listId === listId),
    name,
    input.unit
  );
  if (input.increaseItem !== undefined) {
    if (duplicate?.id !== input.increaseItem.id) {
      throw new Error(
        "Пункт изменился. Проверьте данные и повторите добавление"
      );
    }
    const quantity = (duplicate.plannedQuantity ?? 0) + input.quantity;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Слишком большое количество");
    }
    return items.map((item) =>
      item.id === duplicate.id
        ? { ...item, plannedQuantity: quantity, updatedAt: now }
        : item
    );
  }
  if (duplicate !== undefined) {
    throw new Error(
      "Такой пункт уже есть. Нажмите «Добавить» для подтверждения увеличения"
    );
  }
  return [
    ...items,
    {
      id,
      listId,
      productId: null,
      name,
      unit: input.unit,
      plannedQuantity: input.quantity,
      actualQuantity: null,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    },
  ];
}
