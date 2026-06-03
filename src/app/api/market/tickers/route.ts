import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { getUserTickers, saveUserTickers, DEFAULT_TICKERS, type CustomTicker } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json(DEFAULT_TICKERS);
  const tickers = await getUserTickers(session.email);
  return NextResponse.json(tickers);
}

export async function PUT(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tickers = (await req.json()) as CustomTicker[];
  if (!Array.isArray(tickers)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await saveUserTickers(session.email, tickers.slice(0, 50));
  return NextResponse.json({ ok: true });
}
