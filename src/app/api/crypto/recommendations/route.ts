import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { getCryptoSettings, listCryptoHoldings } from "@/lib/crypto";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const CACHE_TTL = 60 * 60 * 6; // 6시간

export type CoinRecommendation = {
  coinId: string;          // CoinGecko id ("bitcoin")
  symbol: string;          // "BTC"
  name: string;            // "Bitcoin"
  type: "major" | "alt" | "stable_hedge" | "short";  // 포지션 유형
  theme: string;
  reason: string;
  cycle_view: "축적" | "상승 초기" | "상승 후기" | "분배" | "약세장";
  urgency: "high" | "medium" | "low";
  expected_move: string;
  entry_hint: string;
  risk: string;
  generatedAt: number;
};

export type CryptoRecommendationsCache = {
  items: CoinRecommendation[];
  generatedAt: number;
};

function redis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis not configured");
  return new Redis({ url, token });
}

const cacheKey = (email: string) => `crypto:recommendations:${email.toLowerCase()}`;

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cached = await redis().get<CryptoRecommendationsCache>(cacheKey(session.email));
  if (cached) return NextResponse.json(cached);
  return NextResponse.json({ items: [], generatedAt: 0 });
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { force?: boolean };
  const db = redis();

  if (!body.force) {
    const cached = await db.get<CryptoRecommendationsCache>(cacheKey(session.email));
    if (cached && Date.now() - cached.generatedAt < CACHE_TTL * 1000) {
      return NextResponse.json(cached);
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });

  const [settings, holdings] = await Promise.all([
    getCryptoSettings(session.email),
    listCryptoHoldings(session.email),
  ]);
  const w = settings.traderWeights;
  const holdingsList = holdings.map((h) => `${h.symbol}(${h.coinId})`).join(", ") || "없음";
  const today = new Date().toISOString().slice(0, 10);

  const systemPrompt = `너는 5명의 유명 코인 트레이더의 관점을 종합하는 시장 전략가다.
트레이더 가중치: Saylor ${w.saylor}% / Hayes ${w.hayes}% / PlanB ${w.planb}% / Pal ${w.pal}% / Woo ${w.woo}%
- Michael Saylor: BTC 맥시멀리스트. 거시 인플레이션 헤지로서 BTC 장기 hodl.
- Arthur Hayes: 매크로 파생 트레이더. 펀딩비/옵션·금리/유동성 환경으로 단·중기 방향성.
- PlanB: Stock-to-Flow. 반감기 사이클로 BTC 적정가 추정, 사이클 단계 판단.
- Raoul Pal: 글로벌 매크로 + "Exponential Age". ETH·고품질 alt에 분산.
- Willy Woo: 온체인 (NVT, MVRV, Coin Days Destroyed)로 축적/분배 국면 판단.

지금 당장 매수·관망·숏할 코인/방향을 명확히 정해라. 모르겠다는 말은 없다.
반드시 JSON 배열로만 답하라 (설명/코드펜스 금지).`;

  const userPrompt = `오늘: ${today}
현재 보유 (제외 권고): ${holdingsList}

지금 시장 사이클·매크로 환경에서 주목해야 할 코인/포지션을 총 10개 선정하라.
구성:
- major: 2~3개 (BTC/ETH 등 시총 상위)
- alt: 4~5개 (L1, L2, DeFi, AI 인프라 등 — 카테고리 다양하게)
- stable_hedge: 1~2개 (스테이블 + 수익 전략, 단기 캐시 회피 등)
- short: 1~2개 (선물 숏 또는 풋옵션 후보, 또는 약세 알트)

각 항목마다 구체적 근거(시총, 1년 변동, 펀딩비/공포지수 추정, 사이클 위치 등)를 포함.
coinId는 반드시 CoinGecko id 소문자 영문 (예: "bitcoin", "ethereum", "solana", "chainlink", "render-token").

다음 JSON 배열로만 답하라:
[
  {
    "coinId": "CoinGecko id (예: bitcoin)",
    "symbol": "BTC",
    "name": "Bitcoin",
    "type": "major" | "alt" | "stable_hedge" | "short",
    "theme": "핵심 테마 (2~4단어, 예: 반감기 이후 분배 초입)",
    "reason": "지금 주목하는 이유 2~3문장. 구체 수치·촉매 포함",
    "cycle_view": "축적" | "상승 초기" | "상승 후기" | "분배" | "약세장",
    "urgency": "high" | "medium" | "low",
    "expected_move": "예상 폭 (예: +30~80%, 헤지 +10%)",
    "entry_hint": "진입 조건 — 가격 레벨 또는 시장 트리거",
    "risk": "핵심 리스크 — 하방 시나리오와 예상 손실 폭"
  }
]`;

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
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
  const items = JSON.parse(raw) as CoinRecommendation[];

  const cache: CryptoRecommendationsCache = {
    items: items.map((i) => ({ ...i, generatedAt: Date.now() })),
    generatedAt: Date.now(),
  };
  await db.set(cacheKey(session.email), cache, { ex: CACHE_TTL });

  return NextResponse.json(cache);
}
