import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  DEFAULT_CRYPTO_SETTINGS,
  getCryptoSettings,
  saveCryptoSettings,
  type CryptoSettings,
} from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await getCryptoSettings(session.email);
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Partial<CryptoSettings>;
  const w: Partial<CryptoSettings["traderWeights"]> = body.traderWeights ?? {};
  const next: CryptoSettings = {
    traderWeights: {
      saylor: clamp(w.saylor, DEFAULT_CRYPTO_SETTINGS.traderWeights.saylor),
      hayes: clamp(w.hayes, DEFAULT_CRYPTO_SETTINGS.traderWeights.hayes),
      planb: clamp(w.planb, DEFAULT_CRYPTO_SETTINGS.traderWeights.planb),
      pal: clamp(w.pal, DEFAULT_CRYPTO_SETTINGS.traderWeights.pal),
      woo: clamp(w.woo, DEFAULT_CRYPTO_SETTINGS.traderWeights.woo),
    },
    defaultStopLossRate:
      typeof body.defaultStopLossRate === "number"
        ? Math.max(0, Math.min(50, body.defaultStopLossRate))
        : DEFAULT_CRYPTO_SETTINGS.defaultStopLossRate,
    focusThemes:
      typeof body.focusThemes === "string" ? body.focusThemes.slice(0, 300) : "",
  };
  await saveCryptoSettings(session.email, next);
  return NextResponse.json(next);
}

function clamp(v: unknown, fallback: number): number {
  return typeof v === "number" && v >= 0 && v <= 100 ? v : fallback;
}
