import Link from "next/link";

export const metadata = {
  title: "Spec — Woong Hub",
};

const FEATURES: {
  title: string;
  status: "done" | "wip" | "planned";
  notes: string;
}[] = [
  {
    title: "허브 메인 (서비스 카드 그리드)",
    status: "done",
    notes:
      "GitHub 레포 메타데이터로 자동 enrich. 카테고리 필터, 검색, 즐겨찾기, ⌘K 팔레트.",
  },
  {
    title: "iframe 프리뷰 모달",
    status: "done",
    notes: "카드 클릭 시 풀스크린 iframe. GitHub은 차단되니 폴백 화면.",
  },
  {
    title: "Google Calendar 연동",
    status: "done",
    notes: "OAuth 로그인, 이벤트 조회/추가/삭제, 카테고리 색상 매핑.",
  },
  {
    title: "카테고리 시스템",
    status: "done",
    notes: "인생 / 회사 / VFX / 앱개발 / 재즈. Calendar colorId + extendedProperties.",
  },
  {
    title: "캘린더 크기 조절(S/M/L/XL)",
    status: "done",
    notes: "localStorage 기억. 홈 위젯과 풀 페이지 모두 지원.",
  },
  {
    title: "주/월/년 계획 관리 (/plans)",
    status: "done",
    notes: "Upstash Redis 영속화. 카테고리별 분류, 체크리스트, 진행률, 메모.",
  },
  {
    title: "Gemini AI 리뷰",
    status: "done",
    notes: "gemini-2.5-flash-lite. 개별 계획·전체 포트폴리오 두 모드.",
  },
  {
    title: "게임풍 UI/UX 리스킨",
    status: "planned",
    notes: "픽셀/도트 폰트, 카드 모션, 사운드. 컴포넌트 구조는 그대로 두고 시각만 교체.",
  },
  {
    title: "검색에 계획·일정도 포함",
    status: "planned",
    notes: "현재 ⌘K는 서비스만 검색. 추후 cross-cutting 검색.",
  },
  {
    title: "공개 게시 (OAuth verification)",
    status: "planned",
    notes: "Google Cloud OAuth Production 전환. refresh token 7일 만료 해소.",
  },
];

const ROUTES: { path: string; desc: string }[] = [
  { path: "/", desc: "허브 메인 — 서비스 그리드 + 캘린더 위젯 + 계획 카드" },
  { path: "/calendar", desc: "Google Calendar 풀 페이지 — 카테고리 탭, 줌, 일정 추가" },
  { path: "/plans", desc: "주/월/년 계획 — 체크리스트, 메모, AI 리뷰" },
  { path: "/spec", desc: "(여기) 기획서 + 코드 구조" },
  { path: "/api/google/*", desc: "OAuth, 이벤트 CRUD, 상태" },
  { path: "/api/plans/*", desc: "계획 CRUD, AI 리뷰, 상태" },
  { path: "/api/discover", desc: "GitHub에서 본인 레포 자동 수집" },
];

const STACK: { label: string; items: string[] }[] = [
  {
    label: "프레임워크",
    items: ["Next.js 16 (App Router, Turbopack)", "React 19", "TypeScript 5"],
  },
  { label: "스타일", items: ["Tailwind CSS 4", "CSS 변수 기반 토큰"] },
  {
    label: "데이터/연동",
    items: [
      "Google Calendar API (직접 fetch)",
      "Upstash Redis (@upstash/redis)",
      "Gemini 2.5 Flash Lite (REST)",
      "GitHub REST API",
    ],
  },
  { label: "인증", items: ["Google OAuth 2.0", "jose (JWE 쿠키 세션)"] },
  { label: "배포", items: ["Vercel", "Vercel Marketplace (Upstash)"] },
];

const TREE: { path: string; desc: string }[] = [
  { path: "src/app/", desc: "라우트(App Router). page.tsx = 페이지, route.ts = API" },
  { path: "src/app/page.tsx", desc: "허브 메인" },
  { path: "src/app/calendar/page.tsx", desc: "캘린더 풀 페이지" },
  { path: "src/app/plans/page.tsx", desc: "계획 페이지" },
  { path: "src/app/api/google/", desc: "Google OAuth + Calendar API" },
  { path: "src/app/api/plans/", desc: "계획 CRUD + AI 리뷰" },
  { path: "src/components/", desc: "재사용 컴포넌트" },
  { path: "src/components/HubGrid.tsx", desc: "메인 그리드 + 검색·필터" },
  { path: "src/components/ServiceCard.tsx", desc: "서비스 카드" },
  { path: "src/components/PreviewModal.tsx", desc: "iframe 프리뷰" },
  { path: "src/components/CalendarPanel.tsx", desc: "캘린더 풀 패널" },
  { path: "src/components/CalendarMonthGrid.tsx", desc: "월간 그리드" },
  { path: "src/components/CalendarWidget.tsx", desc: "홈용 위젯" },
  { path: "src/components/EventForm.tsx", desc: "일정 추가 폼" },
  { path: "src/components/PlansPanel.tsx", desc: "계획 페이지 본체" },
  { path: "src/lib/", desc: "도메인 로직 (서버·클라 공용)" },
  { path: "src/lib/google.ts", desc: "Calendar API 클라이언트" },
  { path: "src/lib/session.ts", desc: "암호화 쿠키 세션" },
  { path: "src/lib/categories.ts", desc: "5개 카테고리 정의" },
  { path: "src/lib/calendar-util.ts", desc: "날짜·이벤트 유틸" },
  { path: "src/lib/plans.ts", desc: "Upstash Redis 저장소" },
  { path: "src/lib/gemini.ts", desc: "Gemini API + 프롬프트" },
  { path: "src/lib/github.ts", desc: "GitHub 메타 fetch" },
  { path: "src/lib/types.ts", desc: "Service / Category 타입" },
  { path: "src/data/services.json", desc: "큐레이션된 서비스 목록 (수동 편집)" },
];

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  done: { label: "DONE", color: "#46d6db" },
  wip: { label: "WIP", color: "#ffa726" },
  planned: { label: "PLANNED", color: "#a36ee0" },
};

export default function SpecPage() {
  return (
    <div className="relative">
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-10 flex items-baseline justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
              woong-hub / spec
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">기획서</h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              내가 만들고 내가 쓰는 개인 허브. 서비스, 일정, 계획, AI 리뷰까지.
            </p>
          </div>
          <Link href="/" className="text-xs text-[var(--muted)] hover:text-foreground">
            ← 허브로
          </Link>
        </header>

        <Section title="개요">
          <p className="text-sm leading-relaxed">
            <strong>woong-hub</strong>는 흩어진 본인의 도구·서비스를 한 곳에 모으고,
            그 위에 <em>일정 관리</em>와 <em>계획 관리</em>를 얹은 개인용 메타-앱이다.
            허브에 등록된 서비스들은 카드로 표시되며, 클릭하면 iframe으로 미리본다.
            모든 일정과 계획은 다섯 개 카테고리(인생 / 회사 / VFX / 앱개발 / 재즈)로
            분류되어, 어떤 영역에 시간을 얼마나 쓰는지 시각적으로 보인다.
          </p>
        </Section>

        <Section title="기능">
          <ul className="flex flex-col gap-2">
            {FEATURES.map((f) => {
              const s = STATUS_STYLE[f.status];
              return (
                <li
                  key={f.title}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded px-1.5 py-0.5 font-mono text-[10px] tracking-wider"
                      style={{ background: `${s.color}1a`, color: s.color }}
                    >
                      {s.label}
                    </span>
                    <span className="text-sm font-medium">{f.title}</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
                    {f.notes}
                  </p>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="라우트">
          <div className="overflow-hidden rounded-lg border border-[var(--border)]">
            {ROUTES.map((r, i) => (
              <div
                key={r.path}
                className={`flex items-center gap-4 px-4 py-2.5 text-xs ${
                  i !== 0 ? "border-t border-[var(--border)]" : ""
                }`}
              >
                <code className="w-44 shrink-0 font-mono text-[var(--accent)]">
                  {r.path}
                </code>
                <span className="text-[var(--muted)]">{r.desc}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="기술 스택">
          <div className="grid gap-3 sm:grid-cols-2">
            {STACK.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
              >
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  {s.label}
                </h3>
                <ul className="mt-2 flex flex-col gap-1 text-xs">
                  {s.items.map((it) => (
                    <li key={it}>· {it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section title="코드 구조">
          <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
            {TREE.map((t, i) => {
              const depth = (t.path.match(/\//g) ?? []).length - 1;
              const indent = Math.max(0, depth - 1);
              return (
                <div
                  key={t.path}
                  className={`flex items-baseline gap-3 px-4 py-1.5 text-xs ${
                    i !== 0 ? "border-t border-[var(--border)]/50" : ""
                  }`}
                >
                  <code
                    className="font-mono text-[var(--accent)]"
                    style={{ paddingLeft: `${indent * 12}px` }}
                  >
                    {t.path}
                  </code>
                  <span className="text-[var(--muted)]">{t.desc}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
            App Router 컨벤션: <code className="rounded bg-white/5 px-1">page.tsx</code>는
            라우트, <code className="rounded bg-white/5 px-1">route.ts</code>는 API
            엔드포인트, <code className="rounded bg-white/5 px-1">layout.tsx</code>는
            공용 레이아웃.
          </p>
        </Section>

        <Section title="환경 변수">
          <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-black/30 p-4 font-mono text-[11px] leading-relaxed text-[var(--muted)]">{`# Google OAuth (필수)
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI       # https://<도메인>/api/google/callback
SESSION_SECRET            # 32+ 글자 랜덤

# 계획 저장소 (Upstash Redis, /plans 사용 시 필수)
UPSTASH_REDIS_REST_URL    또는 KV_REST_API_URL
UPSTASH_REDIS_REST_TOKEN  또는 KV_REST_API_TOKEN

# AI 리뷰 (선택)
GEMINI_API_KEY            # aistudio.google.com/apikey

# GitHub 비공개 레포 메타 조회 (선택)
GITHUB_TOKEN`}</pre>
        </Section>

        <Section title="다음 단계 (생각 중)">
          <ul className="flex flex-col gap-2 text-sm leading-relaxed">
            <li>· 게임풍 UI 리스킨 — 컴포넌트는 그대로, 비주얼·모션·사운드만 교체</li>
            <li>· 통합 검색 — 서비스 / 일정 / 계획을 ⌘K 한 번에</li>
            <li>· 주간 리뷰 자동 생성 — 매주 일요일 Gemini가 한 주 정리</li>
            <li>· 캘린더-계획 연동 — 계획 항목을 캘린더 일정으로 한 번에 생성</li>
          </ul>
        </Section>

        <footer className="mt-12 border-t border-[var(--border)] pt-4 text-[11px] text-[var(--muted)]">
          이 문서는{" "}
          <code className="rounded bg-white/5 px-1 font-mono">
            src/app/spec/page.tsx
          </code>
          에 하드코딩돼 있다. 수정하고 push하면 바로 반영.
        </footer>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
        {"// "}
        {title}
      </h2>
      {children}
    </section>
  );
}
