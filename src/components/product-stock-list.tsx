"use client";

import { Refrigerator } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { loadProducts } from "@/lib/storage";
import type { Product } from "@/lib/types";

export function ProductStockList() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadProducts()
      .then((items) => {
        if (!cancelled) setProducts(items);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Не удалось загрузить продукты. Возможно, браузер запрещает этому сайту
        сохранять данные (localStorage).
      </p>
    );
  }

  // Хранилище читается за доли секунды — пустой контейнер вместо скелета.
  if (products === null) return null;

  if (products.length === 0) {
    return (
      <EmptyState
        icon={Refrigerator}
        title="Продуктов пока нет"
        description="Добавьте первый продукт — и он появится в этом списке."
      />
    );
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {products.map((product) => (
        <li
          key={product.id}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{product.name}</p>
            <p className="text-xs text-muted-foreground">{product.category}</p>
          </div>
          <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {product.stock} {product.unit}
          </p>
        </li>
      ))}
    </ul>
  );
}
