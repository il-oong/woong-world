import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const YF_HEADERS = { "User-Agent": "Mozilla/5.0" };

export type AgentVerdict = "강력매수" | "매수" | "관망" | "매도" | "강력매도";

export type AgentReview = {
  agent: string;
  style: string;
  verdict: AgentVerdict;
  score: number; // 0-100 (bullish)
  key_point: string;
  reason: string;
};

export type ValuationDetail = {
  view: "심각저평가" | "저평가" | "적정" | "고평가" | "심각고평가";
  pe_comment: string;
  pb_comment: string;
  growth_comment: string;
  intrinsic_value_hint: string;
};

export type BuyTiming = {
  current_stage: string;
  ideal_entry: string;
  entry_trigger: string;
  stop_loss: string;
  target_short: string;
  target_long: string;
  partial_exit?: string;
  full_exit?: string;
};

export type AgentReviewResult = {
  ticker: string;
  name: string;
  currentPrice: number | null;
  changePercent: number | null;
  agents: AgentReview[];
  valuation: ValuationDetail;
  buyTiming: BuyTiming;
  consensus: AgentVerdict;
  consensusScore: number;
  jkp_final: string;
};

async function fetchPrice(ticker: string): Promise<{ price: number | null; changePercent: number | null; ok: boolean }> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
      { headers: YF_HEADERS, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return { price: null, changePercent: null, ok: false };
    const data = (await res.json()) as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; regularMarketChangePercent?: number } }[] };
    };
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return { price: null, changePercent: null, ok: false };
    return { price: meta.regularMarketPrice, changePercent: meta.regularMarketChangePercent ?? null, ok: true };
  } catch {
    return { price: null, changePercent: null, ok: false };
  }
}

async function fetchFundamentals(ticker: string): Promise<{ text: string; ok: boolean }> {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=summaryDetail,financialData,defaultKeyStatistics`;
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { text: "(데이터 없음)", ok: false };
    const data = (await res.json()) as {
      quoteSummary?: {
        result?: {
          summaryDetail?: { trailingPE?: { raw?: number }; forwardPE?: { raw?: number }; marketCap?: { raw?: number }; beta?: { raw?: number }; fiftyTwoWeekLow?: { raw?: number }; fiftyTwoWeekHigh?: { raw?: number } };
          financialData?: { targetMeanPrice?: { raw?: number }; recommendationKey?: string; revenueGrowth?: { raw?: number }; returnOnEquity?: { raw?: number }; debtToEquity?: { raw?: number }; grossMargins?: { raw?: number } };
          defaultKeyStatistics?: { priceToBook?: { raw?: number }; "52WeekChange"?: { raw?: number }; forwardEps?: { raw?: number }; trailingEps?: { raw?: number } };
        }[];
      };
    };
    const r = data.quoteSummary?.result?.[0];
    if (!r) return { text: "(데이터 없음)", ok: false };
    const sd = r.summaryDetail ?? {};
    const fd = r.financialData ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const pct = (v?: number) => v !== undefined ? `${(v * 100).toFixed(1)}%` : "N/A";
    const fmt = (v?: number, d = 2) => v !== undefined ? v.toFixed(d) : "N/A";
    const parts = [
      `P/E(trailing): ${fmt(sd.trailingPE?.raw)}`,
      `P/E(forward): ${fmt(sd.forwardPE?.raw)}`,
      `PBR: ${fmt(ks.priceToBook?.raw)}`,
      `EPS: ${fmt(ks.trailingEps?.raw)}`,
      `52주범위: ${fmt(sd.fiftyTwoWeekLow?.raw, 0)}~${fmt(sd.fiftyTwoWeekHigh?.raw, 0)}`,
      `52주변동: ${pct(ks["52WeekChange"]?.raw)}`,
      `매출성장률: ${pct(fd.revenueGrowth?.raw)}`,
      `ROE: ${pct(fd.returnOnEquity?.raw)}`,
      `부채비율: ${fmt(fd.debtToEquity?.raw)}`,
      `목표주가: ${fmt(fd.targetMeanPrice?.raw, 0)}`,
      `애널리스트추천: ${fd.recommendationKey ?? "N/A"}`,
      `베타: ${fmt(sd.beta?.raw)}`,
    ];
    // 모든 핵심 값이 N/A면 데이터가 사실상 없는 것으로 간주.
    const hasAny = parts.some((p) => !p.endsWith("N/A"));
    return { text: parts.join(" / "), ok: hasAny };
  } catch {
    return { text: "(데이터 없음)", ok: false };
  }
}

// 추천 단계의 Gemini가 ticker 접미사를 잘못 줄 수 있다(예: 코스닥인데 .KS).
// 우선 받은 ticker 그대로 시도하고, 데이터가 비면 .KS/.KQ/접미사 없는 형태로
// 한 번씩 더 시도해 첫 번째로 살아있는 ticker를 채택한다.
function tickerCandidates(ticker: string): string[] {
  const t = ticker.trim();
  const candidates = new Set<string>([t]);
  const bare = t.replace(/\.(KS|KQ)$/i, "");
  if (bare !== t) {
    candidates.add(bare);
    // 같은 코드를 반대 거래소로
    candidates.add(`${bare}.${t.toUpperCase().endsWith(".KS") ? "KQ" : "KS"}`);
  } else if (/^\d{6}$/.test(t)) {
    // 한국 6자리 숫자 코드만 들어온 경우
    candidates.add(`${t}.KS`);
    candidates.add(`${t}.KQ`);
  }
  return [...candidates];
}

async function resolveTicker(input: string): Promise<{
  ticker: string;
  price: number | null;
  changePercent: number | null;
  fundamentals: string;
  dataOk: boolean;
}> {
  const candidates = tickerCandidates(input);
  let best: {
    ticker: string;
    price: number | null;
    changePercent: number | null;
    fundamentals: string;
    dataOk: boolean;
  } | null = null;
  for (const c of candidates) {
    const [p, f] = await Promise.all([fetchPrice(c), fetchFundamentals(c)]);
    const dataOk = p.ok || f.ok;
    if (p.ok && f.ok) {
      return { ticker: c, price: p.price, changePercent: p.changePercent, fundamentals: f.text, dataOk: true };
    }
    if (dataOk && !best) {
      best = { ticker: c, price: p.price, changePercent: p.changePercent, fundamentals: f.text, dataOk };
    }
  }
  if (best) return best;
  return { ticker: input, price: null, changePercent: null, fundamentals: "(데이터 없음)", dataOk: false };
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker, name, market, recommendationReason } = await req.json() as { ticker: string; name: string; market: string; recommendationReason?: string };
  if (!ticker || !name) return NextResponse.json({ error: "ticker, name required" }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });

  const resolved = await resolveTicker(ticker);

  const systemPrompt = `너는 4명의 전설적 투자자들의 관점을 모두 이해하는 멀티에이전트 분석 시스템이다.
각 에이전트의 철학에 충실하게 분석하되, 불확실해도 결론을 내린다.
제공된 실시간 펀더멘털 데이터를 최우선으로 활용해 구체적 수치 근거로 결론을 내려라.
실시간 데이터가 "(데이터 없음)"으로 표기되어 비어 있어도 "데이터 부재"를 사유로 일률적으로 관망/매도로 회피하지 마라.
그 경우엔 JKP 추천 배경, 해당 기업·섹터에 대한 일반적 지식, 종목명/시장 정보로 추정해 각 에이전트의 철학에 맞는 의견을 분명히 내고, "데이터 한계"는 reason 끝에 한 번만 짧게 언급해라.
반드시 JSON으로만 답하라 (코드펜스/설명 금지).`;

  const recContext = recommendationReason
    ? `\nJKP 추천 배경 (참고): ${recommendationReason}\n위 추천 배경과 실시간 데이터를 함께 고려하되, 데이터가 상충할 경우 실시간 데이터를 우선하고 이유를 reason에 명시하라.`
    : "";

  const dataNotice = resolved.dataOk
    ? ""
    : "\n주의: 실시간 펀더멘털·시세를 가져오지 못했다 (종목코드 미스매치/한국 종목 일부 필드 누락 가능). 데이터 부재를 핑계로 관망으로 회피하지 말고, 추천 배경과 종목 상식으로 의견을 내라.";

  const userPrompt = `종목: ${resolved.ticker} (${name}, ${market})
실시간 데이터: ${resolved.fundamentals}
현재가: ${resolved.price ?? "N/A"} (오늘 ${resolved.changePercent !== null ? `${resolved.changePercent > 0 ? "+" : ""}${resolved.changePercent.toFixed(2)}%` : "N/A"})${dataNotice}${recContext}

4명의 에이전트 관점 + 종합 분석을 다음 JSON으로만 답하라:
{
  "agents": [
    {
      "agent": "O'Neil",
      "style": "CANSLIM · 성장/수급",
      "verdict": "강력매수" | "매수" | "관망" | "매도" | "강력매도",
      "score": 0~100,
      "key_point": "O'Neil 철학 핵심 포인트 한 문장",
      "reason": "O'Neil 관점 근거 2문장"
    },
    {
      "agent": "Lynch",
      "style": "PEG · 성장+가치",
      "verdict": "...",
      "score": 0~100,
      "key_point": "...",
      "reason": "..."
    },
    {
      "agent": "Weinstein",
      "style": "스테이지 분석 · 추세",
      "verdict": "...",
      "score": 0~100,
      "key_point": "...",
      "reason": "..."
    },
    {
      "agent": "Minervini",
      "style": "VCP · 저변동 돌파",
      "verdict": "...",
      "score": 0~100,
      "key_point": "...",
      "reason": "..."
    }
  ],
  "valuation": {
    "view": "심각저평가" | "저평가" | "적정" | "고평가" | "심각고평가",
    "pe_comment": "P/E 평가 한 문장",
    "pb_comment": "PBR 평가 한 문장",
    "growth_comment": "성장성 평가 한 문장",
    "intrinsic_value_hint": "적정 주가 힌트 한 문장 (수치 포함)"
  },
  "buyTiming": {
    "current_stage": "현재 주가 스테이지 (예: 스테이지 2 상승 초입)",
    "ideal_entry": "이상적 진입 가격 또는 조건",
    "entry_trigger": "진입 트리거 한 문장 (어떤 조건이 충족될 때)",
    "stop_loss": "손절 기준",
    "target_short": "단기 목표가",
    "target_long": "장기 목표가",
    "partial_exit": "1차 목표 도달 시 몇 % 익절하고 언제 매도할지",
    "full_exit": "완전 청산해야 하는 구체적 조건 (가격·이벤트·기간)"
  },
  "consensus": "강력매수" | "매수" | "관망" | "매도" | "강력매도",
  "consensusScore": 0~100,
  "jkp_final": "JKP 최종 한마디 — 단정적으로 2문장"
}`;

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Gemini ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
  }

  const geminiData = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const result = JSON.parse(raw) as Omit<AgentReviewResult, "ticker" | "name" | "currentPrice" | "changePercent">;

  return NextResponse.json({
    ticker: resolved.ticker,
    name,
    currentPrice: resolved.price,
    changePercent: resolved.changePercent,
    ...result,
  } satisfies AgentReviewResult);
}
