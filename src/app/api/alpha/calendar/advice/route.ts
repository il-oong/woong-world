import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { listEvents, listHoldings, updateEventAdvice } from "@/lib/alpha";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await req.json();
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

  const [events, holdings] = await Promise.all([
    listEvents(session.email),
    listHoldings(session.email),
  ]);

  const ev = events.find((e) => e.id === eventId);
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const today = new Date();
  const eventDate = new Date(ev.eventDate);
  const daysLeft = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const holdingsList = holdings.length
    ? holdings.map((h) => `${h.name}(${h.ticker}) ${h.qty}주 매수가 ${h.avgBuyPrice}`).join(", ")
    : "현재 보유 종목 없음";

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });

  const systemPrompt = `너는 JKP다. 다가오는 중요 금융 이벤트를 앞두고 현재 보유 포지션을 어떻게 할지 조언해야 한다.
각 액션에 대해 "왜 지금인가"를 근거로 제시하라.
불확실해도 방향을 결론 내려라. 관망도 의견이다.
반드시 JSON으로만 답하라 (설명 금지, 코드펜스 금지).`;

  const userPrompt = `이벤트: ${ev.title} (${ev.eventDate}, D${daysLeft >= 0 ? `-${daysLeft}` : `+${Math.abs(daysLeft)}`})
시장: ${ev.market}
중요도: ${ev.importance}
메모: ${ev.memo || "없음"}

현재 보유종목: ${holdingsList}

포지션 전략을 다음 JSON으로만 답하라:
{
  "summary": "한 줄 핵심 조언",
  "actions": [
    {
      "action": "매수" | "매도" | "추매" | "절반매도" | "보유" | "관망",
      "reason": "이유",
      "timing": "타이밍 (예: 발표 2일 전, 당일 장 시작 전)"
    }
  ],
  "riskNote": "핵심 리스크 1가지"
}`;

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Gemini error: ${text.slice(0, 200)}` }, { status: 502 });
  }

  const geminiData = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

  type AdviceJson = { summary: string; actions: { action: string; reason: string; timing: string }[]; riskNote: string };
  const advice = JSON.parse(raw) as AdviceJson;

  const saved = {
    summary: advice.summary ?? "",
    actions: (advice.actions ?? []) as NonNullable<Parameters<typeof updateEventAdvice>[2]["actions"]>,
    riskNote: advice.riskNote ?? "",
    generatedAt: Date.now(),
  };

  await updateEventAdvice(session.email, eventId, saved);
  return NextResponse.json(saved);
}
