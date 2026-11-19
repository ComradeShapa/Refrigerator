// Node.js 24: node --test tests/shopping-items.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { parseAmount } from "../src/lib/product-form.ts";
import { formatShoppingQuantity } from "../src/lib/shopping-format.ts";
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

test("формат количества: обычные значения компактны и сохраняют значащие цифры", () => {
  for (const [value, expected] of [
    [1, "1"],
    [1.5, "1.5"],
    [2.25, "2.25"],
    [1000, "1000"],
    [1.2345678901234567, "1.2345678901234567"],
    [0.30000000000000004, "0.30000000000000004"],
  ]) {
    assert.equal(formatShoppingQuantity(value), expected);
    assert.equal(Number(formatShoppingQuantity(value)), value);
  }
});

test("формат количества: малые положительные значения не превращаются в ноль", () => {
  for (const [value, expected] of [
    [0.001, "0.001"],
    [0.000001, "0.000001"],
    [1e-7, "1e-7"],
    [Number.MIN_VALUE, "5e-324"],
  ]) {
    const formatted = formatShoppingQuantity(value);
    assert.equal(formatted, expected);
    assert.notEqual(formatted, "0");
    assert.equal(Number(formatted), value);
  }
});

test("формат количества: большие конечные значения не превращаются в Infinity", () => {
  for (const [value, expected] of [
    [1e308, "1e+308"],
    [Number.MAX_VALUE, "1.7976931348623157e+308"],
    [Number.MAX_SAFE_INTEGER, "9007199254740991"],
  ]) {
    const formatted = formatShoppingQuantity(value);
    assert.equal(formatted, expected);
    assert.equal(Number(formatted), value);
    assert.equal(Number.isFinite(Number(formatted)), true);
  }
});

test("формат количества: прежний безопасный вывод нуля и неконечных значений", () => {
  for (const value of [0, -0, NaN, Infinity, -Infinity]) {
    assert.equal(formatShoppingQuantity(value), "0");
  }
});

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
