"use client";

import { CATEGORIES, type CategoryId } from "@/lib/types";

export type CategorySelection = CategoryId | "all";

export function CategoryFilter({
  active,
  counts,
  onChange,
}: {
  active: CategorySelection;
  counts: Partial<Record<CategoryId, number>> & { all: number };
  onChange: (next: CategorySelection) => void;
}) {
  const items: { id: CategorySelection; label: string }[] = [
    { id: "all", label: "All" },
    ...CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const count = item.id === "all" ? counts.all : counts[item.id] ?? 0;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              isActive
                ? "border-[var(--accent)]/60 bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--muted)] hover:border-white/20 hover:text-foreground"
            }`}
          >
            {item.label}
            <span className="ml-1.5 opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
