"use client";

import {
  AlertCircle,
  AlertTriangle,
  Pencil,
  Plus,
  RefreshCw,
  Refrigerator,
  SearchX,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ALL_CATEGORIES, CategoryFilter } from "@/components/category-filter";
import { EmptyState } from "@/components/empty-state";
import { ProductDialog } from "@/components/product-dialog";
import { StockSearch } from "@/components/stock-search";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDays, formatQuantity } from "@/lib/format";
import { useAutoDeduction } from "@/hooks/use-auto-deduction";
import { NUMBER_ERROR, parseAmount } from "@/lib/product-form";
import { loadProducts, saveProducts } from "@/lib/storage";
import type { Product } from "@/lib/types";

/** Остаток в целых днях; null — расход не задан. */
function daysLeft(product: Product): number | null {
  if (product.dailyRate === null || product.dailyRate <= 0) return null;
  return Math.floor(product.stock / product.dailyRate);
}

type EditorState = { mode: "create" } | { mode: "edit"; product: Product };

function StockEditor({
  product,
  onSave,
}: {
  product: Product;
  onSave: (stock: number) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // При входе в режим правки выделяем всё значение для быстрой замены.
  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (input === null) return;
    input.focus();
    input.select();
  }, [editing]);

  const startEditing = () => {
    setDraft(formatQuantity(product.stock));
    setError(null);
    setEditing(true);
  };

  const revert = () => {
    if (saving) return;
    setEditing(false);
    setError(null);
  };

  const commit = async () => {
    if (saving) return;
    const trimmed = draft.trim();
    const value = trimmed === "" ? null : parseAmount(trimmed);
    if (value === null) {
      setError(trimmed === "" ? "Введите число" : NUMBER_ERROR);
      return;
    }
    if (value === product.stock) {
      // Значение не изменилось — storage не трогаем.
      setEditing(false);
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(value);
      setEditing(false);
    } catch {
      // Запись не прошла: показываем прежний остаток в карточке.
      setEditing(false);
      toast.error("Не удалось сохранить остаток");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className="group inline-flex cursor-pointer items-center gap-1 rounded-sm text-sm font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={`Изменить остаток: ${formatQuantity(product.stock)} ${product.unit}`}
      >
        <span className="underline-offset-2 group-hover:underline group-hover:decoration-dotted">
          {formatQuantity(product.stock)} {product.unit}
        </span>
        {/* Иконка-подсказка только там, где hover-эффектов нет (тач-устройства). */}
        <Pencil
          className="h-3 w-3 shrink-0 text-muted-foreground [@media(hover:hover)]:hidden"
          aria-hidden
        />
      </button>
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          value={draft}
          disabled={saving}
          inputMode="decimal"
          aria-label={`Остаток, ${product.unit}`}
          aria-invalid={error !== null}
          aria-describedby={
            error !== null ? `stock-error-${product.id}` : undefined
          }
          className="h-8 w-20 text-sm font-semibold tabular-nums"
          onChange={(event) => {
            setDraft(event.target.value);
            if (error !== null) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              revert();
            }
          }}
          onBlur={() => {
            if (saving) return;
            const trimmed = draft.trim();
            // Уход с невалидным значением — возвращаем прежний остаток.
            if (trimmed === "" || parseAmount(trimmed) === null) {
              setEditing(false);
              setError(null);
              return;
            }
            void commit();
          }}
        />
        <span className="text-sm text-muted-foreground">{product.unit}</span>
      </div>
      {error !== null && (
        <p
          id={`stock-error-${product.id}`}
          role="alert"
          className="mt-1 text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function StockCard({
  product,
  onEdit,
  onDelete,
  onStockSave,
}: {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (productId: string) => Promise<void>;
  onStockSave: (productId: string, stock: number) => Promise<void>;
}) {
  const days = daysLeft(product);
  const outOfStock = product.stock === 0;
  const runningOut = !outOfStock && days !== null && days < 2;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(product.id);
    } catch {
      toast.error("Не удалось удалить продукт");
    } finally {
      setDeleting(false);
    }
  };

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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{product.name}</p>
          {product.category !== null && (
            <Badge variant="secondary" className="mt-1.5">
              {product.category}
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-muted-foreground hover:text-foreground"
                  aria-label="Редактировать"
                  onClick={() => onEdit(product)}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Редактировать продукт</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-muted-foreground hover:text-destructive"
            aria-label="Удалить"
            disabled={deleting}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <StockEditor
          product={product}
          onSave={(stock) => onStockSave(product.id, stock)}
        />
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          {product.dailyRate !== null && product.dailyRate > 0 && (
            <span className="tabular-nums">
              {formatQuantity(product.dailyRate)} {product.unit}/день
            </span>
          )}
          <Badge
            variant="outline"
            className={`shrink-0 gap-1 border-transparent ${
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
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Удалить продукт «{product.name}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void handleDelete();
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const [editor, setEditor] = useState<EditorState | null>(null);

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

  // Автосписание: при монтировании экрана и возврате на вкладку досчитываем
  // пропущенные дни; результат сразу попадает в список без перезагрузки.
  const { lastDeduction } = useAutoDeduction({
    onProductsApplied: (updated) => setProducts(updated),
  });

  // Баннер эфемерный: закрытие живёт только в состоянии экрана и привязано
  // к моменту прогона — новое автосписание покажет баннер снова.
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const banner =
    lastDeduction !== null &&
    lastDeduction.missedDays > 0 &&
    lastDeduction.at !== dismissedAt
      ? lastDeduction
      : null;

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

  /** Пишет массив целиком в storage и обновляет список. */
  const replaceProducts = async (next: Product[]) => {
    await saveProducts(next);
    setProducts(next);
  };

  // Сохраняет в storage и сразу показывает продукт: фильтры сбрасываем,
  // чтобы новый элемент не спрятал активный поиск или категория.
  const handleCreate = async (product: Product) => {
    await replaceProducts([...(products ?? []), product]);
    resetFilters();
    toast.success("Продукт добавлен");
  };

  const handleUpdate = async (updated: Product) => {
    if (!products) return;
    await replaceProducts(
      products.map((item) =>
        item.id === updated.id
          ? // Модалка редактирует снимок: пока она была открыта, автосписание
            // могло обновить lastAutoDeductAt — берём актуальное значение,
            // чтобы при следующем прогоне дни не списались повторно.
            { ...updated, lastAutoDeductAt: item.lastAutoDeductAt }
          : item
      )
    );
    toast.success("Продукт обновлён");
  };

  const handleDelete = async (productId: string) => {
    if (!products) return;
    await replaceProducts(products.filter((item) => item.id !== productId));
    toast.success("Продукт удалён");
  };

  const handleStockSave = async (productId: string, stock: number) => {
    if (!products) return;
    const now = new Date().toISOString();
    await replaceProducts(
      products.map((item) =>
        item.id === productId ? { ...item, stock, updatedAt: now } : item
      )
    );
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

  return (
    <div className="space-y-3">
      {banner !== null && (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3 duration-200 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </div>
          <p role="status" className="min-w-0 flex-1 text-sm">
            Обновлены остатки за {formatDays(banner.missedDays)}.
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Закрыть"
            onClick={() => setDismissedAt(banner.at)}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}

      <Button
        className="w-full"
        onClick={() => setEditor({ mode: "create" })}
      >
        <Plus className="h-4 w-4" aria-hidden />
        Добавить продукт
      </Button>

      {products.length === 0 ? (
        <EmptyState
          icon={Refrigerator}
          title="Пока нет продуктов"
          description="Добавьте первый продукт."
        />
      ) : (
        <>
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
                <StockCard
                  key={product.id}
                  product={product}
                  onEdit={(item) => setEditor({ mode: "edit", product: item })}
                  onDelete={handleDelete}
                  onStockSave={handleStockSave}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <ProductDialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        mode={editor?.mode ?? "create"}
        product={editor?.mode === "edit" ? editor.product : null}
        categories={categories}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
