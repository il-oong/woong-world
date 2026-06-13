import { NextRequest, NextResponse } from "next/server";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export type StockSignal = "BUY" | "SELL" | "HOLD";

export type StockAnalysis = {
  ticker: string;
  name: string;
  market: string;
  price: number;
  priceChange: number;
  priceChangePct: number;
  signal: StockSignal;
  score: number;
  scores: {
    technical: number;
    momentum: number;
    volume: number;
    trend: number;
  };
  reasoning: string;
  keyPoints: string[];
  rsi: number;
  sma20: number;
  sma50: number;
  analysisAt: string;
};

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const changes = closes.slice(1).map((v, i) => v - closes[i]);
  const recent = changes.slice(-period);
  const gains = recent.filter((c) => c > 0).reduce((a, b) => a + b, 0) / period;
  const losses = recent.filter((c) => c < 0).reduce((a, b) => a + Math.abs(b), 0) / period;
  if (losses === 0) return 100;
  const rs = gains / losses;
  return Math.round(100 - 100 / (1 + rs));
}

function calcSMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1];
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcVolumeTrend(volumes: number[]): number {
  if (volumes.length < 20) return 50;
  const recent5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const avg20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const ratio = recent5 / avg20;
  return Math.min(100, Math.max(0, Math.round(ratio * 50)));
}

function toScore(value: number, low: number, high: number): number {
  return Math.min(100, Math.max(0, Math.round(((value - low) / (high - low)) * 100)));
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: `너는 James K. Park (JKP) — 20년 경력의 퀀트 투자 전문가다.
한국 주식과 미국 주식 모두 분석 가능하다.
RSI, 이동평균, 거래량, 모멘텀 데이터를 기반으로 매수/매도 판단을 내린다.
어조는 단호하고 직설적. 불필요한 말은 하지 않는다.
반드시 아래 JSON 형식으로만 출력한다 (코드펜스 없이):
{
  "signal": "BUY" | "SELL" | "HOLD",
  "score": 0~100,
  "reasoning": "한 문장 핵심 판단",
  "keyPoints": ["포인트1", "포인트2", "포인트3"]
}`,
        }],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawTicker = (searchParams.get("ticker") ?? "").toUpperCase().trim();
  const market = (searchParams.get("market") ?? "KR").toUpperCase();

  if (!rawTicker) {
    return NextResponse.json({ error: "ticker 파라미터가 필요합니다" }, { status: 400 });
  }

  const yTicker = market === "KR" ? `${rawTicker}.KS` : rawTicker;

  let yfData: Record<string, unknown>;
  try {
    const yfRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yTicker}?interval=1d&range=3mo`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible)",
          Accept: "application/json",
        },
      },
    );
    if (!yfRes.ok) {
      return NextResponse.json({ error: `종목을 찾을 수 없습니다: ${rawTicker}` }, { status: 404 });
    }
    yfData = (await yfRes.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "시세 데이터 조회 실패" }, { status: 502 });
  }

  const result = (yfData as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as {
    meta?: { regularMarketPrice?: number; previousClose?: number; shortName?: string; currency?: string };
    indicators?: {
      quote?: { close?: (number | null)[]; volume?: (number | null)[] }[];
    };
    timestamp?: number[];
  } | undefined;

  if (!result) {
    return NextResponse.json({ error: "시세 데이터 파싱 실패" }, { status: 502 });
  }

  const meta = result.meta ?? {};
  const rawCloses = result.indicators?.quote?.[0]?.close ?? [];
  const rawVolumes = result.indicators?.quote?.[0]?.volume ?? [];

  const closes = rawCloses.filter((v): v is number => v !== null && v !== undefined);
  const volumes = rawVolumes.filter((v): v is number => v !== null && v !== undefined);

  if (closes.length < 20) {
    return NextResponse.json({ error: "데이터가 부족합니다 (최소 20일 필요)" }, { status: 422 });
  }

  const price = meta.regularMarketPrice ?? closes[closes.length - 1];
  const prevClose = meta.previousClose ?? closes[closes.length - 2];
  const priceChange = price - prevClose;
  const priceChangePct = (priceChange / prevClose) * 100;
  const name = meta.shortName ?? rawTicker;

  const rsi = calcRSI(closes);
  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const currentPrice = closes[closes.length - 1];

  const momentum1m = ((currentPrice - closes[closes.length - 21]) / closes[closes.length - 21]) * 100;
  const momentum3m = ((currentPrice - closes[0]) / closes[0]) * 100;

  const techScore = toScore(rsi, 20, 80);
  const momentumScore = toScore((momentum1m + momentum3m) / 2, -20, 20);
  const volumeScore = calcVolumeTrend(volumes);
  const trendScore = currentPrice > sma20 ? (currentPrice > sma50 ? 80 : 60) : (currentPrice > sma50 ? 40 : 20);

  const analysisPrompt = `종목: ${name} (${rawTicker}, ${market} 시장)
현재가: ${price.toFixed(2)}
전일 대비: ${priceChange > 0 ? "+" : ""}${priceChange.toFixed(2)} (${priceChangePct.toFixed(2)}%)

=== 기술적 지표 ===
RSI(14): ${rsi} ${rsi < 30 ? "[과매도]" : rsi > 70 ? "[과매수]" : "[중립]"}
SMA20: ${sma20.toFixed(2)} (현재가 ${currentPrice > sma20 ? "위" : "아래"})
SMA50: ${sma50.toFixed(2)} (현재가 ${currentPrice > sma50 ? "위" : "아래"})

=== 모멘텀 ===
1개월 수익률: ${momentum1m.toFixed(1)}%
3개월 수익률: ${momentum3m.toFixed(1)}%

=== 거래량 ===
최근 5일 vs 20일 평균: ${(volumes.slice(-5).reduce((a, b) => a + b, 0) / 5 / (volumes.slice(-20).reduce((a, b) => a + b, 0) / 20) * 100).toFixed(0)}%

이 데이터를 바탕으로 매수/매도/홀드 판단을 내려줘.`;

  let geminiResult: { signal: StockSignal; score: number; reasoning: string; keyPoints: string[] };
  try {
    const raw = await callGemini(analysisPrompt);
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    geminiResult = JSON.parse(cleaned);
  } catch {
    const score = Math.round((techScore + momentumScore + volumeScore + trendScore) / 4);
    geminiResult = {
      signal: score >= 60 ? "BUY" : score <= 40 ? "SELL" : "HOLD",
      score,
      reasoning: "기술적 지표 기반 자동 판단 (AI 분석 실패)",
      keyPoints: [`RSI ${rsi}`, `1개월 ${momentum1m.toFixed(1)}%`, `SMA20 ${currentPrice > sma20 ? "상회" : "하회"}`],
    };
  }

  const analysis: StockAnalysis = {
    ticker: rawTicker,
    name,
    market,
    price,
    priceChange,
    priceChangePct,
    signal: geminiResult.signal,
    score: geminiResult.score,
    scores: {
      technical: techScore,
      momentum: momentumScore,
      volume: volumeScore,
      trend: trendScore,
    },
    reasoning: geminiResult.reasoning,
    keyPoints: geminiResult.keyPoints ?? [],
    rsi,
    sma20,
    sma50,
    analysisAt: new Date().toISOString(),
  };

  return NextResponse.json(analysis);
}
