import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { getChatMessages, addChatMessage } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const messages = await getChatMessages(60);
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.content?.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });

  const name = session.email.split("@")[0];
  const msg = await addChatMessage({
    author: name,
    content: body.content.trim().slice(0, 300),
    createdAt: Date.now(),
    stockTag: body.stockTag ?? null,
  });
  return NextResponse.json(msg, { status: 201 });
}
