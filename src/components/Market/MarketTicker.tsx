"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { CustomTicker } from "@/lib/market";

type QuoteResult = {
  ticker: string;
  price: number | null;
  changePercent: number | null;
  change15m: number | null;
  change30m: number | null;
  prev: number | null;
};

type IntervalTab = "daily" | "15m" | "30m";

function pct(v: number | null) {
  if (v === null) return null;
  return v;
}

function ChangeCell({ v, compact }: { v: number | null; compact?: boolean }) {
  if (v === null) return <span className="text-zinc-700 font-mono text-xs">-</span>;
  const pos = v > 0;
  const neg = v < 0;
  const cls = pos ? "text-emerald-400" : neg ? "text-rose-400" : "text-zinc-500";
  return (
    <span className={`font-mono ${compact ? "text-[11px]" : "text-xs"} ${cls}`}>
      {pos ? "+" : ""}{v.toFixed(2)}%
    </span>
  );
}

type AddTickerForm = {
  ticker: string;
  name: string;
  prefix: string;
};

export default function MarketTicker() {
  const [tickers, setTickers] = useState<CustomTicker[]>([]);
  const [quotes, setQuotes] = useState<Map<string, QuoteResult>>(new Map());
  const [tab, setTab] = useState<IntervalTab>("daily");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [addForm, setAddForm] = useState<AddTickerForm | null>(null);
  const [addQuery, setAddQuery] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTickers = useCallback(async () => {
    const res = await fetch("/api/market/tickers");
    if (res.ok) setTickers(await res.json());
  }, []);

  const fetchQuotes = useCallback(async (list: CustomTicker[]) => {
    if (!list.length) return;
    setRefreshing(true);
    const syms = list.map((t) => t.ticker).join(",");
    const res = await fetch(`/api/market/ticker?tickers=${encodeURIComponent(syms)}`);
    if (res.ok) {
      const data = (await res.json()) as QuoteResult[];
      setQuotes(new Map(data.map((q) => [q.ticker, q])));
      setLastAt(new Date());
    }
    setRefreshing(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTickers();
  }, [fetchTickers]);

  useEffect(() => {
    if (!tickers.length) return;
    fetchQuotes(tickers);
    intervalRef.current = setInterval(() => fetchQuotes(tickers), 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tickers, fetchQuotes]);

  const removeTicker = async (ticker: string) => {
    const next = tickers.filter((t) => t.ticker !== ticker);
    setTickers(next);
    await fetch("/api/market/tickers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
  };

  const addTicker = async () => {
    if (!addForm?.ticker.trim() || !addForm?.name.trim()) return;
    const t: CustomTicker = {
      ticker: addForm.ticker.trim().toUpperCase(),
      name: addForm.name.trim(),
      market: "US",
      source: "yahoo",
      prefix: addForm.prefix || "$",
    };
    const next = [...tickers, t];
    setTickers(next);
    setAddForm(null);
    setAddQuery("");
    await fetch("/api/market/tickers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    fetchQuotes(next);
  };

  const getChange = (q: QuoteResult): number | null => {
    if (tab === "daily") return pct(q.changePercent);
    if (tab === "15m") return pct(q.change15m);
    return pct(q.change30m);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-zinc-800">
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">자동 갱신 시세창</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-600">
            {lastAt ? lastAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "—"}
          </span>
          <button
            onClick={() => fetchQuotes(tickers)}
            disabled={refreshing}
            className="text-[10px] text-zinc-600 hover:text-zinc-300 transition disabled:opacity-40"
          >
            {refreshing ? "⟳" : "↺"}
          </button>
        </div>
      </div>

      {/* Interval tabs */}
      <div className="flex border-b border-zinc-800 shrink-0">
        {(["daily", "15m", "30m"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-[10px] font-mono uppercase transition ${
              tab === t ? "text-amber-400 border-b border-amber-400 -mb-px" : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {t === "daily" ? "일간" : t}
          </button>
        ))}
      </div>

      {/* Add ticker bar */}
      <div className="px-2 py-2 border-b border-zinc-800 shrink-0">
        {addForm !== null ? (
          <div className="flex flex-col gap-1.5">
            <input
              autoFocus
              placeholder="티커 (예: AAPL, ^KS11)"
              value={addForm.ticker}
              onChange={(e) => setAddForm((f) => f && ({ ...f, ticker: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addTicker()}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none"
            />
            <input
              placeholder="종목명"
              value={addForm.name}
              onChange={(e) => setAddForm((f) => f && ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addTicker()}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none"
            />
            <div className="flex gap-1.5">
              <button onClick={addTicker} className="flex-1 py-1 rounded bg-amber-500/20 text-amber-300 text-[11px] hover:bg-amber-500/30 transition">추가</button>
              <button onClick={() => { setAddForm(null); setAddQuery(""); }} className="px-3 py-1 rounded bg-zinc-800 text-zinc-400 text-[11px] hover:bg-zinc-700 transition">취소</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddForm({ ticker: addQuery, name: "", prefix: "" })}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded border border-dashed border-zinc-800 hover:border-zinc-600 text-[11px] text-zinc-600 hover:text-zinc-400 transition"
          >
            <span className="text-base leading-none">+</span>
            <span>종목·코드·지수 추가</span>
          </button>
        )}
      </div>

      {/* Ticker list */}
      <div className="flex-1 overflow-y-auto">
        {/* Column header */}
        <div className="grid grid-cols-[1fr_auto_auto] px-3 py-1 border-b border-zinc-800/50">
          <span className="text-[9px] font-mono text-zinc-700 uppercase">지표</span>
          <span className="text-[9px] font-mono text-zinc-700 uppercase text-right pr-3">현재가</span>
          <span className="text-[9px] font-mono text-zinc-700 uppercase text-right w-16">{tab === "daily" ? "일간" : tab}</span>
        </div>

        {loading ? (
          <div className="px-3 py-8 text-center text-[11px] text-zinc-700 animate-pulse">로딩 중…</div>
        ) : (
          tickers.map((t) => {
            const q = quotes.get(t.ticker);
            const change = q ? getChange(q) : null;
            const price = q?.price ?? null;
            return (
              <div
                key={t.ticker}
                className="group grid grid-cols-[1fr_auto_auto] items-center px-3 py-1.5 hover:bg-zinc-900/60 border-b border-zinc-800/30"
              >
                {/* Name + source */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs text-zinc-300 truncate">{t.name}</span>
                  <button
                    onClick={() => removeTicker(t.ticker)}
                    className="hidden group-hover:inline text-[9px] text-zinc-700 hover:text-rose-400 transition ml-auto shrink-0"
                  >
                    ✕
                  </button>
                </div>

                {/* Price */}
                <div className="text-right pr-3">
                  <span className="font-mono text-xs text-zinc-200">
                    {price !== null
                      ? `${t.prefix ?? ""}${price.toLocaleString("en-US", { maximumFractionDigits: t.ticker.includes("KRW") ? 0 : 2 })}`
                      : "—"}
                  </span>
                </div>

                {/* Change */}
                <div className="w-16 text-right">
                  <ChangeCell v={change} compact />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
