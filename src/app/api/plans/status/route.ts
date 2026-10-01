import { isGeminiConfigured } from "@/lib/gemini";
import { isStorageConfigured } from "@/lib/plans";
import { getValidSession } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return Response.json({ error: "not_connected" }, { status: 401 });
  return Response.json({
    storage: isStorageConfigured(),
    ai: isGeminiConfigured(),
  });
}
