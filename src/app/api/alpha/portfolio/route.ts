import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  listHoldings,
  addHolding,
  updateHolding,
  deleteHolding,
  saveHoldings,
} from "@/lib/alpha";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const holdings = await listHoldings(session.email);
  return NextResponse.json(holdings);
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const holding = await addHolding(session.email, {
    ticker: body.ticker,
    name: body.name,
    market: body.market,
    qty: Number(body.qty),
    avgBuyPrice: Number(body.avgBuyPrice),
    target1: Number(body.target1),
    target2: Number(body.target2),
    stopLoss: Number(body.stopLoss),
    memo: body.memo ?? "",
  });
  return NextResponse.json(holding, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...patch } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ok = await updateHolding(session.email, id, patch);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ok = await deleteHolding(session.email, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
