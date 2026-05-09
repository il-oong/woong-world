import { CATEGORIES, getCategory } from "./categories";
import type { Plan } from "./plans";
import type {
  ChatMessage,
  ProposedAction,
  UploadedFile,
} from "./assistant";
import { newId } from "./assistant";
import type { CalendarEvent } from "./google";
import { eventOnDay, formatTimeRange, toIso } from "./calendar-util";

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

// =====================================================================
// Chat assistant ("뇌 대리")
// =====================================================================

const CHAT_SYSTEM_PROMPT = `너는 사용자의 인생 비서다 ("뇌 대리"). 사용자의 캘린더, 계획, 업로드한 파일을 모두 보고 한국어로 답한다.

성격:
- 친근하지만 만만치 않은 멘토. 무의미한 칭찬 금지.
- 답은 짧고 단단하게. 불필요한 서론·맺음말 금지.
- 사용자가 "뭐 해야 해?", "이번 주 어때?" 같은 모호한 질문을 하면 캘린더/계획을 근거로 구체적으로 답한다.
- 빠진 영역(예: '인생' 카테고리에 아무 일정/계획 없음) 같은 패턴이 보이면 짚어준다.

쓰기 액션:
- 캘린더에 일정을 추가하거나 계획을 만들/수정해야 할 상황이면, 답변 안에 다음 형식의 액션 블록을 포함해라:
  <action>{"type":"add_event","params":{"summary":"...","kind":"timed","start":"2026-04-27T10:00","end":"2026-04-27:11:00","categoryId":"company","reminderMinutes":30}}</action>
  <action>{"type":"create_plan","params":{"period":"weekly","periodKey":"2026-W18","title":"...","items":[{"text":"..."}],"categoryId":"life"}}</action>
  <action>{"type":"update_plan","params":{"planId":"pl_...","patch":{"title":"..."}}}</action>
- 액션은 최종적으로 사용자가 [승인] 버튼을 눌러야만 실행된다. 자유롭게 제안하되, 사용자 의도가 불분명하면 먼저 물어봐라.
- categoryId는 다음 중 하나: "life"(인생), "company"(회사), "vfx"(VFX), "appdev"(앱개발), "jazz"(재즈)
- 시간은 ISO 8601 (한국 시간 기준 'Asia/Seoul'). timed면 'YYYY-MM-DDTHH:mm', allday/project면 'YYYY-MM-DD'.

규칙:
- 한국어로 답한다.
- 액션 블록 외의 본문은 일반 텍스트(마크다운 약간 OK).
- 모르면 모른다고 답한다. 추측해서 만들지 마라.`;

export type AssistantContext = {
  email: string;
  today: string; // ISO date YYYY-MM-DD
  upcomingEvents: CalendarEvent[];
  activePlans: Plan[];
  files: UploadedFile[];
};

function summarizeEvents(events: CalendarEvent[], today: string): string {
  if (events.length === 0) return "  (없음)";
  const lines: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const iso = toIso(d);
    const onDay = events.filter((ev) => eventOnDay(ev, iso));
    if (onDay.length === 0) continue;
    lines.push(`  ${iso}:`);
    for (const ev of onDay.slice(0, 6)) {
      lines.push(`    - ${ev.summary ?? "(제목 없음)"} (${formatTimeRange(ev)})`);
    }
  }
  return lines.length ? lines.join("\n") : "  (없음)";
}

function summarizePlans(plans: Plan[]): string {
  if (plans.length === 0) return "  (없음)";
  return plans
    .slice(0, 30)
    .map((p) => {
      const cat = p.categoryId ? getCategory(p.categoryId).label : "전체";
      const period =
        p.period === "weekly" ? "주" : p.period === "monthly" ? "월" : "연";
      const done = p.items.filter((i) => i.done).length;
      const items = p.items
        .slice(0, 5)
        .map((i) => `      ${i.done ? "[x]" : "[ ]"} ${i.text}`)
        .join("\n");
      return `  - id=${p.id} [${period}/${cat}] ${p.title} (${p.periodKey}, ${done}/${p.items.length})${items ? "\n" + items : ""}`;
    })
    .join("\n");
}

function summarizeFiles(files: UploadedFile[]): string {
  if (files.length === 0) return "  (없음)";
  return files
    .slice(0, 50)
    .map((f) => {
      const preview = (f.textContent ?? "").slice(0, 200).replace(/\s+/g, " ");
      return `  - id=${f.id} kind=${f.kind} name=${f.name}${preview ? `\n      preview: ${preview}` : ""}`;
    })
    .join("\n");
}

function buildContextBlock(ctx: AssistantContext): string {
  const cats = CATEGORIES.map((c) => `${c.id}=${c.label}`).join(", ");
  return `[오늘] ${ctx.today} (${weekdayLabel(ctx.today)})
[사용자] ${ctx.email}
[카테고리] ${cats}

[다가오는 일정 (다음 14일)]
${summarizeEvents(ctx.upcomingEvents, ctx.today)}

[활성 계획]
${summarizePlans(ctx.activePlans)}

[업로드된 파일/링크]
${summarizeFiles(ctx.files)}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return WEEKDAYS[date.getDay()] + "요일";
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

async function fetchAsBase64(
  url: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") ?? "image/png";
    const buf = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    const data = Buffer.from(binary, "binary").toString("base64");
    return { data, mimeType };
  } catch {
    return null;
  }
}

async function buildContents(
  history: ChatMessage[],
  userMessage: string,
  attachments: UploadedFile[],
): Promise<GeminiContent[]> {
  const contents: GeminiContent[] = [];

  // History (cap to last 30 messages to keep prompt size sane)
  const recent = history.slice(-30);
  for (const m of recent) {
    contents.push({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    });
  }

  // Current user message + image attachments inline
  const userParts: GeminiPart[] = [{ text: userMessage }];
  for (const f of attachments) {
    if (f.kind === "image" && f.blobUrl) {
      const inline = await fetchAsBase64(f.blobUrl);
      if (inline) {
        userParts.push({
          inlineData: { mimeType: inline.mimeType, data: inline.data },
        });
      }
    }
  }
  contents.push({ role: "user", parts: userParts });

  return contents;
}

const ACTION_REGEX = /<action>([\s\S]*?)<\/action>/g;

function parseActions(text: string): {
  cleanText: string;
  actions: ProposedAction[];
} {
  const actions: ProposedAction[] = [];
  const cleanText = text.replace(ACTION_REGEX, (_, json: string) => {
    try {
      const parsed = JSON.parse(json) as Omit<ProposedAction, "id" | "status">;
      actions.push({
        id: newId("act"),
        status: "pending",
        ...parsed,
      } as ProposedAction);
    } catch {
      // skip malformed
    }
    return "";
  });
  return { cleanText: cleanText.trim(), actions };
}

export async function chatWithAssistant(input: {
  history: ChatMessage[];
  userMessage: string;
  attachments: UploadedFile[];
  context: AssistantContext;
}): Promise<{ text: string; proposedActions: ProposedAction[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const systemText = `${CHAT_SYSTEM_PROMPT}\n\n${buildContextBlock(input.context)}`;
  const contents = await buildContents(
    input.history,
    input.userMessage,
    input.attachments,
  );

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents,
      generationConfig: { temperature: 0.7 },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!raw) return { text: "(빈 응답)", proposedActions: [] };

  const { cleanText, actions } = parseActions(raw);
  return { text: cleanText || raw, proposedActions: actions };
}

// =====================================================================
// CSV / 스프레드시트 → 캘린더 이벤트 파싱
// =====================================================================

export type ParsedEvent = {
  summary: string;
  date: string;       // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string;   // HH:mm
  category?: string;
  location?: string;
};

export async function parseEventsFromSheet(rawText: string, year?: number): Promise<ParsedEvent[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const today = toIso(new Date());
  const yearHint = year ? `연도가 없으면 ${year}년으로 처리` : `연도가 없으면 오늘(${today}) 기준으로 가장 가까운 미래 날짜로 추론`;
  const prompt = `아래는 스프레드시트 또는 CSV 데이터야. 어떤 형식이든(주간 그리드, 월간 표, 단순 목록 등) 분석해서 캘린더 이벤트 목록으로 변환해줘.

규칙:
- 날짜가 없거나 추론 불가능한 행은 제외
- 날짜는 반드시 YYYY-MM-DD 형식
- ${yearHint}
- startTime, endTime은 HH:mm 형식 (없으면 생략)
- summary는 이벤트 제목/내용
- category는 원본 텍스트 그대로 (없으면 생략)
- location은 장소 (없으면 생략)
- 반드시 JSON 배열만 출력 (설명, 마크다운 없이):
[{"summary":"...","date":"YYYY-MM-DD","startTime":"HH:mm","endTime":"HH:mm","category":"...","location":"..."},...]

데이터:
${rawText.slice(0, 8000)}`;

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Gemini 응답 없음");

  try {
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as ParsedEvent[];
    return Array.isArray(parsed) ? parsed.filter((e) => e.summary && e.date) : [];
  } catch {
    throw new Error("Gemini 응답 파싱 실패");
  }
}

// =====================================================================
// 브리핑 스크립트 생성
// =====================================================================

export type BriefingMode = "daily" | "weekly" | "monthly";

export function getBriefingMode(now = new Date()): BriefingMode {
  if (now.getDate() === 1) return "monthly";
  if (now.getDay() === 1) return "weekly"; // Monday
  return "daily";
}

function fmtEventList(evs: CalendarEvent[]): string {
  if (evs.length === 0) return "  없음";
  return evs
    .map((ev) => {
      const time = formatTimeRange(ev);
      return `  · ${ev.summary ?? "(제목 없음)"}${time ? ` (${time})` : ""}`;
    })
    .join("\n");
}

function eventsInRange(events: CalendarEvent[], from: string, to: string): CalendarEvent[] {
  return events.filter((ev) => {
    const d = ev.start.date ?? ev.start.dateTime?.slice(0, 10) ?? "";
    return d >= from && d <= to;
  });
}

function isoOffset(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

function buildDailyBlock(events: CalendarEvent[], plans: Plan[], now: Date): string {
  const today = toIso(now);
  const tomorrow = isoOffset(now, 1);
  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

  const activePlans = plans
    .filter((p) => !p.items.every((i) => i.done))
    .slice(0, 5)
    .map((p) => `  · [${p.period}] ${p.title} (${p.items.filter((i) => !i.done).length}개 남음)`)
    .join("\n") || "  없음";

  return `[오늘: ${today} ${WEEKDAYS[now.getDay()]}요일]
오늘 일정:
${fmtEventList(events.filter((ev) => eventOnDay(ev, today)))}

내일 일정:
${fmtEventList(events.filter((ev) => eventOnDay(ev, tomorrow)))}

진행 중인 계획:
${activePlans}`;
}

function buildWeeklyBlock(events: CalendarEvent[], plans: Plan[], now: Date): string {
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sun = isoOffset(mon, 6);
  const weekEvents = eventsInRange(events, toIso(mon), sun);

  const weeklyPlans = plans
    .filter((p) => p.period === "weekly" && !p.items.every((i) => i.done))
    .slice(0, 5)
    .map((p) => {
      const done = p.items.filter((i) => i.done).length;
      return `  · ${p.title} (${done}/${p.items.length} 완료)`;
    })
    .join("\n") || "  없음";

  return `[이번 주: ${toIso(mon)} ~ ${sun}]
이번 주 일정:
${fmtEventList(weekEvents)}

주간 목표:
${weeklyPlans}`;
}

function buildMonthlyBlock(events: CalendarEvent[], plans: Plan[], now: Date): string {
  const y = now.getFullYear();
  const m = now.getMonth();
  const firstDay = toIso(new Date(y, m, 1));
  const lastDay = toIso(new Date(y, m + 1, 0));
  const monthEvents = eventsInRange(events, firstDay, lastDay);

  const monthlyPlans = plans
    .filter((p) => (p.period === "monthly" || p.period === "yearly") && !p.items.every((i) => i.done))
    .slice(0, 5)
    .map((p) => {
      const done = p.items.filter((i) => i.done).length;
      return `  · [${p.period}] ${p.title} (${done}/${p.items.length} 완료)`;
    })
    .join("\n") || "  없음";

  return `[이번 달: ${y}년 ${m + 1}월]
이달 주요 일정:
${fmtEventList(monthEvents.slice(0, 10))}

월간/연간 목표:
${monthlyPlans}`;
}

export async function generateBriefingScript(
  secretaryName: string,
  events: CalendarEvent[],
  plans: Plan[],
  mode?: BriefingMode,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const now = new Date();
  const resolvedMode = mode ?? getBriefingMode(now);

  const sections: string[] = [];
  if (resolvedMode === "monthly") sections.push(buildMonthlyBlock(events, plans, now));
  if (resolvedMode === "monthly" || resolvedMode === "weekly") sections.push(buildWeeklyBlock(events, plans, now));
  sections.push(buildDailyBlock(events, plans, now));

  const modeLabel =
    resolvedMode === "monthly" ? "월간+주간+일간" :
    resolvedMode === "weekly" ? "주간+일간" : "일간";

  const maxTokens = resolvedMode === "monthly" ? 700 : resolvedMode === "weekly" ? 500 : 400;

  const systemPrompt = `너는 "${secretaryName}"이라는 이름의 AI 비서야.
주인님의 ${modeLabel} 브리핑을 자연스럽고 따뜻하게 읽어줘.

규칙:
- "안녕하세요, 저는 ${secretaryName}입니다" 또는 "${secretaryName}예요"로 시작
- 오늘 날짜와 요일 언급
- 제공된 데이터 순서대로 브리핑 (월간 → 주간 → 일간)
- 각 섹션 자연스럽게 이어서 읽히도록 구성
- 짧고 자연스러운 마무리 인사
- 음성으로 읽기 좋게, JSON/마크다운/특수문자 없이 순수 텍스트`;

  const userPrompt = sections.join("\n\n");

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: maxTokens },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "(브리핑을 생성할 수 없습니다)";
}
