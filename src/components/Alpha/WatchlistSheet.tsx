"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { WatchItem } from "@/lib/alpha";

type PriceData = { price: number | null; changePercent: number | null };

type TickerMatch = {
  ticker: string;
  name: string;
  market: "KR" | "US" | "OTHER";
  exchange: string;
};

export default function WatchlistSheet() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [market, setMarket] = useState<"KR" | "US">("KR");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  // Ticker search state
  const [searchResults, setSearchResults] = useState<TickerMatch[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/alpha/watchlist");
    if (res.ok) setItems(await res.json() as WatchItem[]);
    setLoading(false);
  }, []);

  const fetchPrices = useCallback(async (list: WatchItem[]) => {
    if (!list.length) return;
    const results = await Promise.allSettled(
      list.map((w) =>
        fetch(`/api/alpha/price?ticker=${encodeURIComponent(w.ticker)}`).then(
          (r) => r.json() as Promise<PriceData & { ticker: string }>,
        ),
      ),
    );
    const next: Record<string, PriceData> = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value.price !== undefined) {
        next[list[i].ticker] = { price: r.value.price, changePercent: r.value.changePercent };
      }
    });
    setPrices(next);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { if (items.length) fetchPrices(items); }, [items, fetchPrices]);

  // Ticker name search with debounce
  const handleNameChange = (value: string) => {
    setName(value);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (value.trim().length < 1) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/alpha/ticker-search?q=${encodeURIComponent(value.trim())}`);
        if (res.ok) {
          const data = await res.json() as TickerMatch[];
          setSearchResults(data);
          setShowDropdown(data.length > 0);
        }
      } catch {
        // ignore
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  };

  const handleSelectTicker = (match: TickerMatch) => {
    setTicker(match.ticker);
    setName(match.name);
    setMarket(match.market === "KR" ? "KR" : "US");
    setShowDropdown(false);
    setSearchResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    // 티커 없으면 종목명으로 자동 검색
    let resolvedTicker = ticker.trim();
    let resolvedName = name.trim();
    let resolvedMarket = market;
    if (!resolvedTicker && resolvedName) {
      try {
        const sr = await fetch(`/api/alpha/ticker-search?q=${encodeURIComponent(resolvedName)}`);
        if (sr.ok) {
          const matches = await sr.json() as { ticker: string; name: string; market: string }[];
          if (matches.length > 0) {
            resolvedTicker = matches[0].ticker;
            resolvedName = matches[0].name;
            resolvedMarket = matches[0].market === "KR" ? "KR" : "US";
          }
        }
      } catch { /* use name as-is */ }
    }

    const res = await fetch("/api/alpha/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: (resolvedTicker || resolvedName).toUpperCase(), name: resolvedName, market: resolvedMarket, memo }),
    });
    setSaving(false);
    if (res.ok) {
      setTicker(""); setName(""); setMemo("");
      setShowForm(false);
      fetchItems();
    }
  };

  const handleDelete = async (id: string) => {
    await fetch("/api/alpha/watchlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchItems();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">{items.length}종목 관심</p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-amber-500/50 hover:text-amber-300 transition"
        >
          {showForm ? "취소" : "+ 추가"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">종목명 *</span>
              <div className="relative">
                <div className="relative flex items-center">
                  <input
                    required
                    placeholder="삼성전자, AAPL, 엔비디아…"
                    value={name}
                    onChange={(e) => { handleNameChange(e.target.value); setTicker(""); }}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                    className={inputCls}
                  />
                  {searchLoading && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px]">
                      ⏳
                    </span>
                  )}
                </div>
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
                    {searchResults.map((r) => (
                      <div
                        key={r.ticker}
                        onMouseDown={() => handleSelectTicker(r)}
                        className="px-3 py-2 text-xs hover:bg-zinc-800 cursor-pointer flex items-center gap-2"
                      >
                        <span className="font-mono text-amber-400">{r.ticker}</span>
                        <span className="text-zinc-300 flex-1 truncate">{r.name}</span>
                        <span className={`rounded px-1 py-0.5 text-[10px] ${r.market === "KR" ? "bg-zinc-800 text-zinc-400" : "bg-blue-500/10 text-blue-400"}`}>
                          {r.market === "OTHER" ? r.exchange : r.market}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">시장</span>
              <select value={market} onChange={(e) => setMarket(e.target.value as "KR" | "US")} className={inputCls}>
                <option value="KR">KR</option>
                <option value="US">US</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">메모</span>
              <input placeholder="메모" value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} />
            </label>
          </div>
          <button type="submit" disabled={saving} className="rounded-md bg-amber-500/20 border border-amber-500/40 px-4 py-1.5 text-xs text-amber-300 hover:bg-amber-500/30 transition disabled:opacity-50">
            {saving ? "저장 중…" : "추가"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-zinc-600 py-8 text-center">불러오는 중…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center text-xs text-zinc-600">
          관심 종목을 추가하세요
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((w) => {
            const pd = prices[w.ticker];
            return (
              <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <span className="font-medium text-sm text-white">{w.name}</span>
                  <span className="font-mono text-[10px] text-zinc-500">{w.ticker}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${w.market === "US" ? "bg-blue-500/10 text-blue-400" : "bg-zinc-800 text-zinc-400"}`}>
                    {w.market}
                  </span>
                  {pd?.price !== null && pd?.price !== undefined && (
                    <span className="text-xs text-zinc-300">{pd.price.toLocaleString()}</span>
                  )}
                  {pd?.changePercent !== null && pd?.changePercent !== undefined && (
                    <span className={`text-xs font-mono ${pd.changePercent > 0 ? "text-emerald-400" : pd.changePercent < 0 ? "text-rose-400" : "text-zinc-500"}`}>
                      {pd.changePercent > 0 ? "+" : ""}{pd.changePercent.toFixed(2)}%
                    </span>
                  )}
                  {w.memo && <span className="text-[11px] text-zinc-600">{w.memo}</span>}
                </div>
                <button type="button" onClick={() => handleDelete(w.id)} className="shrink-0 rounded p-1 text-zinc-600 hover:text-rose-400 transition" aria-label="삭제">
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white placeholder-zinc-600 focus:border-amber-500/50 focus:outline-none";
