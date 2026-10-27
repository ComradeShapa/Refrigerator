"use client";

import { AlertCircle, AlertTriangle, Refrigerator, SearchX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AddProductDialog } from "@/components/add-product-dialog";
import { ALL_CATEGORIES, CategoryFilter } from "@/components/category-filter";
import { EmptyState } from "@/components/empty-state";
import { StockSearch } from "@/components/stock-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDays, formatQuantity } from "@/lib/format";
import { loadProducts, saveProducts } from "@/lib/storage";
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
    <li className="relative overflow-hidden rounded-xl border bg-card p-4">
      {outOfStock || runningOut ? (
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-1 ${
            outOfStock ? "bg-destructive" : "bg-amber-500"
          }`}
        />
      ) : null}
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
        <Badge
          variant="outline"
          className={`ml-auto shrink-0 gap-1 border-transparent ${
            outOfStock
              ? "bg-destructive/10 text-destructive"
              : runningOut
                ? "bg-amber-500/10 text-amber-700"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {(outOfStock || runningOut) && (
            <AlertTriangle className="h-3 w-3" aria-hidden />
          )}
          <span className="tabular-nums">
            {days === null ? "Хватит на —" : `Хватит на ${formatDays(days)}`}
          </span>
        </Badge>
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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);

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

  // Уникальные непустые категории в алфавитном порядке.
  const categories = useMemo(() => {
    if (products === null) return [];
    const unique = new Set<string>();
    for (const product of products) {
      if (product.category !== null) unique.add(product.category);
    }
    return [...unique].sort((a, b) => a.localeCompare(b, "ru"));
  }, [products]);

  // Сначала фильтр по категории, затем поиск по названию (регистр и края — игнор).
  const filtered = useMemo(() => {
    if (products === null) return [];
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (category !== ALL_CATEGORIES && product.category !== category) {
        return false;
      }
      if (needle !== "" && !product.name.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [products, query, category]);

  const filtersActive = query.trim() !== "" || category !== ALL_CATEGORIES;

  const resetFilters = () => {
    setQuery("");
    setCategory(ALL_CATEGORIES);
  };

  // Сохраняет в storage и сразу показывает продукт: фильтры сбрасываем,
  // чтобы новый элемент не спрятал активный поиск или категория.
  const handleCreate = async (product: Product) => {
    const next = [...(products ?? []), product];
    await saveProducts(next);
    setProducts(next);
    resetFilters();
    toast.success("Продукт добавлен");
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
      <div className="space-y-3">
        <AddProductDialog categories={categories} onCreate={handleCreate} />
        <EmptyState
          icon={Refrigerator}
          title="Пока нет продуктов"
          description="Добавьте первый продукт."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AddProductDialog categories={categories} onCreate={handleCreate} />
      <StockSearch value={query} onChange={setQuery} />
      {categories.length > 0 && (
        <CategoryFilter
          categories={categories}
          value={category}
          onChange={setCategory}
        />
      )}
      {filtersActive && (
        <p className="text-xs text-muted-foreground" role="status">
          Найдено: {filtered.length}
        </p>
      )}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <SearchX className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </div>
          <p className="font-medium">Ничего не найдено</p>
          <p className="max-w-[260px] text-sm text-muted-foreground">
            Попробуйте изменить поиск или фильтр.
          </p>
          <Button variant="outline" size="sm" onClick={resetFilters}>
            Сбросить фильтры
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((product) => (
            <StockCard key={product.id} product={product} />
          ))}
        </ul>
      )}
    </div>
  );
}
