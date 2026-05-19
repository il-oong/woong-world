"use client";

import { useEffect, useState, useCallback } from "react";
import type { WatchItem } from "@/lib/alpha";

type PriceData = { price: number | null; changePercent: number | null };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/alpha/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: ticker.toUpperCase(), name, market, memo }),
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
            <label className="flex flex-col gap-1 col-span-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">티커 *</span>
              <input required placeholder="AAPL" value={ticker} onChange={(e) => setTicker(e.target.value)} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 col-span-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">종목명 *</span>
              <input required placeholder="Apple" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
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
