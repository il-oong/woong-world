"use client";

import { useEffect, useState, useCallback } from "react";
import type { StockHolding } from "@/lib/alpha";

type PriceData = {
  price: number | null;
  changePercent: number | null;
};

type HoldingForm = {
  ticker: string;
  name: string;
  market: "KR" | "US";
  qty: string;
  avgBuyPrice: string;
  target1: string;
  target2: string;
  stopLoss: string;
  memo: string;
};

const EMPTY_FORM: HoldingForm = {
  ticker: "",
  name: "",
  market: "KR",
  qty: "",
  avgBuyPrice: "",
  target1: "",
  target2: "",
  stopLoss: "",
  memo: "",
};

function pct(current: number, base: number): number {
  return base > 0 ? ((current - base) / base) * 100 : 0;
}

function PctBadge({ value }: { value: number }) {
  const cls =
    value > 0
      ? "text-emerald-400"
      : value < 0
        ? "text-rose-400"
        : "text-zinc-500";
  return (
    <span className={`text-xs font-mono ${cls}`}>
      {value > 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

export default function PortfolioSheet() {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<HoldingForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);

  const fetchHoldings = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/alpha/portfolio");
    if (res.ok) {
      const data = await res.json() as StockHolding[];
      setHoldings(data);
    }
    setLoading(false);
  }, []);

  const fetchPrices = useCallback(async (items: StockHolding[]) => {
    if (!items.length) return;
    setPriceLoading(true);
    const results = await Promise.allSettled(
      items.map((h) =>
        fetch(`/api/alpha/price?ticker=${encodeURIComponent(h.ticker)}`)
          .then((r) => r.json() as Promise<PriceData & { ticker: string }>),
      ),
    );
    const next: Record<string, PriceData> = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value.price !== undefined) {
        next[items[i].ticker] = { price: r.value.price, changePercent: r.value.changePercent };
      }
    });
    setPrices(next);
    setPriceLoading(false);
  }, []);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  useEffect(() => {
    if (holdings.length) fetchPrices(holdings);
  }, [holdings, fetchPrices]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/alpha/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: form.ticker.toUpperCase(),
        name: form.name,
        market: form.market,
        qty: form.qty,
        avgBuyPrice: form.avgBuyPrice,
        target1: form.target1,
        target2: form.target2,
        stopLoss: form.stopLoss,
        memo: form.memo,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setForm(EMPTY_FORM);
      setShowForm(false);
      fetchHoldings();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch("/api/alpha/portfolio", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchHoldings();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {holdings.length}종목 보유
          {priceLoading && <span className="ml-2 text-zinc-600">시세 조회 중…</span>}
        </p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-amber-500/50 hover:text-amber-300 transition"
        >
          {showForm ? "취소" : "+ 종목 추가"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="티커" required>
              <input
                required
                placeholder="005930.KS"
                value={form.ticker}
                onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="종목명" required>
              <input
                required
                placeholder="삼성전자"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="시장">
              <select
                value={form.market}
                onChange={(e) => setForm((f) => ({ ...f, market: e.target.value as "KR" | "US" }))}
                className={inputCls}
              >
                <option value="KR">KR</option>
                <option value="US">US</option>
              </select>
            </Field>
            <Field label="수량" required>
              <input
                required
                type="number"
                min="1"
                value={form.qty}
                onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="평균 매수가" required>
              <input
                required
                type="number"
                min="0"
                value={form.avgBuyPrice}
                onChange={(e) => setForm((f) => ({ ...f, avgBuyPrice: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="목표가 1">
              <input
                type="number"
                min="0"
                value={form.target1}
                onChange={(e) => setForm((f) => ({ ...f, target1: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="목표가 2">
              <input
                type="number"
                min="0"
                value={form.target2}
                onChange={(e) => setForm((f) => ({ ...f, target2: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="손절가">
              <input
                type="number"
                min="0"
                value={form.stopLoss}
                onChange={(e) => setForm((f) => ({ ...f, stopLoss: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="메모">
            <input
              placeholder="간단한 메모"
              value={form.memo}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-amber-500/20 border border-amber-500/40 px-4 py-1.5 text-xs text-amber-300 hover:bg-amber-500/30 transition disabled:opacity-50"
          >
            {saving ? "저장 중…" : "추가"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-zinc-600 py-8 text-center">불러오는 중…</p>
      ) : holdings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center text-xs text-zinc-600">
          보유 종목을 추가하세요
        </div>
      ) : (
        <div className="space-y-2">
          {holdings.map((h) => {
            const pd = prices[h.ticker];
            const currentPrice = pd?.price ?? null;
            const profitPct = currentPrice !== null ? pct(currentPrice, h.avgBuyPrice) : null;
            const nearStop = currentPrice !== null && h.stopLoss > 0 && currentPrice <= h.stopLoss * 1.03;
            const nearTarget1 = currentPrice !== null && h.target1 > 0 && currentPrice >= h.target1 * 0.97;
            const nearTarget2 = currentPrice !== null && h.target2 > 0 && currentPrice >= h.target2 * 0.97;

            return (
              <div
                key={h.id}
                className={`rounded-xl border p-4 ${
                  nearStop
                    ? "border-rose-500/40 bg-rose-500/5"
                    : nearTarget2
                      ? "border-emerald-400/40 bg-emerald-500/5"
                      : nearTarget1
                        ? "border-amber-400/40 bg-amber-500/5"
                        : "border-zinc-800 bg-zinc-900/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-white">{h.name}</span>
                      <span className="font-mono text-[10px] text-zinc-500">{h.ticker}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
                          h.market === "US"
                            ? "bg-blue-500/10 text-blue-400"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {h.market}
                      </span>
                      {nearStop && (
                        <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-400">
                          ⚠ 손절 근접
                        </span>
                      )}
                      {nearTarget2 && (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-400">
                          🎯 목표2 근접
                        </span>
                      )}
                      {!nearTarget2 && nearTarget1 && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">
                          🎯 목표1 근접
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-zinc-500">
                      <span>{h.qty}주</span>
                      <span>매수 {h.avgBuyPrice.toLocaleString()}</span>
                      {currentPrice !== null && (
                        <span className="text-zinc-300">
                          현재 {currentPrice.toLocaleString()}
                        </span>
                      )}
                      {profitPct !== null && <PctBadge value={profitPct} />}
                      {pd?.changePercent !== null && pd?.changePercent !== undefined && (
                        <span className="text-[10px] text-zinc-600">
                          오늘 <PctBadge value={pd.changePercent} />
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex gap-3 text-[11px] text-zinc-600">
                      {h.target1 > 0 && <span>T1: {h.target1.toLocaleString()}</span>}
                      {h.target2 > 0 && <span>T2: {h.target2.toLocaleString()}</span>}
                      {h.stopLoss > 0 && <span className="text-rose-500/70">SL: {h.stopLoss.toLocaleString()}</span>}
                    </div>
                    {h.memo && <p className="mt-1 text-[11px] text-zinc-600">{h.memo}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(h.id)}
                    className="shrink-0 rounded p-1 text-zinc-600 hover:text-rose-400 transition"
                    aria-label="삭제"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
        {label}
        {required && <span className="text-rose-400 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white placeholder-zinc-600 focus:border-amber-500/50 focus:outline-none";
