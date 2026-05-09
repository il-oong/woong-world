import { type NextRequest } from "next/server";
import { getProfile } from "@/lib/secretary";
import { generateBriefingScript } from "@/lib/gemini";
import { synthesize, isTtsConfigured } from "@/lib/tts";
import { put } from "@vercel/blob";
import { listEvents, refreshSession } from "@/lib/google";
import { listPlans } from "@/lib/plans";
import {
  getAllSessionEmails,
  getSessionFromRedis,
  updateSessionInRedis,
  saveBriefingCache,
} from "@/lib/session-store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isTtsConfigured()) {
    return Response.json({ skipped: "tts_not_configured" });
  }

  const seoulHour = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  ).getHours();

  const emails = await getAllSessionEmails();
  if (emails.length === 0) {
    return Response.json({ processed: 0, hour: seoulHour });
  }

  const results: { email: string; status: string }[] = [];

  for (const email of emails) {
    try {
      const profile = await getProfile(email);
      if (!profile || profile.briefingHour !== seoulHour) {
        results.push({ email, status: "skipped" });
        continue;
      }

      let session = await getSessionFromRedis(email);
      if (!session) {
        results.push({ email, status: "no_session" });
        continue;
      }

      // 토큰 만료 시 자동 갱신
      if (session.expiresAt - 60_000 <= Date.now()) {
        const refreshed = await refreshSession(session);
        if (!refreshed) {
          results.push({ email, status: "token_expired" });
          continue;
        }
        session = refreshed;
        await updateSessionInRedis(session);
      }

      const now = new Date();
      const todayStart = new Date(
        now.getFullYear(), now.getMonth(), now.getDate(),
      ).toISOString();
      const dayAfterEnd = new Date(
        now.getFullYear(), now.getMonth(), now.getDate() + 2, 23, 59, 59,
      ).toISOString();

      const [events, plans] = await Promise.all([
        listEvents(session, todayStart, dayAfterEnd),
        listPlans(email),
      ]);

      const script = await generateBriefingScript(profile.name, events, plans);
      const audioBuffer = await synthesize(script, profile.voiceId);

      const dateStr = now.toISOString().slice(0, 10);
      const safeEmail = email.replace(/[^a-zA-Z0-9]/g, "_");
      const { url: audioUrl } = await put(
        `briefings/${safeEmail}/${dateStr}-auto.mp3`,
        audioBuffer,
        { access: "public", contentType: "audio/mpeg" },
      );

      await saveBriefingCache(email, { audioUrl, script, generatedAt: Date.now() });
      results.push({ email, status: "ok" });
    } catch (e) {
      results.push({
        email,
        status: `error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return Response.json({ processed: results.length, results, hour: seoulHour });
}
