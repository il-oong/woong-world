import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { voteOnPoll } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, option } = await req.json();
  if (!id || !option) return NextResponse.json({ error: "id and option required" }, { status: 400 });
  const votes = await voteOnPoll(id, option);
  return NextResponse.json({ votes });
}
