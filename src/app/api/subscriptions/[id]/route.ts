import { type NextRequest } from "next/server";
import { deleteEvent, getValidSession } from "@/lib/google";
import {
  getSubscription,
  isSubscriptionStorageConfigured,
  removeSubscription,
} from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSubscriptionStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await getSubscription(session.email, id);
  if (!existing) return Response.json({ error: "not_found" }, { status: 404 });

  // Best-effort: remove the linked calendar event if any.
  if (existing.calendarEventId) {
    try {
      await deleteEvent(session, existing.calendarEventId);
    } catch {
      // ignore — we still want to remove the subscription
    }
  }
  await removeSubscription(session.email, id);
  return Response.json({ ok: true });
}
