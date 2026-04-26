import { isAssistantStorageConfigured } from "@/lib/assistant";
import { isBlobConfigured } from "@/lib/files";
import { isGeminiConfigured } from "@/lib/gemini";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    storage: isAssistantStorageConfigured(),
    ai: isGeminiConfigured(),
    blob: isBlobConfigured(),
  });
}
