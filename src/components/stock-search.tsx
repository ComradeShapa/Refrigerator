"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type StockSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export function StockSearch({ value, onChange }: StockSearchProps) {
  return (
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pl-9"
      />
    </div>
  );
}
