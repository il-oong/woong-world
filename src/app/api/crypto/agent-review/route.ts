import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export type CryptoVerdict = "강력매수" | "매수" | "관망" | "매도" | "강력매도";

export type CryptoTraderReview = {
  trader: string;
  style: string;
  verdict: CryptoVerdict;
  score: number;       // 0-100 (bullish)
  key_point: string;
  reason: string;
};

export type CycleDetail = {
  phase: "축적" | "상승 초기" | "상승 후기" | "분배" | "약세장";
  cycle_comment: string;
  macro_comment: string;
  onchain_comment: string;
  fair_value_hint: string;
};

export type CryptoEntryPlan = {
  current_zone: string;
  ideal_entry: string;
  entry_trigger: string;
  stop_loss: string;
  target_short: string;
  target_long: string;
  partial_exit?: string;
  full_exit?: string;
};

export type CryptoReviewResult = {
  coinId: string;
  name: string;
  symbol: string;
  currentPrice: number | null;
  change24h: number | null;
  marketCap: number | null;
  ath: number | null;
  athChangePct: number | null;
  traders: CryptoTraderReview[];
  cycle: CycleDetail;
  entryPlan: CryptoEntryPlan;
  consensus: CryptoVerdict;
  consensusScore: number;
  jkp_final: string;
};

type CGCoin = {
  id?: string;
  symbol?: string;
  name?: string;
  market_data?: {
    current_price?: { usd?: number };
    price_change_percentage_24h?: number;
    price_change_percentage_30d?: number;
    price_change_percentage_1y?: number;
    market_cap?: { usd?: number };
    total_volume?: { usd?: number };
    circulating_supply?: number;
    max_supply?: number;
    ath?: { usd?: number };
    ath_change_percentage?: { usd?: number };
    atl?: { usd?: number };
    atl_change_percentage?: { usd?: number };
  };
};

async function fetchCoinGecko(coinId: string): Promise<{ data: CGCoin | null; ok: boolean }> {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
    const res = await fetch(url, {
      headers: { "User-Agent": "BiseoAssistant/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { data: null, ok: false };
    const data = (await res.json()) as CGCoin;
    if (!data?.market_data?.current_price?.usd) return { data, ok: false };
    return { data, ok: true };
  } catch {
    return { data: null, ok: false };
  }
}

function fmtNum(v: number | undefined | null, d = 2): string {
  return v !== undefined && v !== null ? v.toLocaleString("en-US", { maximumFractionDigits: d }) : "N/A";
}
function fmtPct(v: number | undefined | null): string {
  return v !== undefined && v !== null ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : "N/A";
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { coinId, name, symbol, recommendationReason } = (await req.json()) as {
    coinId: string;
    name: string;
    symbol: string;
    recommendationReason?: string;
  };
  if (!coinId || !name) return NextResponse.json({ error: "coinId, name required" }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });

  const cg = await fetchCoinGecko(coinId);
  const md = cg.data?.market_data;
  const price = md?.current_price?.usd ?? null;
  const change24h = md?.price_change_percentage_24h ?? null;
  const marketCap = md?.market_cap?.usd ?? null;
  const ath = md?.ath?.usd ?? null;
  const athPct = md?.ath_change_percentage?.usd ?? null;

  const dataParts = cg.ok
    ? [
        `현재가(USD): $${fmtNum(price)}`,
        `24h: ${fmtPct(change24h)}`,
        `30d: ${fmtPct(md?.price_change_percentage_30d)}`,
        `1y: ${fmtPct(md?.price_change_percentage_1y)}`,
        `시총: $${fmtNum(marketCap, 0)}`,
        `거래량(24h): $${fmtNum(md?.total_volume?.usd, 0)}`,
        `유통공급: ${fmtNum(md?.circulating_supply, 0)}`,
        `최대공급: ${fmtNum(md?.max_supply, 0)}`,
        `ATH: $${fmtNum(ath)} (${fmtPct(athPct)})`,
        `ATL변동: ${fmtPct(md?.atl_change_percentage?.usd)}`,
      ]
    : ["(CoinGecko 데이터 조회 실패 — 일반 지식과 추천 배경으로 판단)"];

  const systemPrompt = `너는 5명의 유명 코인 트레이더 관점을 모두 이해하는 멀티에이전트 분석 시스템이다.
각 트레이더의 철학에 충실하게 분석하되, 불확실해도 결론을 내린다.
제공된 실시간 시장 데이터를 최우선으로 활용해 구체적 수치 근거로 결론을 내려라.
데이터가 비어 있어도 "데이터 부재"를 사유로 일률적으로 관망/매도로 회피하지 마라.
그 경우엔 추천 배경, 일반적 시장 지식, 코인 카테고리(L1/L2/DeFi/AI 등)로 추정해 각 트레이더의 철학에 맞는 의견을 분명히 내라.
반드시 JSON으로만 답하라 (코드펜스/설명 금지).`;

  const recContext = recommendationReason
    ? `\nJKP 추천 배경 (참고): ${recommendationReason}\n위 추천 배경과 실시간 데이터를 함께 고려하되, 데이터가 상충하면 실시간 데이터를 우선하고 이유를 reason에 명시하라.`
    : "";

  const userPrompt = `코인: ${symbol} (${name}, CoinGecko id: ${coinId})
실시간 데이터: ${dataParts.join(" / ")}${recContext}

5명의 트레이더 관점 + 종합 분석을 다음 JSON으로만 답하라:
{
  "traders": [
    {
      "trader": "Michael Saylor",
      "style": "BTC 맥시멀리스트 · 장기 hodl",
      "verdict": "강력매수" | "매수" | "관망" | "매도" | "강력매도",
      "score": 0~100,
      "key_point": "Saylor 철학 핵심 한 문장",
      "reason": "Saylor 관점 근거 2문장 (BTC 본위/거시 인플레이션/장기 가치)"
    },
    {
      "trader": "Arthur Hayes",
      "style": "매크로 파생 · 펀딩비·옵션",
      "verdict": "...",
      "score": 0~100,
      "key_point": "...",
      "reason": "Hayes 관점 (펀딩비·금리·유동성 환경)"
    },
    {
      "trader": "PlanB",
      "style": "S2F · 반감기 사이클",
      "verdict": "...",
      "score": 0~100,
      "key_point": "...",
      "reason": "PlanB 관점 (사이클 단계·공급 모델·적정가)"
    },
    {
      "trader": "Raoul Pal",
      "style": "글로벌 매크로 · Exponential Age",
      "verdict": "...",
      "score": 0~100,
      "key_point": "...",
      "reason": "Pal 관점 (매크로·alt 분산·내러티브)"
    },
    {
      "trader": "Willy Woo",
      "style": "온체인 지표 (NVT/MVRV)",
      "verdict": "...",
      "score": 0~100,
      "key_point": "...",
      "reason": "Woo 관점 (온체인 축적/분배 시그널)"
    }
  ],
  "cycle": {
    "phase": "축적" | "상승 초기" | "상승 후기" | "분배" | "약세장",
    "cycle_comment": "사이클 위치 평가 한 문장",
    "macro_comment": "매크로 환경 평가 한 문장 (금리·유동성)",
    "onchain_comment": "온체인 지표 평가 한 문장",
    "fair_value_hint": "적정가 힌트 한 문장 (구체 수치 포함)"
  },
  "entryPlan": {
    "current_zone": "현재 진입 가능 구간 (예: $42k~$45k)",
    "ideal_entry": "이상적 진입 가격 또는 조건",
    "entry_trigger": "진입 트리거 (예: 50주 MA 회복, 펀딩비 음전환)",
    "stop_loss": "손절 기준",
    "target_short": "단기 목표가",
    "target_long": "장기 목표가",
    "partial_exit": "1차 목표 도달 시 부분 익절 전략",
    "full_exit": "완전 청산 조건 (가격·이벤트·기간)"
  },
  "consensus": "강력매수" | "매수" | "관망" | "매도" | "강력매도",
  "consensusScore": 0~100,
  "jkp_final": "JKP 최종 한마디 — 단정적으로 2문장"
}`;

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
    return NextResponse.json({ error: `Gemini ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
  }

  const geminiData = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const result = JSON.parse(raw) as Omit<
    CryptoReviewResult,
    "coinId" | "name" | "symbol" | "currentPrice" | "change24h" | "marketCap" | "ath" | "athChangePct"
  >;

  return NextResponse.json({
    coinId,
    name,
    symbol,
    currentPrice: price,
    change24h,
    marketCap,
    ath,
    athChangePct: athPct,
    ...result,
  } satisfies CryptoReviewResult);
}
