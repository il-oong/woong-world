"use client";

import { useEffect, useState, useCallback } from "react";
import type { FearIndexData } from "@/app/api/alpha/fear-index/route";
import type { MarketGuidance } from "@/app/api/alpha/market-guidance/route";

const COLOR: Record<string, string> = {
  rose: "text-rose-400",
  orange: "text-orange-400",
  amber: "text-amber-400",
  zinc: "text-zinc-400",
  emerald: "text-emerald-400",
  cyan: "text-cyan-400",
};

const BG: Record<string, string> = {
  rose: "bg-rose-500/10 border-rose-500/30",
  orange: "bg-orange-500/10 border-orange-500/30",
  amber: "bg-amber-500/10 border-amber-500/30",
  zinc: "bg-zinc-800 border-zinc-700",
  emerald: "bg-emerald-500/10 border-emerald-500/30",
  cyan: "bg-cyan-500/10 border-cyan-500/30",
};

function Chg({ v }: { v: number | null }) {
  if (v === null) return <span className="text-zinc-600">—</span>;
  const cls = v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-500";
  return (
    <span className={`text-xs font-mono ${cls}`}>
      {v > 0 ? "+" : ""}{v.toFixed(2)}%
    </span>
  );
}

function Num({ v, decimals = 2 }: { v: number | null; decimals?: number }) {
  if (v === null) return <span className="text-zinc-600">—</span>;
  return <span className="text-xs text-zinc-200 font-mono">{v.toFixed(decimals)}</span>;
}

const STANCE_LABEL: Record<string, string> = {
  bullish: "강세 (매수)",
  bearish: "약세 (매도)",
  neutral: "중립 (관망)",
  cautious: "신중 (축소)",
};
const STANCE_COLOR: Record<string, string> = {
  bullish: "text-emerald-400",
  bearish: "text-rose-400",
  neutral: "text-zinc-400",
  cautious: "text-amber-400",
};

export default function FearIndex() {
  const [data, setData] = useState<FearIndexData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<MarketGuidance | null>(null);
  const [guidanceLoading, setGuidanceLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/alpha/fear-index");
    if (res.ok) {
      setData(await res.json() as FearIndexData);
    } else {
      setError("데이터 수집 실패");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    // Load cached guidance on mount
    fetch("/api/alpha/market-guidance")
      .then((r) => r.ok ? r.json() as Promise<MarketGuidance | null> : null)
      .then((g) => { if (g) setGuidance(g); })
      .catch(() => {});
  }, [fetchData]);

  async function fetchGuidance() {
    if (!data || guidanceLoading) return;
    setGuidanceLoading(true);
    const marketContext = buildMarketContext(data);
    const res = await fetch("/api/alpha/market-guidance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketContext }),
    });
    if (res.ok) setGuidance(await res.json() as MarketGuidance);
    setGuidanceLoading(false);
  }

  function buildMarketContext(d: FearIndexData): string {
    const lines = [
      `시장 공포 지수: ${d.composite.score} (${d.composite.label})`,
      d.sp500.price !== null ? `S&P500: ${d.sp500.price.toFixed(0)} (${d.sp500.changePercent?.toFixed(2)}%)` : "",
      d.kospi.price !== null ? `KOSPI: ${d.kospi.price.toFixed(2)} (${d.kospi.changePercent?.toFixed(2)}%)` : "",
      d.nasdaq.price !== null ? `NASDAQ: ${d.nasdaq.price.toFixed(0)} (${d.nasdaq.changePercent?.toFixed(2)}%)` : "",
      d.vix.price !== null ? `VIX: ${d.vix.price.toFixed(2)} — ${d.vix.level?.label ?? ""}` : "",
      d.gold.price !== null ? `금: ${d.gold.price.toFixed(1)} (${d.gold.changePercent?.toFixed(2)}%)` : "",
      d.oil?.price !== null ? `WTI 원유: ${d.oil.price?.toFixed(2)} (${d.oil.changePercent?.toFixed(2)}%)` : "",
      d.bitcoin?.price !== null ? `비트코인: ${d.bitcoin.price?.toFixed(0)} (${d.bitcoin.changePercent?.toFixed(2)}%)` : "",
      d.semiconductor?.price !== null ? `반도체(SOXX): ${d.semiconductor.price?.toFixed(2)} (${d.semiconductor.changePercent?.toFixed(2)}%)` : "",
      d.usdKrw?.price !== null ? `달러/원: ${d.usdKrw.price?.toFixed(2)}` : "",
      d.usTreasury10y.price !== null ? `미국 10Y 금리: ${d.usTreasury10y.price.toFixed(3)}%` : "",
      d.cryptoFearGreed !== null ? `크립토 공포·탐욕: ${d.cryptoFearGreed?.value} (${d.cryptoFearGreed?.label})` : "",
    ].filter(Boolean);
    return lines.join("\n");
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <p className="text-xs text-zinc-600 animate-pulse">시장 데이터 수집 중…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex items-center justify-between">
        <p className="text-xs text-zinc-600">{error ?? "데이터 없음"}</p>
        <button type="button" onClick={fetchData} className="text-xs text-zinc-500 hover:text-zinc-300 transition">새로고침</button>
      </div>
    );
  }

  const { composite, vix, vkospi, sp500, kospi, nasdaq, gold, usTreasury10y, dxy, cryptoFearGreed, oil, silver, bitcoin, semiconductor, usdKrw } = data;

  return (
    <div className="space-y-3">
      {/* Composite gauge */}
      <div className={`rounded-xl border p-4 ${BG[composite.color]}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">시장 공포 지수</p>
            <div className="mt-1 flex items-baseline gap-3">
              <span className={`text-3xl font-bold font-mono ${COLOR[composite.color]}`}>{composite.score}</span>
              <span className={`text-sm font-medium ${COLOR[composite.color]}`}>{composite.label}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-right">
            <p className="text-[10px] text-zinc-600">
              {new Date(data.fetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준
            </p>
            <button type="button" onClick={fetchData} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition text-right">
              새로고침
            </button>
          </div>
        </div>

        {/* Score bar */}
        <div className="mt-3 relative h-2 w-full rounded-full bg-zinc-800">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all ${
              composite.color === "rose" ? "bg-rose-500" :
              composite.color === "orange" ? "bg-orange-500" :
              composite.color === "amber" ? "bg-amber-500" :
              composite.color === "emerald" ? "bg-emerald-500" :
              composite.color === "cyan" ? "bg-cyan-500" : "bg-zinc-500"
            }`}
            style={{ width: `${composite.score}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-zinc-600">
          <span>극단적 탐욕 0</span>
          <span>중립 50</span>
          <span>100 극단적 공포</span>
        </div>
      </div>

      {/* Volatility */}
      <div className="grid grid-cols-2 gap-2">
        <Panel title="VIX (미국 변동성)">
          <div className="flex items-center justify-between">
            <Num v={vix.price} />
            <Chg v={vix.changePercent} />
          </div>
          {vix.level && (
            <p className={`text-[10px] mt-1 ${COLOR[vix.level.color]}`}>{vix.level.label}</p>
          )}
        </Panel>
        <Panel title="VKOSPI (한국 변동성)">
          <div className="flex items-center justify-between">
            <Num v={vkospi.price} />
            <Chg v={vkospi.changePercent} />
          </div>
          {vkospi.level && (
            <p className={`text-[10px] mt-1 ${COLOR[vkospi.level.color]}`}>{vkospi.level.label}</p>
          )}
        </Panel>
      </div>

      {/* Major Indices */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">주요 지수 — 전날 대비</p>
        <div className="space-y-2">
          <IndexRow label="S&P 500" price={sp500.price} change={sp500.change} chg={sp500.changePercent} decimals={0} />
          <IndexRow label="KOSPI" price={kospi.price} change={kospi.change} chg={kospi.changePercent} decimals={2} />
          <IndexRow label="NASDAQ" price={nasdaq.price} change={nasdaq.change} chg={nasdaq.changePercent} decimals={0} />
          <IndexRow label="금 (XAU/USD)" price={gold.price} change={gold.change} chg={gold.changePercent} decimals={1} />
          <IndexRow label="미국 10Y 금리" price={usTreasury10y.price} change={usTreasury10y.change} chg={usTreasury10y.changePercent} suffix="%" decimals={3} />
          <IndexRow label="달러 인덱스" price={dxy.price} change={dxy.change} chg={dxy.changePercent} decimals={2} />
        </div>
      </div>

      {/* Crypto F&G */}
      {cryptoFearGreed && (
        <Panel title="크립토 공포·탐욕 지수">
          <div className="flex items-center gap-3">
            <span className={`text-xl font-bold font-mono ${
              cryptoFearGreed.value <= 24 ? "text-rose-400" :
              cryptoFearGreed.value <= 44 ? "text-orange-400" :
              cryptoFearGreed.value <= 55 ? "text-zinc-400" :
              cryptoFearGreed.value <= 74 ? "text-emerald-400" : "text-cyan-400"
            }`}>
              {cryptoFearGreed.value}
            </span>
            <span className="text-xs text-zinc-400">{cryptoFearGreed.label}</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full ${
                cryptoFearGreed.value <= 24 ? "bg-rose-500" :
                cryptoFearGreed.value <= 44 ? "bg-orange-500" :
                cryptoFearGreed.value <= 55 ? "bg-zinc-500" :
                cryptoFearGreed.value <= 74 ? "bg-emerald-500" : "bg-cyan-500"
              }`}
              style={{ width: `${cryptoFearGreed.value}%` }}
            />
          </div>
        </Panel>
      )}

      {/* Extended indicators */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">원자재 · 자산 — 전날 대비</p>
        <div className="space-y-2">
          <IndexRow label="WTI 원유" price={oil?.price ?? null} change={oil?.change ?? null} chg={oil?.changePercent ?? null} decimals={2} />
          <IndexRow label="은 (XAG)" price={silver?.price ?? null} change={silver?.change ?? null} chg={silver?.changePercent ?? null} decimals={2} />
          <IndexRow label="비트코인" price={bitcoin?.price ?? null} change={bitcoin?.change ?? null} chg={bitcoin?.changePercent ?? null} decimals={0} />
          <IndexRow label="반도체(SOXX)" price={semiconductor?.price ?? null} change={semiconductor?.change ?? null} chg={semiconductor?.changePercent ?? null} decimals={2} />
          <IndexRow label="달러/원" price={usdKrw?.price ?? null} change={usdKrw?.change ?? null} chg={usdKrw?.changePercent ?? null} decimals={2} />
        </div>
      </div>

      {/* JKP Market Guidance */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400">JKP 행동 지침</p>
          <button
            type="button"
            onClick={fetchGuidance}
            disabled={guidanceLoading}
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 transition"
          >
            {guidanceLoading ? "분석 중…" : guidance ? "재생성" : "지침 생성"}
          </button>
        </div>

        {guidance ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500">JKP 포지션</span>
              <span className={`text-xs font-semibold ${STANCE_COLOR[guidance.stance] ?? "text-zinc-400"}`}>
                {STANCE_LABEL[guidance.stance] ?? guidance.stance}
              </span>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 mb-1">오늘의 지침</p>
              <p className="text-xs text-zinc-200 leading-relaxed">{guidance.today}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 mb-1">주간 전략</p>
              <p className="text-xs text-zinc-200 leading-relaxed">{guidance.week}</p>
            </div>
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
              <p className="text-[10px] text-rose-400/70 mb-0.5">핵심 리스크</p>
              <p className="text-xs text-zinc-300">{guidance.keyRisk}</p>
            </div>
            <p className="text-[9px] text-zinc-700">
              {new Date(guidance.generatedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} 생성
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-zinc-600">
            현재 지표를 기반으로 JKP의 오늘/주간 행동 지침을 생성합니다.
          </p>
        )}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">{title}</p>
      {children}
    </div>
  );
}

function IndexRow({
  label,
  price,
  change,
  chg,
  decimals = 2,
  suffix = "",
}: {
  label: string;
  price: number | null;
  change?: number | null;
  chg: number | null;
  decimals?: number;
  suffix?: string;
}) {
  const isUp = (change ?? chg ?? 0) > 0;
  const isDown = (change ?? chg ?? 0) < 0;
  const barColor = isUp ? "bg-emerald-500" : isDown ? "bg-rose-500" : "bg-zinc-600";

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-zinc-500 w-28 shrink-0">{label}</span>
      <div className={`w-0.5 h-3.5 rounded-full shrink-0 ${barColor}`} />
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {price !== null ? (
          <span className="text-[11px] font-mono text-zinc-300 shrink-0">
            {price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
          </span>
        ) : (
          <span className="text-[11px] text-zinc-700 shrink-0">—</span>
        )}
        {change !== null && change !== undefined && (
          <span className={`text-[10px] font-mono shrink-0 ${isUp ? "text-emerald-400" : isDown ? "text-rose-400" : "text-zinc-500"}`}>
            {isUp ? "+" : ""}{change.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
          </span>
        )}
        <Chg v={chg} />
      </div>
    </div>
  );
}
