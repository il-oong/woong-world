import seed from "@/data/services.json";
import { fetchRepo } from "@/lib/github";
import type { Service, ServiceSeed } from "@/lib/types";
import { HubGrid } from "@/components/HubGrid";

async function loadServices(): Promise<Service[]> {
  const seeds = seed as ServiceSeed[];
  return Promise.all(
    seeds.map(async (s) => {
      const repo = await fetchRepo(s.repo);
      const fallbackUrl = `https://github.com/${s.repo}`;
      return {
        ...s,
        resolvedTitle: s.title ?? repo?.name ?? s.repo.split("/").pop() ?? s.repo,
        resolvedDescription: s.description ?? repo?.description ?? "",
        resolvedUrl: s.url ?? repo?.homepage ?? fallbackUrl,
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

      <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <header className="mb-12 md:mb-16">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
            woong / hub
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            내 도구와 서비스를 한 곳에
          </h1>
          <p className="mt-4 max-w-xl text-base text-[var(--muted)]">
            포트폴리오, 프롬프트 아카이브, 아이디어 노트, 게임 프로젝트, 워크플로우
            도구 — 직접 만들고 사용하는 모든 것을 모았습니다.
          </p>
          {pinned.length > 0 && (
            <div className="mt-6 flex items-center gap-2 text-xs text-[var(--muted)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              <span>
                pinned: {pinned.map((p) => p.resolvedTitle).join(" · ")}
              </span>
            </div>
          )}
        </header>

        <HubGrid services={services} />

        <footer className="mt-20 border-t border-[var(--border)] pt-6 text-xs text-[var(--muted)]">
          <p>
            서비스 추가는{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px]">
              src/data/services.json
            </code>{" "}
            에 항목을 더하세요.
          </p>
        </footer>
      </div>
    </div>
  );
}
