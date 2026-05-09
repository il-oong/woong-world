import { type NextRequest } from "next/server";
import { removeSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { deviceId?: string; briefingHour?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const { deviceId, briefingHour } = body;
  if (!deviceId || briefingHour === undefined) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    await removeSubscription(deviceId, briefingHour);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "remove_failed" },
      { status: 500 },
    );
  }
}
