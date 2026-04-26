"use client";

import { useEffect, useMemo, useState } from "react";
import type { Service, CategoryId } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";
import { useFavorites } from "@/lib/favorites";
import { ServiceCard } from "./ServiceCard";
import { CategoryFilter, type CategorySelection } from "./CategoryFilter";
import { SearchBar } from "./SearchBar";
import { CommandPalette } from "./CommandPalette";
import { PreviewModal } from "./PreviewModal";

type Mode = "curated" | "all";

export function HubGrid({ services: initialServices }: { services: Service[] }) {
  const [mode, setMode] = useState<Mode>("curated");
  const [discovered, setDiscovered] = useState<Service[] | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const [category, setCategory] = useState<CategorySelection>("all");
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [preview, setPreview] = useState<Service | null>(null);

  const { favs, toggle } = useFavorites();

  const services = useMemo(
    () => (mode === "curated" ? initialServices : discovered ?? []),
    [mode, initialServices, discovered],
  );
  const discoverLoading = mode === "all" && !discovered && !discoverError;

  useEffect(() => {
    if (mode !== "all" || discovered) return;
    let cancelled = false;
    fetch("/api/discover")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ services: Service[] }>;
      })
      .then((data) => {
        if (!cancelled) setDiscovered(data.services);
      })
      .catch((err: Error) => {
        if (!cancelled) setDiscoverError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, discovered]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aPin = a.pinned ? 1 : 0;
      const bPin = b.pinned ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;

      const aFav = favs.has(a.repo) ? 1 : 0;
      const bFav = favs.has(b.repo) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;

      const aTime = a.pushedAt ? new Date(a.pushedAt).getTime() : 0;
      const bTime = b.pushedAt ? new Date(b.pushedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [filtered, favs]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="md:max-w-sm md:flex-1">
          <SearchBar
            value={query}
            onChange={setQuery}
            onCommandK={() => setPaletteOpen(true)}
          />
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <CategoryFilter active={category} counts={counts} onChange={setCategory} />
      </div>

      {discoverLoading && (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-10 text-center text-sm text-[var(--muted)]">
          GitHub에서 레포 가져오는 중...
        </div>
      )}
      {mode === "all" && discoverError && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 py-6 text-center text-sm text-amber-300/90">
          discover 실패: {discoverError}
        </div>
      )}

      {!discoverLoading && sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center text-sm text-[var(--muted)]">
          조건에 맞는 서비스가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((s) => (
            <ServiceCard
              key={s.repo}
              service={s}
              favorited={favs.has(s.repo)}
              onToggleFavorite={toggle}
              onPreview={setPreview}
            />
          ))}
        </div>
      )}

      <CommandPalette
        services={services}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />

      {preview && (
        <PreviewModal
          url={preview.resolvedUrl}
          title={preview.resolvedTitle}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div className="flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5 text-xs">
      {(["curated", "all"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded-md px-3 py-1.5 transition ${
            mode === m
              ? "bg-white/10 text-foreground"
              : "text-[var(--muted)] hover:text-foreground"
          }`}
        >
          {m === "curated" ? "Curated" : "All Repos"}
        </button>
      ))}
    </div>
  );
}
