import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { ShoppingListView } from "@/components/shopping-list-view";

export const metadata: Metadata = {
  title: "Покупки",
};

export default function ShoppingPage() {
  return (
    <>
      <AppHeader title="Покупки" />
      <main className="flex flex-1 flex-col px-4 py-6">
        <ShoppingListView />
      </main>
    </>
  );
}
