/**
 * Краткая запись сохранённого количества без округления и умножения.
 * String сохраняет точность number; для крайних значений использует экспоненту.
 */
export function formatShoppingQuantity(value: number): string {
  return Number.isFinite(value) ? String(value) : "0";
}
