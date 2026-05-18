import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { listEvents, listHoldings, updateEventAdvice } from "@/lib/alpha";
import type { EconEvent } from "@/lib/alpha";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type PriceResult = { ticker: string; price: number | null; changePercent: number | null };

async function fetchPrice(ticker: string): Promise<PriceResult> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ticker, price: null, changePercent: null };
    const data = (await res.json()) as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; regularMarketChangePercent?: number } }[] };
    };
    const meta = data.chart?.result?.[0]?.meta;
    return {
      ticker,
      price: meta?.regularMarketPrice ?? null,
      changePercent: meta?.regularMarketChangePercent ?? null,
    };
  } catch {
    return { ticker, price: null, changePercent: null };
  }
}

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

  // Fetch current prices for all holdings in parallel
  let holdingsContext = "현재 보유 종목 없음";
  if (holdings.length > 0) {
    const priceResults = await Promise.allSettled(
      holdings.map((h) => fetchPrice(h.ticker)),
    );

    const holdingLines = holdings.map((h, i) => {
      const pr = priceResults[i];
      const pd = pr.status === "fulfilled" ? pr.value : null;
      const currentPrice = pd?.price;
      const pct = currentPrice && h.avgBuyPrice > 0
        ? (((currentPrice - h.avgBuyPrice) / h.avgBuyPrice) * 100).toFixed(1)
        : null;

      const parts = [
        `${h.name}(${h.ticker})`,
        `${h.qty}주`,
        `매수가 ${h.avgBuyPrice.toLocaleString()}`,
      ];
      if (currentPrice) parts.push(`현재가 ${currentPrice.toLocaleString()}`);
      if (pct) parts.push(`수익률 ${Number(pct) > 0 ? "+" : ""}${pct}%`);
      if (pd?.changePercent !== null && pd?.changePercent !== undefined) {
        parts.push(`오늘 ${pd.changePercent > 0 ? "+" : ""}${pd.changePercent.toFixed(2)}%`);
      }
      if (h.target1 > 0) parts.push(`목표1 ${h.target1.toLocaleString()}`);
      if (h.target2 > 0) parts.push(`목표2 ${h.target2.toLocaleString()}`);
      if (h.stopLoss > 0) parts.push(`손절 ${h.stopLoss.toLocaleString()}`);
      return parts.join(" / ");
    });

    holdingsContext = holdingLines.join("\n");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });

  const dLabel = daysLeft >= 0 ? `D-${daysLeft}` : `D+${Math.abs(daysLeft)}`;

  const systemPrompt = `너는 JKP다. 다가오는 중요 금융 이벤트를 앞두고 보유 포지션을 어떻게 할지 단정적으로 조언해야 한다.
각 액션에 대해 "왜 지금인가"를 구체적으로 제시하라. 관망도 의견이다. 불확실해도 방향을 결론 내려라.
반드시 JSON으로만 답하라 (설명 금지, 코드펜스 금지).`;

  const userPrompt = `이벤트: ${ev.title} (${ev.eventDate}, ${dLabel})
시장: ${ev.market} / 중요도: ${ev.importance}
메모: ${ev.memo || "없음"}

현재 보유 포지션 (실시간 가격 반영):
${holdingsContext}

위 정보를 바탕으로 이벤트 전 포지션 전략을 수립하라.
보유 종목별로 또는 전체 포트폴리오 관점에서 구체적으로 조언하라.

다음 JSON으로만 답하라:
{
  "summary": "전체 포지션 방향 한 줄 요약",
  "actions": [
    {
      "action": "매수" | "매도" | "추매" | "절반매도" | "보유" | "관망",
      "reason": "구체적 이유",
      "timing": "타이밍 (예: 발표 2일 전, 당일 장 시작 전, 결과 확인 후)"
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

  const saved: NonNullable<EconEvent["positionAdvice"]> = {
    summary: advice.summary ?? "",
    actions: (advice.actions ?? []) as NonNullable<EconEvent["positionAdvice"]>["actions"],
    riskNote: advice.riskNote ?? "",
    generatedAt: Date.now(),
  };

  await updateEventAdvice(session.email, eventId, saved);
  return NextResponse.json(saved);
}
