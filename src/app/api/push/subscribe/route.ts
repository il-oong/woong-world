import { type NextRequest } from "next/server";
import {
  getVapidPublicKey,
  isVapidConfigured,
  saveSubscription,
} from "@/lib/push";
import { getValidSession } from "@/lib/google";

export const dynamic = "force-dynamic";

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

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
  const session = await getValidSession();
  if (!session?.email) return Response.json({ error: "not_connected" }, { status: 401 });
  if (!isVapidConfigured()) {
    return Response.json({ error: "push_not_configured" }, { status: 503 });
  }
  let body: {
    deviceId?: string;
    subscription?: { endpoint: string; keys: { p256dh: string; auth: string } };
    briefingHour?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const { deviceId, subscription, briefingHour } = body;
  if (
    typeof deviceId !== "string" || !/^[0-9a-f-]{36}$/i.test(deviceId) ||
    !validEndpoint(subscription?.endpoint) ||
    typeof subscription.keys?.p256dh !== "string" ||
    subscription.keys.p256dh.length > 512 ||
    typeof subscription.keys?.auth !== "string" ||
    subscription.keys.auth.length > 512 ||
    !Number.isInteger(briefingHour) || briefingHour! < 0 || briefingHour! > 23
  ) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    await saveSubscription(
      deviceId,
      { ownerEmail: session.email.toLowerCase(), endpoint: subscription.endpoint, keys: subscription.keys, briefingHour: briefingHour! },
    );
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "forbidden")
      return Response.json({ error: "forbidden" }, { status: 403 });
    return Response.json(
      { error: e instanceof Error ? e.message : "save_failed" },
      { status: 500 },
    );
  }
}
