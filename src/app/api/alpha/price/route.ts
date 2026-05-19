import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Yahoo Finance error: ${res.status}` }, { status: 502 });
    }

    const data = (await res.json()) as {
      chart?: {
        result?: {
          meta?: {
            regularMarketPrice?: number;
            regularMarketChangePercent?: number;
            currency?: string;
            symbol?: string;
          };
        }[];
        error?: { description?: string };
      };
    };

    if (data.chart?.error) {
      return NextResponse.json({ error: data.chart.error.description ?? "Unknown error" }, { status: 404 });
    }

    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) {
      return NextResponse.json({ error: "No price data" }, { status: 404 });
    }

    return NextResponse.json({
      ticker,
      price: meta.regularMarketPrice ?? null,
      changePercent: meta.regularMarketChangePercent ?? null,
      currency: meta.currency ?? "KRW",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
