import { type NextRequest } from "next/server";
import { getValidSession, listEvents } from "@/lib/google";
import { listPlans } from "@/lib/plans";
import {
  appendChat,
  type ChatAttachment,
  type ChatMessage,
  isAssistantStorageConfigured,
  listFiles,
  loadChat,
  newId,
} from "@/lib/assistant";
import { chatWithAssistant, isGeminiConfigured } from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isAssistantStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  if (!isGeminiConfigured()) {
    return Response.json({ error: "gemini_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }

  let body: { text?: string; attachmentFileIds?: string[] };
  try {
    body = (await req.json()) as {
      text?: string;
      attachmentFileIds?: string[];
    };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = body.text?.trim();
  if (!text) return Response.json({ error: "empty" }, { status: 400 });

  // Gather context
  const [history, allFiles, plans] = await Promise.all([
    loadChat(session.email),
    listFiles(session.email),
    listPlans(session.email),
  ]);
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - 1);
  const toDate = new Date(today);
  toDate.setDate(toDate.getDate() + 14);
  let upcomingEvents: Awaited<ReturnType<typeof listEvents>> = [];
  try {
    upcomingEvents = await listEvents(
      session,
      fromDate.toISOString(),
      toDate.toISOString(),
    );
  } catch {
    // Calendar fetch is best-effort; chat still works without it.
  }

  const attachmentIds = body.attachmentFileIds ?? [];
  const attachedFiles = allFiles.filter((f) => attachmentIds.includes(f.id));
  const attachmentRefs: ChatAttachment[] = attachedFiles.map((f) => ({
    fileId: f.id,
    name: f.name,
    kind: f.kind,
  }));

  const userMsg: ChatMessage = {
    id: newId("msg"),
    role: "user",
    text,
    attachments: attachmentRefs.length ? attachmentRefs : undefined,
    ts: Date.now(),
  };

  let result: { text: string; proposedActions: typeof userMsg.proposedActions };
  try {
    const r = await chatWithAssistant({
      history,
      userMessage: text,
      attachments: attachedFiles,
      context: {
        email: session.email,
        today: toIsoDate(today),
        upcomingEvents,
        activePlans: plans,
        files: allFiles,
      },
    });
    result = { text: r.text, proposedActions: r.proposedActions };
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "chat_failed" },
      { status: 500 },
    );
  }

  const assistantMsg: ChatMessage = {
    id: newId("msg"),
    role: "assistant",
    text: result.text,
    proposedActions: result.proposedActions?.length
      ? result.proposedActions
      : undefined,
    ts: Date.now(),
  };

  const messages = await appendChat(session.email, userMsg, assistantMsg);
  return Response.json({
    user: userMsg,
    assistant: assistantMsg,
    messages,
  });
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
