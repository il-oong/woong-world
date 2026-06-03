"use client";

import { useEffect, useState } from "react";

type Vote = { up: number; down: number; mixed: number };

export default function MarketSentimentPoll({ market }: { market: string }) {
  const [vote, setVote] = useState<Vote | null>(null);
  const [voted, setVoted] = useState<"up" | "down" | "mixed" | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const label = market === "KR" ? "내일" : "오늘";
  const marketLabel = market === "KR" ? "코스피" : market === "US" ? "미장" : "코인";

  useEffect(() => {
    const key = `market-poll-voted-${today}-${market}`;
    const prev = localStorage.getItem(key) as "up" | "down" | "mixed" | null;
    setVoted(prev);
    fetch(`/api/market/sentiment?date=${tomorrow}&market=${market}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setVote(d));
  }, [market, today, tomorrow]);

  const handleVote = async (direction: "up" | "down" | "mixed") => {
    if (voted) return;
    const res = await fetch("/api/market/sentiment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: tomorrow, market, direction }),
    });
    if (res.ok) {
      const d = await res.json();
      setVote(d);
      setVoted(direction);
      localStorage.setItem(`market-poll-voted-${today}-${market}`, direction);
    }
  };

  const total = (vote?.up ?? 0) + (vote?.down ?? 0) + (vote?.mixed ?? 0);
  const pct = (n: number) => total ? Math.round((n / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900/50 border-b border-zinc-800">
      <span className="text-[10px] font-mono text-zinc-500 shrink-0">
        {label}의 투표 {label}({tomorrow.slice(5)}) {marketLabel} 분위기는?
        {total > 0 && <span className="ml-1 text-zinc-700">{total}명 참여</span>}
      </span>
      <div className="flex items-center gap-1.5">
        {(["up", "mixed", "down"] as const).map((d) => {
          const labels = { up: "상승", mixed: "보합", down: "하락" };
          const colors = {
            up: voted === d ? "bg-emerald-500/30 text-emerald-300 border-emerald-500/50" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-emerald-500/10 hover:text-emerald-400",
            mixed: voted === d ? "bg-zinc-600/30 text-zinc-300 border-zinc-500/50" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700",
            down: voted === d ? "bg-rose-500/30 text-rose-300 border-rose-500/50" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-rose-500/10 hover:text-rose-400",
          };
          return (
            <button
              key={d}
              disabled={!!voted}
              onClick={() => handleVote(d)}
              className={`rounded border px-2 py-0.5 text-[11px] font-mono transition ${colors[d]} disabled:cursor-default`}
            >
              {labels[d]}
              {total > 0 && <span className="ml-1 opacity-70">{pct(vote?.[d] ?? 0)}%</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
