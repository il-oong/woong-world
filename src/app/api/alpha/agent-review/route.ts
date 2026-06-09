import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
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

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker, name, market, recommendationReason } = (await req.json()) as {
    ticker: string;
    name: string;
    market: string;
    recommendationReason?: string;
  };
  if (!ticker || !name) return NextResponse.json({ error: "ticker, name required" }, { status: 400 });

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  }

  try {
    const result = await runAgentReview({ ticker, name, market, recommendationReason });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: `Agent review failed: ${String(err)}` }, { status: 502 });
  }
}
