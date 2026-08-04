// =============================================================================
// 주식 에이전트 네트워크 (Stock Agent Network)
// -----------------------------------------------------------------------------
// "뇌대리"(lib/gemini.ts)가 주식 질문을 위임하는 하위 에이전트들의 공용 구현.
// 모든 분석은 Yahoo Finance 실시간 데이터에 근거한다. 데이터가 없으면 "데이터
// 없음"으로 남기고 절대 수치를 지어내지 않는다.
//
//   · gatherMarketData()        — 종목별 실시간 시세/펀더멘털/뉴스 1회 수집
//   · runJkpAnalysis()          — JKP(전 Bridgewater) 단일종목 분석 에이전트
//   · runAgentReview()          — O'Neil·Lynch·Weinstein·Minervini 5인 합의
//   · fetchMarketSnapshot()     — 거시 지표 스냅샷 (VIX·지수·환율·금리 등)
//   · searchTickerSmart()       — 종목명/코드 → Yahoo 티커 해석
//   · fetchGroundedMarketBrief()— Google 검색 그라운딩 기반 트렌드/예정 이벤트
//
// api/alpha/analysis, api/alpha/agent-review 라우트가 이 모듈을 그대로 사용한다.
// =============================================================================

import type { InvestSettings, JkpAnalysisResult } from "./alpha";

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const YF_HEADERS = { "User-Agent": "Mozilla/5.0" };

// ── Agent review 결과 타입 (구 api/alpha/agent-review/route.ts에서 이전) ──────────

export type AgentVerdict = "강력매수" | "매수" | "관망" | "매도" | "강력매도";

export type AgentReview = {
  agent: string;
  style: string;
  verdict: AgentVerdict;
  score: number; // 0-100 (bullish)
  key_point: string;
  reason: string;
};

export type ValuationDetail = {
  view: "심각저평가" | "저평가" | "적정" | "고평가" | "심각고평가";
  pe_comment: string;
  pb_comment: string;
  growth_comment: string;
  intrinsic_value_hint: string;
};

export type BuyTiming = {
  current_stage: string;
  ideal_entry: string;
  entry_trigger: string;
  stop_loss: string;
  target_short: string;
  target_long: string;
  partial_exit?: string;
  full_exit?: string;
};

export type AgentReviewResult = {
  ticker: string;
  name: string;
  currentPrice: number | null;
  changePercent: number | null;
  agents: AgentReview[];
  valuation: ValuationDetail;
  buyTiming: BuyTiming;
  consensus: AgentVerdict;
  consensusScore: number;
  jkp_final: string;
};

// ── Yahoo Finance 원본 타입 ──────────────────────────────────────────────────

type QuoteSummaryModules = {
  summaryDetail?: {
    regularMarketPrice?: { raw?: number };
    fiftyTwoWeekLow?: { raw?: number };
    fiftyTwoWeekHigh?: { raw?: number };
    averageVolume?: { raw?: number };
    regularMarketVolume?: { raw?: number };
    marketCap?: { raw?: number };
    trailingPE?: { raw?: number };
    forwardPE?: { raw?: number };
    beta?: { raw?: number };
    dividendYield?: { raw?: number };
    dividendYieldFmt?: string;
  };
  financialData?: {
    currentPrice?: { raw?: number };
    targetMeanPrice?: { raw?: number };
    targetLowPrice?: { raw?: number };
    targetHighPrice?: { raw?: number };
    numberOfAnalystOpinions?: { raw?: number };
    recommendationKey?: string;
    revenueGrowth?: { raw?: number };
    grossMargins?: { raw?: number };
    operatingMargins?: { raw?: number };
    profitMargins?: { raw?: number };
    returnOnEquity?: { raw?: number };
    debtToEquity?: { raw?: number };
    totalCash?: { raw?: number };
    totalDebt?: { raw?: number };
    freeCashflow?: { raw?: number };
    earningsGrowth?: { raw?: number };
  };
  defaultKeyStatistics?: {
    forwardEps?: { raw?: number };
    trailingEps?: { raw?: number };
    priceToBook?: { raw?: number };
    enterpriseValue?: { raw?: number };
    pegRatio?: { raw?: number };
    "52WeekChange"?: { raw?: number };
    shortRatio?: { raw?: number };
    shortPercentOfFloat?: { raw?: number };
    heldPercentInstitutions?: { raw?: number };
  };
};

type NewsItem = {
  title?: string;
  providerPublishTime?: number;
  publisher?: string;
};

/** 한 종목에 대해 1회 수집한 실시간 시장 데이터 묶음. */
export type StockMarketData = {
  /** 실제 데이터가 살아있던 해석된 티커. */
  ticker: string;
  price: number | null;
  changePercent: number | null;
  quote: QuoteSummaryModules | null;
  news: NewsItem[];
  /** 시세 또는 펀더멘털 중 하나라도 수집되면 true. */
  dataOk: boolean;
  asOf: number;
};

export type MarketSnapshot = {
  text: string;
  asOf: number;
  ok: boolean;
  readings: Record<string, { price: number | null; changePercent: number | null }>;
};

export type AgentReadiness = "ready" | "caution" | "unavailable";

export type MacroRiskAgentResult = {
  role: "macro_risk";
  readiness: AgentReadiness;
  score: number;
  signals: string[];
};

export type FundamentalValueAgentResult = {
  role: "fundamental_value";
  readiness: AgentReadiness;
  score: number;
  signals: string[];
  masterPatterns: string[];
};

export type TrendEntryAgentResult = {
  role: "trend_entry";
  readiness: AgentReadiness;
  score: number;
  signals: string[];
  entryRule: string;
  invalidationRule: string;
};

export type ThreeAgentAnalysis = {
  ticker: string;
  name: string;
  asOf: number;
  dataStatus: "ready" | "insufficient";
  macroRisk: MacroRiskAgentResult;
  fundamentalValue: FundamentalValueAgentResult;
  trendEntry: TrendEntryAgentResult;
  riskGate: {
    decision: "buy_candidate" | "watch" | "no_trade";
    score: number | null;
    reasons: string[];
    requiresManualConfirmation: true;
  };
};

// ── 포매터 ────────────────────────────────────────────────────────────────────

function pct(v: number | undefined): string {
  return v !== undefined ? `${(v * 100).toFixed(1)}%` : "N/A";
}
function fmt(v: number | undefined, decimals = 2): string {
  return v !== undefined ? v.toFixed(decimals) : "N/A";
}
function fmtM(v: number | undefined): string {
  if (v === undefined) return "N/A";
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toFixed(0);
}

/** JKP 분석용 상세 시장 컨텍스트 블록. */
function buildMarketContext(q: QuoteSummaryModules, news: NewsItem[]): string {
  const sd = q.summaryDetail ?? {};
  const fd = q.financialData ?? {};
  const ks = q.defaultKeyStatistics ?? {};

  const lines: string[] = [];

  lines.push("=== 실시간 시장 데이터 ===");
  lines.push(`현재가: ${fmt(sd.regularMarketPrice?.raw ?? fd.currentPrice?.raw)}`);
  lines.push(`52주 범위: ${fmt(sd.fiftyTwoWeekLow?.raw)} ~ ${fmt(sd.fiftyTwoWeekHigh?.raw)}`);
  lines.push(`52주 변동률: ${pct(ks["52WeekChange"]?.raw)}`);
  lines.push(`시가총액: ${fmtM(sd.marketCap?.raw)}`);
  lines.push(`거래량(평균): ${fmtM(sd.averageVolume?.raw)}`);
  lines.push(`베타: ${fmt(sd.beta?.raw)}`);

  lines.push("\n=== 밸류에이션 ===");
  lines.push(`Trailing P/E: ${fmt(sd.trailingPE?.raw)}`);
  lines.push(`Forward P/E: ${fmt(sd.forwardPE?.raw)}`);
  lines.push(`EPS (trailing): ${fmt(ks.trailingEps?.raw)}`);
  lines.push(`EPS (forward): ${fmt(ks.forwardEps?.raw)}`);
  lines.push(`PBR: ${fmt(ks.priceToBook?.raw)}`);
  lines.push(`PEG: ${fmt(ks.pegRatio?.raw)}`);
  lines.push(`EV: ${fmtM(ks.enterpriseValue?.raw)}`);

  lines.push("\n=== 재무 지표 ===");
  lines.push(`매출 성장률(YoY): ${pct(fd.revenueGrowth?.raw)}`);
  lines.push(`순이익 성장률: ${pct(fd.earningsGrowth?.raw)}`);
  lines.push(`영업이익률: ${pct(fd.operatingMargins?.raw)}`);
  lines.push(`순이익률: ${pct(fd.profitMargins?.raw)}`);
  lines.push(`ROE: ${pct(fd.returnOnEquity?.raw)}`);
  lines.push(`부채비율(D/E): ${fmt(fd.debtToEquity?.raw)}`);
  lines.push(`잉여현금흐름: ${fmtM(fd.freeCashflow?.raw)}`);

  lines.push("\n=== 애널리스트 컨센서스 ===");
  lines.push(`추천: ${fd.recommendationKey ?? "N/A"}`);
  lines.push(`목표주가 평균: ${fmt(fd.targetMeanPrice?.raw)}`);
  lines.push(`목표주가 범위: ${fmt(fd.targetLowPrice?.raw)} ~ ${fmt(fd.targetHighPrice?.raw)}`);
  lines.push(`커버리지 수: ${fd.numberOfAnalystOpinions?.raw ?? "N/A"}명`);

  lines.push("\n=== 수급 ===");
  lines.push(`공매도 비율: ${pct(ks.shortPercentOfFloat?.raw)}`);
  lines.push(`기관 보유 비율: ${pct(ks.heldPercentInstitutions?.raw)}`);
  if (sd.dividendYield?.raw) {
    lines.push(`배당수익률: ${pct(sd.dividendYield.raw)}`);
  }

  if (news.length > 0) {
    lines.push("\n=== 최근 뉴스 (최대 6건) ===");
    news.forEach((n, i) => {
      const date = n.providerPublishTime
        ? new Date(n.providerPublishTime * 1000).toLocaleDateString("ko-KR")
        : "";
      lines.push(`${i + 1}. [${date}] ${n.title ?? "(제목 없음)"} (${n.publisher ?? ""})`);
    });
  }

  return lines.join("\n");
}

/** 5인 에이전트 분석용 한 줄 펀더멘털 요약 + 데이터 유무. */
export function buildFundamentalsLine(q: QuoteSummaryModules | null): { text: string; ok: boolean } {
  if (!q) return { text: "(데이터 없음)", ok: false };
  const sd = q.summaryDetail ?? {};
  const fd = q.financialData ?? {};
  const ks = q.defaultKeyStatistics ?? {};
  const parts = [
    `P/E(trailing): ${fmt(sd.trailingPE?.raw)}`,
    `P/E(forward): ${fmt(sd.forwardPE?.raw)}`,
    `PBR: ${fmt(ks.priceToBook?.raw)}`,
    `EPS: ${fmt(ks.trailingEps?.raw)}`,
    `52주범위: ${fmt(sd.fiftyTwoWeekLow?.raw, 0)}~${fmt(sd.fiftyTwoWeekHigh?.raw, 0)}`,
    `52주변동: ${pct(ks["52WeekChange"]?.raw)}`,
    `매출성장률: ${pct(fd.revenueGrowth?.raw)}`,
    `ROE: ${pct(fd.returnOnEquity?.raw)}`,
    `부채비율: ${fmt(fd.debtToEquity?.raw)}`,
    `목표주가: ${fmt(fd.targetMeanPrice?.raw, 0)}`,
    `애널리스트추천: ${fd.recommendationKey ?? "N/A"}`,
    `베타: ${fmt(sd.beta?.raw)}`,
  ];
  const hasAny = parts.some((p) => !p.endsWith("N/A"));
  return { text: parts.join(" / "), ok: hasAny };
}

// ── Yahoo Finance 페처 ───────────────────────────────────────────────────────

async function fetchQuoteSummary(ticker: string): Promise<QuoteSummaryModules | null> {
  try {
    const modules = "summaryDetail,financialData,defaultKeyStatistics";
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`;
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { quoteSummary?: { result?: QuoteSummaryModules[] } };
    return data.quoteSummary?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchNews(ticker: string, name: string): Promise<NewsItem[]> {
  try {
    const query = encodeURIComponent(`${ticker} ${name}`);
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${query}&newsCount=6&enableFuzzyQuery=false&quotesCount=0`;
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { news?: NewsItem[] };
    return data.news?.slice(0, 6) ?? [];
  } catch {
    return [];
  }
}

async function fetchChartQuote(
  ticker: string,
): Promise<{ price: number | null; changePercent: number | null; ok: boolean }> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
      { headers: YF_HEADERS, signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return { price: null, changePercent: null, ok: false };
    const data = (await res.json()) as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; regularMarketChangePercent?: number } }[] };
    };
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return { price: null, changePercent: null, ok: false };
    return { price: meta.regularMarketPrice, changePercent: meta.regularMarketChangePercent ?? null, ok: true };
  } catch {
    return { price: null, changePercent: null, ok: false };
  }
}

async function fetchChartHistory(ticker: string): Promise<number[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`,
      { headers: YF_HEADERS, signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      chart?: {
        result?: {
          indicators?: { quote?: { close?: Array<number | null> }[] };
        }[];
      };
    };
    return (data.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    );
  } catch {
    return [];
  }
}

// 추천/사용자 입력 티커가 거래소 접미사를 잘못 줄 수 있다(코스닥인데 .KS 등).
// 받은 ticker 그대로 → 접미사 제거 → 반대 거래소 → .KS/.KQ 순으로 시도한다.
function tickerCandidates(ticker: string): string[] {
  const t = ticker.trim();
  const candidates = new Set<string>([t]);
  const bare = t.replace(/\.(KS|KQ)$/i, "");
  if (bare !== t) {
    candidates.add(bare);
    candidates.add(`${bare}.${t.toUpperCase().endsWith(".KS") ? "KQ" : "KS"}`);
  } else if (/^\d{6}$/.test(t)) {
    candidates.add(`${t}.KS`);
    candidates.add(`${t}.KQ`);
  }
  return [...candidates];
}

/**
 * 한 종목의 실시간 데이터를 1회 수집한다. 살아있는 티커를 찾으면 그 데이터를,
 * 모두 실패하면 dataOk=false로 입력 티커를 그대로 돌려준다.
 */
export async function gatherMarketData(input: string, name: string): Promise<StockMarketData> {
  const candidates = tickerCandidates(input);
  let best: { ticker: string; price: number | null; changePercent: number | null; quote: QuoteSummaryModules | null } | null =
    null;

  for (const c of candidates) {
    const [chart, quote] = await Promise.all([fetchChartQuote(c), fetchQuoteSummary(c)]);
    if (chart.ok && quote) {
      best = { ticker: c, price: chart.price, changePercent: chart.changePercent, quote };
      break;
    }
    if ((chart.ok || quote) && !best) {
      best = { ticker: c, price: chart.price, changePercent: chart.changePercent, quote };
    }
  }

  if (!best) {
    return { ticker: input, price: null, changePercent: null, quote: null, news: [], dataOk: false, asOf: Date.now() };
  }

  const news = await fetchNews(best.ticker, name);
  return {
    ticker: best.ticker,
    price: best.price,
    changePercent: best.changePercent,
    quote: best.quote,
    news,
    dataOk: best.price !== null || best.quote !== null,
    asOf: Date.now(),
  };
}

// ── Gemini 호출 헬퍼 ─────────────────────────────────────────────────────────

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function readableNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function runMacroRiskAgent(snapshot: MarketSnapshot): MacroRiskAgentResult {
  if (!snapshot.ok) {
    return {
      role: "macro_risk",
      readiness: "unavailable",
      score: 0,
      signals: ["Market-regime data could not be verified."],
    };
  }
  let score = 60;
  const signals: string[] = [];
  const vix = snapshot.readings["^VIX"]?.price;
  const spxMove = snapshot.readings["^GSPC"]?.changePercent;
  if (typeof vix === "number") {
    if (vix >= 30) {
      score -= 30;
      signals.push(`VIX ${readableNumber(vix)}: high-volatility regime.`);
    } else if (vix >= 20) {
      score -= 15;
      signals.push(`VIX ${readableNumber(vix)}: elevated volatility.`);
    } else {
      score += 8;
      signals.push(`VIX ${readableNumber(vix)}: volatility is contained.`);
    }
  } else {
    signals.push("VIX is unavailable.");
  }
  if (typeof spxMove === "number") {
    if (spxMove <= -1.5) {
      score -= 15;
      signals.push(`S&P 500 daily move ${spxMove.toFixed(2)}%: risk-off session.`);
    } else if (spxMove >= 1) {
      score += 8;
      signals.push(`S&P 500 daily move +${spxMove.toFixed(2)}%: risk appetite improved.`);
    }
  } else {
    signals.push("S&P 500 daily move is unavailable.");
  }
  const finalScore = clampScore(score);
  return {
    role: "macro_risk",
    readiness: finalScore >= 50 ? "ready" : "caution",
    score: finalScore,
    signals,
  };
}

function runFundamentalValueAgent(md: StockMarketData): FundamentalValueAgentResult {
  const quote = md.quote;
  if (!quote) {
    return {
      role: "fundamental_value",
      readiness: "unavailable",
      score: 0,
      signals: ["Fundamental data could not be verified."],
      masterPatterns: [],
    };
  }
  const detail = quote.summaryDetail ?? {};
  const financial = quote.financialData ?? {};
  const statistics = quote.defaultKeyStatistics ?? {};
  const revenueGrowth = financial.revenueGrowth?.raw;
  const earningsGrowth = financial.earningsGrowth?.raw;
  const roe = financial.returnOnEquity?.raw;
  const debtToEquity = financial.debtToEquity?.raw;
  const trailingPe = detail.trailingPE?.raw;
  const peg = statistics.pegRatio?.raw;
  const signals: string[] = [];
  const masterPatterns: string[] = [];
  let score = 50;
  let verifiedFields = 0;

  if (typeof revenueGrowth === "number") {
    verifiedFields += 1;
    score += revenueGrowth > 0.1 ? 12 : revenueGrowth < 0 ? -12 : 0;
    signals.push(`Revenue growth: ${(revenueGrowth * 100).toFixed(1)}%.`);
    if (revenueGrowth > 0.1) masterPatterns.push("O'Neil growth screen: revenue growth is positive.");
  }
  if (typeof earningsGrowth === "number") {
    verifiedFields += 1;
    score += earningsGrowth > 0.1 ? 12 : earningsGrowth < 0 ? -12 : 0;
    signals.push(`Earnings growth: ${(earningsGrowth * 100).toFixed(1)}%.`);
  }
  if (typeof roe === "number") {
    verifiedFields += 1;
    score += roe >= 0.15 ? 10 : roe < 0.08 ? -10 : 0;
    signals.push(`ROE: ${(roe * 100).toFixed(1)}%.`);
  }
  if (typeof debtToEquity === "number") {
    verifiedFields += 1;
    score += debtToEquity <= 100 ? 6 : debtToEquity >= 200 ? -10 : 0;
    signals.push(`Debt-to-equity: ${debtToEquity.toFixed(1)}.`);
  }
  if (typeof peg === "number") {
    verifiedFields += 1;
    score += peg > 0 && peg <= 1.5 ? 8 : peg > 3 ? -8 : 0;
    masterPatterns.push(`Lynch PEG check: ${peg.toFixed(2)}.`);
  }
  if (typeof trailingPe === "number") {
    verifiedFields += 1;
    signals.push(`Trailing P/E: ${trailingPe.toFixed(1)}.`);
  }
  if (!masterPatterns.length) masterPatterns.push("Classic-investor pattern checks need more verified fields.");
  if (verifiedFields < 3) {
    return {
      role: "fundamental_value",
      readiness: "unavailable",
      score: 0,
      signals: [...signals, "Fewer than three verified fundamental fields are available."],
      masterPatterns,
    };
  }
  return {
    role: "fundamental_value",
    readiness: score >= 45 ? "ready" : "caution",
    score: clampScore(score),
    signals,
    masterPatterns,
  };
}

async function runTrendEntryAgent(ticker: string): Promise<TrendEntryAgentResult> {
  const closes = await fetchChartHistory(ticker);
  if (closes.length < 50) {
    return {
      role: "trend_entry",
      readiness: "unavailable",
      score: 0,
      signals: ["At least 50 verified daily closes are required for trend analysis."],
      entryRule: "No entry rule until historical price data is available.",
      invalidationRule: "No trade while trend data is unavailable.",
    };
  }
  const price = closes.at(-1)!;
  const sma50 = average(closes.slice(-50))!;
  const sma200 = closes.length >= 200 ? average(closes.slice(-200)) : null;
  const high = Math.max(...closes);
  const signals: string[] = [];
  let score = 50;
  if (price > sma50) {
    score += 15;
    signals.push(`Price ${readableNumber(price)} is above the 50-day average ${readableNumber(sma50)}.`);
  } else {
    score -= 15;
    signals.push(`Price ${readableNumber(price)} is below the 50-day average ${readableNumber(sma50)}.`);
  }
  if (sma200 !== null) {
    if (price > sma200) score += 15;
    else score -= 15;
    if (sma50 > sma200) score += 10;
    else score -= 10;
    signals.push(`200-day average: ${readableNumber(sma200)}; 50/200 trend relationship checked.`);
  } else {
    signals.push("200-day average is unavailable because the listing history is short.");
  }
  const distanceFromHigh = ((price / high) - 1) * 100;
  if (distanceFromHigh >= -15) score += 5;
  else score -= 5;
  signals.push(`Distance from 1-year high: ${distanceFromHigh.toFixed(1)}%.`);
  return {
    role: "trend_entry",
    readiness: sma200 === null ? "caution" : score >= 45 ? "ready" : "caution",
    score: clampScore(score),
    signals,
    entryRule: `Require a close above the 50-day average (${readableNumber(sma50)}) and a new higher high before considering entry.`,
    invalidationRule: `Reassess if the price closes below the 50-day average (${readableNumber(sma50)}).`,
  };
}

export async function runThreeAgentAnalysis(input: {
  ticker: string;
  name: string;
  marketData?: StockMarketData;
  macroSnapshot?: MarketSnapshot;
}): Promise<ThreeAgentAnalysis> {
  const md = input.marketData ?? (await gatherMarketData(input.ticker, input.name));
  const [snapshot, trendEntry] = await Promise.all([
    input.macroSnapshot ? Promise.resolve(input.macroSnapshot) : fetchMarketSnapshot(),
    runTrendEntryAgent(md.ticker),
  ]);
  const macroRisk = runMacroRiskAgent(snapshot);
  const fundamentalValue = runFundamentalValueAgent(md);
  const unavailable = [macroRisk, fundamentalValue, trendEntry].filter(
    (agent) => agent.readiness === "unavailable",
  );
  const reasons = unavailable.flatMap((agent) => agent.signals.slice(0, 1));
  if (!md.dataOk || unavailable.length > 0) {
    return {
      ticker: md.ticker,
      name: input.name,
      asOf: md.asOf,
      dataStatus: "insufficient",
      macroRisk,
      fundamentalValue,
      trendEntry,
      riskGate: {
        decision: "no_trade",
        score: null,
        reasons: reasons.length ? reasons : ["Verified market data is unavailable."],
        requiresManualConfirmation: true,
      },
    };
  }
  const score = clampScore(
    macroRisk.score * 0.3 + fundamentalValue.score * 0.4 + trendEntry.score * 0.3,
  );
  const decision = score >= 70 && macroRisk.readiness === "ready" && trendEntry.readiness === "ready"
    ? "buy_candidate"
    : "watch";
  return {
    ticker: md.ticker,
    name: input.name,
    asOf: md.asOf,
    dataStatus: "ready",
    macroRisk,
    fundamentalValue,
    trendEntry,
    riskGate: {
      decision,
      score,
      reasons:
        decision === "buy_candidate"
          ? ["All three independent checks passed; manual confirmation remains required."]
          : ["The combined signal does not meet the candidate threshold."],
      requiresManualConfirmation: true,
    },
  };
}

async function callGeminiJson<T>(systemPrompt: string, userPrompt: string, temperature = 0.2): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return JSON.parse(raw) as T;
}

// ── 에이전트 1: JKP 단일 종목 분석 ────────────────────────────────────────────

export async function runJkpAnalysis(input: {
  ticker: string;
  name: string;
  market?: string;
  settings: InvestSettings;
  marketData?: StockMarketData;
}): Promise<JkpAnalysisResult> {
  const md = input.marketData ?? (await gatherMarketData(input.ticker, input.name));
  if (!md.dataOk) {
    throw new Error("Verified market data is unavailable; no trade analysis was produced.");
  }
  const { livermore, oneil, weinstein, minervini, lynch } = input.settings.traderWeights;

  const marketContext = md.quote
    ? buildMarketContext(md.quote, md.news)
    : md.news.length > 0
      ? `=== 최근 뉴스 ===\n${md.news.map((n, i) => `${i + 1}. ${n.title}`).join("\n")}`
      : "(시장 데이터 수집 실패 — 보유 지식으로 판단)";

  const systemPrompt = `너는 전 Bridgewater 시니어 펀드매니저 JKP(James K. Park)다.
투자 원칙: 매크로 우선 / 수급 중시 / 규율 / 단순함 / 리스크 퍼스트
현재 사용자 트레이더 가중치: Livermore ${livermore}% / O'Neil ${oneil}% / Weinstein ${weinstein}% / Minervini ${minervini}% / Lynch ${lynch}%

아래 제공된 실시간 시장 데이터를 최우선으로 활용해 분석하라.
"알 수 없다"는 답변은 없다. 데이터가 불충분하면 보수적 결론을 내려라.
반드시 JSON으로만 답하라 (설명 금지, 코드펜스 금지).`;

  const userPrompt = `${input.ticker}(${input.name}, ${input.market ?? "KR"}) 종목 분석.

${marketContext}

위 데이터를 바탕으로 지금 당장 판단을 내려라.
구체적 수치(현재가 기준 비율 또는 절대값)로 매수구간/목표가/손절가를 제시하라.

다음 JSON 스키마로만 답하라:
{
  "final_action": "매수" | "관망" | "매도",
  "confidence": number,
  "buy_zone": { "entry_price": string, "entry_condition": string, "additional_buy": string },
  "target_price": { "target_1": string, "target_1_reason": string, "target_2": string, "target_2_reason": string },
  "sell_plan": {
    "partial_exit": "1차 목표 도달 시 몇 % 매도, 조건",
    "full_exit": "완전 청산해야 하는 구체적 조건 (가격/이벤트/기간)",
    "trailing_stop": "수익 보전을 위한 트레일링 스탑 기준"
  },
  "stop_loss": string,
  "stop_loss_reason": string,
  "risk_reward_ratio": string,
  "time_horizon": string,
  "key_catalysts": string[],
  "key_risks": string[],
  "jkp_comment": string
}`;

  return callGeminiJson<JkpAnalysisResult>(systemPrompt, userPrompt);
}

// ── 에이전트 2: 5인 전설적 투자자 합의 ────────────────────────────────────────

export async function runAgentReview(input: {
  ticker: string;
  name: string;
  market: string;
  recommendationReason?: string;
  marketData?: StockMarketData;
}): Promise<AgentReviewResult> {
  const md = input.marketData ?? (await gatherMarketData(input.ticker, input.name));
  if (!md.dataOk) {
    throw new Error("Verified market data is unavailable; no investor-persona review was produced.");
  }
  const fundamentals = buildFundamentalsLine(md.quote);

  const systemPrompt = `너는 4명의 전설적 투자자들의 관점을 모두 이해하는 멀티에이전트 분석 시스템이다.
각 에이전트의 철학에 충실하게 분석하되, 불확실해도 결론을 내린다.
제공된 실시간 펀더멘털 데이터를 최우선으로 활용해 구체적 수치 근거로 결론을 내려라.
실시간 데이터가 "(데이터 없음)"으로 표기되어 비어 있어도 "데이터 부재"를 사유로 일률적으로 관망/매도로 회피하지 마라.
그 경우엔 JKP 추천 배경, 해당 기업·섹터에 대한 일반적 지식, 종목명/시장 정보로 추정해 각 에이전트의 철학에 맞는 의견을 분명히 내고, "데이터 한계"는 reason 끝에 한 번만 짧게 언급해라.
반드시 JSON으로만 답하라 (코드펜스/설명 금지).`;

  const recContext = input.recommendationReason
    ? `\nJKP 추천 배경 (참고): ${input.recommendationReason}\n위 추천 배경과 실시간 데이터를 함께 고려하되, 데이터가 상충할 경우 실시간 데이터를 우선하고 이유를 reason에 명시하라.`
    : "";

  const dataNotice = md.dataOk
    ? ""
    : "\n주의: 실시간 펀더멘털·시세를 가져오지 못했다 (종목코드 미스매치/한국 종목 일부 필드 누락 가능). 데이터 부재를 핑계로 관망으로 회피하지 말고, 추천 배경과 종목 상식으로 의견을 내라.";

  const userPrompt = `종목: ${md.ticker} (${input.name}, ${input.market})
실시간 데이터: ${fundamentals.text}
현재가: ${md.price ?? "N/A"} (오늘 ${md.changePercent !== null ? `${md.changePercent > 0 ? "+" : ""}${md.changePercent.toFixed(2)}%` : "N/A"})${dataNotice}${recContext}

4명의 에이전트 관점 + 종합 분석을 다음 JSON으로만 답하라:
{
  "agents": [
    {
      "agent": "O'Neil",
      "style": "CANSLIM · 성장/수급",
      "verdict": "강력매수" | "매수" | "관망" | "매도" | "강력매도",
      "score": 0~100,
      "key_point": "O'Neil 철학 핵심 포인트 한 문장",
      "reason": "O'Neil 관점 근거 2문장"
    },
    {
      "agent": "Lynch",
      "style": "PEG · 성장+가치",
      "verdict": "...",
      "score": 0~100,
      "key_point": "...",
      "reason": "..."
    },
    {
      "agent": "Weinstein",
      "style": "스테이지 분석 · 추세",
      "verdict": "...",
      "score": 0~100,
      "key_point": "...",
      "reason": "..."
    },
    {
      "agent": "Minervini",
      "style": "VCP · 저변동 돌파",
      "verdict": "...",
      "score": 0~100,
      "key_point": "...",
      "reason": "..."
    }
  ],
  "valuation": {
    "view": "심각저평가" | "저평가" | "적정" | "고평가" | "심각고평가",
    "pe_comment": "P/E 평가 한 문장",
    "pb_comment": "PBR 평가 한 문장",
    "growth_comment": "성장성 평가 한 문장",
    "intrinsic_value_hint": "적정 주가 힌트 한 문장 (수치 포함)"
  },
  "buyTiming": {
    "current_stage": "현재 주가 스테이지 (예: 스테이지 2 상승 초입)",
    "ideal_entry": "이상적 진입 가격 또는 조건",
    "entry_trigger": "진입 트리거 한 문장 (어떤 조건이 충족될 때)",
    "stop_loss": "손절 기준",
    "target_short": "단기 목표가",
    "target_long": "장기 목표가",
    "partial_exit": "1차 목표 도달 시 몇 % 익절하고 언제 매도할지",
    "full_exit": "완전 청산해야 하는 구체적 조건 (가격·이벤트·기간)"
  },
  "consensus": "강력매수" | "매수" | "관망" | "매도" | "강력매도",
  "consensusScore": 0~100,
  "jkp_final": "JKP 최종 한마디 — 단정적으로 2문장"
}`;

  const result = await callGeminiJson<
    Omit<AgentReviewResult, "ticker" | "name" | "currentPrice" | "changePercent">
  >(systemPrompt, userPrompt);

  return {
    ticker: md.ticker,
    name: input.name,
    currentPrice: md.price,
    changePercent: md.changePercent,
    ...result,
  };
}

// ── 거시 지표 스냅샷 ──────────────────────────────────────────────────────────

const SNAPSHOT_TICKERS: { symbol: string; label: string }[] = [
  { symbol: "^VIX", label: "VIX (변동성)" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "나스닥" },
  { symbol: "^KS11", label: "코스피" },
  { symbol: "^TNX", label: "美 10년물 금리" },
  { symbol: "KRW=X", label: "원/달러 환율" },
  { symbol: "GC=F", label: "금" },
];

/** 시장 전반(공포/지수/환율/금리/원자재) 실시간 스냅샷 텍스트. */
export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  const quotes = await Promise.all(SNAPSHOT_TICKERS.map((t) => fetchChartQuote(t.symbol)));
  const lines: string[] = [];
  const readings: MarketSnapshot["readings"] = {};
  let ok = false;
  SNAPSHOT_TICKERS.forEach((t, i) => {
    const q = quotes[i];
    readings[t.symbol] = { price: q.price, changePercent: q.changePercent };
    if (q.price === null) {
      lines.push(`${t.label}: 데이터 없음`);
      return;
    }
    ok = true;
    const chg =
      q.changePercent !== null ? ` (${q.changePercent > 0 ? "+" : ""}${q.changePercent.toFixed(2)}%)` : "";
    lines.push(`${t.label}: ${q.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}${chg}`);
  });
  return { text: lines.join("\n"), asOf: Date.now(), ok, readings };
}

// ── 종목명/코드 → 티커 해석 ───────────────────────────────────────────────────

type TickerMatch = { ticker: string; name: string; market: "KR" | "US" | "OTHER" };

const US_EXCHANGES = new Set(["NYSE", "NASDAQ", "NMS", "NGM", "NCM", "ASE", "PCX"]);
const KR_EXCHANGE_CODES = new Set(["KOE", "KSC", "KSE"]);

// 자주 쓰는 종목의 오프라인 폴백 (Yahoo 검색 실패 시).
const LOCAL_STOCKS: TickerMatch[] = [
  { ticker: "005930.KS", name: "삼성전자", market: "KR" },
  { ticker: "000660.KS", name: "SK하이닉스", market: "KR" },
  { ticker: "035420.KS", name: "NAVER", market: "KR" },
  { ticker: "035720.KS", name: "카카오", market: "KR" },
  { ticker: "051910.KS", name: "LG화학", market: "KR" },
  { ticker: "006400.KS", name: "삼성SDI", market: "KR" },
  { ticker: "207940.KS", name: "삼성바이오로직스", market: "KR" },
  { ticker: "005380.KS", name: "현대차", market: "KR" },
  { ticker: "000270.KS", name: "기아", market: "KR" },
  { ticker: "068270.KS", name: "셀트리온", market: "KR" },
  { ticker: "373220.KS", name: "LG에너지솔루션", market: "KR" },
  { ticker: "247540.KS", name: "에코프로비엠", market: "KR" },
  { ticker: "086520.KS", name: "에코프로", market: "KR" },
  { ticker: "042700.KS", name: "한미반도체", market: "KR" },
  { ticker: "066570.KS", name: "LG전자", market: "KR" },
  { ticker: "352820.KS", name: "하이브", market: "KR" },
  { ticker: "259960.KS", name: "크래프톤", market: "KR" },
  { ticker: "114800.KS", name: "KODEX 인버스", market: "KR" },
  { ticker: "122630.KS", name: "KODEX 레버리지", market: "KR" },
  { ticker: "AAPL", name: "Apple", market: "US" },
  { ticker: "MSFT", name: "Microsoft", market: "US" },
  { ticker: "NVDA", name: "NVIDIA", market: "US" },
  { ticker: "AMZN", name: "Amazon", market: "US" },
  { ticker: "GOOGL", name: "Alphabet", market: "US" },
  { ticker: "META", name: "Meta Platforms", market: "US" },
  { ticker: "TSLA", name: "Tesla", market: "US" },
  { ticker: "AVGO", name: "Broadcom", market: "US" },
  { ticker: "AMD", name: "AMD", market: "US" },
  { ticker: "NFLX", name: "Netflix", market: "US" },
  { ticker: "PLTR", name: "Palantir", market: "US" },
  { ticker: "COIN", name: "Coinbase", market: "US" },
  { ticker: "QQQ", name: "Nasdaq 100 ETF", market: "US" },
  { ticker: "SPY", name: "S&P 500 ETF", market: "US" },
  { ticker: "SQQQ", name: "ProShares UltraPro Short QQQ", market: "US" },
];

function detectMarket(symbol: string, exchange: string): "KR" | "US" | "OTHER" {
  const sym = symbol.toUpperCase();
  const exch = exchange.toUpperCase();
  if (sym.endsWith(".KS") || sym.endsWith(".KQ") || exch.includes("KS") || exch.includes("KQ") || KR_EXCHANGE_CODES.has(exch))
    return "KR";
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
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: "https://finance.yahoo.com/",
  };
  const params = `?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&enableFuzzyQuery=true&region=KR,US&lang=ko-KR`;

  for (const base of ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]) {
    try {
      const res = await fetch(`${base}/v1/finance/search${params}`, { headers, signal: AbortSignal.timeout(3000) });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        quotes?: { symbol?: string; longname?: string; shortname?: string; exchange?: string; quoteType?: string }[];
      };
      const quotes = data.quotes ?? [];
      const results = quotes
        .filter((qq) => (qq.quoteType === "EQUITY" || qq.quoteType === "ETF") && qq.symbol)
        .map((qq) => {
          const symbol = qq.symbol!;
          const exchange = qq.exchange ?? "";
          return {
            ticker: normalizeTicker(symbol, exchange),
            name: qq.longname ?? qq.shortname ?? symbol,
            market: detectMarket(symbol, exchange),
          };
        });
      if (results.length > 0) return results;
    } catch {
      /* try next base */
    }
  }
  return [];
}

/** 종목명/코드/티커를 받아 가장 그럴듯한 1개 종목을 해석한다. 실패 시 null. */
export async function searchTickerSmart(query: string): Promise<TickerMatch | null> {
  const q = query.trim();
  if (!q) return null;
  const remote = await yahooSearch(q);
  if (remote.length > 0) return remote[0];
  const lower = q.toLowerCase();
  const local = LOCAL_STOCKS.find(
    (s) => s.name.toLowerCase().includes(lower) || s.ticker.toLowerCase().includes(lower),
  );
  return local ?? null;
}

// ── Google 검색 그라운딩 기반 시장 브리핑 ─────────────────────────────────────

export type GroundedBrief = { text: string; sources: { title: string; uri: string }[] };

type GroundingResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
};

/**
 * Google 검색으로 그라운딩한 최신 시장/거시/예정 이벤트 브리핑.
 * 검색 그라운딩이 API 키에서 비활성화돼 있으면 그라운딩 없이 1회 재시도하고,
 * 그래도 실패하면 null을 반환한다(베스트에포트 — 채팅을 깨뜨리지 않는다).
 */
export async function fetchGroundedMarketBrief(query: string): Promise<GroundedBrief | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = `너는 시장 리서치 에이전트다. 검색으로 확인되는 최신 사실만 간결히 정리한다.
규칙:
- 오늘 기준 최신 거시 흐름, 관련 뉴스, 다가오는 일정(실적·FOMC·CPI·지표 발표 등)을 날짜와 함께 정리.
- 검색으로 확인되지 않으면 "확인 불가"라고 적는다. 절대 지어내지 마라.
- 가격을 단정적으로 예측하지 마라. 사실과 일정만 전달.
- 한국어, 불릿 5개 이내.`;

  async function call(useSearch: boolean): Promise<GroundedBrief | null> {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: query }] }],
      generationConfig: { temperature: 0.2 },
    };
    if (useSearch) body.tools = [{ google_search: {} }];

    const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GroundingResponse;
    const cand = data.candidates?.[0];
    const text = cand?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
    if (!text) return null;
    const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
    const sources = chunks
      .map((c) => ({ title: c.web?.title ?? "", uri: c.web?.uri ?? "" }))
      .filter((s) => s.uri);
    return { text, sources };
  }

  try {
    const withSearch = await call(true);
    if (withSearch) return withSearch;
  } catch {
    /* fall through to no-search retry */
  }
  try {
    return await call(false);
  } catch {
    return null;
  }
}
