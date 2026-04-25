"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const KEY = "woong-hub:favorites";
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function readRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function emptyRaw(): string {
  return "";
}

function parse(raw: string): Set<string> {
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function useFavorites() {
  const raw = useSyncExternalStore(subscribe, readRaw, emptyRaw);
  const favs = useMemo(() => parse(raw), [raw]);

  const toggle = useCallback((slug: string) => {
    const current = parse(readRaw());
    if (current.has(slug)) current.delete(slug);
    else current.add(slug);
    try {
      localStorage.setItem(KEY, JSON.stringify([...current]));
    } catch {
      // ignore quota errors
    }
    notify();
  }, []);

  return { favs, toggle };
}
