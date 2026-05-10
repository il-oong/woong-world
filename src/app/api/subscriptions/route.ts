import { type NextRequest } from "next/server";
import { createEvent, getValidSession } from "@/lib/google";
import {
  addSubscription,
  isoDate,
  isSubscriptionStorageConfigured,
  listSubscriptions,
  monthlyTotal,
  nextPaymentDate,
  setCalendarEventId,
  type SubscriptionCycle,
} from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!isSubscriptionStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const subscriptions = await listSubscriptions(session.email);
  return Response.json({
    subscriptions,
    monthlyTotal: monthlyTotal(subscriptions),
  });
}

type AddBody = {
  name?: string;
  amount?: number;
  paymentDay?: number;
  monthOfYear?: number;
  cycle?: SubscriptionCycle;
  syncCalendar?: boolean;
};

export async function POST(req: NextRequest) {
  if (!isSubscriptionStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }

  let body: AddBody;
  try {
    body = (await req.json()) as AddBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = body.name?.trim();
  const amount = Number(body.amount);
  const paymentDay = Number(body.paymentDay);
  const cycle: SubscriptionCycle = body.cycle === "yearly" ? "yearly" : "monthly";
  const monthOfYear = body.monthOfYear != null ? Number(body.monthOfYear) : undefined;

  if (!name) return Response.json({ error: "missing_name" }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) {
    return Response.json({ error: "invalid_amount" }, { status: 400 });
  }
  if (!Number.isFinite(paymentDay) || paymentDay < 1 || paymentDay > 31) {
    return Response.json({ error: "invalid_payment_day" }, { status: 400 });
  }

  const sub = await addSubscription(session.email, {
    name,
    amount,
    paymentDay,
    monthOfYear,
    cycle,
  });

  // Optional: sync to Google Calendar as a recurring all-day event.
  if (body.syncCalendar) {
    try {
      const next = nextPaymentDate(sub);
      const startStr = isoDate(next);
      const rrule =
        sub.cycle === "monthly"
          ? `RRULE:FREQ=MONTHLY;BYMONTHDAY=${sub.paymentDay}`
          : `RRULE:FREQ=YEARLY;BYMONTH=${sub.monthOfYear ?? 1};BYMONTHDAY=${sub.paymentDay}`;
      const event = await createEvent(session, {
        summary: `💳 ${sub.name} 결제일`,
        description: `${sub.cycle === "monthly" ? "월간" : "연간"} 구독 (${sub.amount.toLocaleString("ko-KR")}원)`,
        kind: "allday",
        start: startStr,
        end: startStr,
        recurrence: [rrule],
        reminderMinutes: 60 * 12, // 12 hours before
      });
      await setCalendarEventId(session.email, sub.id, event.id);
      return Response.json({ ok: true, subscription: { ...sub, calendarEventId: event.id } });
    } catch (e) {
      // Subscription added; calendar sync failed. Report so UI can warn.
      return Response.json({
        ok: true,
        subscription: sub,
        calendarSyncError: e instanceof Error ? e.message : "calendar_sync_failed",
      });
    }
  }

  return Response.json({ ok: true, subscription: sub });
}
