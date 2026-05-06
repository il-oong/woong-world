import Link from "next/link";
import seed from "@/data/services.json";
import { fetchRepo } from "@/lib/github";
import {
  githubUrlFor,
  pickLiveUrl,
  type Service,
  type ServiceSeed,
} from "@/lib/types";
import { HubGrid } from "@/components/HubGrid";
import { CalendarWidget } from "@/components/CalendarWidget";

async function loadServices(): Promise<Service[]> {
  const seeds = seed as ServiceSeed[];
  return Promise.all(
    seeds.map(async (s) => {
      const repo = await fetchRepo(s.repo);
      const githubUrl = githubUrlFor(s.repo);
      const resolvedLiveUrl = pickLiveUrl(s.liveUrl, s.url, repo?.homepage);
      return {
        ...s,
        resolvedTitle: s.title ?? repo?.name ?? s.repo.split("/").pop() ?? s.repo,
        resolvedDescription: s.description ?? repo?.description ?? "",
        resolvedUrl: resolvedLiveUrl ?? githubUrl,
        resolvedLiveUrl,
        githubUrl,
        language: repo?.language ?? null,
        topics: repo?.topics ?? [],
        stars: repo?.stargazers_count,
        pushedAt: repo?.pushed_at ?? null,
        isPrivate: repo?.private,
        exists: repo !== null,
        curated: true,
      };
    }),
  );
}

export default async function HubPage() {
  const services = await loadServices();
  const pinned = services.filter((s) => s.pinned);

  return (
    <div className="relative">
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10" />

      <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
        <header className="mb-10 md:mb-12">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
            woong-hub
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            woong-hub
          </h1>
          {pinned.length > 0 && (
            <div className="mt-6 flex items-center gap-2 text-xs text-[var(--muted)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              <span>
                pinned: {pinned.map((p) => p.resolvedTitle).join(" · ")}
              </span>
            </div>
          )}
        </header>

        <div className="mb-10 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <CalendarWidget />
          <div className="flex flex-col gap-4">
            <Link
              href="/plans"
              className="group flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--accent)]/50"
            >
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
                  woong / plans
                </p>
                <h2 className="mt-2 text-base font-medium">계획 관리</h2>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  주간 / 월간 / 연간 계획을 카테고리별로 정리하고 Gemini로
                  보완점을 받습니다.
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-[11px] text-[var(--muted)] group-hover:text-foreground">
                <span>인생 · 회사 · VFX · 앱개발 · 재즈</span>
                <span>→</span>
              </div>
            </Link>
            <Link
              href="/cheongak"
              className="group flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--accent)]/50"
            >
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
                  woong / cheongak
                </p>
                <h2 className="mt-2 text-base font-medium">청약알리미 🏠</h2>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  내 조건에 맞는 청약만 골라서 알림으로 알려드려요.
                  지역 · 무주택 · 통장 횟수로 필터링합니다.
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-[11px] text-[var(--muted)] group-hover:text-foreground">
                <span>🔔 맞춤 알림 · 신청 바로가기</span>
                <span>→</span>
              </div>
            </Link>
          </div>
        </div>

        <HubGrid services={services} />

        <footer className="mt-20 border-t border-[var(--border)] pt-6 text-xs text-[var(--muted)]">
          서비스 추가는{" "}
          <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px]">
            src/data/services.json
          </code>{" "}
          에 항목을 더하세요.
        </footer>
      </div>
    </div>
  );
}
