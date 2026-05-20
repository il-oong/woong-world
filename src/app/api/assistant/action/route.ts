import { type NextRequest } from "next/server";
import { createEvent, getValidSession } from "@/lib/google";
import { createPlan, updatePlan } from "@/lib/plans";
import { addRoutine } from "@/lib/routines";
import {
  isAssistantStorageConfigured,
  updateActionStatus,
} from "@/lib/assistant";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAssistantStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }

  let body: {
    messageId?: string;
    actionId?: string;
    decision?: "approve" | "reject";
    params?: Record<string, unknown>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.messageId || !body.actionId || !body.decision) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  if (body.decision === "reject") {
    const r = await updateActionStatus(
      session.email,
      body.messageId,
      body.actionId,
      "rejected",
    );
    if (!r) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true, status: "rejected" });
  }

  // approve → execute (params override applied to Redis + used for execution)
  const r = await updateActionStatus(
    session.email,
    body.messageId,
    body.actionId,
    "approved",
    body.params,
  );
  if (!r) return Response.json({ error: "not_found" }, { status: 404 });

  try {
    if (r.action.type === "add_event") {
      const ev = await createEvent(session, {
        summary: r.action.params.summary,
        description: r.action.params.description,
        kind: r.action.params.kind,
        start: r.action.params.start,
        end: r.action.params.end,
        categoryId: r.action.params.categoryId,
        reminderMinutes: r.action.params.reminderMinutes,
      });
      return Response.json({ ok: true, status: "approved", result: { event: ev } });
    }
    if (r.action.type === "create_plan") {
      const plan = await createPlan(session.email, {
        period: r.action.params.period,
        periodKey: r.action.params.periodKey,
        title: r.action.params.title,
        items: r.action.params.items,
        categoryId: r.action.params.categoryId ?? null,
        notes: r.action.params.notes,
      });
      return Response.json({ ok: true, status: "approved", result: { plan } });
    }
    if (r.action.type === "update_plan") {
      const plan = await updatePlan(
        session.email,
        r.action.params.planId,
        r.action.params.patch,
      );
      if (!plan) {
        return Response.json(
          { error: "plan_not_found" },
          { status: 404 },
        );
      }
      return Response.json({ ok: true, status: "approved", result: { plan } });
    }
    if (r.action.type === "create_routine") {
      const routine = await addRoutine(
        session.email,
        r.action.params.name,
        r.action.params.weekdays,
      );
      return Response.json({ ok: true, status: "approved", result: { routine } });
    }
    if (r.action.type === "suggest_command") {
      // No server execution — the user runs the command locally. Approval just
      // marks the suggestion as acknowledged in the chat history.
      return Response.json({ ok: true, status: "approved" });
    }
    return Response.json({ error: "unknown_action_type" }, { status: 400 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "execution_failed" },
      { status: 500 },
    );
  }
}
