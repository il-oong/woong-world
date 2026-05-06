import { NextRequest, NextResponse } from "next/server";
import { removeSub } from "@/lib/push";

export async function POST(req: NextRequest) {
  const { endpoint } = (await req.json()) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  await removeSub(endpoint);
  return NextResponse.json({ ok: true });
}
