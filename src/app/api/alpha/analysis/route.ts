import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { getSettings } from "@/lib/alpha";
import type { JkpAnalysisResult } from "@/lib/alpha";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const YF_HEADERS = { "User-Agent": "Mozilla/5.0" };

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

async function fetchQuoteSummary(ticker: string): Promise<QuoteSummaryModules | null> {
  try {
    const modules = "summaryDetail,financialData,defaultKeyStatistics";
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`;
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(6000) });
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
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { news?: NewsItem[] };
    return data.news?.slice(0, 6) ?? [];
  } catch {
    return [];
  }
}

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
      lines.push(`${i + 1}. [${date}] ${n.title ?? "(제목 없음"} (${n.publisher ?? ""})`);
    });
  }

  return lines.join("\n");
}

async function callGeminiJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return JSON.parse(raw) as T;
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker, name, market } = await req.json();
  if (!ticker || !name) return NextResponse.json({ error: "ticker, name required" }, { status: 400 });

  const settings = await getSettings(session.email);
  const { livermore, oneil, weinstein, minervini, lynch } = settings.traderWeights;

  // Fetch real market data in parallel
  const [quoteSummary, news] = await Promise.all([
    fetchQuoteSummary(ticker),
    fetchNews(ticker, name),
  ]);

  const marketContext = quoteSummary
    ? buildMarketContext(quoteSummary, news)
    : news.length > 0
      ? `=== 최근 뉴스 ===\n${news.map((n, i) => `${i + 1}. ${n.title}`).join("\n")}`
      : "(시장 데이터 수집 실패 — 보유 지식으로 판단)";

  const systemPrompt = `너는 전 Bridgewater 시니어 펀드매니저 JKP(James K. Park)다.
투자 원칙: 매크로 우선 / 수급 중시 / 규율 / 단순함 / 리스크 퍼스트
현재 사용자 트레이더 가중치: Livermore ${livermore}% / O'Neil ${oneil}% / Weinstein ${weinstein}% / Minervini ${minervini}% / Lynch ${lynch}%

아래 제공된 실시간 시장 데이터를 최우선으로 활용해 분석하라.
"알 수 없다"는 답변은 없다. 데이터가 불충분하면 보수적 결론을 내려라.
반드시 JSON으로만 답하라 (설명 금지, 코드펜스 금지).`;

  const userPrompt = `${ticker}(${name}, ${market ?? "KR"}) 종목 분석.

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

  try {
    const result = await callGeminiJson<JkpAnalysisResult>(systemPrompt, userPrompt);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
