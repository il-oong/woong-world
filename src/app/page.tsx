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
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    fetch("/api/secretary")
      .then((r) => (r.ok ? (r.json() as Promise<{ profile: SecretaryProfile | null }>) : null))
      .then((d) => setProfile(d?.profile ?? null))
      .catch(() => setProfile(null));
  }, []);

  if (profile === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="animate-pulse text-sm text-[var(--muted)]">불러오는 중...</span>
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
