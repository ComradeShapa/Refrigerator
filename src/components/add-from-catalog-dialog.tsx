"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { daysLeft, formatDays, formatQuantity } from "@/lib/format";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALREADY_IN_LIST_HINT =
  "Этот продукт уже в списке. Измените количество в существующем пункте";

type AddFromCatalogDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  /** productId пунктов, уже лежащих в текущем списке. */
  existingProductIds: ReadonlySet<string>;
  /** Идёт запись в storage: выбор блокируется, чтобы не создать дубли. */
  saving: boolean;
  onSelect: (product: Product) => void;
};

function CatalogRow({
  product,
  inList,
  saving,
  onSelect,
}: {
  product: Product;
  inList: boolean;
  saving: boolean;
  onSelect: (product: Product) => void;
}) {
  const days = daysLeft(product);
  return (
    <li>
      <button
        type="button"
        disabled={saving}
        aria-disabled={inList || undefined}
        onClick={() => {
          if (inList) {
            toast(ALREADY_IN_LIST_HINT);
            return;
          }
          onSelect(product);
        }}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          inList ? "cursor-not-allowed opacity-60" : "enabled:hover:bg-accent/60"
        )}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {product.name}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {product.unit}
          </span>
        </span>
        {inList ? (
          <Badge variant="secondary" className="shrink-0">
            Уже в списке
          </Badge>
        ) : (
          <span className="shrink-0 text-right text-xs leading-4 text-muted-foreground">
            <span className="block tabular-nums">
              Остаток: {formatQuantity(product.stock)} {product.unit}
            </span>
            <span className="block tabular-nums">
              {days === null ? "Хватит на —" : `Хватит на ${formatDays(days)}`}
            </span>
          </span>
        )}
      </button>
    </li>
  );
}

export function AddFromCatalogDialog({
  open,
  onOpenChange,
  products,
  existingProductIds,
  saving,
  onSelect,
}: AddFromCatalogDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  // Регистр и пробелы по краям игнорируем — как поиск на экране «Остатки».
  const needle = query.trim().toLowerCase();
  const found = useMemo(
    () =>
      needle === ""
        ? products
        : products.filter((product) =>
            product.name.toLowerCase().includes(needle)
          ),
    [products, needle]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить из каталога</DialogTitle>
          <DialogDescription>
            Нажмите на продукт — он попадёт в список с количеством 1.
          </DialogDescription>
        </DialogHeader>

        {products.length === 0 ? (
          <div className="py-6 text-center" role="status">
            <p className="mx-auto max-w-[280px] text-sm text-muted-foreground">
              На странице "Остатки" пока нет продуктов. Добавьте их, чтобы
              выбирать из каталога
            </p>
            <Button
              className="mt-4 h-10 w-full"
              onClick={() => router.push("/")}
            >
              Перейти к Остаткам
            </Button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                role="searchbox"
                aria-label="Поиск по названию"
                placeholder="Поиск по названию"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
              />
            </div>

            {found.length === 0 ? (
              <div className="py-6 text-center" role="status">
                <p className="text-sm text-muted-foreground">
                  Ничего не найдено
                </p>
                <Button
                  variant="outline"
                  className="mt-4 h-10 w-full"
                  onClick={() => setQuery("")}
                >
                  Сбросить поиск
                </Button>
              </div>
            ) : (
              <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {found.map((product) => (
                  <CatalogRow
                    key={product.id}
                    product={product}
                    inList={existingProductIds.has(product.id)}
                    saving={saving}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            )}
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            className="h-10 w-full"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Отмена
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
