import { TIME_PATTERN } from "@/lib/storage";
import type { Product } from "@/lib/types";

/**
 * Чистые функции автосписания: расчёт пропущенных дней и применение списаний.
 * Никакого доступа к хранилищу и сторонним эффектам — интеграция в экраны
 * (вызов при открытии приложения) выполняется отдельным шагом.
 *
 * Все вычисления — в локальной таймзоне через методы Date, без хардкода
 * смещений: переходы на летнее/зимнее время обрабатывает сам Date.
 */

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

function parseDayEndTime(
  dayEndTime: string
): { hours: number; minutes: number } | null {
  if (!TIME_PATTERN.test(dayEndTime)) return null;
  const [hours, minutes] = dayEndTime.split(":").map(Number);
  return { hours, minutes };
}

// Порядковый номер локального календарного дня — достаточно, чтобы
// сравнивать даты без учёта времени и переходов через месяц/год.
function localDayNumber(value: Date): number {
  return value.getFullYear() * 10000 + (value.getMonth() + 1) * 100 + value.getDate();
}

export function calculateMissedDays(params: {
  lastAutoDeductAt: string | null;
  createdAt: string;
  dayEndTime: string;
  now: Date;
}): number {
  const { lastAutoDeductAt, createdAt, dayEndTime, now } = params;
  const time = parseDayEndTime(dayEndTime);
  if (!time) return 0;

  const t0 = new Date(lastAutoDeductAt ?? createdAt);
  if (!isValidDate(t0) || !isValidDate(now)) return 0;
  if (t0.getTime() >= now.getTime()) return 0;

  let missed = 0;
  // Курсор — локальная полночь текущего проверяемого дня; setDate корректно
  // переходит через границы месяцев и переводы часов.
  const cursor = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate());
  const lastDay = localDayNumber(now);
  for (;;) {
    if (localDayNumber(cursor) > lastDay) break;
    const moment = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate(),
      time.hours,
      time.minutes
    );
    if (moment.getTime() > t0.getTime() && moment.getTime() <= now.getTime()) {
      missed += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return missed;
}

export function applyDeductions(params: {
  products: Product[];
  dayEndTime: string;
  now: Date;
}): { updatedProducts: Product[]; maxMissedDays: number; hasChanges: boolean } {
  const { products, dayEndTime, now } = params;

  let maxMissedDays = 0;
  let hasChanges = false;
  const updatedProducts = products.map((product) => {
    // Продукты без расхода (null) и с нулевым расходом не списываются вовсе.
    if (product.dailyRate === null || product.dailyRate <= 0) return product;

    const missedDays = calculateMissedDays({
      lastAutoDeductAt: product.lastAutoDeductAt,
      createdAt: product.createdAt,
      dayEndTime,
      now,
    });
    if (missedDays > maxMissedDays) maxMissedDays = missedDays;
    if (missedDays === 0) return product;

    hasChanges = true;
    const iso = now.toISOString();
    return {
      ...product,
      stock: Math.max(0, product.stock - product.dailyRate * missedDays),
      lastAutoDeductAt: iso,
      updatedAt: iso,
    };
  });

  return { updatedProducts, maxMissedDays, hasChanges };
}
