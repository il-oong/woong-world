import { NextResponse } from "next/server";
import { getRecentMeetings } from "@/lib/vault-reader";

export async function GET() {
  try {
    const meetings = getRecentMeetings(7);
    return NextResponse.json({ meetings });
  } catch (err) {
    return NextResponse.json({ meetings: [], error: String(err) });
  }
}
