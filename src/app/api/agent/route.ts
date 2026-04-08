import { NextRequest, NextResponse } from "next/server";
import { chatWithGemini } from "@/lib/gemini-client";
import prompts from "@/data/prompts.json";

const promptData = prompts as Record<string, string>;

export async function POST(req: NextRequest) {
  try {
    const { agentId, command, projectContext } = await req.json();

    if (!agentId || !command) {
      return NextResponse.json({ error: "agentId and command required" }, { status: 400 });
    }

    const basePrompt = promptData[agentId] || "";
    const systemPrompt = `${basePrompt}

당신은 지금 AI 개발 에이전트로서 활동합니다. 사령관의 명령에 따라 실제로 코드를 작성하거나, 기획을 하거나, 분석을 수행합니다.

프로젝트 컨텍스트: ${projectContext || "없음"}

결과물은 마크다운 형식으로 제공하세요. 코드는 \`\`\`로 감싸세요.
실행 가능한 구체적인 결과물을 만들어주세요.`;

    const reply = await chatWithGemini(systemPrompt, [], command);

    return NextResponse.json({
      reply,
      agent: agentId,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const error = err as Error;

    if (error.message === "NO_API_KEY") {
      return NextResponse.json({
        reply: "[데모 모드] Gemini API 키를 .env.local에 추가하면 에이전트가 실제로 코드를 생성합니다.",
        demo: true,
      });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
