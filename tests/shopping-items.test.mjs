// Node.js 24: node --test tests/shopping-items.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { parseAmount } from "../src/lib/product-form.ts";
import {
  addManualShoppingItem,
  findManualDuplicate,
} from "../src/lib/shopping-items.ts";

const createdAt = "2026-11-12T10:00:00.000Z";
const updatedAt = "2026-11-12T11:00:00.000Z";
const input = { name: "  Хлеб  ", quantity: 1.5, unit: "шт" };
const add = (items, value = input, listId = "draft") =>
  addManualShoppingItem(items, listId, value, "new-id", updatedAt);
const original = {
  id: "existing",
  listId: "draft",
  productId: null,
  name: "хЛЕБ ",
  unit: "шт",
  plannedQuantity: 2,
  status: "pending",
  createdAt,
  updatedAt: createdAt,
};

test("ручной пункт: поля модели, обрезка пробелов, исходный массив не меняется", () => {
  const items = [];
  assert.deepEqual(add(items), [
    {
      id: "new-id",
      listId: "draft",
      productId: null,
      name: "Хлеб",
      unit: "шт",
      plannedQuantity: 1.5,
      status: "pending",
      createdAt: updatedAt,
      updatedAt,
    },
  ]);
  assert.equal(items.length, 0);
});

test("количество: запятая и точка; пустое, ноль, отрицательное и бесконечность запрещены", () => {
  for (const raw of ["1,5", "1.5", " 1,5 "]) {
    assert.equal(
      add([], { ...input, quantity: parseAmount(raw) })[0].plannedQuantity,
      1.5
    );
  }
  for (const raw of ["", " ", "0", "-1", "Infinity", "NaN", "1e999", "1,2,3"]) {
    assert.throws(() => add([], { ...input, quantity: parseAmount(raw) }));
  }
  assert.throws(() => add([], { ...input, name: "   " }));
});

test("дубли: регистр и пробелы игнорируются, единица учитывается", () => {
  assert.equal(findManualDuplicate([original], input.name, "шт"), original);
  assert.equal(findManualDuplicate([original], input.name, "кг"), undefined);
  assert.throws(() => add([original]), /подтверждения/);
  assert.equal(add([original], { ...input, unit: "кг" }).length, 2);
  assert.equal(add([original], input, "another-list").length, 2);
  assert.equal(add([{ ...original, productId: "bread" }]).length, 2);
});

test("подтверждение увеличивает свежий остаток и обновляет только updatedAt", () => {
  const fresh = { ...original, plannedQuantity: 4 };
  const other = { ...original, id: "other", listId: "another-list" };
  const next = add([fresh, other], { ...input, increaseItem: original });
  assert.equal(next.length, 2);
  assert.deepEqual(next[0], { ...fresh, plannedQuantity: 5.5, updatedAt });
  assert.equal(next[1], other);
  assert.equal(fresh.plannedQuantity, 4);
});

test("устаревшее подтверждение и переполнение не изменяют исходные данные", () => {
  assert.throws(
    () => add([], { ...input, increaseItem: original }),
    /изменился/
  );
  assert.throws(() =>
    add([original], { ...input, unit: "кг", increaseItem: original })
  );
  const huge = { ...original, plannedQuantity: Number.MAX_VALUE };
  assert.throws(
    () =>
      add([huge], { ...input, quantity: Number.MAX_VALUE, increaseItem: huge }),
    /большое/
  );
  assert.equal(original.plannedQuantity, 2);
});

test("storage: сохранение и повторное чтение, пустой каталог и отказ записи", async () => {
  // Только разрешение существующего alias TypeScript, без дополнительных пакетов.
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      return nextResolve(
        specifier.startsWith("@/")
          ? new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href
          : specifier,
        context
      );
    },
  });
  const previousWindow = globalThis.window;
  const records = new Map();
  let failWrite = false;
  globalThis.window = {
    localStorage: {
      getItem: (key) => records.get(key) ?? null,
      setItem(key, value) {
        if (failWrite) throw new Error("QuotaExceededError");
        records.set(key, value);
      },
    },
  };
  try {
    const storage = await import("../src/lib/storage.ts");
    const draft = {
      id: "draft",
      householdId: "default",
      status: "draft",
      createdAt,
      completedAt: null,
    };
    await storage.saveShoppingLists([draft]);
    assert.deepEqual(await storage.loadDraftShoppingList(), draft);
    await storage.saveShoppingItems(add([]));
    assert.deepEqual(await storage.loadShoppingItems(), add([]));
    await storage.saveProducts([]);
    assert.deepEqual(await storage.loadProducts(), []);
    const before = records.get("fridge.shopping-items.v2");
    failWrite = true;
    await assert.rejects(storage.saveShoppingItems([]), /QuotaExceededError/);
    assert.equal(records.get("fridge.shopping-items.v2"), before);
    assert.deepEqual(await storage.loadShoppingItems(), add([]));
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    hooks.deregister();
  }
});
