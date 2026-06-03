import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const YF_HEADERS = { "User-Agent": "Mozilla/5.0" };

type QuoteResult = {
  ticker: string;
  price: number | null;
  changePercent: number | null;
  change15m: number | null;
  change30m: number | null;
  prev: number | null;
};

async function fetchYahoo(ticker: string): Promise<QuoteResult> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=5m&range=1d`;
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(7000) });
    if (!res.ok) return { ticker, price: null, changePercent: null, change15m: null, change30m: null, prev: null };
    type YahooChart = {
      chart?: {
        result?: {
          meta?: {
            regularMarketPrice?: number;
            regularMarketChangePercent?: number;
            chartPreviousClose?: number;
          };
          timestamp?: number[];
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[];
      };
    };
    const data = (await res.json()) as YahooChart;
    const meta = data.chart?.result?.[0]?.meta;
    const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const price = meta?.regularMarketPrice ?? null;
    const prev = meta?.chartPreviousClose ?? null;

    // compute 15m & 30m change
    const validCloses = closes.filter((v): v is number => v !== null && v !== undefined);
    const len = validCloses.length;
    const price15ago = len >= 3 ? validCloses[len - 4] : null;
    const price30ago = len >= 6 ? validCloses[len - 7] : null;

    const change15m = price && price15ago ? ((price - price15ago) / price15ago) * 100 : null;
    const change30m = price && price30ago ? ((price - price30ago) / price30ago) * 100 : null;

    return {
      ticker,
      price,
      changePercent: meta?.regularMarketChangePercent ?? null,
      change15m,
      change30m,
      prev,
    };
  } catch {
    return { ticker, price: null, changePercent: null, change15m: null, change30m: null, prev: null };
  }
}

export async function GET(req: NextRequest) {
  const tickers = req.nextUrl.searchParams.get("tickers")?.split(",").filter(Boolean) ?? [];
  if (!tickers.length) return NextResponse.json([]);

  const results = await Promise.all(tickers.slice(0, 30).map(fetchYahoo));
  return NextResponse.json(results);
}
