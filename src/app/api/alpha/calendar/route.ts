import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { listEvents, addEvent, deleteEvent } from "@/lib/alpha";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listEvents(session.email));
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const ev = await addEvent(session.email, {
    title: body.title,
    eventDate: body.eventDate,
    importance: body.importance ?? "medium",
    market: body.market ?? "GLOBAL",
    memo: body.memo ?? "",
  });
  return NextResponse.json(ev, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ok = await deleteEvent(session.email, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
