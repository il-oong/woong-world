import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { getSettings } from "@/lib/alpha";
import { Redis } from "@upstash/redis";
import { jobKey } from "../route";
import type { AnalysisJob } from "../route";
import type { JkpAnalysisResult } from "@/lib/alpha";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const YF_HEADERS = { "User-Agent": "Mozilla/5.0" };

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis not configured");
  return new Redis({ url, token });
}

type QuoteSummaryModules = {
  summaryDetail?: {
    regularMarketPrice?: { raw?: number };
    fiftyTwoWeekLow?: { raw?: number };
    fiftyTwoWeekHigh?: { raw?: number };
    averageVolume?: { raw?: number };
    marketCap?: { raw?: number };
    trailingPE?: { raw?: number };
    forwardPE?: { raw?: number };
    beta?: { raw?: number };
    dividendYield?: { raw?: number };
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
    shortPercentOfFloat?: { raw?: number };
    heldPercentInstitutions?: { raw?: number };
  };
};

type NewsItem = { title?: string; providerPublishTime?: number; publisher?: string };

async function fetchQuoteSummary(ticker: string): Promise<QuoteSummaryModules | null> {
  try {
    const modules = "summaryDetail,financialData,defaultKeyStatistics";
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`;
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { quoteSummary?: { result?: QuoteSummaryModules[] } };
    return data.quoteSummary?.result?.[0] ?? null;
  } catch { return null; }
}

async function fetchNews(ticker: string, name: string): Promise<NewsItem[]> {
  try {
    const query = encodeURIComponent(`${ticker} ${name}`);
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${query}&newsCount=6&enableFuzzyQuery=false&quotesCount=0`;
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { news?: NewsItem[] };
    return data.news?.slice(0, 6) ?? [];
  } catch { return []; }
}

function pct(v: number | undefined) { return v !== undefined ? `${(v * 100).toFixed(1)}%` : "N/A"; }
function fmt(v: number | undefined, d = 2) { return v !== undefined ? v.toFixed(d) : "N/A"; }
function fmtM(v: number | undefined) {
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
  const lines = [
    "=== 실시간 시장 데이터 ===",
    `현재가: ${fmt(sd.regularMarketPrice?.raw ?? fd.currentPrice?.raw)}`,
    `52주 범위: ${fmt(sd.fiftyTwoWeekLow?.raw)} ~ ${fmt(sd.fiftyTwoWeekHigh?.raw)}`,
    `52주 변동률: ${pct(ks["52WeekChange"]?.raw)}`,
    `시가총액: ${fmtM(sd.marketCap?.raw)}`,
    `베타: ${fmt(sd.beta?.raw)}`,
    "\n=== 밸류에이션 ===",
    `Trailing P/E: ${fmt(sd.trailingPE?.raw)}`, `Forward P/E: ${fmt(sd.forwardPE?.raw)}`,
    `EPS (trailing): ${fmt(ks.trailingEps?.raw)}`, `PBR: ${fmt(ks.priceToBook?.raw)}`, `PEG: ${fmt(ks.pegRatio?.raw)}`,
    "\n=== 재무 지표 ===",
    `매출 성장률(YoY): ${pct(fd.revenueGrowth?.raw)}`, `순이익 성장률: ${pct(fd.earningsGrowth?.raw)}`,
    `영업이익률: ${pct(fd.operatingMargins?.raw)}`, `ROE: ${pct(fd.returnOnEquity?.raw)}`,
    `부채비율(D/E): ${fmt(fd.debtToEquity?.raw)}`, `FCF: ${fmtM(fd.freeCashflow?.raw)}`,
    "\n=== 애널리스트 컨센서스 ===",
    `추천: ${fd.recommendationKey ?? "N/A"}`,
    `목표주가: ${fmt(fd.targetLowPrice?.raw)} ~ ${fmt(fd.targetHighPrice?.raw)} (평균 ${fmt(fd.targetMeanPrice?.raw)})`,
    `커버리지: ${fd.numberOfAnalystOpinions?.raw ?? "N/A"}명`,
    "\n=== 수급 ===",
    `공매도: ${pct(ks.shortPercentOfFloat?.raw)}`, `기관 보유: ${pct(ks.heldPercentInstitutions?.raw)}`,
  ];
  if (sd.dividendYield?.raw) lines.push(`배당수익률: ${pct(sd.dividendYield.raw)}`);
  if (news.length > 0) {
    lines.push("\n=== 최근 뉴스 ===");
    news.forEach((n, i) => {
      const date = n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toLocaleDateString("ko-KR") : "";
      lines.push(`${i + 1}. [${date}] ${n.title ?? ""} (${n.publisher ?? ""})`);
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
      generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return JSON.parse(raw) as T;
}

// POST: run actual analysis and store result in Redis
export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId, ticker, name, market } = await req.json() as {
    jobId: string; ticker: string; name: string; market?: string;
  };
  if (!jobId || !ticker || !name) return NextResponse.json({ error: "jobId, ticker, name required" }, { status: 400 });

  const redis = getRedis();

  try {
    const settings = await getSettings(session.email);
    const { livermore, oneil, weinstein, minervini, lynch } = settings.traderWeights;

    const [quoteSummary, news] = await Promise.all([fetchQuoteSummary(ticker), fetchNews(ticker, name)]);
    const marketContext = quoteSummary
      ? buildMarketContext(quoteSummary, news)
      : "(시장 데이터 수집 실패 — 보유 지식으로 판단)";

    const systemPrompt = `너는 전 Bridgewater 시니어 펀드매니저 JKP(James K. Park)다.
투자 원칙: 매크로 우선 / 수급 중시 / 규율 / 단순함 / 리스크 퍼스트
현재 사용자 트레이더 가중치: Livermore ${livermore}% / O'Neil ${oneil}% / Weinstein ${weinstein}% / Minervini ${minervini}% / Lynch ${lynch}%
아래 실시간 시장 데이터를 최우선으로 활용해 분석하라. "알 수 없다"는 없다. 반드시 JSON으로만 답하라.`;

    const userPrompt = `${ticker}(${name}, ${market ?? "KR"}) 종목 분석.

${marketContext}

다음 JSON 스키마로만 답하라:
{
  "final_action": "매수"|"관망"|"매도",
  "confidence": number,
  "buy_zone": { "entry_price": string, "entry_condition": string, "additional_buy": string },
  "target_price": { "target_1": string, "target_1_reason": string, "target_2": string, "target_2_reason": string },
  "sell_plan": { "partial_exit": string, "full_exit": string, "trailing_stop": string },
  "stop_loss": string,
  "stop_loss_reason": string,
  "risk_reward_ratio": string,
  "time_horizon": string,
  "key_catalysts": string[],
  "key_risks": string[],
  "jkp_comment": string
}`;

    const result = await callGeminiJson<JkpAnalysisResult>(systemPrompt, userPrompt);

    const done: AnalysisJob = {
      status: "done",
      result,
      ticker,
      name,
      createdAt: Date.now(),
    };
    await redis.set(jobKey(jobId), done, { ex: 600 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const errJob: AnalysisJob = {
      status: "error",
      error: String(err),
      ticker,
      name,
      createdAt: Date.now(),
    };
    await redis.set(jobKey(jobId), errJob, { ex: 600 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
