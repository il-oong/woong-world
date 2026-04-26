import { getValidSession } from "@/lib/google";
import {
  isAssistantStorageConfigured,
  removeFile,
} from "@/lib/assistant";
import { deleteBlob } from "@/lib/files";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: RouteContext<"/api/assistant/files/[id]">,
) {
  if (!isAssistantStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const file = await removeFile(session.email, id);
  if (!file) return Response.json({ error: "not_found" }, { status: 404 });
  await deleteBlob(file.blobUrl);
  return Response.json({ ok: true });
}
