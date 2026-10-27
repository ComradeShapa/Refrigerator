"use client";

import { AlertCircle, Refrigerator } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDays, formatQuantity } from "@/lib/format";
import { loadProducts } from "@/lib/storage";
import type { Product } from "@/lib/types";

/** Остаток в целых днях; null — расход не задан. */
function daysLeft(product: Product): number | null {
  if (product.dailyRate === null || product.dailyRate <= 0) return null;
  return Math.floor(product.stock / product.dailyRate);
}

function StockCard({ product }: { product: Product }) {
  const days = daysLeft(product);
  const outOfStock = product.stock === 0;
  const runningOut = !outOfStock && days !== null && days < 2;

  return (
    <li
      className={`rounded-xl border bg-card p-4 ${
        outOfStock
          ? "border-destructive/30 bg-destructive/5"
          : runningOut
            ? "border-amber-500/40 bg-amber-500/5"
            : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{product.name}</p>
          {product.category !== null && (
            <Badge variant="secondary" className="mt-1.5">
              {product.category}
            </Badge>
          )}
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums">
          {formatQuantity(product.stock)} {product.unit}
        </p>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        {product.dailyRate !== null && product.dailyRate > 0 && (
          <span className="tabular-nums">
            {formatQuantity(product.dailyRate)} {product.unit}/день
          </span>
        )}
        <span className="ml-auto shrink-0 tabular-nums">
          {days === null ? "Хватит на —" : `Хватит на ${formatDays(days)}`}
        </span>
      </div>
    </li>
  );
}

function StockSkeleton() {
  return (
    <div className="space-y-2" role="status">
      <span className="sr-only">Загрузка…</span>
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="rounded-xl border bg-card p-4" aria-hidden>
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="mt-3 h-3 w-44" />
        </div>
      ))}
    </div>
  );
}

export function ProductStockList() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await loadProducts();
        if (!cancelled) {
          setProducts(items);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setFailed(false);
    setAttempt((value) => value + 1);
  };

  if (failed) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
      >
        <AlertCircle
          className="mx-auto h-7 w-7 text-destructive"
          strokeWidth={1.75}
          aria-hidden
        />
        <p className="mt-3 text-sm font-medium">Не удалось загрузить продукты</p>
        <p className="mx-auto mt-1 max-w-[260px] text-sm text-muted-foreground">
          Возможно, браузер запрещает этому сайту сохранять данные.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={retry}>
          Повторить
        </Button>
      </div>
    );
  }

  if (products === null) return <StockSkeleton />;

  if (products.length === 0) {
    return (
      <EmptyState
        icon={Refrigerator}
        title="Пока нет продуктов"
        description="Добавьте первый продукт."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {products.map((product) => (
        <StockCard key={product.id} product={product} />
      ))}
    </ul>
  );
}
