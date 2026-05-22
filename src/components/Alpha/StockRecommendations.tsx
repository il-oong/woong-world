"use client";

import { useEffect, useState } from "react";
import type { RecommendationsCache, StockRecommendation } from "@/app/api/alpha/recommendations/route";
import type { AgentReviewResult, AgentVerdict } from "@/app/api/alpha/agent-review/route";

const VALUATION_COLOR: Record<string, string> = {
  "심각저평가": "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  "저평가": "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  "적정": "text-zinc-400 bg-zinc-800 border-zinc-700",
  "고평가": "text-orange-400 bg-orange-500/10 border-orange-500/30",
  "심각고평가": "text-rose-400 bg-rose-500/10 border-rose-500/30",
};

const URGENCY_COLOR: Record<string, string> = {
  high: "text-rose-400 bg-rose-500/10",
  medium: "text-amber-400 bg-amber-500/10",
  low: "text-zinc-400 bg-zinc-800",
};

const VERDICT_COLOR: Record<AgentVerdict, string> = {
  "강력매수": "text-emerald-400 bg-emerald-500/20",
  "매수": "text-emerald-300 bg-emerald-500/10",
  "관망": "text-zinc-400 bg-zinc-800",
  "매도": "text-rose-300 bg-rose-500/10",
  "강력매도": "text-rose-400 bg-rose-500/20",
};

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color =
    score >= 70 ? "bg-emerald-500" :
    score >= 50 ? "bg-amber-500" : "bg-rose-500";
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

function AgentCard({ review }: { review: AgentReviewResult["agents"][0] }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-200">{review.agent}</p>
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

function ReviewModal({ ticker, name, market, recommendationReason, onClose }: { ticker: string; name: string; market: string; recommendationReason?: string; onClose: () => void }) {
  const [data, setData] = useState<AgentReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/alpha/agent-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, name, market, recommendationReason }),
    })
      .then((r) => r.json())
      .then((d) => { setData(d as AgentReviewResult); setLoading(false); })
      .catch(() => { setError("분석 실패"); setLoading(false); });
  }, [ticker, name, market]);

  const consensusColorClass = data ? (VERDICT_COLOR[data.consensus] ?? "text-zinc-300 bg-zinc-800") : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">에이전트 리뷰</p>
            <h2 className="text-lg font-bold text-white mt-0.5">{name}</h2>
            <p className="text-xs text-zinc-500 font-mono">{ticker}</p>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <div className="text-right">
                {data.currentPrice !== null && (
                  <p className="text-sm font-mono text-zinc-200">{data.currentPrice.toLocaleString()}</p>
                )}
                {data.changePercent !== null && (
                  <p className={`text-xs font-mono ${data.changePercent > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {data.changePercent > 0 ? "+" : ""}{data.changePercent.toFixed(2)}%
                  </p>
                )}
              </div>
            )}
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-xl leading-none">✕</button>
          </div>
        </div>

        {loading && (
          <p className="text-xs text-zinc-600 py-8 text-center animate-pulse">4명의 에이전트가 분석 중…</p>
        )}
        {error && <p className="text-xs text-rose-500 text-center">{error}</p>}

        {data && (
          <>
            {/* Consensus */}
            <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex-1">
                <p className="text-[10px] text-zinc-500 mb-1">에이전트 컨센서스</p>
                <ScoreBar score={data.consensusScore} label="" />
              </div>
              <span className={`rounded-lg border px-4 py-1.5 text-sm font-bold ${consensusColorClass}`}>
                {data.consensus}
              </span>
            </div>

            {/* JKP Final */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-amber-500/70 mb-1">JKP 최종 의견</p>
              <p className="text-sm text-amber-100 leading-relaxed">{data.jkp_final}</p>
            </div>

            {/* Buy Timing */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-3">매수 타이밍</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <TimingRow label="현재 스테이지" value={data.buyTiming.current_stage} />
                <TimingRow label="진입 트리거" value={data.buyTiming.entry_trigger} />
                <TimingRow label="이상적 진입가" value={data.buyTiming.ideal_entry} />
                <TimingRow label="손절 기준" value={data.buyTiming.stop_loss} highlight="rose" />
                <TimingRow label="단기 목표" value={data.buyTiming.target_short} highlight="emerald" />
                <TimingRow label="장기 목표" value={data.buyTiming.target_long} highlight="emerald" />
                {data.buyTiming.partial_exit && <TimingRow label="부분 매도" value={data.buyTiming.partial_exit} highlight="amber" />}
                {data.buyTiming.full_exit && <TimingRow label="완전 청산" value={data.buyTiming.full_exit} />}
              </div>
            </div>

            {/* Valuation */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">밸류에이션</p>
                <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${VALUATION_COLOR[data.valuation.view] ?? "text-zinc-400 border-zinc-700 bg-zinc-800"}`}>
                  {data.valuation.view}
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-zinc-400">
                <p><span className="text-zinc-600">P/E  </span>{data.valuation.pe_comment}</p>
                <p><span className="text-zinc-600">PBR  </span>{data.valuation.pb_comment}</p>
                <p><span className="text-zinc-600">성장성 </span>{data.valuation.growth_comment}</p>
                <p><span className="text-zinc-600">적정가 </span><span className="text-zinc-200">{data.valuation.intrinsic_value_hint}</span></p>
              </div>
            </div>

            {/* Agent Reviews */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-3">에이전트별 리뷰</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.agents.map((a) => <AgentCard key={a.agent} review={a} />)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type TickerMatch = { ticker: string; name: string; market: string };
type SelectedReview = { ticker: string; name: string; market: string; reason?: string };

function SearchReview({ onPick }: { onPick: (m: SelectedReview) => void }) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<TickerMatch[]>([]);
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
        const r = await fetch(`/api/alpha/ticker-search?q=${encodeURIComponent(v.trim())}`);
        if (r.ok) setMatches((await r.json()) as TickerMatch[]);
      } finally {
        setBusy(false);
      }
    }, 300);
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
        임의 종목 분석 — 종목명/티커 검색
      </p>
      <input
        type="text"
        value={q}
        onChange={(e) => search(e.target.value)}
        placeholder="예: 스타벅스, AAPL, 삼성전자, 005930"
        className="w-full rounded border border-zinc-700 bg-black/30 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none"
      />
      {busy && <p className="mt-2 text-[10px] text-zinc-600 animate-pulse">검색 중…</p>}
      {matches.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 max-h-64 overflow-y-auto">
          {matches.map((m) => (
            <li key={`${m.ticker}-${m.name}`}>
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setMatches([]);
                  onPick({ ticker: m.ticker, name: m.name, market: m.market });
                }}
                className="flex w-full items-center justify-between rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs hover:border-amber-500/40 hover:bg-zinc-900"
              >
                <span className="text-zinc-200">{m.name}</span>
                <span className="font-mono text-[10px] text-zinc-500">
                  {m.ticker} · {m.market}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function StockRecommendations() {
  const [cache, setCache] = useState<RecommendationsCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<SelectedReview | null>(null);

  const fetchRecs = async (force = false) => {
    if (force) setGenerating(true);
    const res = await fetch("/api/alpha/recommendations" + (force ? "" : ""), {
      method: force ? "POST" : "GET",
      headers: force ? { "Content-Type": "application/json" } : undefined,
      body: force ? JSON.stringify({ force: true }) : undefined,
    });
    if (res.ok) setCache(await res.json() as RecommendationsCache);
    setLoading(false);
    setGenerating(false);
  };

  useEffect(() => { fetchRecs(); }, []);

  const noData = !cache || cache.items.length === 0;

  return (
    <div className="space-y-4">
      <SearchReview onPick={setSelected} />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs text-zinc-300 font-medium">JKP 추천 종목</p>
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
          {generating ? "분석 중…" : noData ? "추천 종목 생성" : "새로 생성"}
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-600 py-8 text-center animate-pulse">불러오는 중…</p>
      ) : noData ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center">
          <p className="text-xs text-zinc-600 mb-3">JKP가 지금 주목할 종목을 선정합니다</p>
          <button
            type="button"
            onClick={() => fetchRecs(true)}
            disabled={generating}
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-50"
          >
            {generating ? "분석 중…" : "추천 종목 생성"}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cache!.items.map((stock, i) => (
            <button
              key={`${stock.ticker}-${i}`}
              type="button"
              onClick={() => setSelected(stock)}
              className="text-left rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:border-amber-500/40 hover:bg-zinc-900/70 transition group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-white">{stock.name}</span>
                    <span className="font-mono text-[10px] text-zinc-500">{stock.ticker}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${stock.market === "US" ? "bg-blue-500/10 text-blue-400" : "bg-zinc-800 text-zinc-400"}`}>
                      {stock.market}
                    </span>
                    {stock.type === "inverse" && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] bg-rose-500/15 text-rose-400 font-medium">인버스</span>
                    )}
                    {stock.type === "etf" && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] bg-violet-500/15 text-violet-400 font-medium">ETF</span>
                    )}
                  </div>
                  <p className="text-[10px] text-amber-400 mt-1">{stock.theme}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] ${VALUATION_COLOR[stock.valuation_view] ?? "text-zinc-400 border-zinc-700 bg-zinc-800"}`}>
                    {stock.valuation_view}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${URGENCY_COLOR[stock.urgency]}`}>
                    {stock.urgency === "high" ? "긴급" : stock.urgency === "medium" ? "보통" : "여유"}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">{stock.reason}</p>
              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className="text-emerald-400 font-mono">{stock.expected_move}</span>
                <span className="text-zinc-600 group-hover:text-amber-400 transition">에이전트 리뷰 →</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <ReviewModal
          ticker={selected.ticker}
          name={selected.name}
          market={selected.market}
          recommendationReason={selected.reason}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function TimingRow({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
      <p className="text-[10px] text-zinc-600 mb-0.5">{label}</p>
      <p className={`text-xs ${highlight === "rose" ? "text-rose-400" : highlight === "emerald" ? "text-emerald-400" : "text-zinc-300"}`}>
        {value}
      </p>
    </div>
  );
}
