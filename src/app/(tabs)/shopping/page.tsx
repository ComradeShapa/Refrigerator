import { ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = {
  title: "Покупки",
};

export default function ShoppingPage() {
  return (
    <>
      <AppHeader title="Покупки" />
      <main className="flex flex-1 flex-col px-4 py-6">
        <EmptyState
          icon={ShoppingCart}
          title="Список покупок пуст"
          description="Добавляйте продукты в список, чтобы ничего не забыть в магазине."
        />
      </main>
    </>
  );
}
