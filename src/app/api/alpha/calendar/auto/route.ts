import { NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { listEvents, addEvent } from "@/lib/alpha";
import type { EconEvent } from "@/lib/alpha";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type AutoEvent = {
  title: string;
  eventDate: string;
  importance: "high" | "medium" | "low";
  market: "KR" | "US" | "GLOBAL";
  memo: string;
};

export async function POST() {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 90);
  const endStr = endDate.toISOString().slice(0, 10);

  const systemPrompt = `너는 경제 캘린더 전문가다. 정확한 날짜를 기반으로 주요 금융 이벤트를 JSON으로 반환한다.
날짜 형식은 반드시 "YYYY-MM-DD"이다. JSON 외 다른 텍스트는 출력하지 않는다.`;

  const userPrompt = `오늘: ${todayStr}
다음 기간의 주요 금융 경제 이벤트를 수집하라: ${todayStr} ~ ${endStr}

다음 카테고리를 포함하라:
- FOMC 금리결정 및 의사록 (US / high)
- CPI, PPI, PCE 물가 지표 (US / high)
- 고용 지표 (비농업 고용, 실업률) (US / high)
- GDP 발표 (US, 한국) (US 또는 KR / medium~high)
- 한국 기준금리 결정 (KR / high)
- 한국 수출입 통계 (KR / medium)
- 주요 빅테크/반도체 실적 (AAPL, MSFT, NVDA, TSMC, 삼성전자 등) (US 또는 KR / medium~high)
- 잭슨홀 등 주요 연설/심포지엄 (GLOBAL / medium)

반드시 실제 일정 날짜를 사용하라. 모르면 해당 일정을 빼라.
총 15~25개 이벤트를 JSON 배열로만 반환하라:
[
  {
    "title": "이벤트명",
    "eventDate": "YYYY-MM-DD",
    "importance": "high" | "medium" | "low",
    "market": "US" | "KR" | "GLOBAL",
    "memo": "간단한 설명 (투자 영향)"
  }
]`;

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Gemini error: ${text.slice(0, 200)}` }, { status: 502 });
  }

  const geminiData = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  const autoEvents = JSON.parse(raw) as AutoEvent[];

  // Deduplicate against existing events
  const existing = await listEvents(session.email);
  const existingTitles = new Set(existing.map((e) => `${e.title}|${e.eventDate}`));

  const toAdd = autoEvents.filter(
    (e) => !existingTitles.has(`${e.title}|${e.eventDate}`) && e.eventDate >= todayStr,
  );

  const added: EconEvent[] = [];
  for (const e of toAdd) {
    const ev = await addEvent(session.email, {
      title: e.title,
      eventDate: e.eventDate,
      importance: e.importance,
      market: e.market,
      memo: e.memo,
    });
    added.push(ev);
  }

  return NextResponse.json({ added: added.length, events: added });
}
