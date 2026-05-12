"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "홈" },
  { href: "/calendar", label: "일정" },
  { href: "/plans", label: "계획" },
  { href: "/guide", label: "설정 가이드" },
];

const ADMIN_ITEMS = [
  { href: "/", label: "허브" },
  { href: "/calendar", label: "일정" },
  { href: "/plans", label: "계획" },
  { href: "/plugins", label: "플러그인" },
  { href: "/admin/people", label: "관리자" },
  { href: "/guide", label: "설정 가이드" },
];

export function TopNav() {
  const pathname = usePathname();
  const [adminMode, setAdminMode] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Two-step check: confirm the session is actually connected first
    // (secretary endpoint returns 401 if not), then check admin.
    // Otherwise a stale/partial session cookie could flip the brand to
    // "웅허브" before the user has actually logged in this session.
    (async () => {
      try {
        const sec = await fetch("/api/secretary");
        if (cancelled) return;
        // Treat only 2xx as truly connected. 401 = not logged in,
        // 503 = storage not configured, 5xx/etc = backend issue —
        // in all those cases we don't show the logout button.
        if (!sec.ok) {
          setConnected(false);
          setAdminMode(false);
          return;
        }
        setConnected(true);
        const adm = await fetch("/api/admin/status");
        if (cancelled) return;
        if (!adm.ok) {
          setAdminMode(false);
          return;
        }
        const data = (await adm.json()) as { isAdmin?: boolean };
        setAdminMode(Boolean(data.isAdmin));
      } catch {
        if (!cancelled) {
          setConnected(false);
          setAdminMode(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const items = adminMode ? ADMIN_ITEMS : ITEMS;
  const brand = adminMode ? "웅허브" : "비서";

  const handleLogout = async () => {
    if (loggingOut) return;
    if (!confirm("로그아웃하시겠어요? 다시 사용하려면 구글 로그인이 필요합니다.")) return;
    setLoggingOut(true);
    try {
      await fetch("/api/google/disconnect", { method: "POST" });
    } finally {
      // Hard reload to clear all client state (calendar widgets, plans, etc.)
      window.location.href = "/";
    }
  };

  return (
    <nav className="sticky top-0 z-30 border-b border-[var(--border)] bg-[#0b0b0f]/80 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-1 px-3 sm:px-6">
        <Link
          href="/"
          className="mr-2 shrink-0 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--accent)] sm:mr-3"
        >
          {brand}
        </Link>
        <div className="flex flex-1 items-center gap-0.5 overflow-x-auto text-xs sm:gap-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((it) => {
            const active =
              it.href === "/"
                ? pathname === "/"
                : pathname.startsWith(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className="shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 transition sm:px-2.5"
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
        {connected && (
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="ml-1 shrink-0 whitespace-nowrap rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] transition hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-50 sm:px-2.5"
            aria-label="로그아웃"
          >
            {loggingOut ? "..." : "로그아웃"}
          </button>
        )}
      </div>
    </nav>
  );
}
