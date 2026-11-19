// Node.js 24: node --test tests/shopping-draft.test.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { parseAmount } from "../src/lib/product-form.ts";
import {
  changeDraftQuantity,
  removeDraftItem,
  ShoppingDraftError,
  startShoppingTrip,
} from "../src/lib/shopping-draft.ts";

const createdAt = "2026-11-19T10:00:00.000Z";
const now = "2026-11-19T11:00:00.000Z";
const draft = Object.freeze({
  id: "draft",
  householdId: "default",
  status: "draft",
  createdAt,
  completedAt: null,
});
const otherList = Object.freeze({ ...draft, id: "other" });
const manual = Object.freeze({
  id: "manual",
  listId: draft.id,
  productId: null,
  name: "Хлеб",
  unit: "шт",
  plannedQuantity: 1,
  actualQuantity: null,
  status: "pending",
  createdAt,
  updatedAt: createdAt,
});
const catalog = Object.freeze({
  ...manual,
  id: "catalog",
  productId: "milk",
  name: null,
  unit: "л",
});
const otherItem = Object.freeze({
  ...manual,
  id: "other-item",
  listId: otherList.id,
});
const lists = Object.freeze([draft, otherList]);
const items = Object.freeze([manual, catalog, otherItem]);
const errorCode = (code) => (error) =>
  error instanceof ShoppingDraftError && error.code === code;

for (const item of [manual, catalog]) {
  test(`количество ${item.id}: меняются только plannedQuantity и updatedAt`, () => {
    const next = changeDraftQuantity(lists, items, draft, item.id, 2.5, now);
    assert.deepEqual(
      next.find((entry) => entry.id === item.id),
      { ...item, plannedQuantity: 2.5, updatedAt: now }
    );
    for (const entry of items.filter((entry) => entry !== item))
      assert.equal(
        next.find((value) => value.id === entry.id),
        entry
      );
    assert.equal(item.plannedQuantity, 1);
  });
}

test("количество: валидация пустых, нуля, отрицательных, NaN и Infinity; точка и запятая", () => {
  for (const value of [
    "",
    " ",
    "0",
    "-1",
    "NaN",
    "Infinity",
    "1e999",
    "1,2,3",
    "abc",
  ]) {
    assert.throws(
      () =>
        changeDraftQuantity(
          lists,
          items,
          draft,
          manual.id,
          parseAmount(value),
          now
        ),
      errorCode("invalid-quantity")
    );
  }
  for (const value of ["2,5", "2.5"])
    assert.equal(
      changeDraftQuantity(
        lists,
        items,
        draft,
        manual.id,
        parseAmount(value),
        now
      )[0].plannedQuantity,
      2.5
    );
});

test("null старого пункта можно заменить; то же количество не требует записи", () => {
  assert.equal(
    changeDraftQuantity(
      lists,
      [{ ...manual, plannedQuantity: null }],
      draft,
      manual.id,
      3,
      now
    )[0].plannedQuantity,
    3
  );
  assert.equal(
    changeDraftQuantity(lists, items, draft, manual.id, 1, now),
    items
  );
});

test("удаление затрагивает только выбранный пункт нужного списка", () => {
  assert.deepEqual(removeDraftItem(lists, items, draft, manual.id), [
    catalog,
    otherItem,
  ]);
  assert.deepEqual(removeDraftItem(lists, items, draft, catalog.id), [
    manual,
    otherItem,
  ]);
  const sameIdInOtherList = { ...manual, listId: otherList.id };
  assert.deepEqual(
    removeDraftItem(lists, [manual, sameIdInOtherList], draft, manual.id),
    [sameIdInOtherList]
  );
});

test("удаление последнего пункта сохраняет черновик и чужие пункты", () => {
  assert.deepEqual(
    removeDraftItem(lists, [manual, otherItem], draft, manual.id),
    [otherItem]
  );
  assert.equal(lists[0], draft);
  assert.equal(draft.status, "draft");
});

test("поход: меняется только статус выбранного списка, пункты не изменяются", () => {
  assert.deepEqual(startShoppingTrip(lists, items, draft), [
    { ...draft, status: "active" },
    otherList,
  ]);
  assert.equal(draft.status, "draft");
  assert.equal(manual.status, "pending");
  assert.equal(catalog.status, "pending");
  assert.equal(draft.completedAt, null);
});

test("поход: пустой черновик не активируется, чужие пункты не учитываются", () => {
  for (const value of [[], [otherItem]])
    assert.throws(
      () => startShoppingTrip(lists, value, draft),
      errorCode("empty-list")
    );
});

test("поход: повторный запуск и второй активный список запрещены", () => {
  const active = { ...draft, status: "active" };
  assert.throws(
    () => startShoppingTrip([active], items, draft),
    errorCode("not-draft")
  );
  assert.throws(
    () =>
      startShoppingTrip(
        [draft, { ...otherList, status: "active" }],
        items,
        draft
      ),
    errorCode("active-exists")
  );
  assert.equal(
    startShoppingTrip(
      [
        draft,
        { ...otherList, householdId: "another-household", status: "active" },
      ],
      items,
      draft
    )[0].status,
    "active"
  );
});

test("отсутствующий, завершённый, активный или чужой список запрещает все операции", () => {
  for (const [freshLists, code] of [
    [[], "list-missing"],
    [[{ ...draft, status: "active" }], "not-draft"],
    [[{ ...draft, status: "completed" }], "not-draft"],
    [[{ ...draft, householdId: "another-household" }], "list-missing"],
  ]) {
    assert.throws(
      () => changeDraftQuantity(freshLists, items, draft, manual.id, 3, now),
      errorCode(code)
    );
    assert.throws(
      () => removeDraftItem(freshLists, items, draft, manual.id),
      errorCode(code)
    );
    assert.throws(
      () => startShoppingTrip(freshLists, items, draft),
      errorCode(code)
    );
  }
});

test("удалённый или перемещённый пункт не восстанавливается и не меняется", () => {
  for (const freshItems of [
    [],
    [otherItem],
    [{ ...manual, listId: otherList.id }],
  ]) {
    assert.throws(
      () => changeDraftQuantity(lists, freshItems, draft, manual.id, 3, now),
      errorCode("item-missing")
    );
    assert.throws(
      () => removeDraftItem(lists, freshItems, draft, manual.id),
      errorCode("item-missing")
    );
  }
});

test("свежие поля и другие пункты сохраняются при устаревшем редакторе", () => {
  const fresh = {
    ...manual,
    name: "Новое название",
    plannedQuantity: 8,
    unit: "кг",
    status: "unavailable",
  };
  const next = changeDraftQuantity(
    lists,
    [fresh, catalog, otherItem],
    draft,
    fresh.id,
    3,
    now
  );
  assert.deepEqual(next, [
    { ...fresh, plannedQuantity: 3, updatedAt: now },
    catalog,
    otherItem,
  ]);
});

test("storage: отказ записи количества, удаления и запуска оставляет сохранённые данные", async () => {
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
    await storage.saveShoppingLists(lists);
    await storage.saveShoppingItems(items);
    failWrite = true;
    await assert.rejects(
      storage.saveShoppingItems(
        changeDraftQuantity(lists, items, draft, manual.id, 3, now)
      ),
      /QuotaExceededError/
    );
    await assert.rejects(
      storage.saveShoppingItems(
        removeDraftItem(lists, items, draft, manual.id)
      ),
      /QuotaExceededError/
    );
    await assert.rejects(
      storage.saveShoppingLists(startShoppingTrip(lists, items, draft)),
      /QuotaExceededError/
    );
    assert.deepEqual(await storage.loadShoppingItems(), items);
    assert.deepEqual(await storage.loadShoppingLists(), lists);
    failWrite = false;
    await storage.saveShoppingItems(
      changeDraftQuantity(lists, items, draft, manual.id, 3, now)
    );
    assert.equal((await storage.loadShoppingItems())[0].plannedQuantity, 3);
    await storage.saveShoppingLists(
      startShoppingTrip(lists, await storage.loadShoppingItems(), draft)
    );
    assert.equal((await storage.loadActiveShoppingList()).id, draft.id);
    assert.equal((await storage.loadShoppingItems())[0].plannedQuantity, 3);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    hooks.deregister();
  }
});
