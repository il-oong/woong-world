import { isGeminiConfigured } from "@/lib/gemini";
import { isStorageConfigured } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    storage: isStorageConfigured(),
    ai: isGeminiConfigured(),
  });
}
