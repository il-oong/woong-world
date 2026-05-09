"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarWidget } from "@/components/CalendarWidget";
import { BriefingPlayer } from "@/components/BriefingPlayer";
import { SecretarySetup } from "@/components/SecretarySetup";
import { PushSubscribeButton } from "@/components/PushSubscribeButton";
import type { SecretaryProfile } from "@/lib/secretary";

export default function HomePage() {
  const [profile, setProfile] = useState<SecretaryProfile | null | undefined>(undefined);
  const [connected, setConnected] = useState<boolean | undefined>(undefined);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    fetch("/api/secretary").then(async (r) => {
      if (r.status === 401) {
        setConnected(false);
        setProfile(null);
        return;
      }
      setConnected(true);
      if (r.ok) {
        const d = (await r.json()) as { profile: SecretaryProfile | null };
        setProfile(d.profile);
      } else {
        setProfile(null);
      }
    }).catch(() => { setConnected(false); setProfile(null); });
  }, []);

  if (profile === undefined || connected === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="animate-pulse text-sm text-[var(--muted)]">불러오는 중...</span>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
          biseo / welcome
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
          나만의 AI 비서
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
          Google 계정으로 연결하면 캘린더를 읽고<br />매일 아침 음성으로 브리핑해드립니다.
        </p>
        <a
          href="/api/google/auth"
          className="mt-8 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white/5 px-6 py-3.5 text-sm font-medium transition hover:border-[var(--accent)]/50 hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google로 시작하기
        </a>
      </div>
    );
  }

  const handleSave = (p: SecretaryProfile) => {
    setProfile(p);
    setShowSetup(false);
  };

  return (
    <>
      {(profile === null || showSetup) && (
        <SecretarySetup
          onSave={handleSave}
          onClose={profile !== null ? () => setShowSetup(false) : undefined}
          initialProfile={profile ?? undefined}
        />
      )}

      <div className="relative">
        <div className="bg-grid pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto max-w-4xl px-6 py-12 md:py-16">
          <header className="mb-8 flex items-start justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
                biseo / home
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
                안녕하세요{profile?.name ? `, ${profile.name}` : ""}
              </h1>
              <p className="mt-2 text-sm text-[var(--muted)]">오늘도 좋은 하루 되세요.</p>
            </div>

            {profile !== null && (
              <button
                type="button"
                onClick={() => setShowSetup(true)}
                aria-label="비서 설정"
                title="비서 설정"
                className="mt-1 flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:border-[var(--accent)]/40 hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                설정
              </button>
            )}
          </header>

          <div className="mb-6 flex flex-col gap-3">
            <BriefingPlayer secretaryName={profile?.name ?? "비서"} />
            {profile !== null && (
              <div className="flex justify-end">
                <PushSubscribeButton briefingHour={profile?.briefingHour ?? 8} />
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <CalendarWidget />
            <Link
              href="/plans"
              className="group flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--accent)]/50"
            >
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
                  biseo / plans
                </p>
                <h2 className="mt-2 text-base font-medium">계획 관리</h2>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  주간 / 월간 / 연간 계획을 카테고리별로 정리하고 Gemini로 보완점을 받습니다.
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-[11px] text-[var(--muted)] group-hover:text-foreground">
                <span>인생 · 회사 · VFX · 앱개발 · 재즈</span>
                <span>→</span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
