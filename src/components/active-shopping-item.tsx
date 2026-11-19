"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  initialActualQuantity,
  type ActiveChange,
} from "@/lib/shopping-active";
import { parseAmount } from "@/lib/product-form";
import { formatShoppingQuantity } from "@/lib/shopping-format";
import { SHOPPING_ITEM_STATUS_LABELS, type ShoppingItem } from "@/lib/types";

export function ActiveShoppingItem({
  item,
  name,
  disabled,
  editing,
  saving,
  onEdit,
  onCancel,
  onChange,
}: {
  item: ShoppingItem;
  name: string;
  disabled: boolean;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onChange: (change: ActiveChange) => Promise<boolean>;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const handledFocusRequest = useRef(0);

  // Ждём commit React: действие должно уже существовать и быть доступным.
  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (
      focusRequest !== handledFocusRequest.current &&
      !editing &&
      !disabled &&
      !saving &&
      button?.isConnected &&
      !button.disabled
    ) {
      button.focus();
      handledFocusRequest.current = focusRequest;
    }
  }, [focusRequest, editing, disabled, saving]);

  const focusAction = () => setFocusRequest((request) => request + 1);
  const close = () => {
    onCancel();
    focusAction();
  };
  const changeStatus = async (status: "pending" | "unavailable") => {
    if (await onChange({ status })) focusAction();
  };
  const inputId = `actual-${item.id}`;
  return (
    <li className="rounded-xl border bg-card p-4">
      <p className="break-words text-sm font-medium">{name}</p>
      <p className="mt-1 break-words text-sm text-muted-foreground">
        План:{" "}
        {item.plannedQuantity !== null &&
        Number.isFinite(item.plannedQuantity) &&
        item.plannedQuantity > 0
          ? formatShoppingQuantity(item.plannedQuantity)
          : "—"}{" "}
        {item.unit}
      </p>
      <p
        className={`mt-2 text-sm font-semibold ${item.status === "bought" ? "text-green-700 dark:text-green-400" : item.status === "unavailable" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
      >
        {SHOPPING_ITEM_STATUS_LABELS[item.status]}
      </p>
      {item.status === "bought" && (
        <p className="break-words text-sm">
          Фактически куплено: {formatShoppingQuantity(item.actualQuantity!)}{" "}
          {item.unit}
        </p>
      )}
      {editing ? (
        <form
          className="mt-3 space-y-2"
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (saving) return;
            const quantity = parseAmount(value);
            if (quantity === null || quantity <= 0) {
              setError(true);
              return;
            }
            if (await onChange({ status: "bought", quantity })) close();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !saving) {
              event.preventDefault();
              close();
            }
          }}
        >
          <Label htmlFor={inputId}>Фактически куплено ({item.unit})</Label>
          <Input
            id={inputId}
            autoFocus
            inputMode="decimal"
            value={value}
            disabled={saving}
            aria-invalid={error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            onChange={(event) => {
              setValue(event.target.value);
              setError(false);
            }}
          />
          {error && (
            <p
              id={`${inputId}-error`}
              role="alert"
              className="text-sm text-destructive"
            >
              Введите число больше 0
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={close}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Сохранение…" : "Подтвердить"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            ref={buttonRef}
            variant="outline"
            disabled={disabled}
            aria-label={`${item.status === "bought" ? "Изменить фактическое количество" : "Куплено"}: ${name}`}
            onClick={() => {
              setValue(initialActualQuantity(item));
              setError(false);
              onEdit();
            }}
          >
            {item.status === "bought" ? "Изменить количество" : "Куплено"}
          </Button>
          {item.status !== "unavailable" && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => void changeStatus("unavailable")}
            >
              Нет в магазине
            </Button>
          )}
          {item.status !== "pending" && (
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => void changeStatus("pending")}
            >
              Вернуть в «Ожидает»
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
