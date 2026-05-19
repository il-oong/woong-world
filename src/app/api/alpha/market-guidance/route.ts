import { NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const CACHE_TTL = 60 * 60 * 2; // 2 hours

export type MarketGuidance = {
  today: string;
  week: string;
  keyRisk: string;
  stance: "bullish" | "bearish" | "neutral" | "cautious";
  generatedAt: number;
};

function getRedisCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const creds = getRedisCreds();
  if (!creds) throw new Error("Redis credentials not set");
  _redis = new Redis({ url: creds.url, token: creds.token });
  return _redis;
}

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = `alpha:guidance:${session.email.toLowerCase()}`;
  try {
    const cached = await redis().get<MarketGuidance>(key);
    if (cached) return NextResponse.json(cached);
  } catch {
    // Redis unavailable — fall through to generate
  }

  return NextResponse.json(null);
}

export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Gemini not configured" }, { status: 503 });

  let marketContext: string;
  try {
    const body = (await req.json()) as { marketContext?: string };
    marketContext = body.marketContext ?? "시장 데이터 없음";
  } catch {
    marketContext = "시장 데이터 없음";
  }

  const systemPrompt = `너는 JKP(James K. Park), 전 Bridgewater 시니어 펀드매니저다.
투자 원칙: 매크로 우선 / 수급 중시 / 규율 / 단순함 / 리스크 퍼스트
O'Neil·Lynch·Weinstein·Minervini의 관점을 통합하여 시장을 본다.

현재 시장 지표를 기반으로 오늘과 이번 주 행동 지침을 제시하라.
불확실해도 방향을 결론 내려라. "알 수 없다"는 금지.
반드시 한국어로, 다음 JSON으로만 답하라 (코드펜스 금지):
{ "today": "오늘 행동 지침 (2-3문장)", "week": "이번 주 전략 (2-3문장)", "keyRisk": "핵심 리스크 1가지 (1문장)", "stance": "bullish|bearish|neutral|cautious" }`;

  const userMsg = `현재 시장 상황:\n${marketContext}\n\n오늘과 이번 주 JKP 행동 지침을 제시하라.`;

  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return NextResponse.json({ error: "Gemini error" }, { status: 502 });

    const raw = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = JSON.parse(text) as Partial<MarketGuidance>;

    const guidance: MarketGuidance = {
      today: parsed.today ?? "",
      week: parsed.week ?? "",
      keyRisk: parsed.keyRisk ?? "",
      stance: parsed.stance ?? "neutral",
      generatedAt: Date.now(),
    };

    const key = `alpha:guidance:${session.email.toLowerCase()}`;
    try {
      await redis().set(key, guidance, { ex: CACHE_TTL });
    } catch {
      // Non-fatal: cache miss is ok
    }

    return NextResponse.json(guidance);
  } catch {
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
