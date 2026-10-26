import type { Unit } from "@/lib/types";

type SeedProduct = {
  id: string;
  name: string;
  unit: Unit;
  category: string;
};

/**
 * Базовый каталог для первого запуска: остаток 0, среднесуточный расход
 * не задан. Идентификаторы фиксированные, чтобы сид был стабильным.
 */
export const SEED_CATALOG: readonly SeedProduct[] = [
  { id: "milk", name: "Молоко", unit: "л", category: "Молочные продукты" },
  { id: "bread", name: "Хлеб", unit: "шт", category: "Хлеб и выпечка" },
  { id: "eggs", name: "Яйца", unit: "шт", category: "Яйца" },
  { id: "cheese", name: "Сыр", unit: "г", category: "Молочные продукты" },
  { id: "chicken", name: "Курица", unit: "г", category: "Мясо" },
  { id: "rice", name: "Рис", unit: "г", category: "Крупы и макароны" },
  { id: "pasta", name: "Макароны", unit: "г", category: "Крупы и макароны" },
  { id: "potato", name: "Картофель", unit: "г", category: "Овощи" },
  { id: "onion", name: "Лук", unit: "г", category: "Овощи" },
  { id: "carrot", name: "Морковь", unit: "г", category: "Овощи" },
  { id: "apples", name: "Яблоки", unit: "шт", category: "Фрукты" },
  { id: "bananas", name: "Бананы", unit: "шт", category: "Фрукты" },
  { id: "butter", name: "Масло", unit: "г", category: "Молочные продукты" },
  { id: "salt", name: "Соль", unit: "г", category: "Бакалея" },
  { id: "sugar", name: "Сахар", unit: "г", category: "Бакалея" },
];
