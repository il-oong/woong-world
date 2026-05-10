"use client";

import { useEffect, useState } from "react";
import type { Plugin, PluginStatus } from "@/lib/plugins";
import { askAssistant } from "./AssistantWidget";
import { PluginTree, buildHubSubtitle } from "./PluginTree";

type Response = { plugins: Plugin[]; statuses: PluginStatus[] };

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
      <PluginTree
        plugins={data.plugins}
        statuses={statusMap}
        rootLabel="웅허브"
        rootSubtitle={buildHubSubtitle(data.plugins, statusMap)}
        asLinks
        cardFooter={(plugin) => (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              askAssistant(buildAskPrompt(plugin, statusMap.get(plugin.id)));
            }}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--card)]/80 px-2 py-1 text-[10px] hover:border-[var(--accent)]/40 hover:text-foreground"
            title="비서에게 이 플러그인에 대해 묻기"
          >
            비서에게 묻기
          </button>
        )}
      />
    </section>
  );
}

function buildAskPrompt(plugin: Plugin, status?: PluginStatus): string {
  const lines = [
    `웅허브 플러그인 "${plugin.name}" (id=${plugin.id}) 상태를 점검해줘.`,
    `repo=${plugin.repo}@${plugin.branch}${plugin.pr != null ? ` PR#${plugin.pr}` : ""}`,
  ];
  if (status) {
    lines.push(
      `현재 상태: ${status.label}${status.detail ? ` — ${status.detail}` : ""}`,
    );
  }
  lines.push(
    "문제가 있으면 원인과 다음에 실행할 명령어를 알려줘 (필요하면 suggest_command 액션 사용).",
  );
  return lines.join("\n");
}

function Header() {
  return (
    <div className="mb-4 flex items-baseline justify-between">
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
