import Link from "next/link";

const ITEMS = [
  { href: "/", label: "홈" },
  { href: "/calendar", label: "일정" },
  { href: "/plans", label: "계획" },
];

export function TopNav() {
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
          {ITEMS.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="rounded-md px-2.5 py-1.5 text-[var(--muted)] transition hover:bg-white/5 hover:text-foreground"
            >
              {it.label}
            </Link>
          ))}
        </div>
        <a
          href="https://github.com/il-oong"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:text-foreground"
          title="GitHub 프로필 새 탭에서 열기"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.95 10.95 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5Z" />
          </svg>
          <span>GitHub</span>
          <span className="text-[var(--muted)]">↗</span>
        </a>
      </div>
    </nav>
  );
}
