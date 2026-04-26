"use client";

import { useEffect, useState } from "react";

export function PreviewModal({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const isGitHub = /^https?:\/\/(www\.)?github\.com\//.test(url);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="m-auto flex h-[92vh] w-[96vw] max-w-7xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[#0b0b0f] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-rose-400/60" />
            <span className="h-3 w-3 rounded-full bg-amber-400/60" />
            <span className="h-3 w-3 rounded-full bg-emerald-400/60" />
          </div>

          <button
            type="button"
            onClick={() => setIframeKey((k) => k + 1)}
            className="ml-2 rounded p-1 text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
            aria-label="새로고침"
            title="새로고침"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>

          <div className="ml-2 flex flex-1 items-center gap-2 truncate rounded-md border border-[var(--border)] bg-black/40 px-3 py-1.5">
            <span className="font-mono text-xs text-[var(--muted)]">
              {title}
            </span>
            <span className="text-[var(--muted)]">·</span>
            <span className="truncate font-mono text-[11px] text-[var(--muted)]">
              {url}
            </span>
          </div>

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-foreground"
            title="새 탭에서 열기"
          >
            ↗ 새 탭
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
            aria-label="닫기"
          >
            ✕
          </button>
        </header>

        <div className="relative flex-1 bg-black">
          {isGitHub ? (
            <FallbackMessage url={url} reason="github" />
          ) : (
            <>
              {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
                  로딩 중...
                </div>
              )}
              <iframe
                key={iframeKey}
                src={url}
                title={title}
                onLoad={() => setLoaded(true)}
                className="h-full w-full border-0"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-presentation"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </>
          )}
        </div>

        <footer className="border-t border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[10px] text-[var(--muted)]">
          일부 사이트(GitHub 등)는 임베드를 차단합니다 — 화면이 빈 페이지로 보이면 ↗ 새 탭에서 열어주세요.
        </footer>
      </div>
    </div>
  );
}

function FallbackMessage({
  url,
  reason,
}: {
  url: string;
  reason: "github" | "blocked";
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="text-3xl">
        {reason === "github" ? "🔒" : "⚠️"}
      </span>
      <h3 className="text-base font-medium">
        {reason === "github"
          ? "GitHub은 임베드를 차단합니다"
          : "이 사이트는 임베드를 차단합니다"}
      </h3>
      <p className="max-w-md text-xs leading-relaxed text-[var(--muted)]">
        보안 정책상 iframe 안에서 표시될 수 없습니다. 새 탭에서 직접 열어주세요.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-medium text-black hover:bg-[var(--accent)]/90"
      >
        ↗ 새 탭에서 열기
      </a>
    </div>
  );
}
