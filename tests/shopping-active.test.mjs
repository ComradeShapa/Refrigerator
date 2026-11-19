import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import {
  changeActiveItem,
  initialActualQuantity,
  shoppingProgress,
  ShoppingActiveError,
} from "../src/lib/shopping-active.ts";
import { parseAmount } from "../src/lib/product-form.ts";
const now = "2026-11-19T11:00:00.000Z";
const list = Object.freeze({
  id: "trip",
  householdId: "default",
  status: "active",
  createdAt: now,
  completedAt: null,
});
const item = Object.freeze({
  id: "milk",
  listId: "trip",
  productId: "milk",
  name: null,
  unit: "л",
  plannedQuantity: 3,
  actualQuantity: null,
  status: "pending",
  createdAt: now,
  updatedAt: now,
});
const other = Object.freeze({ ...item, id: "other", listId: "other-list" });
const apply = (
  expected = item,
  change = { status: "bought", quantity: 3 },
  lists = [list],
  items = [expected, other]
) =>
  changeActiveItem(
    lists,
    items,
    list,
    expected,
    change,
    "2026-11-19T12:00:00.000Z"
  );
const code = (value) => (error) =>
  error instanceof ShoppingActiveError && error.code === value;
for (const quantity of [3, 5, 1.5])
  test(`pending → bought: ${quantity}, план и остальные поля неизменны`, () => {
    const next = apply(item, { status: "bought", quantity });
    assert.deepEqual(next[0], {
      ...item,
      status: "bought",
      actualQuantity: quantity,
      updatedAt: "2026-11-19T12:00:00.000Z",
    });
    assert.equal(next[1], other);
    assert.equal(item.status, "pending");
  });
test("валидация количества и десятичных разделителей", () => {
  for (const raw of [
    "",
    " ",
    "0",
    "-1",
    "NaN",
    "Infinity",
    "1e999",
    "abc",
    "1,2,3",
  ])
    assert.throws(
      () => apply(item, { status: "bought", quantity: parseAmount(raw) }),
      code("invalid-quantity")
    );
  for (const quantity of [
    NaN,
    Infinity,
    -Infinity,
    -1,
    0,
    null,
    undefined,
    "2",
  ])
    assert.throws(
      () => apply(item, { status: "bought", quantity }),
      code("invalid-quantity")
    );
  for (const raw of ["1,5", "1.5"])
    assert.equal(
      apply(item, { status: "bought", quantity: parseAmount(raw) })[0]
        .actualQuantity,
      1.5
    );
});
test("все исправления статусов очищают факт; bought можно редактировать", () => {
  const bought = apply()[0];
  for (const status of ["pending", "unavailable"]) {
    const result = apply(bought, { status })[0];
    assert.equal(result.status, status);
    assert.equal(result.actualQuantity, null);
    assert.equal(result.plannedQuantity, 3);
  }
  const unavailable = apply(item, { status: "unavailable" })[0];
  assert.equal(unavailable.actualQuantity, null);
  assert.equal(apply(unavailable)[0].actualQuantity, 3);
  assert.equal(apply(unavailable, { status: "pending" })[0].status, "pending");
  assert.equal(
    apply(bought, { status: "bought", quantity: 7 })[0].actualQuantity,
    7
  );
});
test("предзаполнение: факт важнее плана, некорректный план пуст", () => {
  assert.equal(initialActualQuantity(item), "3");
  assert.equal(
    initialActualQuantity({ ...item, status: "bought", actualQuantity: 2 }),
    "2"
  );
  for (const plannedQuantity of [null, 0, -1, NaN, Infinity])
    assert.equal(initialActualQuantity({ ...item, plannedQuantity }), "");
});
test("чужие, удалённые, неактивные и устаревшие записи отклоняются", () => {
  for (const status of ["draft", "completed"])
    assert.throws(
      () => apply(item, { status: "unavailable" }, [{ ...list, status }]),
      code("not-active")
    );
  for (const lists of [[], [{ ...list, householdId: "foreign" }]])
    assert.throws(
      () => apply(item, { status: "pending" }, lists),
      code("list-missing")
    );
  for (const items of [[], [other], [{ ...item, listId: "foreign" }]])
    assert.throws(
      () => apply(item, { status: "unavailable" }, [list], items),
      code("item-missing")
    );
  for (const fresh of [
    { ...item, status: "unavailable" },
    { ...item, updatedAt: "later" },
    { ...item, actualQuantity: 4 },
  ])
    assert.throws(
      () => apply(item, { status: "bought", quantity: 2 }, [list], [fresh]),
      code("stale")
    );
});
test("прогресс считает позиции, включая отсутствующие, а не количества", () => {
  assert.deepEqual(shoppingProgress([]), { processed: 0, total: 0 });
  assert.deepEqual(
    shoppingProgress([
      item,
      { ...item, status: "bought", actualQuantity: 500 },
      { ...other, status: "unavailable" },
    ]),
    { processed: 2, total: 3 }
  );
});
test("storage: legacy, нормализация, повторная загрузка, отказ записи и неизменность каталога", async () => {
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      return next(
        specifier.startsWith("@/")
          ? new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href
          : specifier,
        context
      );
    },
  });
  const previous = globalThis.window;
  const records = new Map();
  let fail = false;
  globalThis.window = {
    localStorage: {
      getItem: (key) => records.get(key) ?? null,
      setItem(key, value) {
        if (fail) throw new Error("QuotaExceededError");
        records.set(key, value);
      },
    },
  };
  try {
    const storage = await import("../src/lib/storage.ts");
    await storage.saveShoppingLists([list]);
    const { actualQuantity: _omitted, ...legacy } = item;
    await storage.saveShoppingItems([
      legacy,
      { ...legacy, id: "legacy-bought", status: "bought" },
    ]);
    assert.deepEqual(
      (await storage.loadShoppingItems()).map(({ status, actualQuantity }) => ({
        status,
        actualQuantity,
      })),
      [
        { status: "pending", actualQuantity: null },
        { status: "pending", actualQuantity: null },
      ]
    );
    for (const actualQuantity of [null, 0, -3, "2", NaN, Infinity, {}, true]) {
      await storage.saveShoppingItems([
        { ...item, status: "bought", actualQuantity },
      ]);
      assert.deepEqual((await storage.loadShoppingItems())[0], item);
    }
    for (const status of ["pending", "unavailable"]) {
      await storage.saveShoppingItems([{ ...item, status, actualQuantity: 5 }]);
      assert.equal((await storage.loadShoppingItems())[0].actualQuantity, null);
    }
    const product = {
      id: "milk",
      householdId: "default",
      name: "Молоко",
      unit: "л",
      stock: 8,
      dailyRate: null,
      category: null,
      createdAt: now,
      updatedAt: now,
      lastAutoDeductAt: null,
    };
    await storage.saveProducts([product]);
    const catalogBefore = records.get("fridge.products.v2");
    await storage.saveShoppingItems([item, other]);
    const next = changeActiveItem(
      await storage.loadShoppingLists(),
      await storage.loadShoppingItems(),
      list,
      item,
      { status: "bought", quantity: 1.5 },
      now
    );
    const before = records.get("fridge.shopping-items.v2");
    fail = true;
    await assert.rejects(storage.saveShoppingItems(next), /QuotaExceededError/);
    assert.equal(records.get("fridge.shopping-items.v2"), before);
    fail = false;
    await storage.saveShoppingItems(next);
    assert.deepEqual(await storage.loadShoppingItems(), next);
    for (const status of ["pending", "unavailable", "bought", "unavailable"]) {
      const fresh = await storage.loadShoppingItems();
      await storage.saveShoppingItems(
        changeActiveItem(
          await storage.loadShoppingLists(),
          fresh,
          list,
          fresh[0],
          status === "bought" ? { status, quantity: 5 } : { status },
          now
        )
      );
    }
    assert.equal(records.get("fridge.products.v2"), catalogBefore);
    assert.deepEqual(await storage.loadProducts(), [product]);
    assert.deepEqual(await storage.loadShoppingLists(), [list]);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
    hooks.deregister();
  }
});
