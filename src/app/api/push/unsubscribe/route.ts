import { type NextRequest } from "next/server";
import { removeSubscription } from "@/lib/push";
import { getValidSession } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return Response.json({ error: "not_connected" }, { status: 401 });
  let body: { deviceId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const { deviceId } = body;
  if (typeof deviceId !== "string" || !/^[0-9a-f-]{36}$/i.test(deviceId)) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    await removeSubscription(deviceId, session.email.toLowerCase());
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "forbidden")
      return Response.json({ error: "forbidden" }, { status: 403 });
    return Response.json(
      { error: e instanceof Error ? e.message : "remove_failed" },
      { status: 500 },
    );
  }
}
