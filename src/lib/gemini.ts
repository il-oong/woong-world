import { CATEGORIES, getCategory } from "./categories";
import type { Plan } from "./plans";

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export type ReviewResult = {
  summary: string;
  strengths: string[];
  gaps: string[];
  suggestions: string[];
  raw: string;
};

const SYSTEM_PROMPT = `너는 사용자의 인생 비서다. 사용자의 계획을 살펴보고 한국어로 솔직하고 구체적인 피드백을 준다.
어조: 친근하지만 만만치 않은 멘토. 무의미한 칭찬은 금지. 빠진 영역과 보완점을 구체적으로 짚는다.
출력은 반드시 다음 JSON 형식으로만 답한다 (코드펜스 금지):
{
  "summary": "한 문단 한줄 요약",
  "strengths": ["좋은 점 1", "좋은 점 2"],
  "gaps": ["빠진/걱정되는 점 1", "..."],
  "suggestions": ["구체적 제안 1", "..."]
}`;

function buildUserPrompt(plan: Plan): string {
  const cat = plan.categoryId ? getCategory(plan.categoryId).label : "전체";
  const periodLabel =
    plan.period === "weekly" ? "주간" : plan.period === "monthly" ? "월간" : "연간";
  const itemList = plan.items.length
    ? plan.items
        .map((i, idx) => `  ${idx + 1}. [${i.done ? "x" : " "}] ${i.text}`)
        .join("\n")
    : "  (없음)";
  return `다음 ${periodLabel} 계획을 리뷰해줘.

[기간] ${plan.periodKey} (${periodLabel})
[카테고리] ${cat}
[제목] ${plan.title}

[항목]
${itemList}

[메모]
${plan.notes || "(없음)"}

위 계획이 현실적인지, 시간 분배가 적절한지, 빠진 게 있는지, 우선순위가 맞는지 살펴봐.`;
}

function buildPortfolioPrompt(plans: Plan[]): string {
  const byCat = new Map<string, number>();
  for (const c of CATEGORIES) byCat.set(c.label, 0);
  byCat.set("(미분류)", 0);
  for (const p of plans) {
    const k = p.categoryId ? getCategory(p.categoryId).label : "(미분류)";
    byCat.set(k, (byCat.get(k) ?? 0) + 1);
  }
  const dist = Array.from(byCat.entries())
    .map(([k, v]) => `  ${k}: ${v}건`)
    .join("\n");

  const summaries = plans
    .slice(0, 30)
    .map((p) => {
      const cat = p.categoryId ? getCategory(p.categoryId).label : "전체";
      const period =
        p.period === "weekly" ? "주" : p.period === "monthly" ? "월" : "연";
      const done = p.items.filter((i) => i.done).length;
      return `- [${period}/${cat}] ${p.title} (${p.periodKey}, ${done}/${p.items.length} 완료)`;
    })
    .join("\n");

  return `사용자의 전체 계획 포트폴리오를 봐달라.

[카테고리별 분포]
${dist}

[최근 계획들 (최대 30개)]
${summaries}

영역간 균형, 과부하/과소 영역, 일관성을 봐줘.`;
}

async function callGemini(userPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
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
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Gemini empty response");
  return text;
}

function parseReview(raw: string): ReviewResult {
  let parsed: Partial<ReviewResult> = {};
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      summary: raw.slice(0, 500),
      strengths: [],
      gaps: [],
      suggestions: [],
      raw,
    };
  }
  return {
    summary: parsed.summary ?? "",
    strengths: parsed.strengths ?? [],
    gaps: parsed.gaps ?? [],
    suggestions: parsed.suggestions ?? [],
    raw,
  };
}

export async function reviewPlan(plan: Plan): Promise<ReviewResult> {
  const text = await callGemini(buildUserPrompt(plan));
  return parseReview(text);
}

export async function reviewPortfolio(plans: Plan[]): Promise<ReviewResult> {
  const text = await callGemini(buildPortfolioPrompt(plans));
  return parseReview(text);
}
