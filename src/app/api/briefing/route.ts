import { getValidSession, listEvents, listAllCalendarsEvents, listCalendars } from "@/lib/google";
import { listPlans } from "@/lib/plans";
import { getProfile, isStorageConfigured } from "@/lib/secretary";
import { generateBriefingScript, getBriefingMode } from "@/lib/gemini";
import { synthesize, isTtsConfigured } from "@/lib/tts";
import { put } from "@vercel/blob";
import { getCalendarFilter } from "@/lib/calendar-filter";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  if (!isTtsConfigured()) {
    return Response.json({ error: "tts_not_configured" }, { status: 503 });
  }

  try {
    const profile = await getProfile(session.email);
    const secretaryName = profile?.name ?? "비서";
    const voiceId = profile?.voiceId ?? "ko-KR-Wavenet-A";

    const now = new Date();
    const mode = getBriefingMode(now);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const rangeEnd =
      mode === "monthly"
        ? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()
        : mode === "weekly"
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59).toISOString()
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 23, 59, 59).toISOString();

    const [calFilter, allCals, plans] = await Promise.all([
      getCalendarFilter(session.email),
      listCalendars(session),
      listPlans(session.email),
    ]);
    const calIds = calFilter
      ? calFilter.filter((id) => allCals.some((c) => c.id === id))
      : allCals.map((c) => c.id);
    const events = await listAllCalendarsEvents(session, todayStart, rangeEnd, calIds);

    const script = await generateBriefingScript(secretaryName, events, plans, mode);
    const audioBuffer = await synthesize(script, voiceId);

    const dateStr = now.toISOString().slice(0, 10);
    const safeEmail = session.email.replace(/[^a-zA-Z0-9]/g, "_");
    const { url: audioUrl } = await put(
      `briefings/${safeEmail}/${dateStr}-${Date.now()}.mp3`,
      audioBuffer,
      { access: "public", contentType: "audio/mpeg" },
    );

    return Response.json({ audioUrl, script });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "briefing_failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
