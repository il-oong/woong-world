"use client";

import { useEffect, useRef, useState } from "react";
import type { BriefingCache } from "@/lib/session-store";

type Phase =
  | "checking"
  | "generating"
  | "ready"
  | "playing"
  | "done"
  | "error";

export default function AutoBriefingPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [script, setScript] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [scriptOpen, setScriptOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  function playAudio(url: string) {
    audioUrlRef.current = url;
    setPhase("ready");
    // 자동 재생 시도
    setTimeout(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = url;
      audio.play().then(() => setPhase("playing")).catch(() => {
        // autoplay 차단 시 ready 상태 유지 (버튼 표시)
        setPhase("ready");
      });
    }, 100);
  }

  useEffect(() => {
    async function init() {
      try {
        // 1. 캐시 확인
        const cacheRes = await fetch("/api/briefing/cache");
        if (cacheRes.ok) {
          const { cache } = (await cacheRes.json()) as { cache: BriefingCache | null };
          if (cache?.audioUrl) {
            setScript(cache.script);
            playAudio(cache.audioUrl);
            return;
          }
        }

        // 2. 캐시 없으면 직접 생성
        setPhase("generating");
        const res = await fetch("/api/briefing", { method: "POST" });
        const data = (await res.json()) as {
          audioUrl?: string;
          script?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "생성 실패");
        setScript(data.script ?? null);
        playAudio(data.audioUrl!);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "오류 발생");
        setPhase("error");
      }
    }
    init();
  }, []);

  const handlePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrlRef.current) return;
    if (!audio.src) audio.src = audioUrlRef.current;
    audio.play().then(() => setPhase("playing")).catch(() => {});
  };

  const handlePause = () => {
    audioRef.current?.pause();
    setPhase("ready");
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a0a0f] px-6">
      <audio
        ref={audioRef}
        onEnded={() => setPhase("done")}
        className="hidden"
      />

      <div className="w-full max-w-sm text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
          biseo / briefing
        </p>

        {phase === "checking" && (
          <div className="mt-8">
            <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-[var(--accent)]/20" />
            <p className="mt-4 text-sm text-[var(--muted)]">브리핑 확인 중...</p>
          </div>
        )}

        {phase === "generating" && (
          <div className="mt-8">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-[var(--accent)]/20 border-t-[var(--accent)]" />
            <p className="mt-4 text-sm text-[var(--muted)]">브리핑 생성 중...</p>
            <p className="mt-1 text-xs text-[var(--muted)]/60">잠시만 기다려 주세요</p>
          </div>
        )}

        {phase === "playing" && (
          <div className="mt-8">
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)]/20" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/20">
                <span className="text-2xl">✦</span>
              </div>
            </div>
            <p className="mt-4 text-base font-medium">브리핑 중</p>
            <button
              type="button"
              onClick={handlePause}
              className="mt-3 text-xs text-[var(--muted)] hover:text-foreground"
            >
              ⏸ 일시정지
            </button>
          </div>
        )}

        {(phase === "ready" || phase === "done") && (
          <div className="mt-8">
            <button
              type="button"
              onClick={handlePlay}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-2xl text-black shadow-lg shadow-[var(--accent)]/30 transition hover:opacity-90 active:scale-95"
            >
              {phase === "done" ? "↺" : "▶"}
            </button>
            <p className="mt-4 text-sm text-[var(--muted)]">
              {phase === "done" ? "브리핑 완료" : "탭해서 재생"}
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="mt-8">
            <p className="text-sm text-red-400">{errorMsg}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 text-xs text-[var(--muted)] hover:text-foreground"
            >
              다시 시도
            </button>
          </div>
        )}

        {script && (phase === "playing" || phase === "done" || phase === "ready") && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setScriptOpen((o) => !o)}
              className="text-xs text-[var(--muted)] hover:text-foreground"
            >
              {scriptOpen ? "스크립트 접기 ↑" : "스크립트 보기 ↓"}
            </button>
            {scriptOpen && (
              <p className="mt-3 rounded-xl border border-[var(--border)] bg-white/[0.02] p-4 text-left text-xs leading-relaxed text-[var(--muted)]">
                {script}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
