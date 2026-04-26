import { getValidSession } from "@/lib/google";
import {
  clearChat,
  isAssistantStorageConfigured,
  loadChat,
} from "@/lib/assistant";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAssistantStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const messages = await loadChat(session.email);
  return Response.json({ messages });
}

export async function DELETE() {
  if (!isAssistantStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  await clearChat(session.email);
  return Response.json({ ok: true });
}
