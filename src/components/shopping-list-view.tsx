"use client";

import { AlertCircle, ListPlus, Plus, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  loadActiveShoppingList,
  loadDraftShoppingList,
  loadShoppingLists,
  saveShoppingLists,
} from "@/lib/storage";
import {
  DEFAULT_HOUSEHOLD_ID,
  SHOPPING_LIST_STATUS_LABELS,
  type ShoppingList,
} from "@/lib/types";

// randomUUID есть только в защищённом контексте — нужен запасной вариант.
function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

export function ShoppingListView() {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [draft, active] = await Promise.all([
          loadDraftShoppingList(),
          loadActiveShoppingList(),
        ]);
        if (!cancelled) {
          // Активный список важнее черновика: пользователь уже в походе.
          setList(active ?? draft);
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

  // Добавление пунктов и режим похода — следующие шаги.
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
          className="w-full"
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
        <Button className="w-full" onClick={notYet}>
          Продолжить поход
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ListHeader status={list.status} />
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={notYet}>
          <Plus className="h-4 w-4" aria-hidden />
          Добавить пункт
        </Button>
        <Button variant="outline" onClick={notYet}>
          Начать поход
        </Button>
      </div>
      <EmptyState
        icon={ListPlus}
        title="Добавьте первый пункт"
        description="Пункты появятся на следующем шаге."
      />
    </div>
  );
}
