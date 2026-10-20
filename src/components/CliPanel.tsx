"use client";

import { useRef, useState } from "react";
import type { Plugin } from "@/lib/plugins";

/** Admin-only CLI drawer: runs `claude -p <prompt>` against a plugin's local repo clone. */
export function CliPanel({ plugin, onClose }: { plugin: Plugin; onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [log, setLog] = useState("");
  const [running, setRunning] = useState(false);
  const [notCloned, setNotCloned] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  async function run() {
    if (!prompt.trim() || running) return;
    setRunning(true);
    setNotCloned(null);
    setLog("");
    try {
      const res = await fetch("/api/cli/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: plugin.repo, prompt }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.reason === "not_cloned" || data.error === "not_cloned") {
          setNotCloned(data.suggestedClone ?? `gh repo clone ${plugin.repo}`);
        } else {
          setLog(`[cli] 요청 실패: ${data.error ?? res.status}`);
        }
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setLog((prev) => prev + decoder.decode(value, { stream: true }));
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--background)] shadow-2xl">
      <div className="mx-auto flex max-h-[60vh] max-w-3xl flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs text-[var(--accent)]">
            cli · {plugin.repo}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--muted)] hover:text-foreground"
          >
            닫기
          </button>
        </div>

        {notCloned ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-300/90">
            로컬에 이 레포가 안 클론돼 있음. 터미널에서 먼저 실행:{" "}
            <code className="font-mono">{notCloned}</code>
          </p>
        ) : (
          <pre
            ref={logRef}
            className="min-h-[8rem] flex-1 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--card)] p-2 font-mono text-[11px] whitespace-pre-wrap text-foreground/90"
          >
            {log || (running ? "실행 중…" : "claude -p 로 보낼 프롬프트를 입력하세요.")}
          </pre>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
          className="flex gap-2"
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={running}
            placeholder={`${plugin.name} 레포에 보낼 명령…`}
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs outline-none focus:border-[var(--accent)]/60"
          />
          <button
            type="submit"
            disabled={running || !prompt.trim()}
            className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs hover:border-[var(--accent)]/40 disabled:opacity-40"
          >
            {running ? "..." : "실행"}
          </button>
        </form>
      </div>
    </div>
  );
}
