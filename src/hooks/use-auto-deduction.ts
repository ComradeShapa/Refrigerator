"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { applyDeductions } from "@/lib/auto-deduction";
import { loadProducts, loadSettings, saveProducts } from "@/lib/storage";
import type { Product } from "@/lib/types";

/** Итог успешного прогона автосписания — для показа пользователю. */
export type DeductionInfo = {
  /** Максимум пропущенных дней среди всех продуктов. */
  missedDays: number;
  /** Момент списания (ISO). */
  at: string;
};

type UseAutoDeductionOptions = {
  /**
   * Вызывается после успешной записи списаний: экран заменяет список
   * этими данными без перезагрузки.
   */
  onProductsApplied: (products: Product[]) => void;
};

/**
 * Досчитывает автосписание при открытии экрана остатков и при возврате
 * на вкладку. Интервалов нет: прогон запускают только монтирование
 * (в том числе повторное) и visibilitychange → visible.
 */
export function useAutoDeduction({
  onProductsApplied,
}: UseAutoDeductionOptions): {
  lastDeduction: DeductionInfo | null;
  isRunning: boolean;
} {
  const [lastDeduction, setLastDeduction] = useState<DeductionInfo | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Один прогон за раз: повторный вызов до завершения предыдущего пропускаем.
  const runningRef = useRef(false);
  // Свежий колбэк без пересоздания подписки: эффект живёт весь маунт.
  const appliedRef = useRef(onProductsApplied);
  useEffect(() => {
    appliedRef.current = onProductsApplied;
  }, [onProductsApplied]);

  useEffect(() => {
    // Прогон объявлен внутри эффекта: все обновления состояния — после await,
    // синхронных setState при монтировании нет.
    const runOnce = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const settings = await loadSettings();
        setIsRunning(true);
        const products = await loadProducts();
        const now = new Date();
        const result = applyDeductions({
          products,
          dayEndTime: settings.dayEndTime,
          now,
        });
        if (result.hasChanges) {
          // Ошибка записи выделена отдельно: список не обновляем, чтобы он
          // не разошёлся с хранилищем. Неудачное чтение данных логируется
          // молча — прогон просто пропускается до следующего вызова.
          try {
            await saveProducts(result.updatedProducts);
            setLastDeduction({
              missedDays: result.maxMissedDays,
              at: now.toISOString(),
            });
            appliedRef.current(result.updatedProducts);
          } catch {
            toast.error("Не удалось обновить остатки");
          }
        }
      } catch (error) {
        console.warn(
          "Автосписание пропущено: не удалось прочитать данные",
          error
        );
      }
      runningRef.current = false;
      setIsRunning(false);
    };

    void runOnce();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void runOnce();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return { lastDeduction, isRunning };
}
