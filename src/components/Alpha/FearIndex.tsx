"use client";

import { useEffect, useState, useCallback } from "react";
import type { FearIndexData } from "@/app/api/alpha/fear-index/route";

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

export default function FearIndex() {
  const [data, setData] = useState<FearIndexData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const { composite, vix, vkospi, sp500, kospi, nasdaq, gold, usTreasury10y, dxy, cryptoFearGreed } = data;

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
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">주요 지수</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          <IndexRow label="S&P 500" price={sp500.price} chg={sp500.changePercent} decimals={0} />
          <IndexRow label="KOSPI" price={kospi.price} chg={kospi.changePercent} decimals={2} />
          <IndexRow label="NASDAQ" price={nasdaq.price} chg={nasdaq.changePercent} decimals={0} />
          <IndexRow label="금 (XAU/USD)" price={gold.price} chg={gold.changePercent} decimals={1} />
          <IndexRow label="미국 10Y 금리" price={usTreasury10y.price} chg={usTreasury10y.changePercent} suffix="%" decimals={3} />
          <IndexRow label="달러 인덱스" price={dxy.price} chg={dxy.changePercent} decimals={2} />
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
  chg,
  decimals = 2,
  suffix = "",
}: {
  label: string;
  price: number | null;
  chg: number | null;
  decimals?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-zinc-500 shrink-0">{label}</span>
      <div className="flex items-center gap-2">
        {price !== null ? (
          <span className="text-[11px] font-mono text-zinc-300">
            {price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
          </span>
        ) : (
          <span className="text-[11px] text-zinc-700">—</span>
        )}
        <Chg v={chg} />
      </div>
    </div>
  );
}
