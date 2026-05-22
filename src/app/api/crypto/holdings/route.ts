import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  addCryptoHolding,
  deleteCryptoHolding,
  listCryptoHoldings,
} from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const holdings = await listCryptoHoldings(session.email);
  return NextResponse.json({ holdings });
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    coinId?: string;
    symbol?: string;
    name?: string;
    qty?: number;
    avgBuyPrice?: number;
    memo?: string;
  };
  if (!body.coinId || !body.symbol || !body.name) {
    return NextResponse.json({ error: "coinId, symbol, name required" }, { status: 400 });
  }
  const h = await addCryptoHolding(session.email, {
    coinId: body.coinId.trim().toLowerCase(),
    symbol: body.symbol.trim().toUpperCase(),
    name: body.name.trim(),
    qty: typeof body.qty === "number" ? body.qty : 0,
    avgBuyPrice: typeof body.avgBuyPrice === "number" ? body.avgBuyPrice : 0,
    memo: typeof body.memo === "string" ? body.memo.slice(0, 200) : "",
  });
  return NextResponse.json({ holding: h });
}

export async function DELETE(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = await deleteCryptoHolding(session.email, id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
