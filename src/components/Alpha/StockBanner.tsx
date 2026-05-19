"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { FearIndexData } from "@/app/api/alpha/fear-index/route";
import type { AlertsResponse, PortfolioAlert } from "@/app/api/alpha/alerts/route";
import type { RecommendationsCache } from "@/app/api/alpha/recommendations/route";

const FEAR_PALETTE: Record<string, { bar: string; text: string; bg: string; border: string }> = {
  rose:    { bar: "bg-rose-500",    text: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30" },
  orange:  { bar: "bg-orange-500",  text: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30" },
  amber:   { bar: "bg-amber-500",   text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30" },
  zinc:    { bar: "bg-zinc-400",    text: "text-zinc-300",    bg: "bg-zinc-800",        border: "border-zinc-700" },
  emerald: { bar: "bg-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  cyan:    { bar: "bg-cyan-500",    text: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/30" },
};

const ALERT_ICON: Record<string, string> = { danger: "🔴", warning: "🟡", success: "🟢" };

function Chg({ v, size = "sm" }: { v: number | null; size?: "xs" | "sm" }) {
  if (v === null) return <span className="text-zinc-700">—</span>;
  const cls = v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-500";
  return (
    <span className={`font-mono ${size === "xs" ? "text-[10px]" : "text-xs"} ${cls}`}>
      {v > 0 ? "+" : ""}{v.toFixed(2)}%
    </span>
  );
}

function IndexCell({ label, price, change, decimals = 0 }: { label: string; price: number | null; change: number | null; decimals?: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[60px]">
      <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-600">{label}</span>
      <span className="text-xs font-mono font-semibold text-zinc-200">
        {price !== null ? price.toLocaleString("en-US", { maximumFractionDigits: decimals }) : "—"}
      </span>
      <Chg v={change} size="xs" />
    </div>
  );
}

export default function StockBanner() {
  const [fearData, setFearData] = useState<FearIndexData | null>(null);
  const [alertsData, setAlertsData] = useState<AlertsResponse | null>(null);
  const [recsData, setRecsData] = useState<RecommendationsCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [fearRes, alertsRes, recsRes] = await Promise.allSettled([
      fetch("/api/alpha/fear-index").then(r => r.ok ? r.json() as Promise<FearIndexData> : null),
      fetch("/api/alpha/alerts").then(r => r.ok ? r.json() as Promise<AlertsResponse> : null),
      fetch("/api/alpha/recommendations").then(r => r.ok ? r.json() as Promise<RecommendationsCache> : null),
    ]);
    if (fearRes.status === "fulfilled" && fearRes.value) setFearData(fearRes.value);
    if (alertsRes.status === "fulfilled" && alertsRes.value) setAlertsData(alertsRes.value);
    if (recsRes.status === "fulfilled" && recsRes.value) setRecsData(recsRes.value);
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const palette = fearData ? (FEAR_PALETTE[fearData.composite.color] ?? FEAR_PALETTE.zinc) : FEAR_PALETTE.zinc;
  const score = fearData?.composite.score ?? 50;
  const topAlerts = (alertsData?.alerts ?? []).slice(0, 3);
  const topRec = recsData?.items?.[0] ?? null;

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${palette.border} bg-zinc-950`}>
      {/* Ambient glow */}
      <div className={`pointer-events-none absolute inset-0 opacity-[0.03] ${palette.bar}`} style={{ filter: "blur(60px)" }} />

      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber-500/80">ALPHA MARKET</span>
          <span className="text-zinc-800">·</span>
          <span className="font-mono text-[10px] text-zinc-600">
            {lastUpdated ? lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "—"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchAll}
            disabled={loading}
            className="text-[10px] text-zinc-600 hover:text-zinc-300 transition disabled:opacity-40"
          >
            {loading ? "로딩…" : "↺ 새로고침"}
          </button>
          <Link href="/apps/alpha" className="text-[10px] text-amber-500/70 hover:text-amber-400 transition font-mono">
            ALPHA →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-0 sm:grid-cols-[200px_1fr]">
        {/* LEFT: Fear gauge */}
        <div className={`flex flex-col justify-between p-4 border-b sm:border-b-0 sm:border-r border-zinc-800/60 ${palette.bg}`}>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600 mb-1">복합 공포 지수</p>
            <div className="flex items-end gap-2 mb-2">
              <span className={`text-4xl font-black font-mono leading-none ${palette.text}`}>
                {loading ? "—" : score}
              </span>
              <span className={`text-sm font-semibold pb-0.5 ${palette.text}`}>
                {fearData?.composite.label ?? ""}
              </span>
            </div>
            {/* Score bar */}
            <div className="relative h-2 rounded-full bg-zinc-800 mb-3 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                style={{
                  width: `${score}%`,
                  background: "linear-gradient(to right, #10b981, #f59e0b, #ef4444)",
                  clipPath: `inset(0 ${100 - score}% 0 0)`,
                }}
              />
              {/* Clip trick for gradient */}
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                style={{
                  width: `${score}%`,
                  background: score >= 75 ? "#ef4444" : score >= 55 ? "#f97316" : score >= 45 ? "#6b7280" : score >= 25 ? "#10b981" : "#06b6d4",
                  opacity: 0.8,
                }}
              />
            </div>
            {/* Score labels */}
            <div className="flex justify-between text-[8px] font-mono text-zinc-700 mb-3">
              <span>탐욕</span><span>중립</span><span>공포</span>
            </div>
          </div>

          {/* VIX + VKOSPI */}
          <div className="space-y-1">
            {fearData?.vix.price !== null && fearData?.vix.price !== undefined && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono text-zinc-600">VIX</span>
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-semibold ${fearData.vix.level ? FEAR_PALETTE[fearData.vix.level.color]?.text ?? "text-zinc-300" : "text-zinc-300"}`}>
                    {fearData.vix.price.toFixed(1)}
                  </span>
                  <Chg v={fearData.vix.changePercent} size="xs" />
                </div>
              </div>
            )}
            {fearData?.vkospi.price !== null && fearData?.vkospi.price !== undefined && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono text-zinc-600">VKOSPI</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-zinc-300">{fearData.vkospi.price.toFixed(1)}</span>
                  <Chg v={fearData.vkospi.changePercent} size="xs" />
                </div>
              </div>
            )}
            {fearData?.cryptoFearGreed && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono text-zinc-600">코인 F&G</span>
                <span className="font-mono text-zinc-400">{fearData.cryptoFearGreed.value}</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Indices + Alerts + Rec */}
        <div className="flex flex-col gap-0 divide-y divide-zinc-800/60">
          {/* Indices row */}
          <div className="flex items-center gap-1 overflow-x-auto px-4 py-3 scrollbar-none">
            <IndexCell label="KOSPI" price={fearData?.kospi.price ?? null} change={fearData?.kospi.changePercent ?? null} />
            <div className="h-8 w-px bg-zinc-800 shrink-0 mx-1" />
            <IndexCell label="S&P500" price={fearData?.sp500.price ?? null} change={fearData?.sp500.changePercent ?? null} />
            <div className="h-8 w-px bg-zinc-800 shrink-0 mx-1" />
            <IndexCell label="NASDAQ" price={fearData?.nasdaq.price ?? null} change={fearData?.nasdaq.changePercent ?? null} />
            <div className="h-8 w-px bg-zinc-800 shrink-0 mx-1" />
            <IndexCell label="GOLD" price={fearData?.gold.price ?? null} change={fearData?.gold.changePercent ?? null} />
            <div className="h-8 w-px bg-zinc-800 shrink-0 mx-1" />
            <IndexCell label="DXY" price={fearData?.dxy.price ?? null} change={fearData?.dxy.changePercent ?? null} decimals={2} />
            <div className="h-8 w-px bg-zinc-800 shrink-0 mx-1" />
            <IndexCell label="10Y" price={fearData?.usTreasury10y.price ?? null} change={fearData?.usTreasury10y.changePercent ?? null} decimals={2} />
          </div>

          {/* Alerts */}
          <div className="px-4 py-3 space-y-1.5 min-h-[72px]">
            {loading && <p className="text-[11px] text-zinc-700 animate-pulse">시장 데이터 불러오는 중…</p>}
            {!loading && topAlerts.length === 0 && topRec === null && (
              <p className="text-[11px] text-zinc-700">포트폴리오 알림 없음 · 추천 종목 없음</p>
            )}
            {topAlerts.map((a: PortfolioAlert) => (
              <div key={`${a.holdingId}-${a.type}`} className="flex items-start gap-2">
                <span className="shrink-0 text-sm">{ALERT_ICON[a.level]}</span>
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-xs font-semibold text-zinc-200 shrink-0">{a.name}</span>
                  <span className="text-[11px] text-zinc-500 truncate">{a.message}</span>
                  {a.changePercent !== null && (
                    <Chg v={a.changePercent} size="xs" />
                  )}
                </div>
              </div>
            ))}
            {(alertsData?.alerts.length ?? 0) > 3 && (
              <p className="text-[10px] text-zinc-700 pl-5">
                +{(alertsData?.alerts.length ?? 0) - 3}개 알림 더 있음
              </p>
            )}
          </div>

          {/* JKP Top Rec */}
          {topRec && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/5">
              <span className="shrink-0 text-[9px] font-mono uppercase tracking-[0.2em] text-amber-500/60">JKP 추천</span>
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-xs font-semibold text-white">{topRec.name}</span>
                <span className="font-mono text-[10px] text-zinc-500">{topRec.ticker}</span>
                <span className="text-[10px] text-amber-400">{topRec.theme}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-mono
                  ${topRec.valuation_view.includes("저평가") ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" :
                    topRec.valuation_view.includes("고평가") ? "text-rose-400 border-rose-500/30 bg-rose-500/5" :
                    "text-zinc-400 border-zinc-700 bg-zinc-800"}`}
                >
                  {topRec.valuation_view}
                </span>
              </div>
              <span className="ml-auto shrink-0 text-xs font-mono font-bold text-emerald-400">{topRec.expected_move}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
