"use client";

import { useState } from "react";

export function PluginEmbed({ src, title }: { src: string; title: string }) {
  const [error, setError] = useState(false);
  const isExternal = src.startsWith("http");

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-rose-300/90">
          이 페이지는 iframe에 임베드할 수 없습니다.
        </p>
        <p className="text-xs text-[var(--muted)]">
          외부 사이트의 보안 정책(X-Frame-Options / CSP) 때문에 차단됐어요.
        </p>
        <a
          href={src}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-[11px] hover:border-[var(--accent)]/40"
        >
          새 탭에서 열기 →
        </a>
      </div>
    );
  }

  return (
    <iframe
      src={src}
      title={title}
      className="h-full w-full border-0 bg-white"
      // Allow microphone/clipboard so plugin apps can use them when embedded.
      allow="clipboard-read; clipboard-write; microphone"
      // For external embeds, sandbox helps but be permissive enough for SPAs.
      {...(isExternal ? { sandbox: "allow-scripts allow-same-origin allow-forms allow-popups" } : {})}
      onError={() => setError(true)}
    />
  );
}
