import { NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { listHoldings } from "@/lib/alpha";

export const dynamic = "force-dynamic";

export type AlertLevel = "danger" | "warning" | "success";

export type PortfolioAlert = {
  holdingId: string;
  ticker: string;
  name: string;
  level: AlertLevel;
  type: "stop_loss" | "target1" | "target2" | "big_gain" | "big_loss";
  message: string;
  currentPrice: number;
  changePercent: number | null;
};

export type AlertsResponse = {
  alerts: PortfolioAlert[];
  fearScore: number | null;
  fearLabel: string | null;
};

async function fetchQuote(ticker: string): Promise<{ price: number | null; changePercent: number | null }> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return { price: null, changePercent: null };
    const data = (await res.json()) as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; regularMarketChangePercent?: number } }[] };
    };
    const meta = data.chart?.result?.[0]?.meta;
    return { price: meta?.regularMarketPrice ?? null, changePercent: meta?.regularMarketChangePercent ?? null };
  } catch {
    return { price: null, changePercent: null };
  }
}

async function fetchVix(): Promise<{ score: number | null; label: string | null }> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d",
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return { score: null, label: null };
    const data = (await res.json()) as { chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } };
    const vix = data.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    if (vix === null) return { score: null, label: null };
    const score = Math.min(100, Math.max(0, ((vix - 10) / 30) * 100));
    const label =
      score >= 75 ? "극단적 공포" :
      score >= 55 ? "공포" :
      score >= 45 ? "중립" :
      score >= 25 ? "탐욕" : "극단적 탐욕";
    return { score: Math.round(score), label };
  } catch {
    return { score: null, label: null };
  }
}

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [holdings, fearData] = await Promise.all([
    listHoldings(session.email),
    fetchVix(),
  ]);

  if (!holdings.length) {
    return NextResponse.json({ alerts: [], fearScore: fearData.score, fearLabel: fearData.label });
  }

  const quotes = await Promise.allSettled(
    holdings.map((h) => fetchQuote(h.ticker).then((q) => ({ ...q, holding: h }))),
  );

  const alerts: PortfolioAlert[] = [];

  quotes.forEach((r) => {
    if (r.status !== "fulfilled") return;
    const { price, changePercent, holding: h } = r.value;
    if (price === null) return;

    const profitPct = h.avgBuyPrice > 0 ? ((price - h.avgBuyPrice) / h.avgBuyPrice) * 100 : 0;

    // Stop loss alert
    if (h.stopLoss > 0 && price <= h.stopLoss) {
      alerts.push({
        holdingId: h.id, ticker: h.ticker, name: h.name,
        level: "danger", type: "stop_loss",
        message: `손절가 도달 — 현재 ${price.toLocaleString()} ≤ 손절 ${h.stopLoss.toLocaleString()}`,
        currentPrice: price, changePercent,
      });
    } else if (h.stopLoss > 0 && price <= h.stopLoss * 1.03) {
      alerts.push({
        holdingId: h.id, ticker: h.ticker, name: h.name,
        level: "warning", type: "stop_loss",
        message: `손절가 3% 이내 — 현재 ${price.toLocaleString()} / 손절 ${h.stopLoss.toLocaleString()}`,
        currentPrice: price, changePercent,
      });
    }

    // Target 2 hit
    if (h.target2 > 0 && price >= h.target2) {
      alerts.push({
        holdingId: h.id, ticker: h.ticker, name: h.name,
        level: "success", type: "target2",
        message: `목표가 2 달성! 현재 ${price.toLocaleString()} ≥ T2 ${h.target2.toLocaleString()} (+${profitPct.toFixed(1)}%)`,
        currentPrice: price, changePercent,
      });
    } else if (h.target1 > 0 && price >= h.target1) {
      alerts.push({
        holdingId: h.id, ticker: h.ticker, name: h.name,
        level: "success", type: "target1",
        message: `목표가 1 달성 — T2 ${h.target2.toLocaleString()} 노려볼 때`,
        currentPrice: price, changePercent,
      });
    }

    // Big move alerts
    if (changePercent !== null) {
      if (changePercent <= -5) {
        alerts.push({
          holdingId: h.id, ticker: h.ticker, name: h.name,
          level: "danger", type: "big_loss",
          message: `오늘 ${changePercent.toFixed(1)}% 급락 — 대응 필요`,
          currentPrice: price, changePercent,
        });
      } else if (changePercent >= 5) {
        alerts.push({
          holdingId: h.id, ticker: h.ticker, name: h.name,
          level: "success", type: "big_gain",
          message: `오늘 +${changePercent.toFixed(1)}% 급등 — 절반 매도 고려`,
          currentPrice: price, changePercent,
        });
      }
    }
  });

  // Sort: danger first
  alerts.sort((a, b) => {
    const order = { danger: 0, warning: 1, success: 2 };
    return order[a.level] - order[b.level];
  });

  return NextResponse.json({ alerts, fearScore: fearData.score, fearLabel: fearData.label });
}
