import { NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";

export const dynamic = "force-dynamic";

const YF_HEADERS = { "User-Agent": "Mozilla/5.0" };

type TickerQuote = {
  price: number | null;
  changePercent: number | null;
  prev: number | null;
};

async function fetchYahooQuote(ticker: string): Promise<TickerQuote> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: YF_HEADERS,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { price: null, changePercent: null, prev: null };
    const data = (await res.json()) as {
      chart?: {
        result?: {
          meta?: { regularMarketPrice?: number; regularMarketChangePercent?: number };
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[];
      };
    };
    const meta = data.chart?.result?.[0]?.meta;
    const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const validCloses = closes.filter((v): v is number => v !== null && v !== undefined);
    const prev = validCloses.length >= 2 ? validCloses[validCloses.length - 2] : null;
    return {
      price: meta?.regularMarketPrice ?? null,
      changePercent: meta?.regularMarketChangePercent ?? null,
      prev,
    };
  } catch {
    return { price: null, changePercent: null, prev: null };
  }
}

async function fetchCryptoFearGreed(): Promise<{ value: number; label: string } | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { value?: string; value_classification?: string }[];
    };
    const item = data.data?.[0];
    if (!item?.value) return null;
    return {
      value: Number(item.value),
      label: item.value_classification ?? "",
    };
  } catch {
    return null;
  }
}

function vixLevel(vix: number): { label: string; color: string } {
  if (vix >= 35) return { label: "극단적 공포", color: "rose" };
  if (vix >= 25) return { label: "공포", color: "orange" };
  if (vix >= 18) return { label: "불안", color: "amber" };
  if (vix >= 12) return { label: "보통", color: "zinc" };
  return { label: "안도/탐욕", color: "emerald" };
}

function fearScore(vix: number | null, vkospi: number | null, cryptoFG: number | null): number {
  let total = 0;
  let weight = 0;

  if (vix !== null) {
    // VIX: 10→0점, 40→100점 (공포 점수)
    const score = Math.min(100, Math.max(0, ((vix - 10) / 30) * 100));
    total += score * 0.4;
    weight += 0.4;
  }
  if (vkospi !== null) {
    const score = Math.min(100, Math.max(0, ((vkospi - 10) / 30) * 100));
    total += score * 0.25;
    weight += 0.25;
  }
  if (cryptoFG !== null) {
    // Crypto F&G: 반전 (높을수록 탐욕 → 낮을수록 공포)
    const score = 100 - cryptoFG;
    total += score * 0.35;
    weight += 0.35;
  }

  return weight > 0 ? Math.round(total / weight) : 50;
}

function compositeLabel(score: number): { label: string; color: string } {
  if (score >= 75) return { label: "극단적 공포", color: "rose" };
  if (score >= 55) return { label: "공포", color: "orange" };
  if (score >= 45) return { label: "중립", color: "zinc" };
  if (score >= 25) return { label: "탐욕", color: "emerald" };
  return { label: "극단적 탐욕", color: "cyan" };
}

export type FearIndexData = {
  composite: { score: number; label: string; color: string };
  vix: { price: number | null; changePercent: number | null; level: { label: string; color: string } | null };
  vkospi: { price: number | null; changePercent: number | null; level: { label: string; color: string } | null };
  sp500: { price: number | null; changePercent: number | null };
  kospi: { price: number | null; changePercent: number | null };
  nasdaq: { price: number | null; changePercent: number | null };
  gold: { price: number | null; changePercent: number | null };
  usTreasury10y: { price: number | null; changePercent: number | null };
  dxy: { price: number | null; changePercent: number | null };
  cryptoFearGreed: { value: number; label: string } | null;
  fetchedAt: number;
};

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [vixQ, vkospiQ, sp500Q, kospiQ, nasdaqQ, goldQ, tnxQ, dxyQ, cryptoFG] =
    await Promise.all([
      fetchYahooQuote("^VIX"),
      fetchYahooQuote("^VKOSPI"),
      fetchYahooQuote("^GSPC"),
      fetchYahooQuote("^KS11"),
      fetchYahooQuote("^IXIC"),
      fetchYahooQuote("GC=F"),
      fetchYahooQuote("^TNX"),
      fetchYahooQuote("DX-Y.NYB"),
      fetchCryptoFearGreed(),
    ]);

  const score = fearScore(vixQ.price, vkospiQ.price, cryptoFG?.value ?? null);
  const composite = { score, ...compositeLabel(score) };

  const result: FearIndexData = {
    composite,
    vix: {
      price: vixQ.price,
      changePercent: vixQ.changePercent,
      level: vixQ.price !== null ? vixLevel(vixQ.price) : null,
    },
    vkospi: {
      price: vkospiQ.price,
      changePercent: vkospiQ.changePercent,
      level: vkospiQ.price !== null ? vixLevel(vkospiQ.price) : null,
    },
    sp500: { price: sp500Q.price, changePercent: sp500Q.changePercent },
    kospi: { price: kospiQ.price, changePercent: kospiQ.changePercent },
    nasdaq: { price: nasdaqQ.price, changePercent: nasdaqQ.changePercent },
    gold: { price: goldQ.price, changePercent: goldQ.changePercent },
    usTreasury10y: { price: tnxQ.price, changePercent: tnxQ.changePercent },
    dxy: { price: dxyQ.price, changePercent: dxyQ.changePercent },
    cryptoFearGreed: cryptoFG,
    fetchedAt: Date.now(),
  };

  return NextResponse.json(result);
}
