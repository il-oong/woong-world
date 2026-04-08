import { NextRequest, NextResponse } from "next/server";
import { chatWithGemini, ChatMessage } from "@/lib/gemini-client";
import prompts from "@/data/prompts.json";

const promptData = prompts as Record<string, string>;

export async function POST(req: NextRequest) {
  try {
    const { crewId, message, history } = await req.json();

    if (!crewId || !message) {
      return NextResponse.json({ error: "crewId and message required" }, { status: 400 });
    }

    const systemPrompt = promptData[crewId];
    if (!systemPrompt) {
      return NextResponse.json({ error: `No prompt found for crew: ${crewId}` }, { status: 404 });
    }

    // Convert history format
    const geminiHistory: ChatMessage[] = (history || []).map((msg: { role: string; content: string }) => ({
      role: msg.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: msg.content }],
    }));

    const reply = await chatWithGemini(systemPrompt, geminiHistory, message);

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    const error = err as Error;

    if (error.message === "NO_API_KEY") {
      return NextResponse.json({
        reply: "[데모 모드] Gemini API 키가 설정되지 않았습니다. .env.local에 GEMINI_API_KEY를 추가해주세요.",
        demo: true,
      });
    }

    if (error.message === "RATE_LIMITED") {
      return NextResponse.json({
        reply: "[Rate Limited] 잠시 후 다시 시도해주세요. API 키 쿨다운 중입니다.",
        rateLimited: true,
      });
    }

    console.error("Chat API error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
