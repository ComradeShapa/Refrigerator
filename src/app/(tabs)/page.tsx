import { Refrigerator } from "lucide-react";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = {
  title: "Остатки",
};

export default function StockPage() {
  return (
    <>
      <AppHeader title="Остатки" />
      <main className="flex flex-1 flex-col px-4 py-6">
        <EmptyState
          icon={Refrigerator}
          title="Продуктов пока нет"
          description="Добавьте первый продукт — и он появится в этом списке."
        />
      </main>
    </>
  );
}
