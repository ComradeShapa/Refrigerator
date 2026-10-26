import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { ProductStockList } from "@/components/product-stock-list";

export const metadata: Metadata = {
  title: "Остатки",
};

export default function StockPage() {
  return (
    <>
      <AppHeader title="Остатки" />
      <main className="flex flex-1 flex-col px-4 py-6">
        <ProductStockList />
      </main>
    </>
  );
}
