/**
 * Самопроверка автосписания. Не подключён к приложению, запускается вручную:
 *   bun run src/lib/auto-deduction.check.ts
 */
import { applyDeductions, calculateMissedDays } from "./auto-deduction";
import { DEFAULT_HOUSEHOLD_ID, type Product } from "./types";

const YEAR = 2025;
const OCTOBER = 9; // месяцы в Date — с нуля

function at(day: number, hours: number, minutes: number): Date {
  return new Date(YEAR, OCTOBER, day, hours, minutes);
}

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: "product-1",
    householdId: DEFAULT_HOUSEHOLD_ID,
    name: "Молоко",
    unit: "л",
    stock: 0,
    dailyRate: null,
    category: null,
    createdAt: at(10, 12, 0).toISOString(),
    updatedAt: at(10, 12, 0).toISOString(),
    lastAutoDeductAt: null,
    ...overrides,
  };
}

let failed = 0;
let total = 0;

function check(name: string, condition: boolean): void {
  total += 1;
  // console.assert печатает провал, но не прерывает скрипт — считаем сами.
  console.assert(condition, `FAIL: ${name}`);
  if (!condition) failed += 1;
}

// 1. Создан 10.10 12:00, dayEndTime "00:00", now 13.10 15:00 → 3 списания.
check(
  "1: три пропущенных дня (11, 12, 13 октября в 00:00)",
  calculateMissedDays({
    lastAutoDeductAt: null,
    createdAt: at(10, 12, 0).toISOString(),
    dayEndTime: "00:00",
    now: at(13, 15, 0),
  }) === 3
);

// 2. now 10.10 23:00 → 0: полночь 11-го ещё не наступила.
check(
  "2: полночь следующего дня ещё не наступила",
  calculateMissedDays({
    lastAutoDeductAt: null,
    createdAt: at(10, 12, 0).toISOString(),
    dayEndTime: "00:00",
    now: at(10, 23, 0),
  }) === 0
);

// 3. dayEndTime "22:00", создан 10.10 12:00, now 10.10 23:00 → 1.
check(
  "3: списание в 22:00 того же дня",
  calculateMissedDays({
    lastAutoDeductAt: null,
    createdAt: at(10, 12, 0).toISOString(),
    dayEndTime: "22:00",
    now: at(10, 23, 0),
  }) === 1
);

// 4. lastAutoDeductAt 12.10 00:05, dayEndTime "00:00", now 13.10 15:00 → 1
//    (полночь 12-го уже учтена: 00:00 не позже 00:05).
check(
  "4: полночь дня последнего списания не дублируется",
  calculateMissedDays({
    lastAutoDeductAt: at(12, 0, 5).toISOString(),
    createdAt: at(10, 12, 0).toISOString(),
    dayEndTime: "00:00",
    now: at(13, 15, 0),
  }) === 1
);

// 5. dailyRate = null — продукт не меняется вообще.
{
  const product = makeProduct({ stock: 5, dailyRate: null });
  const result = applyDeductions({
    products: [product],
    dayEndTime: "00:00",
    now: at(13, 15, 0),
  });
  const [updated] = result.updatedProducts;
  check("5: dailyRate null — нет изменений", !result.hasChanges);
  check("5: dailyRate null — maxMissedDays 0", result.maxMissedDays === 0);
  check("5: dailyRate null — остаток прежний", updated.stock === 5);
  check(
    "5: dailyRate null — lastAutoDeductAt прежний",
    updated.lastAutoDeductAt === product.lastAutoDeductAt
  );
  check("5: dailyRate null — updatedAt прежний", updated.updatedAt === product.updatedAt);
  check("5: dailyRate null — объект не тронут", updated === product);
}

// 6. stock 1, dailyRate 2, 3 пропущенных дня → stock 0, не отрицательный.
{
  const product = makeProduct({ stock: 1, dailyRate: 2 });
  const now = at(13, 15, 0);
  const result = applyDeductions({
    products: [product],
    dayEndTime: "00:00",
    now,
  });
  const [updated] = result.updatedProducts;
  check("6: остаток обнулился", updated.stock === 0);
  check("6: есть изменения", result.hasChanges);
  check("6: maxMissedDays 3", result.maxMissedDays === 3);
  check(
    "6: lastAutoDeductAt = now",
    updated.lastAutoDeductAt === now.toISOString()
  );
  check("6: updatedAt = now", updated.updatedAt === now.toISOString());
}

// 7. missedDays = 0 — lastAutoDeductAt и updatedAt не переписываются.
{
  const lastAutoDeductAt = at(13, 0, 5).toISOString();
  const updatedAt = "2025-10-12T10:00:00.000Z";
  const product = makeProduct({
    stock: 4,
    dailyRate: 1,
    lastAutoDeductAt,
    updatedAt,
  });
  const result = applyDeductions({
    products: [product],
    dayEndTime: "00:00",
    now: at(13, 15, 0),
  });
  const [updated] = result.updatedProducts;
  check("7: missedDays 0 — нет изменений", !result.hasChanges);
  check("7: missedDays 0 — lastAutoDeductAt прежний", updated.lastAutoDeductAt === lastAutoDeductAt);
  check("7: missedDays 0 — updatedAt прежний", updated.updatedAt === updatedAt);
  check("7: missedDays 0 — объект не тронут", updated === product);
}

// Дополнительные крайние случаи.
check(
  "8: невалидный dayEndTime → 0",
  calculateMissedDays({
    lastAutoDeductAt: null,
    createdAt: at(10, 12, 0).toISOString(),
    dayEndTime: "25:99",
    now: at(13, 15, 0),
  }) === 0
);
{
  const result = applyDeductions({ products: [], dayEndTime: "00:00", now: at(13, 15, 0) });
  check(
    "9: пустой список — нет изменений",
    !result.hasChanges && result.maxMissedDays === 0 && result.updatedProducts.length === 0
  );
}
{
  const product = makeProduct({ stock: 3, dailyRate: 0 });
  const result = applyDeductions({
    products: [product],
    dayEndTime: "00:00",
    now: at(13, 15, 0),
  });
  check(
    "10: dailyRate 0 — продукт не тронут",
    !result.hasChanges && result.updatedProducts[0] === product
  );
}

if (failed > 0) {
  console.error(`Провалено проверок: ${failed} из ${total}`);
  process.exit(1);
}
console.log(`Все проверки автосписания пройдены (${total})`);
