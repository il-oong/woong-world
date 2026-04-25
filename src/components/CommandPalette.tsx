"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_BY_ID, type Service } from "@/lib/types";

export function CommandPalette({
  services,
  open,
  onClose,
}: {
  services: Service[];
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return <PaletteContent services={services} onClose={onClose} />;
}

function PaletteContent({
  services,
  onClose,
}: {
  services: Service[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services.slice(0, 20);
    return services
      .filter((s) => {
        const haystack = [
          s.resolvedTitle,
          s.resolvedDescription,
          s.repo,
          s.language ?? "",
          s.category,
          ...(s.topics ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 30);
  }, [services, query]);

  const clampedActive = Math.min(Math.max(active, 0), Math.max(matches.length - 1, 0));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, matches.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const target = matches[clampedActive];
        if (target) {
          window.open(target.resolvedUrl, "_blank", "noopener,noreferrer");
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [matches, clampedActive, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${clampedActive}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [clampedActive]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[15vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border)] bg-[#101015] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4">
          <svg
            className="h-4 w-4 text-[var(--muted)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="서비스 검색..."
            className="flex-1 bg-transparent py-3 text-sm text-foreground placeholder:text-[var(--muted)] focus:outline-none"
          />
          <kbd className="rounded border border-[var(--border)] bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)]">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {matches.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              검색 결과가 없습니다.
            </div>
          ) : (
            matches.map((s, i) => {
              const cat = CATEGORY_BY_ID[s.category];
              const isActive = i === clampedActive;
              return (
                <a
                  key={s.repo}
                  data-idx={i}
                  href={s.resolvedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onMouseEnter={() => setActive(i)}
                  onClick={onClose}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{
                    background: isActive ? "rgba(255,255,255,0.04)" : "transparent",
                  }}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg"
                    style={{ background: `${cat.color}1a` }}
                  >
                    {s.icon ?? "📦"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-foreground">
                      {s.resolvedTitle}
                    </div>
                    <div className="truncate font-mono text-[11px] text-[var(--muted)]">
                      {s.repo}
                    </div>
                  </div>
                  <span
                    className="font-mono text-[10px] uppercase tracking-wider"
                    style={{ color: cat.color }}
                  >
                    {cat.label}
                  </span>
                </a>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--muted)]">
          <div className="flex gap-3">
            <span>
              <kbd className="font-mono">↑↓</kbd> 탐색
            </span>
            <span>
              <kbd className="font-mono">↵</kbd> 열기
            </span>
          </div>
          <span>{matches.length} 결과</span>
        </div>
      </div>
    </div>
  );
}
