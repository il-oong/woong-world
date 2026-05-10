"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Plugin, PluginStatus, StatusLevel } from "@/lib/plugins";

type Response = { plugins: Plugin[]; statuses: PluginStatus[] };

const LEVEL_COLOR: Record<StatusLevel, string> = {
  green: "#34d399",
  yellow: "#fbbf24",
  red: "#f87171",
  unknown: "#64748b",
};

const LEVEL_GLOW: Record<StatusLevel, string> = {
  green: "0 0 8px rgba(52, 211, 153, 0.7)",
  yellow: "0 0 8px rgba(251, 191, 36, 0.7)",
  red: "0 0 8px rgba(248, 113, 113, 0.8)",
  unknown: "0 0 4px rgba(100, 116, 139, 0.5)",
};

export function HubGrid() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/plugins/status")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Response;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "load_failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <section className="mt-10 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-300/90">
        플러그인 상태 로드 실패: {error}
      </section>
    );
  }

  if (!data) {
    return (
      <section className="mt-10">
        <Header />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--card)]"
            />
          ))}
        </div>
      </section>
    );
  }

  const statusMap = new Map(data.statuses.map((s) => [s.pluginId, s]));

  return (
    <section className="mt-10">
      <Header />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.plugins.map((p) => {
          const s = statusMap.get(p.id);
          const level: StatusLevel = s?.level ?? "unknown";
          return (
            <Link
              key={p.id}
              href={`/plugins/${p.id}`}
              className="group flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--accent)]/50"
              style={{
                background: `linear-gradient(135deg, ${p.accent}10 0%, var(--card) 60%)`,
              }}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="break-keep text-sm font-medium leading-snug">{p.name}</h3>
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background: LEVEL_COLOR[level],
                    boxShadow: LEVEL_GLOW[level],
                  }}
                  aria-label={s?.label ?? "상태"}
                  title={s?.label ?? "상태"}
                />
              </div>
              <p className="break-keep text-[11px] leading-relaxed text-[var(--muted)]">
                {p.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {p.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2 text-[10px] text-[var(--muted)] group-hover:text-foreground">
                <span className="truncate" title={s?.detail ?? ""}>
                  {s?.label ?? "상태 확인 중"}
                  {s?.latestCommit ? ` · ${s.latestCommit}` : ""}
                </span>
                <span>→</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Header() {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
          woong / hub
        </p>
        <h2 className="mt-1 text-lg font-medium">플러그인</h2>
      </div>
      <p className="text-[10px] text-[var(--muted)]">상태등 = CI · PR · 커밋 종합</p>
    </div>
  );
}
