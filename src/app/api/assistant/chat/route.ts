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
import { chatWithAssistant, isGeminiConfigured, type StreamEvent } from "@/lib/gemini";
import { isAdminEmail } from "@/lib/admin";
import { loadPlugins } from "@/lib/plugins-store";
import { getAllPluginStatuses } from "@/lib/github-status";
import {
  listHoldings,
  listWatchlist,
  listEvents as listEconEvents,
  getSettings as getInvestSettings,
} from "@/lib/alpha";

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

  const email = session.email;
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - 1);
  const toDate = new Date(today);
  toDate.setDate(toDate.getDate() + 14);

  // 모든 컨텍스트를 병렬로 수집
  const [history, allFiles, plans, upcomingEventsResult, isAdmin, stockResult] =
    await Promise.all([
      loadChat(email),
      listFiles(email),
      listPlans(email),
      listEvents(session, fromDate.toISOString(), toDate.toISOString()).catch(() => []),
      isAdminEmail(email),
      Promise.all([
        listHoldings(email),
        listWatchlist(email),
        listEconEvents(email),
        getInvestSettings(email),
      ]).catch(() => null),
    ]);

  const upcomingEvents = upcomingEventsResult;

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

  // Admin 플러그인 컨텍스트 (병렬 수집 후 처리)
  let pluginContext:
    | {
        plugin: Awaited<ReturnType<typeof loadPlugins>>[number];
        status: Awaited<ReturnType<typeof getAllPluginStatuses>>[number];
      }[]
    | undefined;
  if (isAdmin) {
    try {
      const plugins = await loadPlugins();
      const statuses = await getAllPluginStatuses(plugins);
      const map = new Map(statuses.map((s) => [s.pluginId, s]));
      pluginContext = plugins
        .map((p) => {
          const s = map.get(p.id);
          return s ? { plugin: p, status: s } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    } catch {
      // best-effort
    }
  }

  const stock = stockResult
    ? {
        holdings: stockResult[0],
        watchlist: stockResult[1],
        econEvents: stockResult[2],
        settings: stockResult[3],
      }
    : undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventType: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(
            `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };

      const onToken = (event: StreamEvent) => {
        if (event.type === "token") send("token", { text: event.text });
        else if (event.type === "reset") send("reset", {});
        else if (event.type === "status") send("status", { message: event.message });
      };

      try {
        const r = await chatWithAssistant({
          history,
          userMessage: text,
          attachments: attachedFiles,
          context: {
            email,
            today: toIsoDate(today),
            upcomingEvents,
            activePlans: plans,
            files: allFiles,
            isAdmin,
            plugins: pluginContext,
            stock,
          },
          onToken,
        });

        const assistantMsg: ChatMessage = {
          id: newId("msg"),
          role: "assistant",
          text: r.text,
          proposedActions: r.proposedActions?.length ? r.proposedActions : undefined,
          ts: Date.now(),
        };

        const messages = await appendChat(email, userMsg, assistantMsg);
        send("done", { user: userMsg, assistant: assistantMsg, messages });
      } catch (e) {
        send("error", {
          error: e instanceof Error ? e.message : "chat_failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
