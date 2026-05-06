import { NextRequest, NextResponse } from "next/server";
import { saveSub, type PushSub } from "@/lib/push";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as PushSub;
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  await saveSub(body);
  return NextResponse.json({ ok: true });
}
