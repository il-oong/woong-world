import { readSession } from "@/lib/session";
import {
  aiRequestSchema,
  CRISIS_TEXT,
  hasSafetySignal,
} from "@/lib/mental-health";
import { aiReady, generateSupport } from "@/lib/mental-health-ai";
import { allowAiRequest, storageReady } from "@/lib/mental-health-store";
import { limitedJson, privateJson, sameOrigin } from "@/lib/mental-health-http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "forbidden" }, 403);
  const session = await readSession();
  if (!session?.email) return privateJson({ error: "not_connected" }, 401);
  if (req.headers.get("x-mental-owner") !== session.email)
    return privateJson({ error: "account_changed" }, 409);
  let input;
  try {
    input = aiRequestSchema.parse(await limitedJson(req));
  } catch {
    return privateJson({ error: "invalid_input" }, 400);
  }
  const safetyText = [
    input.context,
    ...input.messages.filter((m) => m.role === "user").map((m) => m.text),
  ].join("\n");
  if (hasSafetySignal(safetyText))
    return privateJson({ text: CRISIS_TEXT, safety: true });
  if (!aiReady() || !storageReady())
    return privateJson({ error: "ai_unavailable" }, 503);
  try {
    if (!(await allowAiRequest(session.email)))
      return privateJson({ error: "rate_limited" }, 429);
    const out = await generateSupport(input);
    return privateJson({ text: out.text, safety: out.crisis });
  } catch {
    return privateJson({ error: "ai_failed" }, 503);
  }
}
