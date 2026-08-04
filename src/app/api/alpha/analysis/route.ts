import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { getSettings } from "@/lib/alpha";
import { consumeUserRateLimit } from "@/lib/assistant";
import { runJkpAnalysis } from "@/lib/stock-agents";

export const dynamic = "force-dynamic";

function stockInput(value: unknown): { ticker: string; name: string; market?: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (
    typeof body.ticker !== "string" ||
    typeof body.name !== "string" ||
    !body.ticker.trim() ||
    !body.name.trim() ||
    body.ticker.length > 40 ||
    body.name.length > 200 ||
    (body.market !== undefined && typeof body.market !== "string")
  ) {
    return null;
  }
  return { ticker: body.ticker.trim(), name: body.name.trim(), market: body.market?.trim() };
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let input: { ticker: string; name: string; market?: string } | null;
  try {
    input = stockInput(await req.json());
  } catch {
    input = null;
  }
  if (!input) return NextResponse.json({ error: "ticker, name required" }, { status: 400 });
  if (!(await consumeUserRateLimit(session.email, "stock-analysis", 6))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const settings = await getSettings(session.email);

  try {
    const result = await runJkpAnalysis({ ...input, settings });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
