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
import type { Plugin, PluginStatus } from "./plugins";

const GEMINI_MODEL = "gemini-2.5-flash";
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
  <action>{"type":"create_routine","params":{"name":"아침 맨몸운동 15분","weekdays":[1,2,3,4,5,6,0]}}</action>
- weekdays 배열: 0=일,1=월,2=화,3=수,4=목,5=금,6=토. 빈 배열이면 매일.
- 액션은 최종적으로 사용자가 [승인] 버튼을 눌러야만 실행된다. 자유롭게 제안하되, 사용자 의도가 불분명하면 먼저 물어봐라.
- categoryId는 다음 중 하나: "life"(인생), "company"(회사), "vfx"(VFX), "appdev"(앱개발), "jazz"(재즈)
- 시간은 ISO 8601 (한국 시간 기준 'Asia/Seoul'). timed면 'YYYY-MM-DDTHH:mm', allday/project면 'YYYY-MM-DD'.

명령어 제안 (관리자 / 웅허브 모드 전용):
- 플러그인이나 코드 점검 결과 사용자가 로컬에서 실행할 명령어가 명확하면 제안해라:
  <action>{"type":"suggest_command","params":{"cmd":"git fetch origin claude/plugin-routine && git checkout claude/plugin-routine && npm install && npm run build","cwd":"woong-world","explanation":"루틴 PR이 main과 충돌나는지 확인하려면 체크아웃 후 빌드해보면 된다.","pluginId":"routine"}}</action>
- 이 액션은 서버에서 실행하지 않는다. UI는 [복사] 버튼과 설명만 보여준다 — 사용자가 직접 터미널에서 실행한다.
- 한 답변에 명령어는 최대 3개. 한 줄에 너무 많은 단계가 섞이면 단계별로 나눠라.
- 위험 명령(rm -rf, force push, db drop 등)은 절대 제안하지 말고, 부득이하면 명시적으로 위험성을 설명해라.

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
  /** Admin-only: plugin registry + their CI/PR status. */
  plugins?: { plugin: Plugin; status: PluginStatus }[];
  isAdmin?: boolean;
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

function summarizePlugins(
  entries: { plugin: Plugin; status: PluginStatus }[],
): string {
  if (entries.length === 0) return "  (없음)";
  const lightOf = (lvl: PluginStatus["level"]) =>
    lvl === "green" ? "🟢" : lvl === "yellow" ? "🟡" : lvl === "red" ? "🔴" : "⚪";
  return entries
    .map(({ plugin, status }) => {
      const parts = [
        `  ${lightOf(status.level)} ${plugin.name} (id=${plugin.id})`,
        `    repo=${plugin.repo}@${plugin.branch}${plugin.pr != null ? ` PR#${plugin.pr}` : ""}`,
        `    상태: ${status.label}${status.detail ? ` — ${status.detail}` : ""}`,
      ];
      return parts.join("\n");
    })
    .join("\n");
}

function buildContextBlock(ctx: AssistantContext): string {
  const cats = CATEGORIES.map((c) => `${c.id}=${c.label}`).join(", ");
  const blocks = [
    `[오늘] ${ctx.today} (${weekdayLabel(ctx.today)})`,
    `[사용자] ${ctx.email}${ctx.isAdmin ? " (관리자 / 웅허브 모드)" : ""}`,
    `[카테고리] ${cats}`,
    "",
    "[다가오는 일정 (다음 14일)]",
    summarizeEvents(ctx.upcomingEvents, ctx.today),
    "",
    "[활성 계획]",
    summarizePlans(ctx.activePlans),
    "",
    "[업로드된 파일/링크]",
    summarizeFiles(ctx.files),
  ];
  if (ctx.isAdmin && ctx.plugins?.length) {
    blocks.push(
      "",
      "[웅허브 플러그인 상태]",
      summarizePlugins(ctx.plugins),
      "",
      "관리자가 플러그인이나 PR 상태를 묻거든 위 정보를 근거로 어느 플러그인이 어떤 상태인지, 무엇을 점검하면 되는지 짧게 보고해라.",
    );
  }
  return blocks.join("\n");
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

export async function parseEventsFromSheet(rawText: string, correction?: string): Promise<ParsedEvent[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const today = toIso(new Date());
  const correctionBlock = correction?.trim()
    ? `\n=== 사용자 수정 지시 (최우선 반영) ===\n${correction.trim()}\n위 내용을 기준으로 해당 이벤트의 날짜/내용을 수정해라.\n`
    : "";

  const prompt = `아래는 스프레드시트 또는 CSV 데이터야. 형식에 맞게 분석해서 캘린더 이벤트 목록으로 변환해줘.

오늘 날짜는 ${today}이다.

=== 달력/그리드 형식의 월/년도 추론 규칙 ===
1. '5/1', '4/30', '12/25' 같은 월/일(M/D) 형식 셀을 먼저 찾아라
   → 그 셀이 위치한 열(요일)과 숫자를 이용해 해당 월을 확정한다
   → 확정된 월을 기준으로 나머지 날짜 숫자에 같은 월/년을 적용한다
   → 월이 바뀌는 구간(예: 30 다음에 1이 오면 다음 달로 넘어감)을 정확히 처리한다
2. TODAY 마커가 있으면 → 오늘(${today})이 위치한 열/행으로 월/년도를 보정한다
3. 연도가 불명확하면 오늘(${today}) 기준 가장 가까운 과거/미래로 추론한다

=== 달력/그리드 형식의 열→날짜 매핑 규칙 ===
1. 요일 헤더 행(SUN/MON/TUE/WED/THU/FRI/SAT 또는 일/월/화/수/목/금/토)으로 열 순서를 파악한다
2. 날짜 숫자만 있는 행(예: ,12,13,14,15,16,17,18)은 날짜 레이블 행이다 — 이 행은 이벤트가 아니다
3. 이벤트의 날짜 = 그 이벤트가 있는 열에서 가장 가까운 위쪽 날짜 레이블 숫자
4. 열 인덱스를 정확히 세서 날짜를 결정해야 한다. 한 칸도 어긋나면 안 된다${correctionBlock}

=== 제외해야 할 항목 ===
- 시트 제목, 면책 문구, 범례/설명 텍스트
- PRODUCTION, DIRECTOR, CAST, 제작사 등 메타데이터 키-값 쌍
- 요일 헤더 행, 날짜 숫자만 있는 행
- 날짜가 없거나 추론 불가능한 항목

=== 출력 규칙 ===
- 날짜: YYYY-MM-DD
- startTime, endTime: HH:mm 형식, 없으면 생략
- summary: 이벤트 제목/내용만 (메타데이터 제외)
- category, location: 원본 그대로, 없으면 생략
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

export type BriefingPerformance = {
  yesterdayHabitRate: number | null;    // 0–100
  yesterdayHabitChecked: number | null;
  yesterdayHabitTotal: number | null;
  weekHabitRate: number | null;         // 0–100
  weekRoutineRate: number | null;       // 0–100
  openTodos: number | null;
  doneTodosToday: number | null;
  portfolioAlerts: { name: string; ticker: string; alertType: string; message: string }[] | null;
  watchlistItems: { name: string; ticker: string; memo: string }[] | null;
  upcomingEconEvents: { title: string; eventDate: string; importance: string; daysLeft: number }[] | null;
};

export async function generateBriefingScript(
  secretaryName: string,
  events: CalendarEvent[],
  plans: Plan[],
  mode?: BriefingMode,
  performance?: BriefingPerformance,
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

  // Gemini 2.5 Flash는 "thinking" 토큰이 maxOutputTokens에 함께 잡힌다.
  // 브리핑은 추론보다 자연스러운 글쓰기가 필요하므로 thinking은 끄고, 한국어 출력을
  // 충분히 담을 수 있게 상한을 넉넉하게 잡는다. (이전 400/500/700에서 스크립트가
  // 끊기는 원인.)
  const maxTokens = resolvedMode === "monthly" ? 4000 : resolvedMode === "weekly" ? 2500 : 2000;

  // Build performance feedback instruction
  let performanceInstruction = "";
  if (performance) {
    const p = performance;
    const lines: string[] = [];

    if (p.yesterdayHabitRate !== null && p.yesterdayHabitTotal !== null && p.yesterdayHabitTotal > 0) {
      const r = p.yesterdayHabitRate;
      lines.push(`어제 습관 달성률: ${r}% (${p.yesterdayHabitChecked}/${p.yesterdayHabitTotal}개)`);
      if (r < 30) {
        lines.push("→ 어제 습관이 심각하게 부진했다. 강하게 야단치되, 포기하지 말라는 메시지를 줘.");
      } else if (r < 60) {
        lines.push("→ 어제 습관이 절반도 안 됐다. 날카롭게 지적하고 오늘은 반드시 달라져야 한다고 강조해.");
      } else if (r < 80) {
        lines.push("→ 어제 습관이 아쉬웠다. 부드럽게 독려하고 조금만 더 하면 된다고 동기부여해.");
      } else {
        lines.push("→ 어제 습관을 잘 지켰다. 진심으로 칭찬하고 오늘도 유지하라고 격려해.");
      }
    }

    if (p.weekHabitRate !== null) {
      const r = p.weekHabitRate;
      lines.push(`이번주 습관 달성률: ${r}%`);
      if (r < 40) lines.push("→ 이번 주 전반적으로 습관이 무너지고 있다. 경각심을 줘.");
      else if (r >= 80) lines.push("→ 이번 주 습관이 훌륭하다. 한 번 더 칭찬해줘.");
    }

    if (p.weekRoutineRate !== null) {
      const r = p.weekRoutineRate;
      lines.push(`이번주 루틴 달성률: ${r}%`);
      if (r < 50) lines.push("→ 루틴이 흔들리고 있다. 루틴의 중요성을 강조해.");
      else if (r >= 80) lines.push("→ 루틴을 잘 지키고 있다. 칭찬해줘.");
    }

    if (p.openTodos !== null) {
      lines.push(`미완료 할 일: ${p.openTodos}개`);
      if (p.openTodos > 10) lines.push("→ 할 일이 쌓여 있다. 우선순위를 정하라고 촉구해.");
      else if (p.openTodos === 0) lines.push("→ 할 일을 모두 처리했다. 칭찬해줘.");
    }

    if (p.doneTodosToday !== null && p.doneTodosToday > 0) {
      lines.push(`오늘 완료한 할 일: ${p.doneTodosToday}개`);
    }

    if (p.portfolioAlerts && p.portfolioAlerts.length > 0) {
      lines.push(`\n[포트폴리오 신호]`);
      for (const a of p.portfolioAlerts) {
        lines.push(`- ${a.name}(${a.ticker}): ${a.alertType} — ${a.message}`);
      }
      lines.push("→ 위 포트폴리오 신호들을 브리핑에 포함해. JKP처럼 단호하게 매도/보유 판단을 언급해줘.");
    }

    if (p.watchlistItems && p.watchlistItems.length > 0) {
      lines.push(`\n[관심종목 — 매수 검토 후보]`);
      for (const w of p.watchlistItems) {
        lines.push(`- ${w.name}(${w.ticker})${w.memo ? `: ${w.memo}` : ""}`);
      }
      lines.push("→ 관심종목들을 짧게 언급하며 오늘 주의 깊게 봐야 할 종목이라고 언급해줘.");
    }

    if (p.upcomingEconEvents && p.upcomingEconEvents.length > 0) {
      lines.push(`\n[다가오는 경제 일정]`);
      for (const e of p.upcomingEconEvents) {
        const dayStr = e.daysLeft === 0 ? "오늘" : e.daysLeft === 1 ? "내일" : `D-${e.daysLeft}`;
        lines.push(`- ${dayStr} ${e.title} (${e.importance === "high" ? "고중요도" : e.importance === "medium" ? "중요도 보통" : "저중요도"})`);
      }
      lines.push("→ 경제 일정들을 브리핑에 포함하고, 고중요도 이벤트는 포지션에 미치는 영향을 JKP 스타일로 간략히 언급해.");
    }

    if (lines.length > 0) {
      performanceInstruction = `\n\n[실적·투자 피드백 — 반드시 브리핑에 자연스럽게 녹여줘. 수치를 직접 언급하고, 잘한 건 칭찬, 못한 건 따끔하게 야단칠 것]\n${lines.join("\n")}`;
    }
  }

  const systemPrompt = `너는 "${secretaryName}"이라는 이름의 AI 비서야.
오늘의 ${modeLabel} 브리핑을 읽어줘.

규칙:
- "안녕하세요, 저는 ${secretaryName}입니다" 또는 "${secretaryName}예요"로 시작
- 오늘 날짜와 요일 언급
- 실적 피드백이 있으면 두 번째 단락에서 자연스럽게 전달 (수치 포함해서 구체적으로)
  - 잘했으면: 진심 어린 칭찬 + 오늘도 이어가자는 동기부여
  - 부진했으면: 솔직하고 따끔하게 야단 (너무 가혹하지 않되, 분명하게) + 오늘 다시 시작하자는 메시지
- 제공된 일정/계획 데이터 순서대로 브리핑 (월간 → 주간 → 일간)
- 각 섹션 자연스럽게 이어서 읽히도록 구성
- 짧고 자연스러운 마무리 인사
- "주인님", "주인", "마스터" 같은 호칭은 절대 사용하지 말 것
- 음성으로 읽기 좋게, JSON/마크다운/특수문자 없이 순수 텍스트${performanceInstruction}`;

  const userPrompt = sections.join("\n\n");

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingBudget: 0 },
      },
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
