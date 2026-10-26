import type { ReactNode } from "react";
import { BottomNav } from "@/components/bottom-nav";

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <div className="flex flex-1 flex-col pb-24">{children}</div>
      <BottomNav />
    </div>
  );
}
