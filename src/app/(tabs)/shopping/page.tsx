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
      {/* На этом экране свой нижний отступ под sticky-кнопку и safe area. */}
      <main className="-mb-24 flex flex-1 flex-col px-4 pb-[calc(3.75rem+env(safe-area-inset-bottom))] pt-6">
        <ShoppingListView />
      </main>
    </>
  );
}
