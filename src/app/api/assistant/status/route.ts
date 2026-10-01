import { isAssistantStorageConfigured } from "@/lib/assistant";
import { isBlobConfigured } from "@/lib/files";
import { isGeminiConfigured } from "@/lib/gemini";
import { getValidSession } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return Response.json({ error: "not_connected" }, { status: 401 });
  return Response.json({
    storage: isAssistantStorageConfigured(),
    ai: isGeminiConfigured(),
    blob: isBlobConfigured(),
  });
}
