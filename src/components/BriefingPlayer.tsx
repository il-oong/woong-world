"use client";

import { useRef, useState } from "react";

type State = "idle" | "loading" | "ready" | "playing" | "paused" | "done" | "error";

export function BriefingPlayer({ secretaryName }: { secretaryName: string }) {
  const [state, setState] = useState<State>("idle");
  const [script, setScript] = useState<string | null>(null);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function generate() {
    setState("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/briefing", { method: "POST" });
      const data = (await res.json()) as { audioUrl?: string; script?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "생성 실패");

      const audio = new Audio(data.audioUrl!);
      audio.addEventListener("ended", () => setState("done"));
      audioRef.current = audio;
      setScript(data.script ?? null);

      try {
        await audio.play();
        setState("playing");
      } catch {
        setState("ready");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "오류 발생");
      setState("error");
    }
  }

  async function play() {
    const audio = audioRef.current;
    if (!audio) return;
    // After "ended", currentTime is at duration; some browsers (notably iOS
    // Safari) won't auto-rewind on play(), so the replay is silent. Reset
    // explicitly when at the end or unset.
    if (audio.ended || audio.currentTime >= audio.duration - 0.1) {
      audio.currentTime = 0;
    }
    try {
      await audio.play();
      setState("playing");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "재생 실패");
      setState("error");
    }
  }

  function pause() {
    audioRef.current?.pause();
    setState("paused");
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
        biseo / briefing
      </p>
      <h2 className="mt-2 text-base font-medium">
        {secretaryName}의 오늘 브리핑
      </h2>

      <div className="mt-4 flex items-center gap-3">
        {state === "idle" || state === "error" ? (
          <button
            onClick={generate}
            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
          >
            <span>✦</span> 브리핑 생성
          </button>
        ) : state === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <span className="animate-pulse">●</span> 브리핑 준비 중...
          </div>
        ) : state === "ready" || state === "paused" || state === "done" ? (
          <button
            onClick={play}
            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
          >
            ▶ {state === "done" ? "다시 듣기" : "재생"}
          </button>
        ) : (
          <button
            onClick={pause}
            className="flex items-center gap-2 rounded-lg border border-[var(--accent)]/50 px-4 py-2 text-sm text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
          >
            ⏸ 일시정지
          </button>
        )}

        {script && (
          <button
            onClick={() => setScriptOpen((o) => !o)}
            className="text-xs text-[var(--muted)] hover:text-foreground transition"
          >
            {scriptOpen ? "스크립트 접기 ↑" : "스크립트 보기 ↓"}
          </button>
        )}
      </div>

      {errorMsg && (
        <p className="mt-2 text-xs text-red-400">{errorMsg}</p>
      )}

      {scriptOpen && script && (
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)] border-t border-[var(--border)] pt-3">
          {script}
        </p>
      )}
    </div>
  );
}
