import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { getSentimentPoll, voteSentiment } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const market = req.nextUrl.searchParams.get("market") ?? "KR";
  const poll = await getSentimentPoll(date, market);
  return NextResponse.json(poll);
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { date, market, direction } = await req.json();
  if (!direction || !["up", "down", "mixed"].includes(direction))
    return NextResponse.json({ error: "invalid direction" }, { status: 400 });
  const result = await voteSentiment(
    date ?? new Date().toISOString().slice(0, 10),
    market ?? "KR",
    direction,
  );
  return NextResponse.json(result);
}
