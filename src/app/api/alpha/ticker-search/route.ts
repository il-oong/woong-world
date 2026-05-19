import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";

export const dynamic = "force-dynamic";

type TickerMatch = {
  ticker: string;
  name: string;
  market: "KR" | "US" | "OTHER";
  exchange: string;
};

const US_EXCHANGES = new Set(["NYSE", "NASDAQ", "NMS", "NGM", "NCM", "ASE", "PCX"]);
const KR_EXCHANGE_CODES = new Set(["KOE", "KSC", "KSE"]);

function detectMarket(symbol: string, exchange: string): "KR" | "US" | "OTHER" {
  const sym = symbol.toUpperCase();
  const exch = exchange.toUpperCase();
  if (
    sym.endsWith(".KS") ||
    sym.endsWith(".KQ") ||
    exch.includes("KS") ||
    exch.includes("KQ") ||
    KR_EXCHANGE_CODES.has(exch)
  ) {
    return "KR";
  }
  if (US_EXCHANGES.has(exch)) return "US";
  return "OTHER";
}

function normalizeTicker(symbol: string, exchange: string): string {
  const exch = exchange.toUpperCase();
  if (
    KR_EXCHANGE_CODES.has(exch) &&
    !symbol.endsWith(".KS") &&
    !symbol.endsWith(".KQ")
  ) {
    return `${symbol}.KS`;
  }
  return symbol;
}

export async function GET(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json([], { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);

  try {
    const url =
      `https://query1.finance.yahoo.com/v1/finance/search` +
      `?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&enableFuzzyQuery=true&region=US,KR`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
      },
    });

    if (!res.ok) return NextResponse.json([]);

    const data = (await res.json()) as {
      quotes?: {
        symbol?: string;
        longname?: string;
        shortname?: string;
        exchange?: string;
        quoteType?: string;
      }[];
    };

    const quotes = data.quotes ?? [];

    const results: TickerMatch[] = quotes
      .filter((q) => q.quoteType === "EQUITY" && q.symbol)
      .map((q) => {
        const symbol = q.symbol!;
        const exchange = q.exchange ?? "";
        const market = detectMarket(symbol, exchange);
        const ticker = normalizeTicker(symbol, exchange);
        const name = q.longname ?? q.shortname ?? symbol;
        return { ticker, name, market, exchange };
      });

    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
