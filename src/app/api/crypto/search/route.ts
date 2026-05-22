import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";

export const dynamic = "force-dynamic";

export type CoinMatch = {
  coinId: string;
  symbol: string;
  name: string;
  rank: number | null;
  thumb: string | null;
};

export async function GET(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([] satisfies CoinMatch[]);

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`,
      {
        headers: { "User-Agent": "BiseoAssistant/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) return NextResponse.json([]);
    const data = (await res.json()) as {
      coins?: { id?: string; symbol?: string; name?: string; market_cap_rank?: number; thumb?: string }[];
    };
    const matches: CoinMatch[] = (data.coins ?? []).slice(0, 12).map((c) => ({
      coinId: c.id ?? "",
      symbol: (c.symbol ?? "").toUpperCase(),
      name: c.name ?? "",
      rank: c.market_cap_rank ?? null,
      thumb: c.thumb ?? null,
    })).filter((m) => m.coinId && m.name);
    return NextResponse.json(matches);
  } catch {
    return NextResponse.json([]);
  }
}
