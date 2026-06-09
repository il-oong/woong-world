import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { getSettings } from "@/lib/alpha";
import { runJkpAnalysis } from "@/lib/stock-agents";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker, name, market } = await req.json();
  if (!ticker || !name) return NextResponse.json({ error: "ticker, name required" }, { status: 400 });

  const settings = await getSettings(session.email);

  try {
    const result = await runJkpAnalysis({ ticker, name, market, settings });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
