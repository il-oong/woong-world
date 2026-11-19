import {
  aiRequestSchema,
  SYSTEM_PROMPT,
  CHAT_REPLY_SCHEMA,
  CHAT_FORMAT_PROMPT,
  RELATIONSHIP_REPORT_PROMPT,
  RELATIONSHIP_REPORT_SCHEMA,
  enforceOneQuestion,
  tooManyQuestions,
} from "./mental-health";
import type { z } from "zod";
import { MOMENT_SYSTEM_PROMPT } from "./mental-health-moment";
export function aiReady() {
  return Boolean(
    process.env.GEMINI_API_KEY &&
    process.env.MENTAL_HEALTH_AI_PRIVACY_REVIEWED === "true",
  );
}
export function aiMissing() {
  const missing: string[] = [];
  if (!process.env.GEMINI_API_KEY) missing.push("GEMINI_API_KEY");
  if (process.env.MENTAL_HEALTH_AI_PRIVACY_REVIEWED !== "true")
    missing.push("MENTAL_HEALTH_AI_PRIVACY_REVIEWED");
  return missing;
}
type Input = z.infer<typeof aiRequestSchema>;
export async function generateSupport(
  input: Input,
): Promise<{ text: string; crisis: boolean }> {
  if (input.mode === "relationship") {
    const raw = await callGemini(
      input,
      true,
      undefined,
      RELATIONSHIP_REPORT_SCHEMA,
    );
    JSON.parse(raw);
    return { text: raw, crisis: false };
  }
  if (input.mode === "report")
    return { text: await callGemini(input, false), crisis: false };
  const parse = async (hint?: string) => {
    const raw = await callGemini(input, true, hint);
    let o: { reply_text?: string; question?: string; risk_level?: string };
    try {
      o = JSON.parse(raw);
    } catch {
      // Not JSON: use the plain text as is, with no retry.
      return { reply_text: raw, question: "", risk: "plain" };
    }
    return {
      reply_text: String(o.reply_text ?? ""),
      question: String(o.question ?? ""),
      risk: o.risk_level,
    };
  };
  let out = await parse();
  if (!out.question.trim() && out.risk !== "crisis" && out.risk !== "plain")
    out = await parse(
      "(시스템 알림: 직전 답변에 질문이 없었습니다. 공감과 반영 뒤에 더 깊이 들어가는 질문 한 문장을 question에 쓰세요.)",
    );
  if (tooManyQuestions(out))
    out = await parse(
      "(시스템 알림: 질문이 둘 이상이었습니다. 질문은 question에 한 문장만 쓰고 reply_text에는 물음표를 쓰지 마세요.)",
    );
  const { reply, question } = enforceOneQuestion(out);
  const text = [reply, question].filter(Boolean).join("\n\n");
  if (!text) throw new Error("ai_failed");
  return { text, crisis: out.risk === "crisis" };
}
async function callGemini(
  input: Input,
  json: boolean,
  hint?: string,
  schema: object = CHAT_REPLY_SCHEMA,
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
                (json && input.mode !== "relationship"
                  ? "\n" + CHAT_FORMAT_PROMPT
                  : "") +
                (input.mode === "relationship"
                  ? "\n" + RELATIONSHIP_REPORT_PROMPT
                  : "") +
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
                    input.mode === "relationship"
                      ? "관계 기록만 근거로 관계 분석 보고서를 작성해 줘."
                      : input.mode === "report"
                        ? "선택된 기록만 사용해 자기관리 보고서를 작성해 줘."
                        : input.mode === "moment"
                          ? "불안한 지금 이 순간에 맞춰 짧게 도와줘. 마지막 사용자 말에 답하고 안전한 다음 행동 하나를 함께 정해줘."
                          : "아래 대화의 마지막 사용자 말에 답해 줘.",
                  selectedContext: input.context,
                  conversation: input.messages,
                  ...(hint ? { systemNotice: hint } : {}),
                }),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: input.mode === "relationship" ? 8000 : 3000,
          ...(json
            ? {
                responseMimeType: "application/json",
                responseSchema: schema,
              }
            : {}),
        },
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
  if (!text || text.length > (input.mode === "relationship" ? 30000 : 12000))
    throw new Error("ai_failed");
  return text;
}
