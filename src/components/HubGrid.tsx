"use client";

import { useMemo, useState } from "react";
import type { Service, CategoryId } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";
import { ServiceCard } from "./ServiceCard";
import { CategoryFilter, type CategorySelection } from "./CategoryFilter";
import { SearchBar } from "./SearchBar";

export function HubGrid({ services }: { services: Service[] }) {
  const [category, setCategory] = useState<CategorySelection>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const base: Partial<Record<CategoryId, number>> & { all: number } = {
      all: services.length,
    };
    for (const c of CATEGORIES) {
      base[c.id] = services.filter((s) => s.category === c.id).length;
    }
    return base;
  }, [services]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((s) => {
      if (category !== "all" && s.category !== category) return false;
      if (!q) return true;
      const haystack = [
        s.resolvedTitle,
        s.resolvedDescription,
        s.repo,
        s.language ?? "",
        ...(s.topics ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [services, category, query]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="md:max-w-sm md:flex-1">
          <SearchBar value={query} onChange={setQuery} />
        </div>
        <CategoryFilter active={category} counts={counts} onChange={setCategory} />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center text-sm text-[var(--muted)]">
          조건에 맞는 서비스가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <ServiceCard key={s.repo} service={s} />
          ))}
        </div>
      )}
    </div>
  );
}
