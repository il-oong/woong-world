"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { StockHolding } from "@/lib/alpha";
import type { AgentReviewResult } from "@/app/api/alpha/agent-review/route";

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

type TickerMatch = {
  ticker: string;
  name: string;
  market: "KR" | "US" | "OTHER";
  exchange: string;
};

type AgentSuggestion = {
  stop_loss: string;
  target_short: string;
  target_long: string;
  consensus: string;
  jkp_final: string;
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

/** Parse a price number from strings like "150,000원", "$145", "145.50" */
function parsePriceNumber(str: string): string {
  const match = str.replace(/,/g, "").match(/[\d]+(?:\.\d+)?/);
  return match ? match[0] : "";
}

export default function PortfolioSheet() {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<HoldingForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);

  // Cash balance
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [cashInput, setCashInput] = useState("");
  const [cashSaving, setCashSaving] = useState(false);

  // Ticker search state
  const [searchResults, setSearchResults] = useState<TickerMatch[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Agent suggestion state (form)
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentSuggestion, setAgentSuggestion] = useState<AgentSuggestion | null>(null);

  // Per-holding agent review state
  const [holdingAgentLoading, setHoldingAgentLoading] = useState<Record<string, boolean>>({});
  const [holdingAgentReview, setHoldingAgentReview] = useState<Record<string, AgentReviewResult>>({});
  const [holdingAgentOpen, setHoldingAgentOpen] = useState<Record<string, boolean>>({});
  const [holdingUpdating, setHoldingUpdating] = useState<Record<string, boolean>>({});

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
    fetch("/api/alpha/settings").then((r) => r.json()).then((d) => {
      if (typeof d.cashBalance === "number") {
        setCashBalance(d.cashBalance);
        setCashInput(d.cashBalance > 0 ? String(d.cashBalance) : "");
      }
    });
  }, [fetchHoldings]);

  useEffect(() => {
    if (holdings.length) fetchPrices(holdings);
  }, [holdings, fetchPrices]);

  async function saveCash() {
    const val = Number(cashInput.replace(/[^0-9]/g, "")) || 0;
    setCashSaving(true);
    const settings = await fetch("/api/alpha/settings").then((r) => r.json());
    await fetch("/api/alpha/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, cashBalance: val }),
    });
    setCashBalance(val);
    setCashSaving(false);
  }

  // Ticker name search with debounce
  const handleNameChange = (value: string) => {
    setForm((f) => ({ ...f, name: value }));
    setAgentSuggestion(null);

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
      } catch {
        // ignore
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  };

  const handleSelectTicker = (match: TickerMatch) => {
    const updated = {
      ticker: match.ticker,
      name: match.name,
      market: (match.market === "KR" ? "KR" : "US") as "KR" | "US",
    };
    setForm((f) => ({ ...f, ...updated }));
    setSearchResults([]);
    setAgentSuggestion(null);
    // Auto-trigger agent analysis
    setTimeout(() => {
      setAgentLoading(true);
      fetch("/api/alpha/agent-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: match.ticker, name: match.name, market: updated.market }),
      })
        .then((r) => r.ok ? r.json() as Promise<AgentReviewResult> : null)
        .then((data) => {
          if (data) {
            setAgentSuggestion({
              stop_loss: data.buyTiming?.stop_loss ?? "",
              target_short: data.buyTiming?.target_short ?? "",
              target_long: data.buyTiming?.target_long ?? "",
              consensus: data.consensus ?? "",
              jkp_final: data.jkp_final ?? "",
            });
          }
        })
        .catch(() => {})
        .finally(() => setAgentLoading(false));
    }, 50);
  };

  // Agent auto-fill for form
  const handleAgentSuggest = async () => {
    if (!form.ticker || !form.name) return;
    setAgentLoading(true);
    setAgentSuggestion(null);
    try {
      const res = await fetch("/api/alpha/agent-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: form.ticker, name: form.name, market: form.market }),
      });
      if (res.ok) {
        const data = await res.json() as AgentReviewResult;
        setAgentSuggestion({
          stop_loss: data.buyTiming?.stop_loss ?? "",
          target_short: data.buyTiming?.target_short ?? "",
          target_long: data.buyTiming?.target_long ?? "",
          consensus: data.consensus ?? "",
          jkp_final: data.jkp_final ?? "",
        });
      }
    } catch {
      // ignore
    } finally {
      setAgentLoading(false);
    }
  };

  const applyAgentSuggestion = () => {
    if (!agentSuggestion) return;
    setForm((f) => ({
      ...f,
      stopLoss: parsePriceNumber(agentSuggestion.stop_loss) || f.stopLoss,
      target1: parsePriceNumber(agentSuggestion.target_short) || f.target1,
      target2: parsePriceNumber(agentSuggestion.target_long) || f.target2,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    // ticker가 없으면 이름으로 자동 검색해서 첫 번째 결과 사용
    let resolvedForm = { ...form };
    if (!resolvedForm.ticker && resolvedForm.name) {
      try {
        const res = await fetch(`/api/alpha/ticker-search?q=${encodeURIComponent(resolvedForm.name.trim())}`);
        if (res.ok) {
          const matches = await res.json() as TickerMatch[];
          if (matches.length > 0) {
            resolvedForm = {
              ...resolvedForm,
              ticker: matches[0].ticker,
              name: matches[0].name,
              market: (matches[0].market === "KR" ? "KR" : "US") as "KR" | "US",
            };
            setForm(resolvedForm);
          }
        }
      } catch { /* ignore, proceed with name as-is */ }
    }

    const target1 = agentSuggestion ? parsePriceNumber(agentSuggestion.target_short) : resolvedForm.target1;
    const target2 = agentSuggestion ? parsePriceNumber(agentSuggestion.target_long) : resolvedForm.target2;
    const stopLoss = agentSuggestion ? parsePriceNumber(agentSuggestion.stop_loss) : resolvedForm.stopLoss;
    const res = await fetch("/api/alpha/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: (resolvedForm.ticker || resolvedForm.name).toUpperCase(),
        name: resolvedForm.name,
        market: resolvedForm.market,
        qty: resolvedForm.qty,
        avgBuyPrice: resolvedForm.avgBuyPrice,
        target1,
        target2,
        stopLoss,
        memo: resolvedForm.memo,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setForm(EMPTY_FORM);
      setShowForm(false);
      setAgentSuggestion(null);
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

  // Per-holding agent review
  const handleHoldingAgentReview = async (h: StockHolding) => {
    setHoldingAgentLoading((prev) => ({ ...prev, [h.id]: true }));
    try {
      const res = await fetch("/api/alpha/agent-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: h.ticker, name: h.name, market: h.market }),
      });
      if (res.ok) {
        const data = await res.json() as AgentReviewResult;
        setHoldingAgentReview((prev) => ({ ...prev, [h.id]: data }));
        setHoldingAgentOpen((prev) => ({ ...prev, [h.id]: true }));
      }
    } catch {
      // ignore
    } finally {
      setHoldingAgentLoading((prev) => ({ ...prev, [h.id]: false }));
    }
  };

  const handleApplyHoldingReview = async (h: StockHolding) => {
    const review = holdingAgentReview[h.id];
    if (!review) return;
    const stopLoss = parsePriceNumber(review.buyTiming?.stop_loss ?? "");
    const target1 = parsePriceNumber(review.buyTiming?.target_short ?? "");
    const target2 = parsePriceNumber(review.buyTiming?.target_long ?? "");

    setHoldingUpdating((prev) => ({ ...prev, [h.id]: true }));
    try {
      await fetch("/api/alpha/portfolio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: h.id,
          stopLoss: stopLoss ? Number(stopLoss) : h.stopLoss,
          target1: target1 ? Number(target1) : h.target1,
          target2: target2 ? Number(target2) : h.target2,
        }),
      });
      fetchHoldings();
      setHoldingAgentOpen((prev) => ({ ...prev, [h.id]: false }));
    } catch {
      // ignore
    } finally {
      setHoldingUpdating((prev) => ({ ...prev, [h.id]: false }));
    }
  };

  // 총 자산 계산
  const stockValue = holdings.reduce((sum, h) => {
    const price = prices[h.ticker]?.price;
    return sum + (price !== null && price !== undefined ? price * h.qty : h.avgBuyPrice * h.qty);
  }, 0);
  const stockCost = holdings.reduce((sum, h) => sum + h.avgBuyPrice * h.qty, 0);
  const totalAsset = stockValue + cashBalance;
  const totalProfitPct = stockCost > 0 ? ((stockValue - stockCost) / stockCost) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* 자산 요약 카드 */}
      {(holdings.length > 0 || cashBalance > 0) && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryCard label="총 자산" value={totalAsset} color="amber" />
          <SummaryCard label="주식 평가금" value={stockValue} color={stockValue >= stockCost ? "emerald" : "rose"} suffix={stockCost > 0 ? `${totalProfitPct >= 0 ? "+" : ""}${totalProfitPct.toFixed(1)}%` : undefined} />
          <SummaryCard label="매수 원가" value={stockCost} color="zinc" />
          <SummaryCard label="현금" value={cashBalance} color="blue" />
        </div>
      )}

      {/* 현금 보유금액 입력 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 flex items-center gap-3">
        <span className="text-xs text-zinc-400 shrink-0">현금 보유</span>
        <input
          value={cashInput}
          onChange={(e) => setCashInput(e.target.value)}
          onBlur={saveCash}
          onKeyDown={(e) => e.key === "Enter" && saveCash()}
          placeholder="₩0"
          className="flex-1 bg-transparent text-sm text-white text-right focus:outline-none placeholder-zinc-700 font-mono"
        />
        {cashSaving && <span className="text-[10px] text-zinc-600">저장 중…</span>}
      </div>

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
          {/* Step 1: 종목명 검색 */}
          <Field label="종목명 검색" required>
            <div className="relative flex items-center">
              <input
                required
                placeholder="삼성전자, AAPL, 엔비디아…"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className={inputCls}
              />
              {searchLoading && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px]">⏳</span>
              )}
              {form.ticker && !searchLoading && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-400 text-[10px] font-mono">{form.ticker}</span>
              )}
            </div>
            {searchResults.length > 0 && (
              <div className="mt-1 rounded-lg border border-zinc-700 bg-zinc-900/95 overflow-hidden">
                {searchResults.map((r) => (
                  <button
                    key={r.ticker}
                    type="button"
                    onClick={() => handleSelectTicker(r)}
                    className="w-full px-3 py-2 text-xs hover:bg-zinc-800 cursor-pointer flex items-center gap-2 text-left"
                  >
                    <span className="font-mono text-amber-400">{r.ticker}</span>
                    <span className="text-zinc-300 flex-1 truncate">{r.name}</span>
                    <span className={`rounded px-1 py-0.5 text-[10px] ${r.market === "KR" ? "bg-zinc-800 text-zinc-400" : "bg-blue-500/10 text-blue-400"}`}>
                      {r.market === "OTHER" ? r.exchange : r.market}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Field>

          {/* Step 2: 수량 + 매수가 */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="수량" required>
              <input
                required
                type="number"
                min="1"
                placeholder="10"
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
                placeholder="75000"
                value={form.avgBuyPrice}
                onChange={(e) => setForm((f) => ({ ...f, avgBuyPrice: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Agent auto-analysis — shown after ticker selected */}
          {form.ticker && (
            <div className="space-y-2">
              {agentLoading ? (
                <div className="flex items-center gap-2 text-[11px] text-amber-400">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border border-amber-400 border-t-transparent" />
                  JKP 에이전트 분석 중… 손절/목표가 자동 설정
                </div>
              ) : agentSuggestion ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-1.5">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[10px] text-zinc-500">JKP 자동 설정</span>
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-300">손절 {agentSuggestion.stop_loss}</span>
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">T1 {agentSuggestion.target_short}</span>
                    <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[11px] text-blue-300">T2 {agentSuggestion.target_long}</span>
                    <span className="rounded bg-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">{agentSuggestion.consensus}</span>
                  </div>
                  {agentSuggestion.jkp_final && (
                    <p className="text-[11px] text-zinc-400 italic">{agentSuggestion.jkp_final}</p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleAgentSuggest}
                  className="text-[11px] text-zinc-500 hover:text-amber-400 transition underline underline-offset-2"
                >
                  에이전트 분석 재시도
                </button>
              )}
            </div>
          )}

          <Field label="메모">
            <input
              placeholder="간단한 메모 (선택)"
              value={form.memo}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <button
            type="submit"
            disabled={saving || !form.name || !form.qty || !form.avgBuyPrice}
            className="rounded-md bg-amber-500/20 border border-amber-500/40 px-4 py-1.5 text-xs text-amber-300 hover:bg-amber-500/30 transition disabled:opacity-50"
          >
            {saving ? "검색 후 저장 중…" : "추가"}
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
            const agentReview = holdingAgentReview[h.id];
            const isAgentOpen = holdingAgentOpen[h.id];

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
                  <div className="flex-1 min-w-0">
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

                    {/* Per-holding agent review panel */}
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() =>
                          agentReview
                            ? setHoldingAgentOpen((prev) => ({ ...prev, [h.id]: !prev[h.id] }))
                            : handleHoldingAgentReview(h)
                        }
                        disabled={holdingAgentLoading[h.id]}
                        className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-amber-500/40 hover:text-amber-300 transition disabled:opacity-50 flex items-center gap-1"
                      >
                        {holdingAgentLoading[h.id] ? (
                          <>
                            <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-amber-400 border-t-transparent" />
                            분석 중…
                          </>
                        ) : (
                          <>에이전트 분석{agentReview ? (isAgentOpen ? " ▲" : " ▼") : ""}</>
                        )}
                      </button>

                      {agentReview && isAgentOpen && (
                        <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3 space-y-2 text-[11px]">
                          <div className="flex flex-wrap gap-2 items-center">
                            <span className={`rounded px-2 py-0.5 font-medium ${
                              agentReview.consensus === "강력매수" ? "bg-emerald-500/20 text-emerald-300" :
                              agentReview.consensus === "매수" ? "bg-green-500/20 text-green-300" :
                              agentReview.consensus === "매도" ? "bg-rose-500/20 text-rose-300" :
                              agentReview.consensus === "강력매도" ? "bg-red-600/20 text-red-400" :
                              "bg-zinc-700 text-zinc-300"
                            }`}>
                              {agentReview.consensus}
                            </span>
                            {agentReview.buyTiming?.stop_loss && (
                              <span className="rounded bg-rose-500/10 px-2 py-0.5 text-rose-300">
                                손절 {agentReview.buyTiming.stop_loss}
                              </span>
                            )}
                            {agentReview.buyTiming?.target_short && (
                              <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-300">
                                T1 {agentReview.buyTiming.target_short}
                              </span>
                            )}
                            {agentReview.buyTiming?.target_long && (
                              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                                T2 {agentReview.buyTiming.target_long}
                              </span>
                            )}
                          </div>
                          {agentReview.jkp_final && (
                            <p className="text-zinc-400 italic">{agentReview.jkp_final}</p>
                          )}
                          <button
                            type="button"
                            onClick={() => handleApplyHoldingReview(h)}
                            disabled={holdingUpdating[h.id]}
                            className="rounded bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-[11px] text-amber-300 hover:bg-amber-500/30 transition disabled:opacity-50"
                          >
                            {holdingUpdating[h.id] ? "업데이트 중…" : "이 값으로 업데이트"}
                          </button>
                        </div>
                      )}
                    </div>
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

function SummaryCard({ label, value, color, suffix }: { label: string; value: number; color: string; suffix?: string }) {
  const cls: Record<string, string> = {
    amber: "text-amber-400 border-amber-500/20 bg-amber-500/5",
    emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    rose: "text-rose-400 border-rose-500/20 bg-rose-500/5",
    blue: "text-blue-400 border-blue-500/20 bg-blue-500/5",
    zinc: "text-zinc-400 border-zinc-700 bg-zinc-800/40",
  };
  const c = cls[color] ?? cls.zinc;
  return (
    <div className={`rounded-xl border p-3 ${c}`}>
      <p className="text-[10px] text-zinc-500 mb-1 leading-tight">{label}</p>
      <p className={`text-sm font-bold font-mono ${c.split(" ")[0]}`}>
        ₩{value.toLocaleString()}
      </p>
      {suffix && <p className={`text-[10px] font-mono mt-0.5 ${c.split(" ")[0]}`}>{suffix}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white placeholder-zinc-600 focus:border-amber-500/50 focus:outline-none";
