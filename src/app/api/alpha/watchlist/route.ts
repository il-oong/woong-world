import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { listWatchlist, addWatchItem, deleteWatchItem } from "@/lib/alpha";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listWatchlist(session.email));
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const item = await addWatchItem(session.email, {
    ticker: body.ticker,
    name: body.name,
    market: body.market,
    memo: body.memo ?? "",
  });
  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ok = await deleteWatchItem(session.email, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
