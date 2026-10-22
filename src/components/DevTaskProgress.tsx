"use client";

import { useCallback, useEffect, useState } from "react";
import type { DevTaskStatus } from "@/lib/jarvis-dev";

const TERMINAL = new Set(["merged", "failed", "closed"]);

function Dots() {
  return (
    <span aria-hidden className="inline-flex gap-0.5 align-baseline">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="animate-pulse"
          style={{ animationDelay: `${i * 250}ms` }}
        >
          .
        </span>
      ))}
    </span>
  );
}

export default function DevTaskProgress({ issue }: { issue: number }) {
  const [task, setTask] = useState<DevTaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/jarvis/tasks?issue=${issue}`, { cache: "no-store" });
      const data = (await res.json()) as { task?: DevTaskStatus; error?: string };
      if (data.task) {
        setTask(data.task);
        setError(null);
      } else {
        setError(data.error ?? "status_failed");
      }
    } catch {
      setError("network_error");
    }
  }, [issue]);

  const phase = task?.phase;
  useEffect(() => {
    if (phase && TERMINAL.has(phase)) return;
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load, phase]);

  const merge = async () => {
    if (!task?.pr) return;
    setMerging(true);
    try {
      const res = await fetch("/api/jarvis/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pr: task.pr.number }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) setError(data.error ?? "merge_failed");
      else setError(null);
    } catch {
      setError("network_error");
    } finally {
      setMerging(false);
      setConfirming(false);
      void load();
    }
  };

  const pr = task?.pr;
  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-[var(--border)] bg-black/20 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-[var(--muted)]">
          이슈{" "}
          <a
            href={task?.url ?? `https://github.com/il-oong/woong-world/issues/${issue}`}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            #{issue}
          </a>
        </span>
        <span className="text-[11px] font-medium text-foreground">
          {(!task || phase === "queued") && (
            <>
              접수됨, 시작 대기 중
              <Dots />
            </>
          )}
          {phase === "working" && (
            <>
              AI가 개발 중
              <Dots />
            </>
          )}
          {phase === "pr_open" && "개발 완료"}
          {phase === "merged" && "머지 완료"}
          {phase === "failed" && "개발 실패"}
          {phase === "closed" && "닫힘"}
        </span>
      </div>

      {phase === "pr_open" && pr && (
        <div className="space-y-1.5 text-[11px] text-[var(--muted)]">
          <p>
            PR{" "}
            <a href={pr.url} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
              #{pr.number}
            </a>
            이 열렸다.
            {pr.changedFiles !== undefined &&
              ` 파일 ${pr.changedFiles}개 변경 (+${pr.additions ?? 0} / −${pr.deletions ?? 0}).`}{" "}
            내용을 확인하고 머지해라.
          </p>
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-medium text-black"
            >
              머지하기
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span>정말 main에 머지할까요?</span>
              <button
                type="button"
                onClick={() => void merge()}
                disabled={merging}
                className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-medium text-black disabled:opacity-40"
              >
                {merging ? "..." : "머지 확정"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={merging}
                className="rounded-md px-3 py-1 text-xs text-[var(--muted)] hover:bg-white/5"
              >
                취소
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "merged" && pr && (
        <p className="text-[11px] text-[var(--muted)]">
          PR{" "}
          <a href={pr.url} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
            #{pr.number}
          </a>
          이 main에 머지됐다. 배포가 끝나면 반영된다.
        </p>
      )}

      {phase === "failed" && (
        <p className="text-[11px] text-[var(--muted)]">
          에이전트가 PR을 만들지 못했다.{" "}
          {task?.runUrl && (
            <a href={task.runUrl} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
              실행 로그 보기
            </a>
          )}
        </p>
      )}

      {error && <p className="text-[10px] text-red-400">오류: {error}</p>}
    </div>
  );
}
