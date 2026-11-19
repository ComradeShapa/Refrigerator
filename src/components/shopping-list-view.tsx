"use client";

import {
  AlertCircle,
  ListPlus,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AddFromCatalogDialog } from "@/components/add-from-catalog-dialog";
import { AddItemSourceDialog } from "@/components/add-item-source-dialog";
import { AddManualItemDialog } from "@/components/add-manual-item-dialog";
import { ActiveShoppingItem } from "@/components/active-shopping-item";
import {
  changeActiveItem,
  shoppingProgress,
  ShoppingActiveError,
  type ActiveChange,
} from "@/lib/shopping-active";
import { EmptyState } from "@/components/empty-state";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { daysLeft, formatDays, formatQuantity } from "@/lib/format";
import { formatShoppingQuantity } from "@/lib/shopping-format";
import { parseAmount } from "@/lib/product-form";
import {
  changeDraftQuantity,
  DRAFT_ERROR_MESSAGES,
  removeDraftItem,
  ShoppingDraftError,
  startShoppingTrip,
} from "@/lib/shopping-draft";
import {
  addManualShoppingItem,
  type ManualItemInput,
} from "@/lib/shopping-items";
import {
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

function QuantityEditor({
  item,
  saving,
  onSave,
  onCancel,
}: {
  item: ShoppingItem;
  saving: boolean;
  onSave: (quantity: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(String(item.plannedQuantity ?? ""));
  const [error, setError] = useState(false);
  const inputId = `shopping-quantity-${item.id}`;

  return (
    <form
      className="mt-3 space-y-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        const quantity = parseAmount(value);
        if (quantity === null || quantity <= 0) {
          setError(true);
          return;
        }
        onSave(quantity);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !saving) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <Label htmlFor={inputId}>Количество</Label>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          autoFocus
          inputMode="decimal"
          type="text"
          className="min-w-0 flex-1"
          value={value}
          disabled={saving}
          onChange={(event) => {
            setValue(event.target.value);
            setError(false);
          }}
          aria-invalid={error}
          aria-describedby={error ? `${inputId}-error` : undefined}
        />
        <span className="shrink-0 text-sm">{item.unit}</span>
      </div>
      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="text-xs text-destructive"
        >
          Введите число больше 0
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-10" disabled={saving}>
          {saving ? "Сохранение…" : "Сохранить"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10"
          disabled={saving}
          onClick={onCancel}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}

function ItemCard({
  item,
  product,
  actions,
  editButtonRef,
}: {
  item: ShoppingItem;
  product: Product | null;
  editButtonRef?: (element: HTMLButtonElement | null) => void;
  actions?: {
    disabled: boolean;
    editing: boolean;
    saving: boolean;
    onEdit: () => void;
    onDelete: (button: HTMLButtonElement) => void;
    onSave: (quantity: number) => void;
    onCancel: () => void;
  };
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
          {formatShoppingQuantity(item.plannedQuantity ?? 0)} {item.unit}
        </p>
      </div>
      {/* Остаток и «хватит на» — только у пунктов, связанных с продуктом. */}
      {product !== null && (
        <p className="mt-1 text-xs text-muted-foreground">
          Остаток: {formatQuantity(product.stock)} {product.unit} ·{" "}
          {days === null ? "Хватит на —" : `Хватит на ${formatDays(days)}`}
        </p>
      )}
      {actions &&
        (actions.editing ? (
          <QuantityEditor
            item={item}
            saving={actions.saving}
            onSave={actions.onSave}
            onCancel={actions.onCancel}
          />
        ) : (
          <div className="mt-2 flex justify-end gap-1">
            <Button
              ref={editButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              aria-label={`Изменить количество: ${name}`}
              disabled={actions.disabled}
              onClick={actions.onEdit}
            >
              <Pencil aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-destructive"
              aria-label={`Удалить пункт: ${name}`}
              disabled={actions.disabled}
              onClick={(event) => actions.onDelete(event.currentTarget)}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ))}
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
  const [addDialog, setAddDialog] = useState<
    "source" | "catalog" | "manual" | null
  >(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [mutation, setMutation] = useState<
    "quantity" | "delete" | "start" | "active" | null
  >(null);
  const savingRef = useRef(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const deleteReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const actionsDisabled =
    adding ||
    mutation !== null ||
    editingId !== null ||
    deleteItemId !== null ||
    addDialog !== null;

  const focusList = () => (addButtonRef.current ?? viewRef.current)?.focus();

  const closeEditor = (itemId: string) => {
    if (savingRef.current) return;
    setEditingId(null);
    requestAnimationFrame(() =>
      (editButtonRefs.current.get(itemId) ?? addButtonRef.current)?.focus()
    );
  };

  const closeAddDialog = () => {
    if (savingRef.current) return;
    setAddDialog(null);
    requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [allLists, allItems, allProducts] = await Promise.all([
          loadShoppingLists(),
          loadShoppingItems(),
          loadProducts(),
        ]);
        if (!cancelled) {
          const householdLists = allLists.filter(
            (entry) => entry.householdId === DEFAULT_HOUSEHOLD_ID
          );
          const active = householdLists.find(
            (entry) => entry.status === "active"
          );
          const draft = householdLists
            .filter((entry) => entry.status === "draft")
            .sort(
              (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
            )[0];
          // Активный список важнее черновика: пользователь уже в походе.
          setList(active ?? draft ?? null);
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
  const progress = shoppingProgress(draftItems);

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
    if (list?.status !== "draft" || savingRef.current) return;
    if (existingProductIds.has(product.id)) {
      toast(
        "Этот продукт уже в списке. Измените количество в существующем пункте"
      );
      return;
    }
    savingRef.current = true;
    setAdding(true);
    try {
      // Хранилище пишет массив целиком: читаем свежие пункты и дописываем в конец.
      const allItems = await loadShoppingItems();
      if (
        allItems.some(
          (item) => item.listId === list.id && item.productId === product.id
        )
      ) {
        setItems(allItems);
        toast("Этот продукт уже в списке");
        return;
      }
      const now = new Date().toISOString();
      const item: ShoppingItem = {
        id: createId(),
        listId: list.id,
        productId: product.id,
        name: null,
        unit: product.unit,
        plannedQuantity: 1,
        actualQuantity: null,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      const next = [...allItems, item];
      await saveShoppingItems(next);
      setItems(next);
      setAddDialog(null);
      requestAnimationFrame(() => addButtonRef.current?.focus());
      toast.success("Добавлено в список");
    } catch {
      // Запись не прошла: модалка остаётся открытой, данные не менялись.
      toast.error("Не удалось добавить пункт");
    } finally {
      savingRef.current = false;
      setAdding(false);
    }
  };

  const handleAddManual = async (input: ManualItemInput) => {
    if (list?.status !== "draft" || savingRef.current) return;
    savingRef.current = true;
    setAdding(true);
    try {
      const allItems = await loadShoppingItems();
      // Только уже сохранённые данные: актуализируем проверку дублей в форме.
      setItems(allItems);
      const next = addManualShoppingItem(
        allItems,
        list.id,
        input,
        createId(),
        new Date().toISOString()
      );
      await saveShoppingItems(next);
      setItems(next);
      setAddDialog(null);
      requestAnimationFrame(() => addButtonRef.current?.focus());
      toast.success(
        input.increaseItem ? "Количество увеличено" : "Добавлено в список"
      );
    } catch (error) {
      console.error("Не удалось сохранить ручной пункт списка покупок", error);
      toast.error("Не удалось сохранить пункт. Попробуйте ещё раз");
    } finally {
      savingRef.current = false;
      setAdding(false);
    }
  };

  const mutateDraft = async (
    operation:
      | { type: "quantity"; itemId: string; quantity: number }
      | { type: "delete"; itemId: string }
      | { type: "start" }
  ) => {
    if (list?.status !== "draft" || savingRef.current || addDialog !== null)
      return;
    if (
      operation.type === "start" &&
      (editingId !== null || deleteItemId !== null)
    )
      return;
    savingRef.current = true;
    setMutation(operation.type);
    let snapshot: { lists: ShoppingList[]; items: ShoppingItem[] } | null =
      null;
    try {
      const [lists, allItems] = await Promise.all([
        loadShoppingLists(),
        loadShoppingItems(),
      ]);
      snapshot = { lists, items: allItems };
      if (operation.type === "start") {
        const next = startShoppingTrip(lists, allItems, list);
        await saveShoppingLists(next);
        setList(next.find((entry) => entry.id === list.id) ?? null);
        setItems(allItems);
        toast.success("Поход начат");
        requestAnimationFrame(() => viewRef.current?.focus());
      } else {
        const next =
          operation.type === "quantity"
            ? changeDraftQuantity(
                lists,
                allItems,
                list,
                operation.itemId,
                operation.quantity,
                new Date().toISOString()
              )
            : removeDraftItem(lists, allItems, list, operation.itemId);
        if (next !== allItems) await saveShoppingItems(next);
        setItems(next);
        if (operation.type === "quantity") {
          setEditingId(null);
          requestAnimationFrame(() =>
            (
              editButtonRefs.current.get(operation.itemId) ??
              addButtonRef.current
            )?.focus()
          );
          toast.success("Количество сохранено");
        } else {
          setDeleteItemId(null);
          toast.success("Пункт удалён");
        }
      }
    } catch (error) {
      if (error instanceof ShoppingDraftError && snapshot) {
        // Устаревшие данные не записываем: показываем актуальный активный список
        // либо доступный черновик текущего домохозяйства.
        const householdLists = snapshot.lists.filter(
          (entry) => entry.householdId === list.householdId
        );
        const draft =
          householdLists.find(
            (entry) => entry.id === list.id && entry.status === "draft"
          ) ??
          householdLists
            .filter((entry) => entry.status === "draft")
            .sort(
              (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
            )[0];
        setList(
          householdLists.find((entry) => entry.status === "active") ??
            draft ??
            null
        );
        setItems(snapshot.items);
        setEditingId(null);
        setDeleteItemId(null);
        toast.error(DRAFT_ERROR_MESSAGES[error.code]);
        requestAnimationFrame(focusList);
      } else {
        console.error("Не удалось изменить список покупок", error);
        toast.error(
          operation.type === "start"
            ? "Не удалось начать поход. Попробуйте ещё раз"
            : operation.type === "delete"
              ? "Не удалось удалить пункт. Попробуйте ещё раз"
              : "Не удалось сохранить количество. Попробуйте ещё раз"
        );
      }
    } finally {
      savingRef.current = false;
      setMutation(null);
    }
  };

  const mutateActive = async (
    expected: ShoppingItem,
    change: ActiveChange
  ): Promise<boolean> => {
    if (list?.status !== "active" || savingRef.current) return false;
    savingRef.current = true;
    setMutation("active");
    try {
      const [lists, allItems] = await Promise.all([
        loadShoppingLists(),
        loadShoppingItems(),
      ]);
      let next: ShoppingItem[];
      try {
        next = changeActiveItem(
          lists,
          allItems,
          list,
          expected,
          change,
          new Date().toISOString()
        );
      } catch (error) {
        if (error instanceof ShoppingActiveError) {
          setItems(allItems);
          const householdLists = lists.filter(
            (entry) => entry.householdId === list.householdId
          );
          setList(
            householdLists.find((entry) => entry.status === "active") ??
              householdLists
                .filter((entry) => entry.status === "draft")
                .sort(
                  (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
                )[0] ??
              null
          );
          setEditingId(null);
          requestAnimationFrame(focusList);
        }
        throw error;
      }
      await saveShoppingItems(next);
      setItems(next);
      toast.success("Изменения сохранены");
      return true;
    } catch (error) {
      toast.error(
        error instanceof ShoppingActiveError
          ? error.message
          : "Не удалось сохранить пункт. Попробуйте ещё раз"
      );
      return false;
    } finally {
      savingRef.current = false;
      setMutation(null);
    }
  };

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
          ref={addButtonRef}
          className="h-10 w-full"
          disabled={creating}
          onClick={() => void handleCreate()}
        >
          {creating ? "Создание…" : "Создать список"}
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={viewRef}
      tabIndex={-1}
      className="flex flex-1 flex-col gap-3 outline-none"
    >
      <ListHeader status={list.status} />
      {list.status === "active" && (
        <div role="status" className="text-sm text-muted-foreground">
          Обработано {progress.processed} из {progress.total}
          {progress.total > 0 && progress.processed === progress.total && (
            <p>Все пункты обработаны</p>
          )}
        </div>
      )}
      {list.status === "draft" && draftItems.length > 0 && (
        <Button
          variant="outline"
          className="h-10 w-full"
          disabled={actionsDisabled}
          onClick={() => void mutateDraft({ type: "start" })}
        >
          {mutation === "start" ? "Начинаем поход…" : "Начать поход"}
        </Button>
      )}

      {draftItems.length === 0 && list.status === "draft" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6">
          <EmptyState
            icon={ListPlus}
            title="Добавьте первый пункт"
            description="Выберите продукты из каталога или добавьте пункт вручную."
          />
          <Button
            ref={addButtonRef}
            className="h-10"
            disabled={actionsDisabled}
            onClick={() => setAddDialog("source")}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Добавить пункт
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {draftItems.map((item) =>
            list.status === "active" ? (
              <ActiveShoppingItem
                key={item.id}
                item={item}
                name={
                  item.productId === null
                    ? (item.name ?? "Без названия")
                    : (productsById.get(item.productId)?.name ??
                      "Продукт удалён")
                }
                disabled={actionsDisabled}
                editing={editingId === item.id}
                saving={mutation !== null}
                onEdit={() => {
                  if (!savingRef.current && !actionsDisabled)
                    setEditingId(item.id);
                }}
                onCancel={() => {
                  if (!savingRef.current) setEditingId(null);
                }}
                onChange={(change) => mutateActive(item, change)}
              />
            ) : (
              <ItemCard
                key={item.id}
                item={item}
                product={
                  item.productId === null
                    ? null
                    : (productsById.get(item.productId) ?? null)
                }
                editButtonRef={(element) => {
                  if (element) editButtonRefs.current.set(item.id, element);
                  else editButtonRefs.current.delete(item.id);
                }}
                actions={
                  list.status === "draft"
                    ? {
                        disabled: actionsDisabled,
                        editing: editingId === item.id,
                        saving: mutation !== null,
                        onEdit: () => {
                          if (!savingRef.current && !actionsDisabled)
                            setEditingId(item.id);
                        },
                        onDelete: (button) => {
                          if (savingRef.current || actionsDisabled) return;
                          deleteReturnFocusRef.current = button;
                          setDeleteItemId(item.id);
                        },
                        onSave: (quantity) =>
                          void mutateDraft({
                            type: "quantity",
                            itemId: item.id,
                            quantity,
                          }),
                        onCancel: () => closeEditor(item.id),
                      }
                    : undefined
                }
              />
            )
          )}
        </ul>
      )}

      {list.status === "draft" && draftItems.length > 0 && (
        <div
          className={cn(
            "z-30 mt-auto border-t bg-background py-3",
            // Во время редактирования кнопка заблокирована и не перекрывает поля.
            editingId === null &&
              "sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))]"
          )}
        >
          <Button
            ref={addButtonRef}
            className="h-10 w-full"
            disabled={actionsDisabled}
            onClick={() => setAddDialog("source")}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Добавить пункт
          </Button>
        </div>
      )}

      <AlertDialog
        open={deleteItemId !== null}
        onOpenChange={(open) => {
          if (!open && !savingRef.current) setDeleteItemId(null);
        }}
      >
        <AlertDialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const button = deleteReturnFocusRef.current;
            if (button?.isConnected && !button.disabled) button.focus();
            else focusList();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить пункт?</AlertDialogTitle>
            <AlertDialogDescription>
              Пункт будет удалён из списка покупок
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation !== null}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation !== null}
              onClick={(event) => {
                event.preventDefault();
                if (deleteItemId !== null)
                  void mutateDraft({ type: "delete", itemId: deleteItemId });
              }}
            >
              {mutation === "delete" ? "Удаление…" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Одновременно смонтирован только один основной диалог. */}
      {addDialog === "source" && (
        <AddItemSourceDialog
          open
          onOpenChange={(open) => {
            if (!open) closeAddDialog();
          }}
          onPickCatalog={() => setAddDialog("catalog")}
          onPickManual={() => setAddDialog("manual")}
        />
      )}
      {addDialog === "catalog" && (
        <AddFromCatalogDialog
          open
          onOpenChange={(open) => {
            if (!open) closeAddDialog();
          }}
          products={products}
          existingProductIds={existingProductIds}
          saving={adding}
          onSelect={(product) => void handleAddFromCatalog(product)}
        />
      )}
      {addDialog === "manual" && (
        <AddManualItemDialog
          open
          onOpenChange={(open) => {
            if (!open) closeAddDialog();
          }}
          manualItems={draftItems.filter((item) => item.productId === null)}
          saving={adding}
          onSubmit={(input) => void handleAddManual(input)}
        />
      )}
    </div>
  );
}
