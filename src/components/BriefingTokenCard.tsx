"use client";

import { useEffect, useState } from "react";

export function BriefingTokenCard() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    fetch("/api/briefing/token")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setToken(d?.token ?? null))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const shortcutUrl = token
    ? `https://woong-world.vercel.app/api/briefing/script?token=${token}`
    : "";

  async function copyUrl() {
    if (!shortcutUrl) return;
    await navigator.clipboard.writeText(shortcutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function regenerate() {
    setRegenerating(true);
    const res = await fetch("/api/briefing/token", { method: "POST" });
    const d = (await res.json()) as { token: string };
    setToken(d.token);
    setRegenerating(false);
  }

  if (loading) return null;
  if (!token) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
        biseo / shortcuts
      </p>
      <h3 className="mt-2 text-sm font-medium">아이폰 단축어 자동 브리핑</h3>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
        아래 URL을 단축어 앱 "URL 가져오기" 액션에 붙여넣고,<br />
        "텍스트 말하기" 액션을 연결하면 완전 자동 브리핑됩니다.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-[var(--border)] bg-white/5 px-3 py-2 text-[11px] text-[var(--muted)]">
          {shortcutUrl}
        </code>
        <button
          type="button"
          onClick={copyUrl}
          className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-xs transition hover:border-[var(--accent)]/40 hover:text-foreground"
        >
          {copied ? "복사됨 ✓" : "복사"}
        </button>
      </div>

      <button
        type="button"
        onClick={regenerate}
        disabled={regenerating}
        className="mt-2 text-[11px] text-[var(--muted)] hover:text-foreground disabled:opacity-50"
      >
        {regenerating ? "발급 중..." : "↻ 새 토큰 발급"}
      </button>
    </div>
  );
}
