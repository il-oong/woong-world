"use client";

import { useState, useRef } from "react";
import type { JkpAnalysisResult } from "@/lib/alpha";

const ACTION_COLOR: Record<string, string> = {
  매수: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  관망: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  매도: "text-rose-400 border-rose-500/40 bg-rose-500/10",
};

type TickerMatch = { ticker: string; name: string; market: string };

export default function JkpAnalysis() {
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [market, setMarket] = useState<"KR" | "US">("KR");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JkpAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [searchResults, setSearchResults] = useState<TickerMatch[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNameChange = (value: string) => {
    setName(value);
    setTicker("");
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length < 1) {
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/alpha/ticker-search?q=${encodeURIComponent(value.trim())}`);
        if (res.ok) {
          const data = await res.json() as TickerMatch[];
          setSearchResults(data);
        }
      } catch { /* ignore */ }
      finally { setSearchLoading(false); }
    }, 350);
  };

  const handleSelect = (match: TickerMatch) => {
    setTicker(match.ticker);
    setName(match.name);
    setMarket(match.market === "KR" ? "KR" : "US");
    setSearchResults([]);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    let resolvedTicker = ticker.trim();
    let resolvedName = name.trim();
    let resolvedMarket = market;
    if (!resolvedTicker) {
      try {
        const sr = await fetch(`/api/alpha/ticker-search?q=${encodeURIComponent(resolvedName)}`);
        if (sr.ok) {
          const matches = await sr.json() as TickerMatch[];
          if (matches.length > 0) {
            resolvedTicker = matches[0].ticker;
            resolvedName = matches[0].name;
            resolvedMarket = matches[0].market === "KR" ? "KR" : "US";
            setTicker(resolvedTicker);
            setName(resolvedName);
            setMarket(resolvedMarket);
          }
        }
      } catch { /* use name as-is */ }
    }

    const res = await fetch("/api/alpha/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: (resolvedTicker || resolvedName).toUpperCase(), name: resolvedName, market: resolvedMarket }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json() as { error?: string };
      setError(data.error ?? "분석 실패");
      return;
    }
    setResult(await res.json() as JkpAnalysisResult);
  };

  const actionColor = result ? (ACTION_COLOR[result.final_action] ?? "text-zinc-300 border-zinc-600 bg-zinc-800") : "";

  return (
    <div className="space-y-5">
      <form onSubmit={handleAnalyze} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">종목명</span>
          <div className="flex flex-col gap-1">
            <div className="relative flex items-center">
              <input
                required
                placeholder="삼성전자, AAPL, 엔비디아…"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className={`${inputCls} w-52`}
              />
              {searchLoading && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px]">⏳</span>
              )}
              {ticker && !searchLoading && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-400 text-[10px] font-mono">{ticker}</span>
              )}
            </div>
            {searchResults.length > 0 && (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900/95 overflow-hidden w-64">
                {searchResults.map((r) => (
                  <button
                    key={r.ticker}
                    type="button"
                    onClick={() => handleSelect(r)}
                    className="w-full px-3 py-2 text-xs hover:bg-zinc-800 flex items-center gap-2 text-left"
                  >
                    <span className="font-mono text-amber-400 shrink-0">{r.ticker}</span>
                    <span className="text-zinc-300 flex-1 truncate">{r.name}</span>
                    <span className={`rounded px-1 py-0.5 text-[10px] shrink-0 ${r.market === "KR" ? "bg-zinc-800 text-zinc-400" : "bg-blue-500/10 text-blue-400"}`}>
                      {r.market}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">시장</span>
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value as "KR" | "US")}
            className={`${inputCls} w-20`}
          >
            <option value="KR">KR</option>
            <option value="US">US</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-50"
        >
          {loading ? "JKP 분석 중…" : "JKP 분석"}
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-xs text-rose-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
          <p className="text-xs text-zinc-500 animate-pulse">JKP가 판단을 내리고 있습니다…</p>
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">JKP Analysis</p>
              <h3 className="mt-1 text-base font-semibold text-white">
                {ticker.toUpperCase()} · {name}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-md border px-3 py-1 text-sm font-bold ${actionColor}`}>
                {result.final_action}
              </span>
              <span className="text-xs text-zinc-500">확신 {result.confidence}%</span>
            </div>
          </div>

          {/* JKP Comment */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-amber-500/70 mb-1">JKP 코멘트</p>
            <p className="text-sm text-amber-100 leading-relaxed">{result.jkp_comment}</p>
          </div>

          {/* Price Targets */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Section title="매수 구간">
              <Row label="진입가" value={result.buy_zone.entry_price} />
              <Row label="진입 조건" value={result.buy_zone.entry_condition} />
              <Row label="추가 매수" value={result.buy_zone.additional_buy} />
            </Section>
            <Section title="목표가">
              <Row label="1차" value={`${result.target_price.target_1} — ${result.target_price.target_1_reason}`} />
              <Row label="2차" value={`${result.target_price.target_2} — ${result.target_price.target_2_reason}`} />
            </Section>
            <Section title="매도 플랜">
              {result.sell_plan ? (
                <>
                  <Row label="부분 매도" value={result.sell_plan.partial_exit} highlight="emerald" />
                  <Row label="완전 청산" value={result.sell_plan.full_exit} highlight="amber" />
                  <Row label="트레일링 스탑" value={result.sell_plan.trailing_stop} />
                </>
              ) : (
                <Row label="손절가" value={result.stop_loss} highlight="rose" />
              )}
            </Section>
            <Section title="손절 / 메타">
              <Row label="손절가" value={result.stop_loss} highlight="rose" />
              <Row label="손절 이유" value={result.stop_loss_reason} />
              <Row label="리스크/수익" value={result.risk_reward_ratio} />
              <Row label="투자 기간" value={result.time_horizon} />
            </Section>
          </div>

          {/* Catalysts & Risks */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">핵심 촉매</p>
              <ul className="space-y-1">
                {result.key_catalysts.map((c, i) => (
                  <li key={i} className="flex gap-2 text-xs text-zinc-300">
                    <span className="text-emerald-500 shrink-0">+</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">핵심 리스크</p>
              <ul className="space-y-1">
                {result.key_risks.map((r, i) => (
                  <li key={i} className="flex gap-2 text-xs text-zinc-300">
                    <span className="text-rose-500 shrink-0">!</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-1.5">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="shrink-0 text-zinc-600 w-16">{label}</span>
      <span className={highlight === "rose" ? "text-rose-400" : "text-zinc-300"}>{value}</span>
    </div>
  );
}

const inputCls =
  "rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-amber-500/50 focus:outline-none";
