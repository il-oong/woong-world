"use client";

import { CATEGORIES, CATEGORY_BY_ID, type CategoryId } from "@/lib/types";

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
  const items: { id: CategorySelection; label: string; color?: string }[] = [
    { id: "all", label: "All" },
    ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, color: c.color })),
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const count = item.id === "all" ? counts.all : counts[item.id] ?? 0;
        const isActive = active === item.id;
        const color =
          item.id === "all" ? undefined : CATEGORY_BY_ID[item.id].color;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className="rounded-full border px-3 py-1 text-xs transition"
            style={{
              borderColor: isActive
                ? color
                  ? `${color}99`
                  : "rgba(255,255,255,0.4)"
                : "var(--border)",
              background: isActive && color ? `${color}1a` : "transparent",
              color: isActive
                ? color ?? "var(--foreground)"
                : "var(--muted)",
            }}
          >
            {item.label}
            <span className="ml-1.5 opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
