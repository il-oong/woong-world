import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import { consumeUserRateLimit } from "@/lib/assistant";
import { FEMALE_VOICES, getProfile } from "@/lib/secretary";
import { isTtsConfigured, synthesize } from "@/lib/tts";

export const dynamic = "force-dynamic";

const MAX_CHARS = 1_200;

/** Reads assistant replies aloud for voice conversation mode. */
export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  if (!isTtsConfigured()) {
    return Response.json({ error: "tts_not_configured" }, { status: 503 });
  }
  let body: { text?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";
  if (!text) return Response.json({ error: "empty_text" }, { status: 400 });

  try {
    if (!(await consumeUserRateLimit(session.email, "assistant-speak", 30))) {
      return Response.json({ error: "rate_limited" }, { status: 429 });
    }
    const profile = await getProfile(session.email).catch(() => null);
    // Voice mode always speaks with a female voice: keep the saved one only if it is female.
    const voice = profile && FEMALE_VOICES.has(profile.voiceId) ? profile.voiceId : "ko-KR-Wavenet-A";
    const audio = await synthesize(text, voice);
    return new Response(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "speak_failed";
    return Response.json({ error: message.slice(0, 200) }, { status: 502 });
  }
}
