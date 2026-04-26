import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import { addFile, isAssistantStorageConfigured } from "@/lib/assistant";
import { fetchUrlAsFile } from "@/lib/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isAssistantStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }

  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.url?.trim()) {
    return Response.json({ error: "no_url" }, { status: 400 });
  }

  try {
    const processed = await fetchUrlAsFile(session.email, body.url.trim());
    await addFile(session.email, processed);
    return Response.json({ file: processed });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "url_failed" },
      { status: 500 },
    );
  }
}
