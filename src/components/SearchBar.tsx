"use client";

import { useSyncExternalStore } from "react";

function noopSubscribe() {
  return () => {};
}
function getIsMac() {
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}
function getIsMacServer() {
  return false;
}

export function SearchBar({
  value,
  onChange,
  onCommandK,
  placeholder = "툴 검색...",
}: {
  value: string;
  onChange: (next: string) => void;
  onCommandK?: () => void;
  placeholder?: string;
}) {
  const isMac = useSyncExternalStore(noopSubscribe, getIsMac, getIsMacServer);

  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
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
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2.5 pl-10 pr-16 text-sm text-foreground placeholder:text-[var(--muted)] focus:border-[var(--accent)]/50 focus:outline-none"
      />
      {onCommandK && (
        <button
          type="button"
          onClick={onCommandK}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-[var(--border)] bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)] transition hover:text-foreground"
          aria-label="Open command palette"
        >
          {isMac ? "⌘K" : "Ctrl K"}
        </button>
      )}
    </div>
  );
}
