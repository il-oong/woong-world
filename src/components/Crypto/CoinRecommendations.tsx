"use client";

import { useEffect, useState } from "react";
import type {
  CoinRecommendation,
  CryptoRecommendationsCache,
} from "@/app/api/crypto/recommendations/route";
import type {
  CryptoReviewResult,
  CryptoVerdict,
} from "@/app/api/crypto/agent-review/route";

const URGENCY_COLOR: Record<string, string> = {
  high: "text-rose-400 bg-rose-500/10",
  medium: "text-amber-400 bg-amber-500/10",
  low: "text-zinc-400 bg-zinc-800",
};

const VERDICT_COLOR: Record<CryptoVerdict, string> = {
  "강력매수": "text-emerald-400 bg-emerald-500/20",
  "매수": "text-emerald-300 bg-emerald-500/10",
  "관망": "text-zinc-400 bg-zinc-800",
  "매도": "text-rose-300 bg-rose-500/10",
  "강력매도": "text-rose-400 bg-rose-500/20",
};

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  major: { label: "메이저", cls: "bg-amber-500/15 text-amber-300" },
  alt: { label: "알트", cls: "bg-violet-500/15 text-violet-300" },
  stable_hedge: { label: "헤지", cls: "bg-sky-500/15 text-sky-300" },
  short: { label: "숏", cls: "bg-rose-500/15 text-rose-300" },
};

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-zinc-600 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-mono text-zinc-500 w-6 text-right">{score}</span>
    </div>
  );
}

function TraderCard({ review }: { review: CryptoReviewResult["traders"][0] }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-200">{review.trader}</p>
          <p className="text-[10px] text-zinc-600">{review.style}</p>
        </div>
        <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${VERDICT_COLOR[review.verdict]}`}>
          {review.verdict}
        </span>
      </div>
      <ScoreBar score={review.score} label="강세 점수" />
      <p className="text-xs text-amber-200 font-medium">{review.key_point}</p>
      <p className="text-[11px] text-zinc-500 leading-relaxed">{review.reason}</p>
    </div>
  );
}

function TimingRow({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
      <p className="text-[10px] text-zinc-600 mb-0.5">{label}</p>
      <p
        className={`text-xs ${highlight === "rose" ? "text-rose-400" : highlight === "emerald" ? "text-emerald-400" : "text-zinc-300"}`}
      >
        {value}
      </p>
    </div>
  );
}

function ReviewModal({
  coinId,
  name,
  symbol,
  recommendationReason,
  recommendationType,
  onClose,
}: {
  coinId: string;
  name: string;
  symbol: string;
  recommendationReason?: string;
  recommendationType?: SelectedReview["type"];
  onClose: () => void;
}) {
  const [data, setData] = useState<CryptoReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/crypto/agent-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coinId, name, symbol, recommendationReason, recommendationType }),
    })
      .then((r) => r.json())
      .then((d) => {
        setData(d as CryptoReviewResult);
        setLoading(false);
      })
      .catch(() => {
        setError("분석 실패");
        setLoading(false);
      });
  }, [coinId, name, symbol, recommendationReason, recommendationType]);

  const consensusColorClass = data ? VERDICT_COLOR[data.consensus] ?? "text-zinc-300 bg-zinc-800" : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">트레이더 리뷰</p>
            <h2 className="text-lg font-bold text-white mt-0.5">{name}</h2>
            <p className="text-xs text-zinc-500 font-mono">{symbol} · {coinId}</p>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <div className="text-right">
                {data.currentPrice !== null && (
                  <p className="text-sm font-mono text-zinc-200">
                    ${data.currentPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </p>
                )}
                {data.change24h !== null && (
                  <p
                    className={`text-xs font-mono ${data.change24h > 0 ? "text-emerald-400" : "text-rose-400"}`}
                  >
                    {data.change24h > 0 ? "+" : ""}
                    {data.change24h.toFixed(2)}%
                  </p>
                )}
              </div>
            )}
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-xl leading-none">
              ✕
            </button>
          </div>
        </div>

        {loading && (
          <p className="text-xs text-zinc-600 py-8 text-center animate-pulse">
            5명의 트레이더가 분석 중…
          </p>
        )}
        {error && <p className="text-xs text-rose-500 text-center">{error}</p>}

        {data && (
          <>
            <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex-1">
                <p className="text-[10px] text-zinc-500 mb-1">트레이더 컨센서스</p>
                <ScoreBar score={data.consensusScore} label="" />
              </div>
              <span className={`rounded-lg border px-4 py-1.5 text-sm font-bold ${consensusColorClass}`}>
                {data.consensus}
              </span>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-amber-500/70 mb-1">
                JKP 최종 의견
              </p>
              <p className="text-sm text-amber-100 leading-relaxed">{data.jkp_final}</p>
            </div>

            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-3">
                진입 플랜
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <TimingRow label="현재 구간" value={data.entryPlan.current_zone} />
                <TimingRow label="진입 트리거" value={data.entryPlan.entry_trigger} />
                <TimingRow label="이상적 진입" value={data.entryPlan.ideal_entry} />
                <TimingRow label="손절" value={data.entryPlan.stop_loss} highlight="rose" />
                <TimingRow label="단기 목표" value={data.entryPlan.target_short} highlight="emerald" />
                <TimingRow label="장기 목표" value={data.entryPlan.target_long} highlight="emerald" />
                {data.entryPlan.partial_exit && (
                  <TimingRow label="부분 익절" value={data.entryPlan.partial_exit} highlight="amber" />
                )}
                {data.entryPlan.full_exit && (
                  <TimingRow label="완전 청산" value={data.entryPlan.full_exit} />
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">사이클·매크로</p>
                <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  {data.cycle.phase}
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-zinc-400">
                <p>
                  <span className="text-zinc-600">사이클 </span>
                  {data.cycle.cycle_comment}
                </p>
                <p>
                  <span className="text-zinc-600">매크로 </span>
                  {data.cycle.macro_comment}
                </p>
                <p>
                  <span className="text-zinc-600">온체인 </span>
                  {data.cycle.onchain_comment}
                </p>
                <p>
                  <span className="text-zinc-600">적정가 </span>
                  <span className="text-zinc-200">{data.cycle.fair_value_hint}</span>
                </p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-3">
                트레이더별 리뷰
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.traders.map((t) => (
                  <TraderCard key={t.trader} review={t} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type CoinMatch = { coinId: string; symbol: string; name: string; rank: number | null; thumb: string | null };
type SelectedReview = {
  coinId: string;
  name: string;
  symbol: string;
  reason?: string;
  type?: "major" | "alt" | "stable_hedge" | "short";
};

function CoinSearchReview({ onPick }: { onPick: (m: SelectedReview) => void }) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<CoinMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useState<{ id: ReturnType<typeof setTimeout> | null }>({ id: null })[0];

  const search = (v: string) => {
    setQ(v);
    if (timer.id) clearTimeout(timer.id);
    if (v.trim().length < 1) {
      setMatches([]);
      return;
    }
    timer.id = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/crypto/search?q=${encodeURIComponent(v.trim())}`);
        if (r.ok) setMatches((await r.json()) as CoinMatch[]);
      } finally {
        setBusy(false);
      }
    }, 300);
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
        임의 코인 분석 — 이름/심볼 검색
      </p>
      <input
        type="text"
        value={q}
        onChange={(e) => search(e.target.value)}
        placeholder="예: bitcoin, ETH, solana, render"
        className="w-full rounded border border-zinc-700 bg-black/30 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none"
      />
      {busy && <p className="mt-2 text-[10px] text-zinc-600 animate-pulse">검색 중…</p>}
      {matches.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 max-h-64 overflow-y-auto">
          {matches.map((m) => (
            <li key={m.coinId}>
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setMatches([]);
                  onPick({ coinId: m.coinId, name: m.name, symbol: m.symbol });
                }}
                className="flex w-full items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs hover:border-amber-500/40 hover:bg-zinc-900"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {m.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.thumb} alt="" className="h-4 w-4 rounded-full" />
                  )}
                  <span className="text-zinc-200 truncate">{m.name}</span>
                  <span className="font-mono text-[10px] text-zinc-500">{m.symbol}</span>
                </span>
                {m.rank && (
                  <span className="font-mono text-[10px] text-zinc-600">#{m.rank}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CoinRecommendations() {
  const [cache, setCache] = useState<CryptoRecommendationsCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<SelectedReview | null>(null);

  const fetchRecs = async (force = false) => {
    if (force) setGenerating(true);
    const res = await fetch("/api/crypto/recommendations", {
      method: force ? "POST" : "GET",
      headers: force ? { "Content-Type": "application/json" } : undefined,
      body: force ? JSON.stringify({ force: true }) : undefined,
    });
    if (res.ok) setCache((await res.json()) as CryptoRecommendationsCache);
    setLoading(false);
    setGenerating(false);
  };

  useEffect(() => {
    fetchRecs();
  }, []);

  const noData = !cache || cache.items.length === 0;

  return (
    <div className="space-y-4">
      <CoinSearchReview onPick={setSelected} />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs text-zinc-300 font-medium">JKP 코인 추천</p>
          {cache?.generatedAt ? (
            <p className="text-[10px] text-zinc-600 mt-0.5">
              {new Date(cache.generatedAt).toLocaleString("ko-KR")} 기준 · 6시간 캐시
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => fetchRecs(true)}
          disabled={generating}
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-50"
        >
          {generating ? "분석 중…" : noData ? "추천 생성" : "새로 생성"}
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-600 py-8 text-center animate-pulse">불러오는 중…</p>
      ) : noData ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center">
          <p className="text-xs text-zinc-600 mb-3">5명의 트레이더 관점으로 지금 주목할 코인을 선정합니다</p>
          <button
            type="button"
            onClick={() => fetchRecs(true)}
            disabled={generating}
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-50"
          >
            {generating ? "분석 중…" : "추천 생성"}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cache!.items.map((coin, i) => {
            const badge = TYPE_BADGE[coin.type] ?? TYPE_BADGE.alt;
            return (
              <button
                key={`${coin.coinId}-${i}`}
                type="button"
                onClick={() =>
                  setSelected({
                    coinId: coin.coinId,
                    name: coin.name,
                    symbol: coin.symbol,
                    reason: coin.reason,
                    type: coin.type,
                  })
                }
                className="text-left rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:border-amber-500/40 hover:bg-zinc-900/70 transition group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-white">{coin.name}</span>
                      <span className="font-mono text-[10px] text-zinc-500">{coin.symbol}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-amber-400 mt-1">{coin.theme}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
                      {coin.cycle_view}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${URGENCY_COLOR[coin.urgency]}`}>
                      {coin.urgency === "high" ? "긴급" : coin.urgency === "medium" ? "보통" : "여유"}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">{coin.reason}</p>
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <span className="text-emerald-400 font-mono">{coin.expected_move}</span>
                  <span className="text-zinc-600 group-hover:text-amber-400 transition">
                    트레이더 리뷰 →
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <ReviewModal
          coinId={selected.coinId}
          name={selected.name}
          symbol={selected.symbol}
          recommendationReason={selected.reason}
          recommendationType={selected.type}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
