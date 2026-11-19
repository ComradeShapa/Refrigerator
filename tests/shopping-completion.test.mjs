import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import {
  previewCompletion,
  prepareCompletion,
  decimalSum,
  shortageQuantity,
} from "../src/lib/shopping-completion.ts";
const hooks = registerHooks({
  resolve(s, c, n) {
    return n(
      s.startsWith("@/")
        ? new URL(`../src/${s.slice(2)}.ts`, import.meta.url).href
        : s.startsWith("./") && !s.endsWith(".ts")
          ? s + ".ts"
          : s,
      c
    );
  },
});
const storage = await import("../src/lib/storage.ts");
const { loadCompletionPreview, completeShoppingTrip } =
  await import("../src/lib/shopping-completion-storage.ts");
const { applyDeductions } = await import("../src/lib/auto-deduction.ts");
const at = "2026-11-19T10:00:00.000Z",
  now = "2026-11-19T12:00:00.000Z";
const list = {
  id: "trip",
  householdId: "default",
  status: "active",
  createdAt: at,
  completedAt: null,
};
const product = {
  id: "milk",
  householdId: "default",
  name: "Молоко",
  unit: "л",
  stock: 8,
  dailyRate: null,
  category: "Молочные",
  createdAt: at,
  updatedAt: at,
  lastAutoDeductAt: null,
};
const item = {
  id: "i",
  listId: "trip",
  productId: "milk",
  name: null,
  unit: "л",
  plannedQuantity: 3,
  actualQuantity: 3,
  status: "bought",
  createdAt: at,
  updatedAt: at,
};
const snapshot = (items = [item], products = [product], lists = [list]) =>
  structuredClone({ items, products, lists });
const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};
function prepare(s = snapshot(), selected, timestamp = now) {
  const p = previewCompletion(s, list);
  return prepareCompletion(
    s,
    p,
    selected ?? p.shortages.map((x) => x.itemId),
    timestamp,
    ids()
  );
}
const code = (value) => (error) => error.code === value;
for (const [actual, shortage, stock] of [
  [3, 0, 11],
  [5, 0, 13],
  [1, 2, 9],
])
  test(`план 3, факт ${actual}: остаток и недостача`, () => {
    const s = snapshot([{ ...item, actualQuantity: actual }]);
    const p = previewCompletion(s, list);
    assert.equal(p.shortages[0]?.quantity ?? 0, shortage);
    const op = prepare(s);
    assert.equal(op.after.products[0].stock, stock);
    assert.equal(op.after.lists[0].status, "completed");
    assert.equal(op.after.lists[0].completedAt, now);
    assert.deepEqual(op.after.items[0], s.items[0]);
    assert.equal(op.after.items[0].plannedQuantity, 3);
  });
test("отсутствующий товар, полный отказ и частичный выбор", () => {
  const s = snapshot([
    { ...item, status: "unavailable", actualQuantity: null },
    { ...item, id: "second", actualQuantity: 1 },
  ]);
  assert.deepEqual(
    previewCompletion(s, list).shortages.map((x) => x.quantity),
    [3, 2]
  );
  const none = prepare(s, []);
  assert.equal(none.after.lists.length, 1);
  assert.equal(none.after.items.length, 2);
  assert.equal(none.after.products[0].stock, 9);
  const partial = prepare(s, ["second"]);
  assert.equal(partial.after.items.at(-1).plannedQuantity, 2);
  assert.equal(partial.after.items.length, 3);
});
test("десятичные суммы без двухзначного округления и мнимой недостачи", () => {
  assert.equal(shortageQuantity(0.3, 0.1), 0.2);
  assert.equal(decimalSum(0.1, 0.2), 0.3);
  assert.equal(shortageQuantity(0.30000000000000004, 0.3), 0);
  assert.equal(shortageQuantity(0.000003, 0.000001), 0.000002);
  assert.equal(shortageQuantity(2e-100, 1e-100), 1e-100);
  assert.throws(
    () => decimalSum(Number.MAX_VALUE, Number.MAX_VALUE),
    code("overflow")
  );
  const s = snapshot(
    [{ ...item, plannedQuantity: 0.3, actualQuantity: 0.1 }],
    [{ ...product, stock: 0.2 }]
  );
  const op = prepare(s);
  assert.equal(op.after.products[0].stock, 0.3);
  assert.equal(op.after.items.at(-1).plannedQuantity, 0.2);
});
test("несколько покупок одного продукта суммируются; чужие поля и история неизменны", () => {
  const foreign = {
    ...product,
    id: "foreign",
    householdId: "other",
    stock: 99,
  };
  const foreignList = { ...list, id: "foreign-list", householdId: "other" };
  const foreignItem = { ...item, id: "foreign-item", listId: foreignList.id };
  const s = snapshot(
    [item, { ...item, id: "second", actualQuantity: 2 }, foreignItem],
    [product, foreign],
    [list, foreignList]
  );
  const original = structuredClone(s);
  const op = prepare(s, []);
  assert.deepEqual(s, original);
  assert.deepEqual(op.after.products[0], {
    ...product,
    stock: 13,
    updatedAt: now,
  });
  assert.deepEqual(op.after.products[1], foreign);
  assert.deepEqual(op.after.lists[1], foreignList);
  assert.deepEqual(op.after.items, s.items);
});
test("ручной товар создаётся один раз; нормализованное совпадение получает покупку", () => {
  const manual = {
    ...item,
    productId: null,
    name: "  ХЛЕБ  ",
    unit: "шт",
    actualQuantity: 1,
    plannedQuantity: 2,
  };
  const op = prepare(snapshot([manual, { ...manual, id: "second" }]));
  const bread = op.after.products.filter((p) => p.name === "ХЛЕБ");
  assert.equal(bread.length, 1);
  assert.equal(bread[0].stock, 2);
  assert.equal(bread[0].dailyRate, null);
  assert.equal(bread[0].category, null);
  assert.equal(bread[0].lastAutoDeductAt, null);
  const existing = { ...product, id: "bread", name: "хлеб", unit: "шт" };
  const match = prepare(snapshot([manual], [existing]));
  assert.equal(match.after.products.length, 1);
  assert.equal(match.after.products[0].stock, 9);
});
test("существующий черновик: каталожные и ручные дубли объединяются, разные единицы отдельно", () => {
  const draft = { ...list, id: "draft", status: "draft" };
  const manual = {
    ...item,
    id: "manual",
    productId: null,
    name: "Хлеб",
    unit: "шт",
    status: "unavailable",
    actualQuantity: null,
  };
  const existing = {
    ...item,
    id: "d",
    listId: "draft",
    plannedQuantity: 2,
    status: "pending",
    actualQuantity: null,
  };
  const manualDraft = {
    ...manual,
    id: "md",
    listId: "draft",
    name: " хлеб ",
    status: "pending",
    plannedQuantity: 1,
  };
  const otherUnit = {
    ...manualDraft,
    id: "mu",
    unit: "кг",
    plannedQuantity: 10,
  };
  const s = snapshot(
    [{ ...item, actualQuantity: 1 }, manual, existing, manualDraft, otherUnit],
    [product],
    [list, draft]
  );
  const op = prepare(s);
  assert.equal(op.after.lists.length, 2);
  assert.equal(op.after.items.find((x) => x.id === "d").plannedQuantity, 4);
  assert.equal(op.after.items.find((x) => x.id === "md").plannedQuantity, 4);
  assert.equal(op.after.items.find((x) => x.id === "mu").plannedQuantity, 10);
  assert.equal(op.after.items.length, s.items.length);
});
test("перенос одинаковых исходных позиций создаёт один pending без факта", () => {
  const s = snapshot([
    { ...item, actualQuantity: 1 },
    { ...item, id: "second", actualQuantity: 2 },
  ]);
  const op = prepare(s);
  const carried = op.after.items.filter((x) => x.listId !== "trip");
  assert.equal(carried.length, 1);
  assert.equal(carried[0].plannedQuantity, 3);
  assert.equal(carried[0].status, "pending");
  assert.equal(carried[0].actualQuantity, null);
});
test("безопасный отказ: связи, единицы, неоднозначность, переполнение", () => {
  assert.throws(() => prepare(snapshot([item], [])), code("link"));
  assert.throws(
    () => prepare(snapshot([item], [{ ...product, householdId: "other" }])),
    code("link")
  );
  assert.throws(
    () => prepare(snapshot([item], [{ ...product, unit: "кг" }])),
    code("unit")
  );
  const manual = { ...item, productId: null, name: "Молоко" };
  assert.throws(
    () => prepare(snapshot([manual], [product, { ...product, id: "another" }])),
    code("ambiguous")
  );
  assert.throws(
    () =>
      prepare(
        snapshot(
          [{ ...item, actualQuantity: Number.MAX_VALUE }],
          [{ ...product, stock: Number.MAX_VALUE }]
        )
      ),
    code("overflow")
  );
  assert.throws(
    () => prepare(snapshot([item], [{ ...product, stock: -1 }])),
    code("stock")
  );
});
test("запрет pending, пустого, чужого и неактивного списка, некорректных количеств", () => {
  assert.throws(
    () =>
      prepare(snapshot([{ ...item, status: "pending", actualQuantity: null }])),
    code("pending")
  );
  assert.throws(() => prepare(snapshot([])), code("empty"));
  for (const status of ["draft", "completed"])
    assert.throws(
      () => prepare(snapshot([item], [product], [{ ...list, status }])),
      code("not-active")
    );
  assert.throws(
    () =>
      prepare(snapshot([item], [product], [{ ...list, householdId: "other" }])),
    code("not-active")
  );
  for (const actualQuantity of [0, -1, null, NaN, Infinity])
    assert.throws(
      () => prepare(snapshot([{ ...item, actualQuantity }])),
      code("actual")
    );
  for (const plannedQuantity of [0, -1, null, NaN, Infinity])
    assert.throws(
      () => prepare(snapshot([{ ...item, plannedQuantity }])),
      code("plan")
    );
});
test("устаревшее предложение и недопустимый выбор не применяются", () => {
  const s = snapshot([{ ...item, actualQuantity: 1 }]);
  const p = previewCompletion(s, list);
  for (const changed of [
    { ...s, products: [{ ...product, stock: 9 }] },
    { ...s, items: [{ ...s.items[0], actualQuantity: 2 }] },
  ])
    assert.throws(
      () => prepareCompletion(changed, p, ["i"], now, ids()),
      code("stale")
    );
  assert.throws(
    () => prepareCompletion(s, p, ["unknown"], now, ids()),
    code("selection")
  );
});
const keys = {
  products: "fridge.products.v2",
  lists: "fridge.shopping-lists.v2",
  items: "fridge.shopping-items.v2",
  journal: "fridge.shopping-completion.v1",
};
function fixture(s = snapshot([{ ...item, actualQuantity: 1 }])) {
  const records = new Map(
    Object.entries(keys)
      .filter(([k]) => k !== "journal")
      .map(([k, v]) => [v, JSON.stringify(s[k])])
  );
  let count = 0,
    failAt = 0,
    afterWrite = false;
  function install() {
    globalThis.window = {
      localStorage: {
        getItem: (k) => records.get(k) ?? null,
        setItem(k, v) {
          count++;
          if (count === failAt && !afterWrite) throw Error("quota");
          records.set(k, v);
          if (count === failAt && afterWrite) throw Error("crash-after-write");
        },
        removeItem(k) {
          count++;
          if (count === failAt && !afterWrite) throw Error("quota-remove");
          records.delete(k);
          if (count === failAt && afterWrite) throw Error("crash-after-remove");
        },
      },
    };
  }
  install();
  return {
    records,
    fail(n, after = false) {
      count = 0;
      failAt = n;
      afterWrite = after;
    },
    restart() {
      count = 0;
      failAt = 0;
      install();
    },
    count: () => count,
  };
}
for (const after of [false, true])
  for (let stage = 1; stage <= 5; stage++)
    test(`сбой ${after ? "после" : "до"} шага ${stage}: перезапуск и идемпотентное восстановление`, () => {
      const previous = globalThis.window;
      try {
        const f = fixture();
        const preview = loadCompletionPreview(list);
        f.fail(stage, after);
        assert.throws(() => completeShoppingTrip(preview, ["i"], now, ids()));
        if (stage === 1 && !after) {
          assert.equal(f.records.get(keys.journal), undefined);
          assert.equal(JSON.parse(f.records.get(keys.products))[0].stock, 8);
        }
        f.restart();
        if (f.records.has(keys.journal)) storage.recoverShoppingCompletion();
        else if (JSON.parse(f.records.get(keys.lists))[0].status === "active")
          completeShoppingTrip(loadCompletionPreview(list), ["i"], now, ids());
        assert.equal(JSON.parse(f.records.get(keys.products))[0].stock, 9);
        assert.equal(
          JSON.parse(f.records.get(keys.lists))[0].status,
          "completed"
        );
        assert.equal(
          JSON.parse(f.records.get(keys.items)).filter(
            (x) => x.listId !== "trip"
          ).length,
          1
        );
        const done = JSON.stringify([...f.records]);
        storage.recoverShoppingCompletion();
        assert.equal(JSON.stringify([...f.records]), done);
        assert.throws(
          () => completeShoppingTrip(preview, ["i"], now, ids()),
          code("not-active")
        );
        assert.equal(JSON.stringify([...f.records]), done);
      } finally {
        if (previous === undefined) delete globalThis.window;
        else globalThis.window = previous;
      }
    });
test("восстановление создаваемого продукта не создаёт дубли; обычные чтения восстанавливают до возврата данных", async () => {
  const previous = globalThis.window;
  try {
    const f = fixture(
      snapshot([
        {
          ...item,
          productId: null,
          name: "Хлеб",
          unit: "шт",
          actualQuantity: 1,
        },
      ])
    );
    f.fail(3);
    assert.throws(() =>
      completeShoppingTrip(loadCompletionPreview(list), ["i"], now, ids())
    );
    f.restart();
    const products = await storage.loadProducts();
    assert.equal(products.filter((p) => p.name === "Хлеб").length, 1);
    assert.equal(products.find((p) => p.name === "Хлеб").stock, 1);
    assert.equal((await storage.loadShoppingLists())[0].status, "completed");
    assert.equal(f.records.has(keys.journal), false);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
test("барьер запрещает обычные записи при отказе восстановления и сохраняет журнал", async () => {
  const previous = globalThis.window;
  try {
    const f = fixture();
    f.fail(3);
    assert.throws(() =>
      completeShoppingTrip(loadCompletionPreview(list), ["i"], now, ids())
    );
    const journal = f.records.get(keys.journal);
    f.fail(1);
    await assert.rejects(storage.saveProducts([]));
    assert.equal(f.records.get(keys.journal), journal);
    f.restart();
    storage.recoverShoppingCompletion();
    assert.equal(JSON.parse(f.records.get(keys.products))[0].stock, 9);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
test("восстановление перед автосписанием; повтор не затирает новое списание", async () => {
  const previous = globalThis.window;
  try {
    const old = "2026-11-17T12:00:00.000Z";
    const f = fixture(
      snapshot(
        [{ ...item, actualQuantity: 1 }],
        [{ ...product, dailyRate: 1, createdAt: old, lastAutoDeductAt: old }]
      )
    );
    f.fail(3);
    assert.throws(() =>
      completeShoppingTrip(loadCompletionPreview(list), ["i"], now, ids())
    );
    f.restart();
    const result = await storage.updateProducts((products) => {
      const r = applyDeductions({
        products,
        dayEndTime: "00:00",
        now: new Date(now),
      });
      return { products: r.updatedProducts, result: r, changed: r.hasChanges };
    });
    assert.equal(result.updatedProducts[0].stock, 7);
    const after = f.records.get(keys.products);
    storage.recoverShoppingCompletion();
    assert.equal(f.records.get(keys.products), after);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
test("внешние изменения и повреждённый журнал блокируют восстановление без перезаписи", () => {
  const previous = globalThis.window;
  try {
    const f = fixture();
    f.fail(3);
    assert.throws(() =>
      completeShoppingTrip(loadCompletionPreview(list), ["i"], now, ids())
    );
    f.restart();
    f.records.set(keys.products, JSON.stringify([{ ...product, stock: 100 }]));
    assert.throws(() => storage.recoverShoppingCompletion(), /изменились/);
    assert.equal(JSON.parse(f.records.get(keys.products))[0].stock, 100);
    f.records.set(keys.journal, "invalid");
    assert.throws(() => storage.recoverShoppingCompletion());
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
test("чужие legacy данные сохраняются побайтово как записи, без потери полей", () => {
  const previous = globalThis.window;
  try {
    const foreign = {
      ...item,
      id: "foreign",
      listId: "foreign-list",
      status: "pending",
      actualQuantity: undefined,
      extra: "keep",
    };
    const f = fixture(snapshot([{ ...item, actualQuantity: 1 }, foreign]));
    completeShoppingTrip(loadCompletionPreview(list), [], now, ids());
    assert.deepEqual(
      JSON.parse(f.records.get(keys.items))[1],
      JSON.parse(JSON.stringify(foreign))
    );
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test("storage: устаревший preview не создаёт журнал, повтор требует нового подтверждения", () => {
  const previous = globalThis.window;
  try {
    const f = fixture();
    const preview = loadCompletionPreview(list);
    f.records.set(keys.products, JSON.stringify([{ ...product, stock: 10 }]));
    const before = JSON.stringify([...f.records]);
    assert.throws(
      () => completeShoppingTrip(preview, ["i"], now, ids()),
      code("stale")
    );
    assert.equal(JSON.stringify([...f.records]), before);
    completeShoppingTrip(loadCompletionPreview(list), ["i"], now, ids());
    assert.equal(JSON.parse(f.records.get(keys.products))[0].stock, 11);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
test("невозможность прочитать журнал не превращается в пустые данные и не запускает списание", async () => {
  const previous = globalThis.window;
  let writes = 0;
  globalThis.window = {
    localStorage: {
      getItem() {
        throw Error("read-denied");
      },
      setItem() {
        writes++;
      },
    },
  };
  try {
    await assert.rejects(storage.loadProducts(), /read-denied/);
    await assert.rejects(storage.loadShoppingLists(), /read-denied/);
    await assert.rejects(
      storage.updateProducts(() => {
        throw Error("must-not-run");
      }),
      /read-denied/
    );
    assert.equal(writes, 0);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

// after-images и operation.after меняются вместе, чтобы проверить именно
// арифметику/смысл операции, а не только совпадение двух её представлений.
function alterResult(journal, key, change) {
  const entries = JSON.parse(journal.after[key]);
  change(entries);
  journal.after[key] = JSON.stringify(entries);
  journal.operation.after[key] = structuredClone(entries);
}
function integrityFixture() {
  return fixture(
    snapshot(
      [
        { ...item, actualQuantity: 1 },
        {
          ...item,
          id: "manual",
          productId: null,
          name: "Хлеб",
          unit: "шт",
          plannedQuantity: 2,
          actualQuantity: 1,
        },
        {
          ...item,
          id: "missing",
          status: "unavailable",
          actualQuantity: null,
          plannedQuantity: 1,
        },
        {
          ...item,
          id: "foreign-item",
          listId: "foreign-list",
          productId: "foreign",
        },
      ],
      [product, { ...product, id: "foreign", householdId: "other", stock: 99 }],
      [
        list,
        {
          ...list,
          id: "foreign-list",
          householdId: "other",
          status: "completed",
          completedAt: at,
        },
      ]
    )
  );
}
const corruptions = [
  [
    "P1: raw after.lists оставляет active",
    (j) => {
      j.after.lists = j.before.lists;
    },
  ],
  [
    "P1: raw after.items удаляет историю",
    (j) => {
      j.after.items = "[]";
    },
  ],
  [
    "active одновременно в operation.after и after-image",
    (j) =>
      alterResult(j, "lists", (rows) => {
        rows.find((x) => x.id === "trip").status = "active";
      }),
  ],
  [
    "история удалена в обоих представлениях",
    (j) =>
      alterResult(j, "items", (rows) => {
        rows.splice(0, 3);
      }),
  ],
  [
    "неправильное начисление продукта",
    (j) =>
      alterResult(j, "products", (rows) => {
        rows[0].stock += 1;
      }),
  ],
  [
    "продукт не начислен",
    (j) =>
      alterResult(j, "products", (rows) => {
        rows[0].stock = product.stock;
      }),
  ],
  [
    "изменён факт исходной покупки",
    (j) =>
      alterResult(j, "items", (rows) => {
        rows[0].actualQuantity = 2;
      }),
  ],
  [
    "изменён план исходной покупки",
    (j) =>
      alterResult(j, "items", (rows) => {
        rows[0].plannedQuantity = 10;
      }),
  ],
  [
    "исходный пункт перемещён в другой список",
    (j) =>
      alterResult(j, "items", (rows) => {
        rows[0].listId = "foreign-list";
      }),
  ],
  [
    "изменён статус исходного пункта",
    (j) =>
      alterResult(j, "items", (rows) => {
        rows[0].status = "unavailable";
        rows[0].actualQuantity = null;
      }),
  ],
  [
    "неверный completedAt",
    (j) =>
      alterResult(j, "lists", (rows) => {
        rows[0].completedAt = "invalid";
      }),
  ],
  [
    "completedAt корректен синтаксически, но отличается от подтверждённого",
    (j) =>
      alterResult(j, "lists", (rows) => {
        rows[0].completedAt = at;
      }),
  ],
  [
    "изменено время создания исходного списка",
    (j) =>
      alterResult(j, "lists", (rows) => {
        rows[0].createdAt = now;
      }),
  ],
  [
    "повторно создан ручной продукт",
    (j) =>
      alterResult(j, "products", (rows) => {
        rows.push({
          ...rows.find((x) => x.name === "Хлеб"),
          id: "unexpected-product",
        });
      }),
  ],
  [
    "ручной продукт создан с неправильным остатком",
    (j) =>
      alterResult(j, "products", (rows) => {
        rows.find((x) => x.name === "Хлеб").stock = 5;
      }),
  ],
  [
    "неправильное количество переноса",
    (j) =>
      alterResult(j, "items", (rows) => {
        rows.find(
          (x) => x.listId !== "trip" && x.listId !== "foreign-list"
        ).plannedQuantity = 99;
      }),
  ],
  [
    "перенос ошибочно помечен купленным",
    (j) =>
      alterResult(j, "items", (rows) => {
        const x = rows.find(
          (x) => x.listId !== "trip" && x.listId !== "foreign-list"
        );
        x.status = "bought";
        x.actualQuantity = 1;
      }),
  ],
  [
    "неожиданное изменение чужого продукта",
    (j) =>
      alterResult(j, "products", (rows) => {
        rows.find((x) => x.id === "foreign").stock = 0;
      }),
  ],
  [
    "неожиданное изменение чужого списка",
    (j) =>
      alterResult(j, "lists", (rows) => {
        rows.find((x) => x.id === "foreign-list").createdAt = now;
      }),
  ],
  [
    "неожиданное изменение чужого пункта",
    (j) =>
      alterResult(j, "items", (rows) => {
        rows.find((x) => x.id === "foreign-item").plannedQuantity = 100;
      }),
  ],
  [
    "выбор переноса не соответствует результату",
    (j) => {
      j.operation.selected = [];
    },
  ],
  [
    "несуществующий выбор переноса",
    (j) => {
      j.operation.selected = ["unknown"];
    },
  ],
  [
    "подменён факт в operation.before",
    (j) => {
      j.operation.before.items[0].actualQuantity = 2;
    },
  ],
  [
    "подменён исходный raw снимок",
    (j) => {
      const rows = JSON.parse(j.before.items);
      rows[0].actualQuantity = 2;
      j.before.items = JSON.stringify(rows);
    },
  ],
  [
    "подменено домохозяйство операции",
    (j) => {
      j.operation.target.householdId = "other";
    },
  ],
  [
    "лишний неиспользованный ID",
    (j) => {
      j.operation.generatedIds.push("extra");
    },
  ],
  [
    "недостающий ID",
    (j) => {
      j.operation.generatedIds.pop();
    },
  ],
  [
    "дублирующийся новый ID",
    (j) => {
      j.operation.generatedIds[1] = j.operation.generatedIds[0];
    },
  ],
  [
    "отсутствует подтверждённое время",
    (j) => {
      delete j.operation.completedAt;
    },
  ],
  [
    "метаданные времени повреждены",
    (j) => {
      j.operation.completedAt = "invalid";
    },
  ],
  [
    "старый журнал без метаданных",
    (j) => {
      j.version = 1;
      j.operation.version = 1;
      delete j.operation.completedAt;
      delete j.operation.generatedIds;
    },
  ],
  [
    "новый номер версии без обязательных метаданных",
    (j) => {
      delete j.operation.generatedIds;
    },
  ],
];
for (const [name, corrupt] of corruptions) {
  test(`целостность журнала: ${name}; отказ до первой записи`, async () => {
    const previous = globalThis.window;
    try {
      const f = integrityFixture();
      const preview = loadCompletionPreview(list);
      f.fail(2); // Журнал сохранён; ни один основной ключ ещё не записан.
      assert.throws(() =>
        completeShoppingTrip(preview, ["i", "manual", "missing"], now, ids())
      );
      const journal = JSON.parse(f.records.get(keys.journal));
      corrupt(journal);
      f.records.set(keys.journal, JSON.stringify(journal));
      f.restart();
      const before = structuredClone([...f.records]);
      for (let repeat = 0; repeat < 2; repeat++) {
        assert.throws(
          () => storage.recoverShoppingCompletion(),
          /Не удалось проверить данные завершения/
        );
        await assert.rejects(
          storage.loadProducts(),
          /Не удалось проверить данные завершения/
        );
        assert.throws(
          () => completeShoppingTrip(preview, [], now, ids()),
          /Не удалось проверить данные завершения/
        );
        assert.equal(
          f.count(),
          0,
          "нет setItem/removeItem, включая удаление журнала"
        );
        assert.deepEqual(
          [...f.records],
          before,
          "основные данные и журнал сохранены дословно"
        );
      }
    } finally {
      if (previous === undefined) delete globalThis.window;
      else globalThis.window = previous;
    }
  });
}
for (const stage of [3, 4, 5])
  for (const [name, corrupt] of corruptions.slice(0, 2)) {
    test(`P1 после частичного сохранения, шаг ${stage}: ${name}`, () => {
      const previous = globalThis.window;
      try {
        const f = integrityFixture();
        f.fail(stage);
        assert.throws(() =>
          completeShoppingTrip(
            loadCompletionPreview(list),
            ["i", "manual", "missing"],
            now,
            ids()
          )
        );
        const journal = JSON.parse(f.records.get(keys.journal));
        corrupt(journal);
        f.records.set(keys.journal, JSON.stringify(journal));
        f.restart();
        const before = structuredClone([...f.records]);
        assert.throws(
          () => storage.recoverShoppingCompletion(),
          /Не удалось проверить/
        );
        assert.deepEqual([...f.records], before);
        assert.equal(f.count(), 0);
      } finally {
        if (previous === undefined) delete globalThis.window;
        else globalThis.window = previous;
      }
    });
  }
test("некорректный внутренний результат отклоняется ещё до записи журнала", () => {
  const previous = globalThis.window;
  try {
    const f = fixture();
    const before = structuredClone([...f.records]);
    assert.throws(
      () =>
        storage.commitShoppingCompletion((s) => {
          const operation = prepare(s);
          operation.after.products[0].stock = 100;
          return operation;
        }),
      /Не удалось проверить/
    );
    assert.deepEqual([...f.records], before);
    assert.equal(f.count(), 0);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
for (const after of [false, true])
  for (let stage = 1; stage <= 5; stage++) {
    test(`корректный полный журнал: ${after ? "после" : "до"} шага ${stage}; продукт, история и переносы без дублей`, () => {
      const previous = globalThis.window;
      try {
        const f = integrityFixture();
        const preview = loadCompletionPreview(list);
        f.fail(stage, after);
        assert.throws(() =>
          completeShoppingTrip(preview, ["i", "manual", "missing"], now, ids())
        );
        f.restart();
        if (f.records.has(keys.journal)) storage.recoverShoppingCompletion();
        else if (JSON.parse(f.records.get(keys.lists))[0].status === "active")
          completeShoppingTrip(
            loadCompletionPreview(list),
            ["i", "manual", "missing"],
            now,
            ids()
          );
        const products = JSON.parse(f.records.get(keys.products));
        assert.equal(products.find((x) => x.id === "milk").stock, 9);
        assert.equal(products.filter((x) => x.name === "Хлеб").length, 1);
        assert.equal(products.find((x) => x.name === "Хлеб").stock, 1);
        const lists = JSON.parse(f.records.get(keys.lists));
        assert.equal(lists.find((x) => x.id === "trip").status, "completed");
        assert.equal(lists.filter((x) => x.status === "draft").length, 1);
        const items = JSON.parse(f.records.get(keys.items));
        assert.equal(items.filter((x) => x.listId === "trip").length, 3);
        assert.equal(
          items.filter(
            (x) => x.listId !== "trip" && x.listId !== "foreign-list"
          ).length,
          2
        );
        const beforeRepeat = structuredClone([...f.records]);
        storage.recoverShoppingCompletion();
        assert.deepEqual([...f.records], beforeRepeat);
        assert.throws(
          () => completeShoppingTrip(preview, [], now, ids()),
          code("not-active")
        );
      } finally {
        if (previous === undefined) delete globalThis.window;
        else globalThis.window = previous;
      }
    });
  }

test("журнал не удаляется, если итоговые значения не подтверждены повторным чтением", () => {
  const previous = globalThis.window;
  try {
    const f = fixture();
    const original = globalThis.window.localStorage.setItem;
    globalThis.window.localStorage.setItem = (key, value) => {
      if (key !== keys.items) original(key, value);
    };
    assert.throws(
      () =>
        completeShoppingTrip(loadCompletionPreview(list), ["i"], now, ids()),
      /Не удалось подтвердить сохранение/
    );
    assert.ok(f.records.has(keys.journal));
    assert.equal(JSON.parse(f.records.get(keys.products))[0].stock, 9);
    f.restart();
    storage.recoverShoppingCompletion();
    assert.equal(f.records.has(keys.journal), false);
    assert.equal(JSON.parse(f.records.get(keys.products))[0].stock, 9);
    assert.equal(JSON.parse(f.records.get(keys.items)).length, 2);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
process.on("exit", () => hooks.deregister());
