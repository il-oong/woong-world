import { aiRequestSchema, SYSTEM_PROMPT } from "./mental-health";
import type { z } from "zod";
import { MOMENT_SYSTEM_PROMPT } from "./mental-health-moment";
export function aiReady() {
  return Boolean(
    process.env.GEMINI_API_KEY &&
    process.env.MENTAL_HEALTH_AI_PRIVACY_REVIEWED === "true",
  );
}
export async function generateSupport(
  input: z.infer<typeof aiRequestSchema>,
): Promise<string> {
  if (!aiReady()) throw new Error("ai_unavailable");
  const model = process.env.MENTAL_HEALTH_MODEL || "gemini-2.5-flash";
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error("ai_unavailable");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(40_000),
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY!,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                SYSTEM_PROMPT +
                (input.mode === "moment" ? "\n" + MOMENT_SYSTEM_PROMPT : ""),
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: JSON.stringify({
                  task:
                    input.mode === "report"
                      ? "선택된 기록만 사용해 자기관리 보고서를 작성해 줘."
                      : input.mode === "moment"
                        ? "불안한 지금 이 순간에 맞춰 짧게 도와줘. 마지막 사용자 말에 답하고 안전한 다음 행동 하나를 함께 정해줘."
                        : "아래 대화의 마지막 사용자 말에 답해 줘.",
                  selectedContext: input.context,
                  conversation: input.messages,
                }),
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.4, maxOutputTokens: 3000 },
      }),
    },
  );
  // Never return provider bodies: they can contain sensitive request material.
  if (!res.ok) throw new Error("ai_failed");
  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason !== "STOP") throw new Error("ai_failed");
  const text = candidate.content?.parts
    ?.filter((p: { text?: string; thought?: boolean }) => !p.thought)
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  if (!text || text.length > 12000) throw new Error("ai_failed");
  return text;
}
