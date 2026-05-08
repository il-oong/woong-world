"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarWidget } from "@/components/CalendarWidget";
import { BriefingPlayer } from "@/components/BriefingPlayer";
import { SecretarySetup } from "@/components/SecretarySetup";
import type { SecretaryProfile } from "@/lib/secretary";

export default function HomePage() {
  const [profile, setProfile] = useState<SecretaryProfile | null | undefined>(undefined);

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

  return (
    <>
      {profile === null && (
        <SecretarySetup onSave={(p) => setProfile(p)} />
      )}

      <div className="relative">
        <div className="bg-grid pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto max-w-4xl px-6 py-12 md:py-16">
          <header className="mb-8">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
              biseo / home
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
              안녕하세요{profile?.name ? `, ${profile.name}` : ""}
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">오늘도 좋은 하루 되세요.</p>
          </header>

          <div className="mb-6">
            <BriefingPlayer secretaryName={profile?.name ?? "비서"} />
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
