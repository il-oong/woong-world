import { type NextRequest } from "next/server";
import {
  getVapidPublicKey,
  isVapidConfigured,
  saveSubscription,
} from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isVapidConfigured()) {
    return Response.json({ error: "push_not_configured" }, { status: 503 });
  }
  try {
    return Response.json({ publicKey: getVapidPublicKey() });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "config_error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isVapidConfigured()) {
    return Response.json({ error: "push_not_configured" }, { status: 503 });
  }
  let body: {
    deviceId?: string;
    subscription?: { endpoint: string; keys: { p256dh: string; auth: string } };
    briefingHour?: number;
    oldHour?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const { deviceId, subscription, briefingHour, oldHour } = body;
  if (
    !deviceId ||
    !subscription?.endpoint ||
    !subscription.keys?.p256dh ||
    !subscription.keys?.auth ||
    briefingHour === undefined
  ) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    await saveSubscription(
      deviceId,
      { endpoint: subscription.endpoint, keys: subscription.keys, briefingHour },
      oldHour,
    );
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "save_failed" },
      { status: 500 },
    );
  }
}
