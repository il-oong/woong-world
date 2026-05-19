import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { getSettings, listHoldings } from "@/lib/alpha";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const CACHE_TTL = 60 * 60 * 6; // 6시간

export type StockRecommendation = {
  ticker: string;
  name: string;
  market: "KR" | "US";
  theme: string;
  reason: string;
  valuation_view: "심각저평가" | "저평가" | "적정" | "고평가" | "심각고평가";
  urgency: "high" | "medium" | "low";
  expected_move: string;
  entry_hint: string;
  risk: string;
  generatedAt: number;
};

export type RecommendationsCache = {
  items: StockRecommendation[];
  generatedAt: number;
};

function redis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis not configured");
  return new Redis({ url, token });
}

const cacheKey = (email: string) => `alpha:recommendations:${email.toLowerCase()}`;

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = redis();
  const cached = await db.get<RecommendationsCache>(cacheKey(session.email));
  if (cached) return NextResponse.json(cached);
  return NextResponse.json({ items: [], generatedAt: 0 });
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { force?: boolean };
  const db = redis();

  // Cache check (6h), skip if force=true
  if (!body.force) {
    const cached = await db.get<RecommendationsCache>(cacheKey(session.email));
    if (cached && Date.now() - cached.generatedAt < CACHE_TTL * 1000) {
      return NextResponse.json(cached);
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });

  const [settings, holdings] = await Promise.all([
    getSettings(session.email),
    listHoldings(session.email),
  ]);
  const { livermore, oneil, weinstein, minervini, lynch } = settings.traderWeights;

  const holdingTickers = holdings.map((h) => `${h.name}(${h.ticker})`).join(", ") || "없음";
  const today = new Date().toISOString().slice(0, 10);

  const systemPrompt = `너는 JKP(James K. Park, 전 Bridgewater 펀드매니저)이자 시장 전략가다.
트레이더 가중치: Livermore ${livermore}% / O'Neil ${oneil}% / Weinstein ${weinstein}% / Minervini ${minervini}% / Lynch ${lynch}%
지금 당장 주목할 종목을 선정해야 한다. 모르겠다는 말은 없다. 근거 있는 의견을 낸다.
반드시 JSON 배열로만 답하라 (설명/코드펜스 금지).`;

  const userPrompt = `오늘: ${today}
현재 보유 종목 (제외 권고): ${holdingTickers}

지금 시장 상황에서 주목해야 할 KR/US 종목 6개를 선정하라.
보유 종목과 겹치지 않도록 하고, 다양한 섹터를 포함하라.

각 종목에 대해 다음 JSON 배열로만 답하라:
[
  {
    "ticker": "005930.KS 또는 AAPL 형식",
    "name": "종목명",
    "market": "KR" | "US",
    "theme": "핵심 테마 (2~4단어, 예: 반도체 턴어라운드)",
    "reason": "지금 주목하는 이유 2~3문장. 구체적 수치나 촉매 포함",
    "valuation_view": "심각저평가" | "저평가" | "적정" | "고평가" | "심각고평가",
    "urgency": "high" | "medium" | "low",
    "expected_move": "예상 상승/하락 폭 (예: +20~30%)",
    "entry_hint": "진입 힌트 한 문장 (가격 또는 조건)",
    "risk": "핵심 리스크 한 문장"
  }
]`;

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.8, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Gemini ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
  }

  const geminiData = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  const items = JSON.parse(raw) as StockRecommendation[];

  const cache: RecommendationsCache = { items: items.map(i => ({ ...i, generatedAt: Date.now() })), generatedAt: Date.now() };
  await db.set(cacheKey(session.email), cache, { ex: CACHE_TTL });

  return NextResponse.json(cache);
}
