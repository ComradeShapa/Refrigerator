"use client";

import { AlertCircle, ListPlus, Plus, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AddFromCatalogDialog } from "@/components/add-from-catalog-dialog";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { daysLeft, formatDays, formatQuantity } from "@/lib/format";
import {
  loadActiveShoppingList,
  loadDraftShoppingList,
  loadProducts,
  loadShoppingItems,
  loadShoppingLists,
  saveShoppingItems,
  saveShoppingLists,
} from "@/lib/storage";
import {
  DEFAULT_HOUSEHOLD_ID,
  SHOPPING_LIST_STATUS_LABELS,
  type Product,
  type ShoppingItem,
  type ShoppingList,
} from "@/lib/types";

// randomUUID есть только в защищённом контексте — нужен запасной вариант.
function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Пункты одного списка в порядке добавления; входной массив не мутируется. */
function itemsOfList(items: ShoppingItem[], listId: string): ShoppingItem[] {
  return items
    .filter((item) => item.listId === listId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function ShoppingSkeleton() {
  return (
    <div className="space-y-2" role="status">
      <span className="sr-only">Загрузка…</span>
      {[0, 1, 2, 3].map((index) => (
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

function ListHeader({ status }: { status: ShoppingList["status"] }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Список покупок</h2>
      <Badge
        variant={status === "active" ? "outline" : "secondary"}
        className={
          status === "active"
            ? "border-transparent bg-amber-500/10 text-amber-700"
            : undefined
        }
      >
        {SHOPPING_LIST_STATUS_LABELS[status]}
      </Badge>
    </div>
  );
}

function ItemCard({
  item,
  product,
}: {
  item: ShoppingItem;
  product: Product | null;
}) {
  // Продукт удалён из каталога: название не восстановить, но пункт показываем.
  const deleted = item.productId !== null && product === null;
  const name =
    item.productId !== null
      ? (product?.name ?? "Продукт удалён")
      : (item.name ?? "Без названия");
  const days = product === null ? null : daysLeft(product);

  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "min-w-0 truncate text-sm",
            deleted ? "italic text-muted-foreground" : "font-medium"
          )}
        >
          {name}
        </p>
        <p className="shrink-0 text-sm font-semibold tabular-nums">
          {formatQuantity(item.plannedQuantity ?? 0)} {item.unit}
        </p>
      </div>
      {/* Остаток и «хватит на» — только у пунктов, связанных с продуктом. */}
      {product !== null && (
        <p className="mt-1 text-xs text-muted-foreground">
          Остаток: {formatQuantity(product.stock)} {product.unit} ·{" "}
          {days === null ? "Хватит на —" : `Хватит на ${formatDays(days)}`}
        </p>
      )}
    </li>
  );
}

export function ShoppingListView() {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [draft, active, allItems, allProducts] = await Promise.all([
          loadDraftShoppingList(),
          loadActiveShoppingList(),
          loadShoppingItems(),
          loadProducts(),
        ]);
        if (!cancelled) {
          // Активный список важнее черновика: пользователь уже в походе.
          setList(active ?? draft);
          setItems(allItems);
          setProducts(allProducts);
          setFailed(false);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const draftItems = useMemo(
    () => (list === null ? [] : itemsOfList(items, list.id)),
    [items, list]
  );

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const existingProductIds = useMemo(
    () =>
      new Set(
        draftItems
          .map((item) => item.productId)
          .filter((id): id is string => id !== null)
      ),
    [draftItems]
  );

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const lists = await loadShoppingLists();
      const now = new Date().toISOString();
      const draft: ShoppingList = {
        id: createId(),
        householdId: DEFAULT_HOUSEHOLD_ID,
        status: "draft",
        createdAt: now,
        completedAt: null,
      };
      await saveShoppingLists([...lists, draft]);
      setList(draft);
    } catch {
      // Запись не прошла: состояние не меняем, можно повторить.
      toast.error("Не удалось создать список");
    } finally {
      setCreating(false);
    }
  };

  const handleAddFromCatalog = async (product: Product) => {
    if (list === null || adding) return;
    if (existingProductIds.has(product.id)) {
      toast(
        "Этот продукт уже в списке. Измените количество в существующем пункте"
      );
      return;
    }
    setAdding(true);
    try {
      // Хранилище пишет массив целиком: читаем свежие пункты и дописываем в конец.
      const allItems = await loadShoppingItems();
      const now = new Date().toISOString();
      const item: ShoppingItem = {
        id: createId(),
        listId: list.id,
        productId: product.id,
        name: null,
        unit: product.unit,
        plannedQuantity: 1,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      const next = [...allItems, item];
      await saveShoppingItems(next);
      setItems(next);
      setAddOpen(false);
      toast.success("Добавлено в список");
    } catch {
      // Запись не прошла: модалка остаётся открытой, данные не менялись.
      toast.error("Не удалось добавить пункт");
    } finally {
      setAdding(false);
    }
  };

  // Режим похода, ручной ввод и правка количества — следующие шаги.
  const notYet = () => toast("Функция появится на следующем шаге");

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
        <p className="mt-3 text-sm font-medium">
          Не удалось загрузить список покупок
        </p>
        <p className="mx-auto mt-1 max-w-[260px] text-sm text-muted-foreground">
          Возможно, браузер запрещает этому сайту сохранять данные.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={retry}>
          Повторить
        </Button>
      </div>
    );
  }

  if (!loaded) return <ShoppingSkeleton />;

  if (list === null) {
    return (
      <div className="space-y-3">
        <EmptyState
          icon={ShoppingCart}
          title="Список покупок пуст"
          description="Создайте список и добавляйте в него продукты перед походом в магазин."
        />
        <Button
          className="h-10 w-full"
          disabled={creating}
          onClick={() => void handleCreate()}
        >
          {creating ? "Создание…" : "Создать список"}
        </Button>
      </div>
    );
  }

  if (list.status === "active") {
    return (
      <div className="space-y-3">
        <ListHeader status={list.status} />
        <Button className="h-10 w-full" onClick={notYet}>
          Продолжить поход
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ListHeader status={list.status} />
      <div className="grid grid-cols-2 gap-2">
        <Button className="h-10" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Добавить пункт
        </Button>
        <Button variant="outline" className="h-10" onClick={notYet}>
          Начать поход
        </Button>
      </div>

      {draftItems.length === 0 ? (
        <>
          <EmptyState
            icon={ListPlus}
            title="Добавьте первый пункт"
            description="Выберите продукты из каталога перед походом в магазин."
          />
          <Button className="h-10 w-full" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Добавить из каталога
          </Button>
        </>
      ) : (
        <ul className="space-y-2">
          {draftItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              product={
                item.productId === null
                  ? null
                  : (productsById.get(item.productId) ?? null)
              }
            />
          ))}
        </ul>
      )}

      {/* Ключ по open: при каждом открытии поиск монтируется с чистым состоянием. */}
      <AddFromCatalogDialog
        key={addOpen ? "open" : "closed"}
        open={addOpen}
        onOpenChange={(open) => {
          if (!open) setAddOpen(false);
        }}
        products={products}
        existingProductIds={existingProductIds}
        saving={adding}
        onSelect={(product) => void handleAddFromCatalog(product)}
      />
    </div>
  );
}
