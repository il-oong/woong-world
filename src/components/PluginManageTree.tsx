"use client";

import { useEffect, useState } from "react";

type TreeEntry = { path: string; type: "file" | "dir" };

export function PluginManageTree({
  repo,
  branch,
}: {
  repo: string;
  branch: string;
}) {
  const [tree, setTree] = useState<TreeEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/plugins/github-meta?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}&tree=1`,
        );
        if (cancelled) return;
        const data = (await res.json().catch(() => ({}))) as {
          tree?: TreeEntry[];
          error?: string;
        };
        if (!res.ok) {
          setErr(data.error ?? `http_${res.status}`);
          setTree([]);
          return;
        }
        setTree(data.tree ?? []);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "load_failed");
          setTree([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, branch]);

  if (tree === null) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-black/20 px-3 py-4 text-xs text-[var(--muted)]">
        불러오는 중...
      </div>
    );
  }
  if (err) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        트리 로드 실패: {err}
      </div>
    );
  }
  if (tree.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-black/20 px-3 py-4 text-xs text-[var(--muted)]">
        표시할 항목이 없습니다.
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-1 rounded-lg border border-[var(--border)] bg-black/20 p-2 text-xs sm:grid-cols-2">
      {tree.map((e) => (
        <li key={e.path}>
          <a
            href={`https://github.com/${repo}/tree/${encodeURIComponent(branch)}/${encodeURIComponent(e.path)}`}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-2 rounded px-2 py-1 transition hover:bg-white/5"
          >
            <span aria-hidden className="text-[var(--muted)]">
              {e.type === "dir" ? "📁" : "📄"}
            </span>
            <span className="truncate font-mono text-[11px]">{e.path}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
