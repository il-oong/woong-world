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

// 로컬 폴백: 검색어와 이름/티커가 일치하는 경우 즉시 반환
const LOCAL_STOCKS: TickerMatch[] = [
  { ticker: "005930.KS", name: "삼성전자", market: "KR", exchange: "KSC" },
  { ticker: "000660.KS", name: "SK하이닉스", market: "KR", exchange: "KSC" },
  { ticker: "035420.KS", name: "NAVER", market: "KR", exchange: "KSC" },
  { ticker: "035720.KS", name: "카카오", market: "KR", exchange: "KSC" },
  { ticker: "051910.KS", name: "LG화학", market: "KR", exchange: "KSC" },
  { ticker: "006400.KS", name: "삼성SDI", market: "KR", exchange: "KSC" },
  { ticker: "207940.KS", name: "삼성바이오로직스", market: "KR", exchange: "KSC" },
  { ticker: "005380.KS", name: "현대차", market: "KR", exchange: "KSC" },
  { ticker: "000270.KS", name: "기아", market: "KR", exchange: "KSC" },
  { ticker: "068270.KS", name: "셀트리온", market: "KR", exchange: "KSC" },
  { ticker: "105560.KS", name: "KB금융", market: "KR", exchange: "KSC" },
  { ticker: "055550.KS", name: "신한지주", market: "KR", exchange: "KSC" },
  { ticker: "086790.KS", name: "하나금융지주", market: "KR", exchange: "KSC" },
  { ticker: "032830.KS", name: "삼성생명", market: "KR", exchange: "KSC" },
  { ticker: "003550.KS", name: "LG", market: "KR", exchange: "KSC" },
  { ticker: "096770.KS", name: "SK이노베이션", market: "KR", exchange: "KSC" },
  { ticker: "017670.KS", name: "SK텔레콤", market: "KR", exchange: "KSC" },
  { ticker: "030200.KS", name: "KT", market: "KR", exchange: "KSC" },
  { ticker: "066570.KS", name: "LG전자", market: "KR", exchange: "KSC" },
  { ticker: "012330.KS", name: "현대모비스", market: "KR", exchange: "KSC" },
  { ticker: "028260.KS", name: "삼성물산", market: "KR", exchange: "KSC" },
  { ticker: "034730.KS", name: "SK", market: "KR", exchange: "KSC" },
  { ticker: "003490.KS", name: "대한항공", market: "KR", exchange: "KSC" },
  { ticker: "009150.KS", name: "삼성전기", market: "KR", exchange: "KSC" },
  { ticker: "000100.KS", name: "유한양행", market: "KR", exchange: "KSC" },
  { ticker: "018260.KS", name: "삼성에스디에스", market: "KR", exchange: "KSC" },
  { ticker: "373220.KS", name: "LG에너지솔루션", market: "KR", exchange: "KSC" },
  { ticker: "247540.KS", name: "에코프로비엠", market: "KR", exchange: "KSC" },
  { ticker: "086520.KS", name: "에코프로", market: "KR", exchange: "KSC" },
  { ticker: "011200.KS", name: "HMM", market: "KR", exchange: "KSC" },
  { ticker: "042700.KS", name: "한미반도체", market: "KR", exchange: "KSC" },
  { ticker: "078930.KS", name: "GS", market: "KR", exchange: "KSC" },
  { ticker: "010130.KS", name: "고려아연", market: "KR", exchange: "KSC" },
  { ticker: "032640.KS", name: "LG유플러스", market: "KR", exchange: "KSC" },
  { ticker: "316140.KS", name: "우리금융지주", market: "KR", exchange: "KSC" },
  { ticker: "259960.KS", name: "크래프톤", market: "KR", exchange: "KSC" },
  { ticker: "293490.KS", name: "카카오게임즈", market: "KR", exchange: "KSQ" },
  { ticker: "352820.KS", name: "하이브", market: "KR", exchange: "KSC" },
  { ticker: "041510.KS", name: "에스엠", market: "KR", exchange: "KSQ" },
  { ticker: "122630.KS", name: "KODEX 레버리지", market: "KR", exchange: "KSC" },
  { ticker: "114800.KS", name: "KODEX 인버스", market: "KR", exchange: "KSC" },
  { ticker: "252670.KS", name: "KODEX 200선물인버스2X", market: "KR", exchange: "KSC" },
  { ticker: "AAPL",    name: "Apple",          market: "US", exchange: "NASDAQ" },
  { ticker: "MSFT",    name: "Microsoft",      market: "US", exchange: "NASDAQ" },
  { ticker: "NVDA",    name: "NVIDIA",         market: "US", exchange: "NASDAQ" },
  { ticker: "AMZN",    name: "Amazon",         market: "US", exchange: "NASDAQ" },
  { ticker: "GOOGL",   name: "Alphabet",       market: "US", exchange: "NASDAQ" },
  { ticker: "META",    name: "Meta Platforms", market: "US", exchange: "NASDAQ" },
  { ticker: "TSLA",    name: "Tesla",          market: "US", exchange: "NASDAQ" },
  { ticker: "AVGO",    name: "Broadcom",       market: "US", exchange: "NASDAQ" },
  { ticker: "AMD",     name: "AMD",            market: "US", exchange: "NASDAQ" },
  { ticker: "INTC",    name: "Intel",          market: "US", exchange: "NASDAQ" },
  { ticker: "NFLX",    name: "Netflix",        market: "US", exchange: "NASDAQ" },
  { ticker: "ORCL",    name: "Oracle",         market: "US", exchange: "NYSE" },
  { ticker: "CRM",     name: "Salesforce",     market: "US", exchange: "NYSE" },
  { ticker: "JPM",     name: "JPMorgan Chase", market: "US", exchange: "NYSE" },
  { ticker: "GS",      name: "Goldman Sachs",  market: "US", exchange: "NYSE" },
  { ticker: "BAC",     name: "Bank of America",market: "US", exchange: "NYSE" },
  { ticker: "SPY",     name: "S&P 500 ETF",    market: "US", exchange: "NYSE" },
  { ticker: "QQQ",     name: "Nasdaq 100 ETF", market: "US", exchange: "NASDAQ" },
  { ticker: "SQQQ",    name: "ProShares UltraPro Short QQQ", market: "US", exchange: "NASDAQ" },
  { ticker: "TQQQ",    name: "ProShares UltraPro QQQ", market: "US", exchange: "NASDAQ" },
  { ticker: "SOXS",    name: "Direxion Semiconductor Bear 3X", market: "US", exchange: "NASDAQ" },
  { ticker: "SOXX",    name: "iShares Semiconductor ETF", market: "US", exchange: "NASDAQ" },
  { ticker: "GLD",     name: "SPDR Gold Shares ETF", market: "US", exchange: "NYSE" },
  { ticker: "SH",      name: "ProShares Short S&P500", market: "US", exchange: "NYSE" },
  { ticker: "COIN",    name: "Coinbase",       market: "US", exchange: "NASDAQ" },
  { ticker: "PLTR",    name: "Palantir",       market: "US", exchange: "NYSE" },
];

function localSearch(q: string): TickerMatch[] {
  const lower = q.toLowerCase();
  return LOCAL_STOCKS.filter(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      s.ticker.toLowerCase().includes(lower),
  ).slice(0, 8);
}

function detectMarket(symbol: string, exchange: string): "KR" | "US" | "OTHER" {
  const sym = symbol.toUpperCase();
  const exch = exchange.toUpperCase();
  if (sym.endsWith(".KS") || sym.endsWith(".KQ") || exch.includes("KS") || exch.includes("KQ") || KR_EXCHANGE_CODES.has(exch)) return "KR";
  if (US_EXCHANGES.has(exch)) return "US";
  return "OTHER";
}

function normalizeTicker(symbol: string, exchange: string): string {
  const exch = exchange.toUpperCase();
  if (KR_EXCHANGE_CODES.has(exch) && !symbol.endsWith(".KS") && !symbol.endsWith(".KQ")) {
    return `${symbol}.KS`;
  }
  return symbol;
}

async function yahooSearch(q: string): Promise<TickerMatch[]> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://finance.yahoo.com/",
  };
  const params = `?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&enableFuzzyQuery=true&region=KR,US&lang=ko-KR`;

  for (const base of ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]) {
    try {
      const res = await fetch(`${base}/v1/finance/search${params}`, {
        headers,
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        quotes?: { symbol?: string; longname?: string; shortname?: string; exchange?: string; quoteType?: string }[];
      };
      const quotes = data.quotes ?? [];
      const results = quotes
        .filter((q) => (q.quoteType === "EQUITY" || q.quoteType === "ETF") && q.symbol)
        .map((q) => {
          const symbol = q.symbol!;
          const exchange = q.exchange ?? "";
          return {
            ticker: normalizeTicker(symbol, exchange),
            name: q.longname ?? q.shortname ?? symbol,
            market: detectMarket(symbol, exchange),
            exchange,
          };
        });
      if (results.length > 0) return results;
    } catch { /* try next */ }
  }
  return [];
}

export async function GET(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json([], { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);

  // 로컬 먼저 — 즉각 응답
  const local = localSearch(q);

  // Yahoo 병렬 — 성공하면 합쳐서 반환
  const remote = await yahooSearch(q);

  if (remote.length > 0) {
    // 로컬 결과 중 remote에 없는 것만 뒤에 추가
    const remoteTickers = new Set(remote.map((r) => r.ticker));
    const merged = [...remote, ...local.filter((l) => !remoteTickers.has(l.ticker))];
    return NextResponse.json(merged.slice(0, 10));
  }

  // Yahoo 실패 시 로컬만 반환
  return NextResponse.json(local);
}
