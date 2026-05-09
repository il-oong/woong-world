"use client";

import { useState, useEffect } from "react";

type Tab = "ios" | "android";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 font-mono text-[10px] text-[var(--accent)]">
        {n}
      </span>
      <p className="text-sm leading-relaxed text-[var(--muted)]">{children}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white/5 px-3 py-2">
      <code className="flex-1 truncate text-[11px] text-[var(--accent)]">{children}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(children);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="shrink-0 text-[11px] text-[var(--muted)] hover:text-foreground"
      >
        {copied ? "✓" : "복사"}
      </button>
    </div>
  );
}

export default function GuidePage() {
  const [tab, setTab] = useState<Tab>("ios");
  const [token, setToken] = useState<string>("");
  const scriptUrl = token
    ? `https://woong-world.vercel.app/api/briefing/script?token=${token}`
    : "로그인 후 홈화면에서 토큰을 확인하세요";

  useEffect(() => {
    fetch("/api/briefing/token")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.token) setToken(d.token); })
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
        biseo / guide
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">자동 브리핑 설정</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        매일 정해진 시간에 AI 브리핑을 자동으로 받는 방법입니다.
      </p>

      {/* 탭 */}
      <div className="mt-8 flex gap-1 rounded-xl border border-[var(--border)] bg-white/5 p-1">
        {([["ios", "iPhone (iOS)"], ["android", "Android"]] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className="flex-1 rounded-lg py-2 text-sm font-medium transition"
            style={{
              background: tab === id ? "rgba(255,255,255,0.08)" : "transparent",
              color: tab === id ? "var(--foreground)" : "var(--muted)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* iOS */}
      {tab === "ios" && (
        <div className="mt-6 flex flex-col gap-4">
          <p className="text-xs text-[var(--muted)]">
            아이폰 단축어 앱을 이용해 매일 정해진 시간에 Siri 음성으로 브리핑합니다.
            Safari를 열지 않아 완전 자동으로 작동합니다.
          </p>

          <Section title="1단계 — 브리핑 URL 준비">
            <Step n={1}>아래 URL을 복사하세요. (본인 전용 토큰이 포함되어 있습니다)</Step>
            <CodeBlock>{scriptUrl}</CodeBlock>
            <Step n={2}>URL이 비어있다면 먼저 앱에 로그인하세요.</Step>
          </Section>

          <Section title="2단계 — 단축어 만들기">
            <Step n={1}>아이폰 기본 앱 <strong className="text-foreground">단축어</strong>를 엽니다.</Step>
            <Step n={2}>우상단 <strong className="text-foreground">+</strong> 탭 → 동작 추가</Step>
            <Step n={3}><strong className="text-foreground">"URL 가져오기"</strong> 검색 후 선택 → 위에서 복사한 URL 붙여넣기</Step>
            <Step n={4}><strong className="text-foreground">"텍스트 말하기"</strong> 검색 후 선택 → "URL 가져오기 결과" 연결</Step>
            <Step n={5}>우상단 완료 저장</Step>
          </Section>

          <Section title="3단계 — 자동 실행 등록">
            <Step n={1}>단축어 앱 하단 <strong className="text-foreground">자동화</strong> 탭 이동</Step>
            <Step n={2}>우상단 <strong className="text-foreground">+</strong> → 시간대 선택</Step>
            <Step n={3}>원하는 시간 설정 (예: 오전 8:00) → 매일 선택</Step>
            <Step n={4}><strong className="text-foreground">새 빈 자동화</strong> → 동작 추가 → 만들어둔 단축어 실행 선택</Step>
            <Step n={5}>완료 — 매일 설정한 시간에 자동으로 브리핑됩니다.</Step>
          </Section>

          <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4">
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              <strong className="text-[var(--accent)]">토큰 보안</strong> — URL에 포함된 토큰은 본인 캘린더 접근 권한이 있습니다.
              다른 사람과 공유하지 마세요. 홈화면 단축어 카드에서 언제든 새 토큰으로 교체할 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* Android */}
      {tab === "android" && (
        <div className="mt-6 flex flex-col gap-4">
          <p className="text-xs text-[var(--muted)]">
            Android는 두 가지 방법을 제공합니다. MacroDroid(무료)를 추천합니다.
          </p>

          <Section title="공통 — 브리핑 URL 준비">
            <Step n={1}>아래 URL을 복사하세요.</Step>
            <CodeBlock>{scriptUrl}</CodeBlock>
          </Section>

          {/* 방법 A */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full bg-[var(--accent)]/15 px-2.5 py-0.5 font-mono text-[10px] text-[var(--accent)]">추천</span>
              <h3 className="text-sm font-semibold">방법 A — MacroDroid (무료 앱)</h3>
            </div>
            <div className="flex flex-col gap-2.5">
              <Step n={1}>Play 스토어에서 <strong className="text-foreground">MacroDroid</strong> 설치</Step>
              <Step n={2}>새 매크로 만들기 → 트리거: <strong className="text-foreground">시간</strong> → 원하는 시간 설정</Step>
              <Step n={3}>액션 추가 → <strong className="text-foreground">HTTP 요청</strong> → URL에 브리핑 URL 붙여넣기 → GET 방식</Step>
              <Step n={4}>액션 추가 → <strong className="text-foreground">텍스트 읽기(TTS)</strong> → "이전 액션 결과" 선택</Step>
              <Step n={5}>저장 — 매일 설정한 시간에 자동 브리핑됩니다.</Step>
            </div>
          </div>

          {/* 방법 B */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-3 text-sm font-semibold">방법 B — PWA 설치 후 브라우저 자동화</h3>
            <div className="flex flex-col gap-2.5">
              <Step n={1}>Chrome에서 앱 접속 → 메뉴(⋮) → <strong className="text-foreground">홈 화면에 추가</strong></Step>
              <Step n={2}>Play 스토어에서 <strong className="text-foreground">Tasker</strong> 설치 (유료, 강력한 자동화)</Step>
              <Step n={3}>트리거: 시간 → 액션: <strong className="text-foreground">브라우저 열기</strong> → 브리핑 URL 입력</Step>
              <Step n={4}>Android Chrome은 설치된 PWA에서 자동재생을 허용하므로 페이지가 열리면 바로 음성이 재생됩니다.</Step>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4">
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              <strong className="text-[var(--accent)]">삼성 갤럭시</strong> 사용자라면
              <strong className="text-foreground"> 빅스비 루틴</strong>에서도 동일하게 설정 가능합니다.
              루틴 → 추가 → 시간 트리거 → 앱 열기 액션.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
