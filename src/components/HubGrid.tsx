"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Plugin, PluginStatus, StatusLevel } from "@/lib/plugins";
import { askAssistant } from "./AssistantWidget";

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
          return <PluginCard key={p.id} plugin={p} status={s} />;
        })}
      </div>
    </section>
  );
}

function PluginCard({ plugin, status }: { plugin: Plugin; status?: PluginStatus }) {
  const level: StatusLevel = status?.level ?? "unknown";

  const askPrompt = buildAskPrompt(plugin, status);

  return (
    <div
      className="group relative flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--accent)]/50"
      style={{
        background: `linear-gradient(135deg, ${plugin.accent}10 0%, var(--card) 60%)`,
      }}
    >
      <Link
        href={`/plugins/${plugin.id}`}
        className="absolute inset-0 z-0 rounded-xl"
        aria-label={`${plugin.name} 열기`}
      />

      <div className="relative z-10 mb-2 flex items-start justify-between gap-2">
        <h3 className="break-keep text-sm font-medium leading-snug">{plugin.name}</h3>
        <StatusDot level={level} label={status?.label ?? "상태 확인 중"} detail={status?.detail} />
      </div>

      <p className="pointer-events-none relative z-10 break-keep text-[11px] leading-relaxed text-[var(--muted)]">
        {plugin.description}
      </p>

      <div className="pointer-events-none relative z-10 mt-3 flex flex-wrap gap-1">
        {plugin.tags.map((t) => (
          <span
            key={t}
            className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="relative z-10 mt-3 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2 text-[10px] text-[var(--muted)]">
        <span className="truncate" title={status?.detail ?? ""}>
          {status?.label ?? "상태 확인 중"}
          {status?.latestCommit ? ` · ${status.latestCommit}` : ""}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            askAssistant(askPrompt);
          }}
          className="relative z-20 rounded-md border border-[var(--border)] bg-[var(--card)]/80 px-2 py-0.5 text-[10px] hover:border-[var(--accent)]/40 hover:text-foreground"
          title="비서에게 이 플러그인에 대해 묻기"
        >
          비서에게 묻기
        </button>
      </div>
    </div>
  );
}

function StatusDot({
  level,
  label,
  detail,
}: {
  level: StatusLevel;
  label: string;
  detail?: string;
}) {
  return (
    <div className="group/dot relative">
      <span
        className="mt-1 block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: LEVEL_COLOR[level], boxShadow: LEVEL_GLOW[level] }}
        aria-label={label}
      />
      <div
        className="pointer-events-none absolute right-0 top-5 z-30 hidden w-56 rounded-md border border-[var(--border)] bg-[#0b0b0f] p-2 text-left text-[10px] leading-relaxed text-[var(--muted)] shadow-xl group-hover/dot:block"
        role="tooltip"
      >
        <p className="font-medium text-foreground">{label}</p>
        {detail && <p className="mt-1 whitespace-pre-wrap break-words">{detail}</p>}
      </div>
    </div>
  );
}

function buildAskPrompt(plugin: Plugin, status?: PluginStatus): string {
  const lines = [
    `웅허브 플러그인 "${plugin.name}" (id=${plugin.id}) 상태를 점검해줘.`,
    `repo=${plugin.repo}@${plugin.branch}${plugin.pr != null ? ` PR#${plugin.pr}` : ""}`,
  ];
  if (status) {
    lines.push(`현재 상태: ${status.label}${status.detail ? ` — ${status.detail}` : ""}`);
  }
  lines.push("문제가 있으면 원인과 다음에 실행할 명령어를 알려줘 (필요하면 suggest_command 액션 사용).");
  return lines.join("\n");
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
