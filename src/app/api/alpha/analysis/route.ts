import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { getSettings } from "@/lib/alpha";
import type { JkpAnalysisResult } from "@/lib/alpha";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function callGeminiJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return JSON.parse(raw) as T;
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker, name, market } = await req.json();
  if (!ticker || !name) return NextResponse.json({ error: "ticker, name required" }, { status: 400 });

  const settings = await getSettings(session.email);
  const { livermore, oneil, weinstein, minervini, lynch } = settings.traderWeights;

  const systemPrompt = `너는 전 Bridgewater 시니어 펀드매니저 JKP(James K. Park)다.
투자 원칙: 매크로 우선 / 수급 중시 / 규율 / 단순함 / 리스크 퍼스트
현재 사용자 트레이더 가중치: Livermore ${livermore}% / O'Neil ${oneil}% / Weinstein ${weinstein}% / Minervini ${minervini}% / Lynch ${lynch}%

불확실한 정보가 있어도 네가 알고 있는 최선의 정보와 논리로 결론을 내려라.
"알 수 없다"는 답변은 없다. 보수적이더라도 방향을 제시해라.
반드시 JSON으로만 답하라 (설명 금지, 코드펜스 금지).`;

  const userPrompt = `${ticker}(${name}, ${market ?? "KR"}) 종목에 대해 지금 당장 판단을 내려야 한다.

반드시 포함할 것:
- 지금 사야 하는가 / 기다려야 하는가 / 팔아야 하는가 (final_action: "매수" | "관망" | "매도")
- 매수한다면 언제/어떤 조건에서 (buy_zone.entry_price, buy_zone.entry_condition, buy_zone.additional_buy)
- 목표가 2단계와 그 근거 (target_price.target_1, target_1_reason, target_2, target_2_reason)
- 손절가와 그 이유 (stop_loss, stop_loss_reason)
- 리스크 대비 수익 비율 (risk_reward_ratio)
- 투자 기간 (time_horizon)
- 핵심 촉매 2-3개 (key_catalysts: string[])
- 가장 중요한 리스크 1-2개 (key_risks: string[])
- JKP 한마디: 핵심 논거 2문장, 단정적으로 (jkp_comment)
- 확신 점수 0-100 (confidence)

다음 JSON 스키마로만 답하라:
{
  "final_action": string,
  "confidence": number,
  "buy_zone": { "entry_price": string, "entry_condition": string, "additional_buy": string },
  "target_price": { "target_1": string, "target_1_reason": string, "target_2": string, "target_2_reason": string },
  "stop_loss": string,
  "stop_loss_reason": string,
  "risk_reward_ratio": string,
  "time_horizon": string,
  "key_catalysts": string[],
  "key_risks": string[],
  "jkp_comment": string
}`;

  try {
    const result = await callGeminiJson<JkpAnalysisResult>(systemPrompt, userPrompt);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
