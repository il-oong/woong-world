import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { consumeUserRateLimit } from "@/lib/assistant";
import { runAgentReview } from "@/lib/stock-agents";

// 타입은 lib/stock-agents.ts로 이전했고, 기존 임포터 호환을 위해 여기서 재노출한다.
export type {
  AgentVerdict,
  AgentReview,
  ValuationDetail,
  BuyTiming,
  AgentReviewResult,
} from "@/lib/stock-agents";

export const dynamic = "force-dynamic";

function stockInput(value: unknown): {
  ticker: string;
  name: string;
  market: string;
  recommendationReason?: string;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (
    typeof body.ticker !== "string" ||
    typeof body.name !== "string" ||
    typeof body.market !== "string" ||
    !body.ticker.trim() ||
    !body.name.trim() ||
    !body.market.trim() ||
    body.ticker.length > 40 ||
    body.name.length > 200 ||
    body.market.length > 20 ||
    (body.recommendationReason !== undefined &&
      (typeof body.recommendationReason !== "string" || body.recommendationReason.length > 2_000))
  ) {
    return null;
  }
  return {
    ticker: body.ticker.trim(),
    name: body.name.trim(),
    market: body.market.trim(),
    recommendationReason: body.recommendationReason?.trim(),
  };
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let input: ReturnType<typeof stockInput>;
  try {
    input = stockInput(await req.json());
  } catch {
    input = null;
  }
  if (!input) return NextResponse.json({ error: "ticker, name, market required" }, { status: 400 });
  if (!(await consumeUserRateLimit(session.email, "stock-analysis", 6))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  }

  try {
    const result = await runAgentReview(input);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: `Agent review failed: ${String(err)}` }, { status: 502 });
  }
}
