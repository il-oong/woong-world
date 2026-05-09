"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "홈" },
  { href: "/calendar", label: "일정" },
  { href: "/plans", label: "계획" },
  { href: "/guide", label: "설정 가이드" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-30 border-b border-[var(--border)] bg-[#0b0b0f]/80 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-1 px-6">
        <Link
          href="/"
          className="mr-3 font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--accent)]"
        >
          비서
        </Link>
        <div className="flex flex-1 items-center gap-1 text-xs">
          {ITEMS.map((it) => {
            const active =
              it.href === "/"
                ? pathname === "/"
                : pathname.startsWith(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className="rounded-md px-2.5 py-1.5 transition"
                style={{
                  color: active ? "var(--foreground)" : "var(--muted)",
                  background: active ? "rgba(255,255,255,0.06)" : "transparent",
                }}
              >
                {it.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
