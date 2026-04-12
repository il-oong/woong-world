import { NextRequest, NextResponse } from "next/server";
import { getRecentMeetings } from "@/lib/vault-reader";
import { clientKey, rateLimit, rateLimitResponse, sanitizeError } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "meetings"), 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const meetings = getRecentMeetings(7);
    return NextResponse.json({ meetings });
  } catch (err) {
    console.error("meetings route error", err);
    return NextResponse.json(
      { meetings: [], error: sanitizeError(err) },
      { status: 500 },
    );
  }
}
