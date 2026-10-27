/**
 * Общие хелперы форматирования чисел для интерфейса.
 * Десятичный разделитель — точка: «2», «0.5», «1.25».
 */

/** Целые — без дробной части, дробные — до 2 знаков без лишних нулей. */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

/** Число с русским склонением «день/дня/дней»: 1 день, 2 дня, 5 дней, 11 дней. */
export function formatDays(days: number): string {
  const value = Math.max(0, Math.floor(days));
  const mod100 = value % 100;
  const mod10 = value % 10;
  let word = "дней";
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) word = "день";
    else if (mod10 >= 2 && mod10 <= 4) word = "дня";
  }
  return `${value} ${word}`;
}
