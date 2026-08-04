import { CATEGORIES, getCategory } from "./categories";
import type { Plan } from "./plans";
import type {
  ChatMessage,
  ProposedAction,
  UploadedFile,
} from "./assistant";
import { parseProposedAction } from "./assistant";
import type { CalendarEvent } from "./google";
import type { Todo } from "./todos";
import type { Subscription } from "./subscriptions";
import { eventOnDay, formatTimeRange, toIso } from "./calendar-util";
import type { Plugin, PluginStatus } from "./plugins";
import type {
  StockHolding,
  WatchItem,
  EconEvent,
  InvestSettings,
  JkpAnalysisResult,
} from "./alpha";
import {
  runJkpAnalysis,
  runThreeAgentAnalysis,
  gatherMarketData,
  buildFundamentalsLine,
  fetchMarketSnapshot,
  searchTickerSmart,
  fetchGroundedMarketBrief,
  type AgentReviewResult,
  type MarketSnapshot,
  type StockMarketData,
  type ThreeAgentAnalysis,
} from "./stock-agents";
import { searchWeb } from "./web-search";

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

주식/투자 질문 (뇌 네트워크 위임):
- 너는 사용자의 전담 펀드매니저 겸 최상위 뇌 네트워크 총괄(최종 자비스)이다. 주식 분석·매수/매도 판단은 하위 에이전트들(JKP·O'Neil·Lynch·Weinstein·Minervini)이 Yahoo Finance 실시간 데이터로 수행하고, 종합 결과로 명확한 투자 판단을 내린다.
- 사용자가 특정 종목·지수·매크로·포트폴리오·매수/매도 타이밍 등을 물으면, 다른 말 없이 아래 위임 지시 한 줄만 출력해라:
  <delegate-stocks>{"intent":"single","queries":[{"name":"엔비디아","ticker":"NVDA","market":"US"}],"need_macro":true,"focus":"지금 진입해도 되는지"}</delegate-stocks>
- intent: "single"(특정 종목) | "portfolio"(내 보유 전체 — queries 비워도 보유 종목으로 자동 채워짐) | "market"(지수·매크로·시장 전반) | "screen"(테마·섹터·"관련주"·"추천 종목 찾아줘" 스크리닝)
- queries: 종목 목록. ticker 알면 채우고(미국=심볼, 한국=6자리코드 또는 .KS/.KQ), 모르면 name만 적어도 서버가 해석한다.
- need_macro: 거시 맥락이 답에 필요하면 true.
- focus: 사용자가 궁금한 핵심 한 문장.

- ★ 테마/섹터 발굴("○○ 관련주 찾아줘", "○○ 테마 추천 종목", "지금 뭐 사면 좋아?" 등):
  - "데이터 없음"이라고 절대 답하지 마라. 너는 어떤 종목이 그 테마에 속하는지 이미 알고 있다. 네 지식으로 후보 종목 5~8개를 직접 골라 ticker까지 채워서 intent "screen"으로 위임해라. 그러면 서버가 각 후보의 실시간 재무(PBR·PER·ROE·부채비율·목표주가 등)를 가져와 단기/중기/장기로 분류·추천한다.
  - theme 필드에 테마를 명확히 적고, queries에 후보를 미국/한국 섞어 구체적으로 담아라.
  - 예) "피지컬 AI 관련주 찾아줘":
  <delegate-stocks>{"intent":"screen","theme":"피지컬 AI(임바디드 AI·휴머노이드·로보틱스·자율머신)","queries":[{"name":"엔비디아","ticker":"NVDA","market":"US"},{"name":"테슬라","ticker":"TSLA","market":"US"},{"name":"인튜이티브서지컬","ticker":"ISRG","market":"US"},{"name":"심보틱","ticker":"SYM","market":"US"},{"name":"서브로보틱스","ticker":"SERV","market":"US"},{"name":"두산로보틱스","ticker":"454910.KS","market":"KR"},{"name":"레인보우로보틱스","ticker":"277810.KS","market":"KR"}],"need_macro":true,"focus":"피지컬 AI 테마에서 지금 살 만한 종목"}</delegate-stocks>
- 용어 정의 등 실데이터 불필요한 단순 질문은 바로 답해라.

규칙:
- 한국어로 답한다.
- 액션 블록 외의 본문은 일반 텍스트(마크다운 약간 OK).
- 모르면 모른다고 답한다. 추측해서 만들지 마라. 특히 주식 수치·시세·재무 데이터는 절대 지어내지 말고 위 위임을 통해 실데이터로만 답한다.`;

/** 주식/투자 컨텍스트 — 뇌 네트워크가 보유·관심·일정·설정을 인지하도록 주입. */
export type StockContext = {
  holdings: StockHolding[];
  watchlist: WatchItem[];
  econEvents: EconEvent[];
  settings: InvestSettings;
};

export type WorkspaceContext = {
  todos: Todo[];
  subscriptions: Subscription[];
};

export type AssistantContext = {
  email: string;
  today: string; // ISO date YYYY-MM-DD
  upcomingEvents: CalendarEvent[];
  activePlans: Plan[];
  files: UploadedFile[];
  /** Admin-only: plugin registry + their CI/PR status. */
  plugins?: { plugin: Plugin; status: PluginStatus }[];
  isAdmin?: boolean;
  /** 투자/주식 컨텍스트 (있으면 주식 질문 위임·종합에 사용). */
  stock?: StockContext;
  workspace?: WorkspaceContext;
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

function summarizeStock(s: StockContext): string {
  const lines: string[] = [];
  if (s.holdings.length) {
    lines.push("보유 종목:");
    for (const h of s.holdings.slice(0, 30)) {
      const extras = [
        h.target1 ? `목표1 ${h.target1}` : "",
        h.target2 ? `목표2 ${h.target2}` : "",
        h.stopLoss ? `손절 ${h.stopLoss}` : "",
        h.memo ? `메모: ${h.memo}` : "",
      ]
        .filter(Boolean)
        .join(" / ");
      lines.push(
        `  - ${h.name}(${h.ticker}, ${h.market}) ${h.qty}주 @평단 ${h.avgBuyPrice}${extras ? ` / ${extras}` : ""}`,
      );
    }
  } else {
    lines.push("보유 종목: (없음)");
  }
  if (s.watchlist.length) {
    lines.push(
      "관심 종목: " + s.watchlist.slice(0, 30).map((w) => `${w.name}(${w.ticker})`).join(", "),
    );
  }
  const today = toIso(new Date());
  const upcoming = s.econEvents.filter((ev) => ev.eventDate >= today).slice(0, 10);
  if (upcoming.length) {
    lines.push("다가오는 경제 일정:");
    for (const ev of upcoming) {
      const imp = ev.importance === "high" ? "고" : ev.importance === "medium" ? "중" : "저";
      lines.push(`  - ${ev.eventDate} [${imp}] ${ev.title} (${ev.market})`);
    }
  }
  const w = s.settings.traderWeights;
  lines.push(
    `트레이더 가중치: Livermore ${w.livermore} / O'Neil ${w.oneil} / Weinstein ${w.weinstein} / Minervini ${w.minervini} / Lynch ${w.lynch}`,
  );
  if (s.settings.focusThemes?.trim()) lines.push(`집중 테마: ${s.settings.focusThemes.trim()}`);
  return lines.join("\n");
}

function summarizeWorkspace(workspace: WorkspaceContext): string {
  const lines: string[] = [];
  const openTodos = workspace.todos.filter((todo) => !todo.done).slice(0, 30);
  lines.push(
    openTodos.length
      ? `Open tasks: ${openTodos.map((todo) => `${todo.id}=${todo.text} (${todo.scope ?? "day"})`).join(" | ")}`
      : "Open tasks: none",
  );
  lines.push(
    workspace.subscriptions.length
      ? `Subscriptions: ${workspace.subscriptions.slice(0, 30).map((sub) => `${sub.id}=${sub.name} ${sub.amount}KRW/${sub.cycle}`).join(" | ")}`
      : "Subscriptions: none",
  );
  return lines.join("\n");
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
  if (ctx.stock) {
    blocks.push("", "[투자/주식 컨텍스트]", summarizeStock(ctx.stock));
  }
  if (ctx.workspace) {
    blocks.push("", "[Workspace controls]", summarizeWorkspace(ctx.workspace));
  }
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
      const action = parseProposedAction(JSON.parse(json) as unknown);
      if (action) actions.push(action);
    } catch {
      // skip malformed
    }
    return "";
  });
  return { cleanText: cleanText.trim(), actions };
}

async function callChatGemini(
  systemText: string,
  contents: GeminiContent[],
  temperature: number,
  maxOutputTokens?: number,
  thinkingBudget?: number,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const generationConfig: Record<string, unknown> = { temperature };
  if (maxOutputTokens) generationConfig.maxOutputTokens = maxOutputTokens;
  if (thinkingBudget !== undefined) generationConfig.thinkingConfig = { thinkingBudget };

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents,
      generationConfig,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

const JARVIS_WORKSPACE_INSTRUCTIONS = `
Jarvis workspace controls:
- When the user clearly asks to create, update, complete, or remove a task, manage a subscription, edit the stock watchlist, run VaultSync, or make an Obsidian backup, propose exactly one or more typed actions below. Never claim that a change happened until the user approves it.
- Use IDs provided in [Workspace controls] for updates or removals. If no unambiguous ID is available, ask a short follow-up question instead of guessing.
- Actions are always subject to the approval button. VaultSync actions additionally require the signed-in administrator.
<action>{"type":"manage_workspace","params":{"operation":"add_todo","text":"Prepare PR review","scope":"day"}}</action>
<action>{"type":"manage_workspace","params":{"operation":"update_todo","id":"td_...","patch":{"done":true}}}</action>
<action>{"type":"manage_workspace","params":{"operation":"remove_todo","id":"td_..."}}</action>
<action>{"type":"manage_workspace","params":{"operation":"add_subscription","name":"Netflix","amount":17000,"paymentDay":15,"cycle":"monthly"}}</action>
<action>{"type":"manage_workspace","params":{"operation":"remove_subscription","id":"sub_..."}}</action>
<action>{"type":"manage_workspace","params":{"operation":"add_watch_item","ticker":"NVDA","name":"NVIDIA","market":"US","memo":"AI watchlist"}}</action>
<action>{"type":"manage_workspace","params":{"operation":"remove_watch_item","id":"a_..."}}</action>
<action>{"type":"manage_workspace","params":{"operation":"sync_vault"}}</action>
<action>{"type":"manage_workspace","params":{"operation":"create_vault_backup"}}</action>`;

const WEB_SEARCH_INSTRUCTIONS = `
Real-time web research:
- For current or externally verifiable information that benefits from a live lookup (for example news, current public announcements, prices, schedules, laws, product availability, people in office, or a user explicitly asking to search the web), return ONLY this marker with a focused search query: <search-web>{"query":"..."}</search-web>
- Do not use the web-search marker for the user's own calendar, plans, tasks, files, or workspace controls; those are already provided in context.
- Do not use it for investment analysis. Use the existing <delegate-stocks> workflow for that instead.
- Do not answer a live-information question from memory when you should use this marker.`;

const WEB_SEARCH_REGEX = /<search-web>([\s\S]*?)<\/search-web>/;

function parseWebSearch(text: string): string | null {
  const match = text.match(WEB_SEARCH_REGEX);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim()) as { query?: unknown };
    const query = typeof parsed.query === "string" ? parsed.query.trim() : "";
    return query ? query.slice(0, 1_000) : null;
  } catch {
    return null;
  }
}

function explicitlyRequestsWebSearch(message: string): boolean {
  return /(?:웹\s*검색|웹에서\s*(?:찾|검색)|인터넷에서\s*(?:찾|검색)|검색해\s*줘|검색해봐|실시간\s*(?:으로|정보|뉴스|검색)|latest\s+(?:news|information)|search\s+the\s+web)/i.test(
    message,
  );
}

function formatWebSearchResult(result: { text: string; sources: { title: string; uri: string }[] }): string {
  const sources = result.sources
    .map((source) => `- ${source.title}: ${source.uri}`)
    .join("\n");
  return `${result.text}\n\n출처 (실시간 웹 검색)\n${sources}`;
}

export async function chatWithAssistant(input: {
  history: ChatMessage[];
  userMessage: string;
  attachments: UploadedFile[];
  context: AssistantContext;
}): Promise<{ text: string; proposedActions: ProposedAction[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const systemText = `${CHAT_SYSTEM_PROMPT}\n${JARVIS_WORKSPACE_INSTRUCTIONS}\n${WEB_SEARCH_INSTRUCTIONS}\n\n${buildContextBlock(input.context)}`;
  const contents = await buildContents(
    input.history,
    input.userMessage,
    input.attachments,
  );

  // Pass 1 — 라우터/플래너. 평소처럼 답하거나, 주식 질문이면 위임 지시를 낸다.
  const raw = await callChatGemini(systemText, contents, 0.7);
  if (!raw) return { text: "(빈 응답)", proposedActions: [] };

  // 주식 위임 지시가 있으면 에이전트 네트워크를 돌리고 실데이터로 종합한다.
  const delegation = parseDelegation(raw);
  if (delegation) {
    try {
      const synthesized =
        delegation.intent === "screen"
          ? await synthesizeScreenAnswer({
              userMessage: input.userMessage,
              report: await runScreen(delegation, input.context),
              context: input.context,
            })
          : await synthesizeStockAnswer({
              userMessage: input.userMessage,
              report: await runStockNetwork(delegation, input.context),
              context: input.context,
            });
      const finalText = synthesized.trim();
      if (!finalText) {
        return {
          text: "주식 에이전트 분석을 받았지만 종합에 실패했어. 잠시 후 다시 시도해줘.",
          proposedActions: [],
        };
      }
      const { cleanText, actions } = parseActions(finalText);
      return { text: cleanText || finalText, proposedActions: actions };
    } catch (e) {
      // 데이터/네트워크 실패: 환각 대신 솔직히 알린다 (추측 금지 원칙).
      const msg = e instanceof Error ? e.message : String(e);
      return {
        text: `주식 에이전트 분석을 완료하지 못했어. (사유: ${msg})\n실시간 데이터를 못 가져오면 추측으로 답하지 않는다는 원칙이라, 잠시 후 다시 물어봐줘.`,
        proposedActions: [],
      };
    }
  }

  // A model-selected marker handles live questions automatically. The explicit
  // fallback means a direct user request for web search cannot be missed when
  // the routing pass returns an ordinary answer.
  const webQuery = parseWebSearch(raw) ??
    (explicitlyRequestsWebSearch(input.userMessage) ? input.userMessage : null);
  if (webQuery) {
    try {
      const result = await searchWeb(webQuery);
      if (result) {
        return { text: formatWebSearchResult(result), proposedActions: [] };
      }
      return {
        text: "실시간 웹 검색 결과를 확인하지 못했습니다. 확인되지 않은 내용으로 답하지 않도록 잠시 후 다시 검색해 주세요.",
        proposedActions: [],
      };
    } catch {
      return {
        text: "실시간 웹 검색 연결에 실패했습니다. 확인되지 않은 내용으로 답하지 않도록 잠시 후 다시 검색해 주세요.",
        proposedActions: [],
      };
    }
  }

  const { cleanText, actions } = parseActions(raw);
  return { text: cleanText || raw, proposedActions: actions };
}

// =====================================================================
// 주식 에이전트 네트워크 — 위임 → 실데이터 수집 → 종합
// =====================================================================

const DEFAULT_INVEST_SETTINGS: InvestSettings = {
  traderWeights: { livermore: 20, oneil: 20, weinstein: 20, minervini: 20, lynch: 20 },
  defaultStopLossRate: 7,
  focusThemes: "",
};

type StockDelegation = {
  intent: "single" | "portfolio" | "market" | "screen";
  queries: { name: string; ticker?: string; market?: string }[];
  need_macro?: boolean;
  focus?: string;
  /** screen 인텐트의 테마/섹터 설명. */
  theme?: string;
};

const DELEGATE_REGEX = /<delegate-stocks>([\s\S]*?)<\/delegate-stocks>/;

function parseDelegation(text: string): StockDelegation | null {
  const m = text.match(DELEGATE_REGEX);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1].trim()) as Partial<StockDelegation>;
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries.filter(
          (q): q is { name: string; ticker?: string; market?: string } =>
            !!q && typeof q.name === "string" && q.name.trim().length > 0,
        )
      : [];
    const intent =
      parsed.intent === "portfolio" ||
      parsed.intent === "market" ||
      parsed.intent === "screen"
        ? parsed.intent
        : "single";
    // 대상이 필요한 인텐트인데 후보가 하나도 없으면 위임 무효(일반 답변으로 폴백).
    if ((intent === "single" || intent === "screen") && queries.length === 0)
      return null;
    return {
      intent,
      queries,
      need_macro: parsed.need_macro,
      focus: parsed.focus,
      theme: typeof parsed.theme === "string" ? parsed.theme : undefined,
    };
  } catch {
    return null;
  }
}

type TickerReport = {
  name: string;
  ticker: string;
  market: string;
  dataOk: boolean;
  asOf: number;
  price: number | null;
  changePercent: number | null;
  holding?: StockHolding;
  jkp: JkpAnalysisResult | null;
  review: AgentReviewResult | null;
  threeAgent?: ThreeAgentAnalysis;
  error?: string;
};

type StockAgentReport = {
  perTicker: TickerReport[];
  macro: { text: string; asOf: number } | null;
  grounded: { text: string; sources: { title: string; uri: string }[] } | null;
};

function buildGroundingQuery(
  d: StockDelegation,
  targets: { name: string }[],
): string {
  const today = toIso(new Date());
  const names = targets.map((t) => t.name).filter(Boolean).join(", ");
  const focus = d.focus ? ` 사용자 관심: ${d.focus}.` : "";
  if (d.intent === "market" || !names) {
    return `오늘(${today}) 글로벌·한국 증시의 최신 흐름과, 이번 주~다음 주 예정된 주요 경제 이벤트(FOMC, CPI, 고용지표, 주요 실적 등)를 날짜와 함께 정리.${focus}`;
  }
  return `오늘(${today}) 기준 ${names} 관련 최신 뉴스·이슈와, 향후 예정된 실적 발표일이나 주가에 영향을 줄 이벤트를 날짜와 함께 정리.${focus}`;
}

async function analyzeTicker(
  t: { name: string; ticker?: string; market?: string },
  holdings: StockHolding[],
  settings: InvestSettings,
  macroSnapshot: MarketSnapshot,
): Promise<TickerReport> {
  let ticker = t.ticker?.trim() ?? "";
  let name = t.name;
  let market = t.market ?? "KR";
  try {
    // 티커를 모르면 종목명으로 해석한다(모델 추측에 의존하지 않음).
    if (!ticker) {
      const found = await searchTickerSmart(t.name);
      if (found) {
        ticker = found.ticker;
        name = found.name || t.name;
        market = found.market === "OTHER" ? market : found.market;
      }
    }
    if (!ticker) {
      return {
        name,
        ticker: "?",
        market,
        dataOk: false,
        asOf: Date.now(),
        price: null,
        changePercent: null,
        jkp: null,
        review: null,
        error: "티커 해석 실패",
      };
    }
    // Collect the market data once, then pass the same immutable snapshot to all three roles.
    const md = await gatherMarketData(ticker, name);
    const threeAgent = await runThreeAgentAnalysis({
      ticker: md.ticker,
      name,
      marketData: md,
      macroSnapshot,
    });
    const holding = holdings.find(
      (h) =>
        h.ticker.toUpperCase() === md.ticker.toUpperCase() ||
        h.ticker.toUpperCase() === ticker.toUpperCase(),
    );
    return {
      name,
      ticker: md.ticker,
      market,
      dataOk: md.dataOk,
      asOf: md.asOf,
      price: md.price,
      changePercent: md.changePercent,
      holding,
      jkp: null,
      review: null,
      threeAgent,
    };
  } catch (e) {
    return {
      name,
      ticker: ticker || "?",
      market,
      dataOk: false,
      asOf: Date.now(),
      price: null,
      changePercent: null,
      jkp: null,
      review: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function runStockNetwork(
  d: StockDelegation,
  ctx: AssistantContext,
): Promise<StockAgentReport> {
  const settings = ctx.stock?.settings ?? DEFAULT_INVEST_SETTINGS;
  const holdings = ctx.stock?.holdings ?? [];

  // 분석 대상 결정 — portfolio면 보유 종목 전체로 채운다.
  let targets: { name: string; ticker?: string; market?: string }[] = d.queries;
  if (d.intent === "portfolio" && holdings.length) {
    targets = holdings.map((h) => ({ name: h.name, ticker: h.ticker, market: h.market }));
  }
  targets = targets.slice(0, 3); // 지연/비용 상한 (최대 3종목)

  // Every decision is gated by the same market-regime snapshot, even when the
  // user did not explicitly ask for a macro briefing.
  const [macroSnapshot, grounded] = await Promise.all([
    fetchMarketSnapshot().catch(() => ({
      text: "Market-regime data unavailable.",
      asOf: Date.now(),
      ok: false,
      readings: {},
    })),
    fetchGroundedMarketBrief(buildGroundingQuery(d, targets)).catch(() => null),
  ]);
  const perTicker = await Promise.all(
    targets.map((t) => analyzeTicker(t, holdings, settings, macroSnapshot)),
  );

  return {
    perTicker,
    macro: macroSnapshot.ok ? { text: macroSnapshot.text, asOf: macroSnapshot.asOf } : null,
    grounded,
  };
}

// =====================================================================
// 테마/섹터 스크리닝 — 후보 발굴(상위 뇌) → 실데이터 검증 → 단/중/장기 추천
// =====================================================================

type ScreenCandidate = {
  name: string;
  ticker: string;
  market: string;
  dataOk: boolean;
  price: number | null;
  changePercent: number | null;
  /** 실데이터 펀더멘털 한 줄 (PBR·PER·ROE·부채비율·목표주가 등). */
  fundamentals: string;
  jkp: JkpAnalysisResult | null;
  holding?: StockHolding;
  error?: string;
};

type ScreenReport = {
  theme: string;
  focus?: string;
  candidates: ScreenCandidate[];
  macro: { text: string; asOf: number } | null;
  grounded: { text: string; sources: { title: string; uri: string }[] } | null;
};

/** 후보 1종목: 티커 해석 → 실시간 데이터 → JKP 단일 분석(5인 리뷰는 비용상 생략). */
async function screenCandidate(
  t: { name: string; ticker?: string; market?: string },
  settings: InvestSettings,
  holdings: StockHolding[],
): Promise<ScreenCandidate> {
  let ticker = t.ticker?.trim() ?? "";
  let name = t.name;
  let market = t.market ?? "US";
  try {
    if (!ticker) {
      const found = await searchTickerSmart(t.name);
      if (found) {
        ticker = found.ticker;
        name = found.name || t.name;
        market = found.market === "OTHER" ? market : found.market;
      }
    }
    if (!ticker) {
      return {
        name,
        ticker: "?",
        market,
        dataOk: false,
        price: null,
        changePercent: null,
        fundamentals: "(티커 해석 실패)",
        jkp: null,
        error: "티커 해석 실패",
      };
    }
    const md: StockMarketData = await gatherMarketData(ticker, name);
    const fundamentals = buildFundamentalsLine(md.quote).text;
    const jkp = md.dataOk
      ? await runJkpAnalysis({
          ticker: md.ticker,
          name,
          market,
          settings,
          marketData: md,
        }).catch(() => null)
      : null;
    const holding = holdings.find(
      (h) => h.ticker.toUpperCase() === md.ticker.toUpperCase(),
    );
    return {
      name,
      ticker: md.ticker,
      market,
      dataOk: md.dataOk,
      price: md.price,
      changePercent: md.changePercent,
      fundamentals,
      jkp,
      holding,
      error: md.dataOk ? undefined : "실데이터 수집 실패",
    };
  } catch (e) {
    return {
      name,
      ticker: ticker || "?",
      market,
      dataOk: false,
      price: null,
      changePercent: null,
      fundamentals: "(수집 오류)",
      jkp: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function buildScreenGroundingQuery(d: StockDelegation): string {
  const today = toIso(new Date());
  const theme = d.theme || d.focus || "관심 테마";
  const names = d.queries.map((q) => q.name).filter(Boolean).join(", ");
  return `오늘(${today}) 기준 "${theme}" 테마의 최신 시장 흐름·수급·정책/실적 모멘텀과, 관련 종목(${names})에 영향을 줄 예정 이벤트를 날짜와 함께 정리. 테마 자체의 단기·중기·장기 전망도 한 단락으로.`;
}

async function runScreen(
  d: StockDelegation,
  ctx: AssistantContext,
): Promise<ScreenReport> {
  const settings = ctx.stock?.settings ?? DEFAULT_INVEST_SETTINGS;
  const holdings = ctx.stock?.holdings ?? [];
  const candidatesIn = d.queries.slice(0, 6); // 비용·지연 상한 (최대 6 후보)

  const [candidates, macro, grounded] = await Promise.all([
    Promise.all(candidatesIn.map((t) => screenCandidate(t, settings, holdings))),
    fetchMarketSnapshot()
      .then((s) => (s.ok ? { text: s.text, asOf: s.asOf } : null))
      .catch(() => null),
    fetchGroundedMarketBrief(buildScreenGroundingQuery(d)).catch(() => null),
  ]);

  return {
    theme: d.theme || d.focus || "테마 스크리닝",
    focus: d.focus,
    candidates,
    macro,
    grounded,
  };
}

function buildScreenReportText(r: ScreenReport, ctx: AssistantContext): string {
  const blocks: string[] = [];
  blocks.push(`### 테마: ${r.theme}${r.focus ? ` (관심: ${r.focus})` : ""}`);

  for (const c of r.candidates) {
    const lines: string[] = [];
    const chg =
      c.changePercent !== null
        ? ` (${c.changePercent > 0 ? "+" : ""}${c.changePercent.toFixed(2)}%)`
        : "";
    lines.push(`#### ${c.name} (${c.ticker}, ${c.market})`);
    if (c.error) lines.push(`  수집: ${c.error}`);
    lines.push(
      `  현재가: ${c.price !== null ? c.price : "데이터 없음"}${chg} — Yahoo Finance, ${fmtKDateTime(Date.now())} 기준`,
    );
    lines.push(`  펀더멘털: ${c.fundamentals}`);
    if (c.holding) {
      lines.push(`  사용자 보유: ${c.holding.qty}주 @평단 ${c.holding.avgBuyPrice}`);
    }
    if (c.jkp) {
      const j = c.jkp;
      lines.push(
        `  [JKP] 결론=${j.final_action} (확신 ${j.confidence}) / 매수구간 ${j.buy_zone?.entry_price} / 목표1 ${j.target_price?.target_1} / 목표2 ${j.target_price?.target_2} / 손절 ${j.stop_loss} / 손익비 ${j.risk_reward_ratio} / 기간 ${j.time_horizon}`,
      );
      if (j.key_catalysts?.length) lines.push(`    촉매: ${j.key_catalysts.join("; ")}`);
      if (j.key_risks?.length) lines.push(`    리스크: ${j.key_risks.join("; ")}`);
    } else {
      lines.push("  [JKP] 분석 없음 (실데이터 부족)");
    }
    blocks.push(lines.join("\n"));
  }

  if (r.macro) {
    blocks.push(
      `### 거시 지표 스냅샷 (Yahoo Finance, ${fmtKDateTime(r.macro.asOf)} 기준)\n${r.macro.text}`,
    );
  }
  if (r.grounded) {
    const src = r.grounded.sources.length
      ? "\n출처:\n" +
        r.grounded.sources
          .map((s, i) => `  [${i + 1}] ${s.title || s.uri} — ${s.uri}`)
          .join("\n")
      : "";
    blocks.push(
      `### 최신 시장/테마 브리핑 (Google 검색 그라운딩)\n${r.grounded.text}${src}`,
    );
  }

  const today = toIso(new Date());
  const upcoming = (ctx.stock?.econEvents ?? [])
    .filter((ev) => ev.eventDate >= today)
    .slice(0, 6);
  if (upcoming.length) {
    blocks.push(
      "### 사용자 등록 경제 일정\n" +
        upcoming
          .map((ev) => `  - ${ev.eventDate} [${ev.importance}] ${ev.title} (${ev.market})`)
          .join("\n"),
    );
  }

  if (r.candidates.filter((c) => c.dataOk).length === 0) {
    blocks.push(
      "(주의: 후보 종목 실데이터를 거의 못 가져왔다. 가져온 펀더멘털·그라운딩 범위 안에서만 신중히 판단하고, 부족하면 그 사실을 밝혀라.)",
    );
  }
  return blocks.join("\n\n");
}

const STOCK_SCREEN_SYNTH_PROMPT = `너는 사용자의 전담 펀드매니저 겸 최상위 뇌 네트워크 총괄("최종 자비스") "뇌대리"다.
하위 에이전트가 테마 후보 종목들의 Yahoo Finance 실시간 재무·시세와 JKP 분석을 모아줬다. 이걸 종합해 테마 안에서 "지금 살 만한 종목"을 골라 단기·중기·장기로 나눠 추천한다.

핵심 원칙:
- "데이터 없음"으로 회피하지 마라. 후보별 펀더멘털(PBR·PER·ROE·부채비율·매출성장률·목표주가)과 JKP 결론이 리포트에 들어있다. 그 수치로 우열을 가려 순위를 매긴다.
- 모든 추천에는 두 종류의 근거를 반드시 붙여라: (1) 회사 경영상태·밸류에이션 근거 — PBR/PER/ROE/부채비율/성장률 중 실제 수치를 인용, (2) 시장흐름·테마 모멘텀 근거 — 거시 스냅샷·그라운딩 브리핑 기반.
- 리포트에 있는 수치만 인용한다. 없는 값은 지어내지 말고 그 종목은 순위에서 내리거나 "데이터 부족"으로 표기.
- 목표가·손절가·진입가는 "(JKP 기준)"처럼 출처를 달아라.
- "투자 권유가 아닙니다" 류 면피 문구 금지. 명확히 매수/관망/회피로 구분.

출력 형식(한국어, 마크다운):

## [테마] 스크리닝 — 단기·중기·장기 추천

> 테마 한 줄 요약 + 현재 시장흐름 한 줄

### 📌 종합 순위
| 순위 | 종목(티커) | 스탠스 | 핵심 근거 (경영·밸류 + 시장흐름) |
|------|-----------|--------|------------------|
| 1 | … | 매수/관망/회피 | PBR/ROE 등 수치 + 테마 모멘텀 |

### ⚡ 단기 (1~4주)
- **[종목]:** 진입가 / 목표 / 손절 (JKP 기준) — 근거: [밸류·경영상태] / [시장흐름·수급]

### 📈 중기 (1~6개월)
- **[종목]:** 목표가 + 펀더멘털 근거 + 테마 성장 근거

### 🏛 장기 (6개월+)
- **[종목]:** 밸류에이션 근거(PBR/PER vs 성장성) + 구조적 테마 근거

### ⚠ 제외·주의
- [데이터 부족하거나 밸류 과열인 종목과 이유]

### 예정 이벤트 & 리스크
- [날짜 있는 이벤트, 테마 공통 리스크]

마지막 줄에 **데이터 기준:** Yahoo Finance 실시간 + Google 검색 그라운딩, [오늘 날짜] 기준 — 그라운딩 출처 URL 있으면 첨부.`;

async function synthesizeScreenAnswer(input: {
  userMessage: string;
  report: ScreenReport;
  context: AssistantContext;
}): Promise<string> {
  const reportText = buildScreenReportText(input.report, input.context);
  const today = toIso(new Date());
  const systemText = `${STOCK_SCREEN_SYNTH_PROMPT}\n\n[오늘] ${today} (${weekdayLabel(today)})`;
  const userPrompt = `사용자 질문: "${input.userMessage}"

아래는 네 하위 에이전트들이 "${input.report.theme}" 테마 후보 종목들에 대해 실시간 데이터로 작성한 리포트다.
========================================
${reportText}
========================================

위 리포트의 실제 수치만 근거로, 테마 안에서 단기·중기·장기 추천 종목을 골라 종합하라. 각 추천에는 경영상태/PBR 등 밸류에이션 근거와 시장흐름 근거를 반드시 함께 제시하라. 제공되지 않은 수치는 만들지 마라.`;
  return callChatGemini(
    systemText,
    [{ role: "user", parts: [{ text: userPrompt }] }],
    0.3,
    2600,
    0,
  );
}

const STOCK_SYNTH_PROMPT = `너는 사용자의 전담 펀드매니저 "뇌대리"다.
하위 에이전트(JKP·O'Neil·Lynch·Weinstein·Minervini)가 Yahoo Finance 실시간 데이터로 분석한 리포트를 종합해, 단기·중기·장기별 명확한 투자 판단과 실행 계획을 준다.

핵심 원칙:
- 사용자는 전담 펀드매니저에게 묻는 것이므로 명확한 매수/관망/매도 결론을 내린다. "투자 권유가 아닙니다" 같은 면피 문구는 절대 쓰지 마라.
- 에이전트 리포트에 있는 수치만 인용한다. 없는 수치는 지어내지 말고 "데이터 없음"으로 처리한다.
- 데이터가 부분적이어도 가용한 정보로 판단을 내린다. 데이터 부재를 이유로 판단을 회피하지 마라.
- 목표가·손절가는 반드시 "(JKP 기준)" "(5인 합의)" 등 에이전트 출처를 달아라.
- 이벤트는 날짜 명시, 리포트·그라운딩 범위 내에서만.

출력 형식 (한국어, 마크다운, 간결하되 핵심 수치 포함):

## [종목명] 판단: [매수/관망/매도] · 컨센서스 [X]/100

> 핵심 근거 한 줄

### 단기 (1~4주)
- **스탠스:** [단기 매수/관망/매도]
- **진입가:** [JKP 매수구간] / **손절:** [JKP 손절] / **손익비:** [JKP 손익비]
- **목표:** [JKP 목표1 / 5인 단기 목표]
- **진입 트리거:** [어떤 조건에 진입할지 한 줄]

### 중기 (1~6개월)
- **스탠스:** [중기 컨센서스]
- **목표가:** [JKP 목표2 또는 중기 목표]
- **핵심 근거:** [펀더멘털/기술적 포인트 2줄 이내]
- **부분 익절:** [1차 목표 도달 시 전략]

### 장기 (6개월+)
- **스탠스:** [장기 밸류에이션 기반 시나리오]
- **목표가:** [장기 목표]
- **밸류에이션:** [view] — [intrinsic_value_hint]
- **완전 청산 조건:** [full_exit]

### 에이전트 의견
[의견 갈리면 누가 왜 강세/약세인지. 만장일치면 1줄]

### 리스크 & 예정 이벤트
- [리스크 항목들, 날짜 있는 이벤트 포함]

### 자동매매 설정값 (JKP 기준)
| 항목 | 값 |
|------|-----|
| 진입가 | [entry_price] |
| 1차 목표 | [target_1] |
| 2차 목표 | [target_2] |
| 손절가 | [stop_loss] |
| 손익비 | [risk_reward_ratio] |
| 부분 익절 | [partial_exit 조건 요약] |
| 트레일링 스탑 | [trailing_stop] |
| 완전 청산 | [full_exit 조건 요약] |

**현재가:** [가격] (Yahoo Finance, [기준시각] 기준)[보유 시: / 평가손익: [손익%]]
[그라운딩 출처 있으면: **출처:** URL 목록]`;

function fmtKDateTime(ts: number): string {
  return new Date(ts).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function buildReportText(r: StockAgentReport, ctx: AssistantContext): string {
  const blocks: string[] = [];

  for (const t of r.perTicker) {
    const lines: string[] = [];
    lines.push(`### ${t.name} (${t.ticker}, ${t.market})`);
    if (t.error) lines.push(`수집 오류: ${t.error}`);
    const chg =
      t.changePercent !== null
        ? ` (${t.changePercent > 0 ? "+" : ""}${t.changePercent.toFixed(2)}%)`
        : "";
    lines.push(
      `현재가: ${t.price !== null ? t.price : "데이터 없음"}${chg} — Yahoo Finance, ${fmtKDateTime(t.asOf)} 기준`,
    );
    lines.push(`실데이터 수집: ${t.dataOk ? "성공" : "실패 (수치 없음 — 추정 금지)"}`);

    if (t.holding) {
      const h = t.holding;
      const pl =
        t.price !== null && h.avgBuyPrice
          ? ` → 평가손익 ${(((t.price - h.avgBuyPrice) / h.avgBuyPrice) * 100).toFixed(2)}%`
          : "";
      lines.push(`사용자 보유: ${h.qty}주 @평단 ${h.avgBuyPrice}${pl}`);
      if (h.target1 || h.target2 || h.stopLoss) {
        lines.push(
          `사용자 설정 목표/손절: 목표1 ${h.target1 || "-"} / 목표2 ${h.target2 || "-"} / 손절 ${h.stopLoss || "-"}`,
        );
      }
    }

    if (t.threeAgent) {
      const a = t.threeAgent;
      lines.push(
        `[3-agent risk gate] decision=${a.riskGate.decision} / score=${a.riskGate.score ?? "N/A"} / manualConfirmation=${a.riskGate.requiresManualConfirmation}`,
      );
      lines.push(
        `  [Macro/Risk ${a.macroRisk.readiness}] ${a.macroRisk.score}/100 — ${a.macroRisk.signals.join(" ")}`,
      );
      lines.push(
        `  [Fundamental/Value ${a.fundamentalValue.readiness}] ${a.fundamentalValue.score}/100 — ${a.fundamentalValue.signals.join(" ")}`,
      );
      lines.push(
        `  [Trend/Entry ${a.trendEntry.readiness}] ${a.trendEntry.score}/100 — ${a.trendEntry.entryRule} ${a.trendEntry.invalidationRule}`,
      );
      lines.push(`  Gate rationale: ${a.riskGate.reasons.join(" ")}`);
    }

    if (t.jkp) {
      const j = t.jkp;
      lines.push(
        `[JKP 분석] 결론=${j.final_action} (확신 ${j.confidence}) / 매수구간 ${j.buy_zone?.entry_price} / 목표1 ${j.target_price?.target_1} / 목표2 ${j.target_price?.target_2} / 손절 ${j.stop_loss} / 손익비 ${j.risk_reward_ratio} / 기간 ${j.time_horizon}`,
      );
      if (j.key_catalysts?.length) lines.push(`  촉매: ${j.key_catalysts.join("; ")}`);
      if (j.key_risks?.length) lines.push(`  리스크: ${j.key_risks.join("; ")}`);
      if (j.jkp_comment) lines.push(`  JKP 코멘트: ${j.jkp_comment}`);
    } else {
      lines.push("[JKP 분석] 생성 실패");
    }

    if (t.review) {
      const v = t.review;
      lines.push(
        `[5인 합의] 컨센서스=${v.consensus} (${v.consensusScore}/100) / 밸류에이션 ${v.valuation?.view}`,
      );
      for (const a of v.agents ?? []) {
        lines.push(`  - ${a.agent}(${a.style}): ${a.verdict} ${a.score} — ${a.key_point}`);
      }
      if (v.buyTiming) {
        lines.push(
          `  타이밍: 스테이지 ${v.buyTiming.current_stage} / 진입 ${v.buyTiming.ideal_entry} / 손절 ${v.buyTiming.stop_loss} / 단기목표 ${v.buyTiming.target_short} / 장기목표 ${v.buyTiming.target_long}`,
        );
      }
      if (v.jkp_final) lines.push(`  JKP 최종: ${v.jkp_final}`);
    } else {
      lines.push("[5인 합의] 생성 실패");
    }

    blocks.push(lines.join("\n"));
  }

  if (r.macro) {
    blocks.push(
      `### 거시 지표 스냅샷 (Yahoo Finance, ${fmtKDateTime(r.macro.asOf)} 기준)\n${r.macro.text}`,
    );
  }

  if (r.grounded) {
    const src = r.grounded.sources.length
      ? "\n출처:\n" +
        r.grounded.sources
          .map((s, i) => `  [${i + 1}] ${s.title || s.uri} — ${s.uri}`)
          .join("\n")
      : "";
    blocks.push(`### 최신 시장/이벤트 브리핑 (Google 검색 그라운딩)\n${r.grounded.text}${src}`);
  }

  const today = toIso(new Date());
  const upcoming = (ctx.stock?.econEvents ?? []).filter((ev) => ev.eventDate >= today).slice(0, 8);
  if (upcoming.length) {
    blocks.push(
      "### 사용자 등록 경제 일정\n" +
        upcoming
          .map((ev) => `  - ${ev.eventDate} [${ev.importance}] ${ev.title} (${ev.market})`)
          .join("\n"),
    );
  }

  if (blocks.length === 0) {
    return "(에이전트들이 사용할 수 있는 데이터를 전혀 수집하지 못했다. 추측하지 말고 데이터를 못 가져왔다고 사용자에게 알릴 것.)";
  }
  return blocks.join("\n\n");
}

const THREE_AGENT_SYNTHESIS_GUARD = `
Non-negotiable safety rules:
- The [3-agent risk gate] is authoritative. Never override no_trade or watch with a buy/sell instruction.
- For no_trade, explain the missing verification and state that no new position should be opened from this report.
- For watch, give only observable conditions to monitor. Do not invent entry, target, stop, price, or dates.
- buy_candidate is a research candidate only. State that it still requires the user's manual confirmation; never imply an order was placed or can be placed.
- Quote only values present in the report and identify the source snapshot time.`;

async function synthesizeStockAnswer(input: {
  userMessage: string;
  report: StockAgentReport;
  context: AssistantContext;
}): Promise<string> {
  const reportText = buildReportText(input.report, input.context);
  const today = toIso(new Date());
  const systemText = `${STOCK_SYNTH_PROMPT}\n\n[오늘] ${today} (${weekdayLabel(today)})`;
  const userPrompt = `사용자 질문: "${input.userMessage}"

아래는 네 하위 주식 에이전트들이 실시간 데이터로 작성한 리포트다.
========================================
${reportText}
========================================

위 에이전트 리포트와 원본 데이터만 근거로, 사용자 질문에 종합 답변하라. 제공되지 않은 수치는 절대 만들지 마라.`;
  return callChatGemini(`${systemText}\n${THREE_AGENT_SYNTHESIS_GUARD}`, [{ role: "user", parts: [{ text: userPrompt }] }], 0.2, 2000, 0);
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
