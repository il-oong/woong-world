import { type NextRequest } from "next/server";
import { createEvent, getValidSession } from "@/lib/google";
import { createPlan, updatePlan } from "@/lib/plans";
import { addRoutine } from "@/lib/routines";
import { addTodo, removeTodo, updateTodo } from "@/lib/todos";
import { addSubscription, removeSubscription } from "@/lib/subscriptions";
import { addWatchItem, deleteWatchItem } from "@/lib/alpha";
import { isAdminSession } from "@/lib/admin";
import { engineCreateBackup, engineSync } from "@/lib/vault-sync/engine";
import {
  appendAssistantActionAudit,
  claimAssistantAction,
  finishAssistantAction,
  isAssistantStorageConfigured,
} from "@/lib/assistant";

export const dynamic = "force-dynamic";

type Decision = "approve" | "reject";

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value) && value.length <= 120;
}

function claimError(state: Exclude<Awaited<ReturnType<typeof claimAssistantAction>>["state"], "claimed">) {
  if (state === "invalid_params") {
    return Response.json({ error: "invalid_action_params" }, { status: 400 });
  }
  if (state === "busy") {
    return Response.json({ error: "action_in_progress" }, { status: 409 });
  }
  if (state === "not_pending") {
    return Response.json({ error: "action_already_decided" }, { status: 409 });
  }
  return Response.json({ error: "not_found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  if (!isAssistantStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }

  let body: {
    messageId?: unknown;
    actionId?: unknown;
    decision?: unknown;
    params?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    !isRequestId(body.messageId) ||
    !isRequestId(body.actionId) ||
    (body.decision !== "approve" && body.decision !== "reject")
  ) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  const decision = body.decision as Decision;
  const claim = await claimAssistantAction(
    session.email,
    body.messageId,
    body.actionId,
    decision === "approve" ? body.params : undefined,
  );
  if (claim.state !== "claimed") return claimError(claim.state);

  const { action } = claim;
  if (decision === "reject") {
    await finishAssistantAction(
      session.email,
      body.messageId,
      body.actionId,
      "rejected",
      action.params,
    );
    await appendAssistantActionAudit(session.email, {
      messageId: body.messageId,
      actionId: body.actionId,
      actionType: action.type,
      status: "rejected",
      params: action.params,
    });
    return Response.json({ ok: true, status: "rejected" });
  }

  try {
    let result: Record<string, unknown> | undefined;

    if (action.type === "add_event") {
      result = {
        event: await createEvent(session, {
          summary: action.params.summary,
          description: action.params.description,
          kind: action.params.kind,
          start: action.params.start,
          end: action.params.end,
          categoryId: action.params.categoryId,
          reminderMinutes: action.params.reminderMinutes,
        }),
      };
    } else if (action.type === "create_plan") {
      result = {
        plan: await createPlan(session.email, {
          period: action.params.period,
          periodKey: action.params.periodKey,
          title: action.params.title,
          items: action.params.items,
          categoryId: action.params.categoryId ?? null,
          notes: action.params.notes,
        }),
      };
    } else if (action.type === "update_plan") {
      const plan = await updatePlan(
        session.email,
        action.params.planId,
        action.params.patch,
      );
      if (!plan) {
        await finishAssistantAction(
          session.email,
          body.messageId,
          body.actionId,
          "failed",
          action.params,
        );
        await appendAssistantActionAudit(session.email, {
          messageId: body.messageId,
          actionId: body.actionId,
          actionType: action.type,
          status: "failed",
          params: action.params,
          error: "plan_not_found",
        });
        return Response.json({ error: "plan_not_found" }, { status: 404 });
      }
      result = { plan };
    } else if (action.type === "create_routine") {
      result = {
        routine: await addRoutine(
          session.email,
          action.params.name,
          action.params.weekdays,
        ),
      };
    } else if (action.type === "manage_workspace") {
      const operation = action.params;
      if (operation.operation === "add_todo") {
        result = { todo: await addTodo(session.email, operation.text, operation.scope) };
      } else if (operation.operation === "update_todo") {
        const todo = await updateTodo(session.email, operation.id, operation.patch);
        if (!todo) throw new Error("todo_not_found");
        result = { todo };
      } else if (operation.operation === "remove_todo") {
        if (!(await removeTodo(session.email, operation.id))) throw new Error("todo_not_found");
        result = { removed: operation.id };
      } else if (operation.operation === "add_subscription") {
        result = {
          subscription: await addSubscription(session.email, {
            name: operation.name,
            amount: operation.amount,
            paymentDay: operation.paymentDay,
            cycle: operation.cycle,
            monthOfYear: operation.monthOfYear,
          }),
        };
      } else if (operation.operation === "remove_subscription") {
        const subscription = await removeSubscription(session.email, operation.id);
        if (!subscription) throw new Error("subscription_not_found");
        result = { removed: subscription };
      } else if (operation.operation === "add_watch_item") {
        result = {
          watchItem: await addWatchItem(session.email, {
            ticker: operation.ticker,
            name: operation.name,
            market: operation.market,
            memo: operation.memo ?? "",
          }),
        };
      } else if (operation.operation === "remove_watch_item") {
        if (!(await deleteWatchItem(session.email, operation.id))) {
          throw new Error("watch_item_not_found");
        }
        result = { removed: operation.id };
      } else {
        if (!(await isAdminSession())) throw new Error("admin_required");
        result =
          operation.operation === "sync_vault"
            ? { state: await engineSync("assistant-approved") }
            : await engineCreateBackup();
      }
    }
    // suggest_command is intentionally only acknowledged. It never reaches a shell.

    await finishAssistantAction(
      session.email,
      body.messageId,
      body.actionId,
      "approved",
      action.params,
    );
    await appendAssistantActionAudit(session.email, {
      messageId: body.messageId,
      actionId: body.actionId,
      actionType: action.type,
      status: "approved",
      params: action.params,
    });
    return Response.json({ ok: true, status: "approved", result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "execution_failed";
    await finishAssistantAction(
      session.email,
      body.messageId,
      body.actionId,
      "failed",
      action.params,
    );
    await appendAssistantActionAudit(session.email, {
      messageId: body.messageId,
      actionId: body.actionId,
      actionType: action.type,
      status: "failed",
      params: action.params,
      error: message.slice(0, 500),
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
