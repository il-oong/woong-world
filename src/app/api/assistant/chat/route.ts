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

  // Admin gets plugin registry + status injected so the assistant can report
  // on plugin health when asked.
  const isAdmin = await isAdminEmail(session.email);
  let pluginContext: { plugin: Awaited<ReturnType<typeof loadPlugins>>[number]; status: Awaited<ReturnType<typeof getAllPluginStatuses>>[number] }[] | undefined;
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
      // Plugin status is best-effort; chat still works without it.
    }
  }

  // 주식/투자 컨텍스트 — 뇌 네트워크가 보유·관심·경제일정·설정을 인지하고,
  // 주식 질문이면 하위 에이전트에 위임할 수 있도록 주입한다 (best-effort).
  let stock:
    | {
        holdings: Awaited<ReturnType<typeof listHoldings>>;
        watchlist: Awaited<ReturnType<typeof listWatchlist>>;
        econEvents: Awaited<ReturnType<typeof listEconEvents>>;
        settings: Awaited<ReturnType<typeof getInvestSettings>>;
      }
    | undefined;
  try {
    const [holdings, watchlist, econEvents, settings] = await Promise.all([
      listHoldings(session.email),
      listWatchlist(session.email),
      listEconEvents(session.email),
      getInvestSettings(session.email),
    ]);
    stock = { holdings, watchlist, econEvents, settings };
  } catch {
    // 투자 데이터는 선택사항 — 없어도 채팅은 동작한다.
  }

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
        isAdmin,
        plugins: pluginContext,
        stock,
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
