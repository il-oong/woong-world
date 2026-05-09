import { getValidSession } from "@/lib/google";
import {
  getProfile,
  saveProfile,
  isStorageConfigured,
  type VoiceId,
} from "@/lib/secretary";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const profile = await getProfile(session.email);
  return Response.json({ profile });
}

export async function POST(req: Request) {
  if (!isStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  let body: { name?: string; voiceId?: VoiceId; briefingHour?: number; briefingMinute?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return Response.json({ error: "name_required" }, { status: 400 });
  }
  const profile = await saveProfile(session.email, {
    name: body.name.trim(),
    voiceId: body.voiceId ?? "ko-KR-Wavenet-A",
    briefingHour: body.briefingHour ?? 8,
    briefingMinute: body.briefingMinute ?? 0,
  });
  return Response.json({ profile });
}
