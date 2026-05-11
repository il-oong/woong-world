import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { isAdminSession } from "@/lib/admin";
import { pluginGitHubUrl } from "@/lib/plugins";
import { loadPlugin } from "@/lib/plugins-store";
import { getPluginStatus } from "@/lib/github-status";
import { AskAssistantButton } from "@/components/AskAssistantButton";
import { PluginManageTree } from "@/components/PluginManageTree";

export const dynamic = "force-dynamic";

const LEVEL_COLOR = {
  green: "#34d399",
  yellow: "#fbbf24",
  red: "#f87171",
  unknown: "#64748b",
} as const;

const LEVEL_GLOW = {
  green: "0 0 18px rgba(52, 211, 153, 0.7)",
  yellow: "0 0 18px rgba(251, 191, 36, 0.7)",
  red: "0 0 18px rgba(248, 113, 113, 0.8)",
  unknown: "0 0 10px rgba(100, 116, 139, 0.5)",
} as const;

const LEVEL_TONE = {
  green: "text-emerald-300",
  yellow: "text-amber-300",
  red: "text-rose-300",
  unknown: "text-[var(--muted)]",
} as const;

export default async function PluginManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdminSession())) redirect("/");
  const { id } = await params;
  const plugin = await loadPlugin(id);
  if (!plugin) notFound();

  const status = await getPluginStatus(plugin).catch(() => null);
  const level = (status?.level ?? "unknown") as keyof typeof LEVEL_COLOR;
  const githubUrl = pluginGitHubUrl(plugin);

  const prompt = [
    `웅허브 플러그인 "${plugin.name}" (id=${plugin.id}) 점검해줘.`,
    `repo=${plugin.repo}@${plugin.branch}${plugin.pr != null ? ` PR#${plugin.pr}` : ""}`,
    status ? `현재 상태: ${status.label}${status.detail ? ` — ${status.detail}` : ""}` : "",
    "문제가 있으면 원인과 다음에 실행할 명령어를 알려줘 (필요하면 suggest_command 액션 사용).",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/plugins"
            className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)]/40 hover:text-foreground"
          >
            ← 허브
          </Link>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--accent)]">
            woong / manage
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/plugins/${plugin.id}`}
            className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)]/40 hover:text-foreground"
          >
            링크 뷰로 →
          </Link>
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)]/40 hover:text-foreground"
          >
            GitHub
          </a>
          <AskAssistantButton prompt={prompt} label="비서에게 점검 요청" />
        </div>
      </header>

      <section
        className="mb-6 flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
        aria-label="플러그인 상태"
      >
        <span
          className="mt-1 inline-block h-6 w-6 shrink-0 rounded-full"
          style={{
            background: LEVEL_COLOR[level],
            boxShadow: LEVEL_GLOW[level],
          }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">{plugin.name}</h1>
          <p className={`mt-1 text-sm font-medium ${LEVEL_TONE[level]}`}>
            {status?.label ?? "상태 알 수 없음"}
          </p>
          {status?.detail && (
            <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-[var(--muted)]">
              {status.detail}
            </p>
          )}
        </div>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetaCell label="브랜치" value={plugin.branch} />
        <MetaCell
          label="최근 커밋"
          value={status?.latestCommit ?? "—"}
          href={
            status?.latestCommit
              ? `https://github.com/${plugin.repo}/commit/${status.latestCommit}`
              : undefined
          }
        />
        <MetaCell
          label="CI"
          value={status?.ciConclusion ?? "—"}
          tone={
            status?.ciConclusion === "success"
              ? "good"
              : status?.ciConclusion === "failure" ||
                  status?.ciConclusion === "timed_out"
                ? "bad"
                : "neutral"
          }
        />
        <MetaCell
          label="열린 PR"
          value={status?.openPrs != null ? String(status.openPrs) : "—"}
          href={`https://github.com/${plugin.repo}/pulls`}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
          코드 구조 (top-level)
        </h2>
        <PluginManageTree repo={plugin.repo} branch={plugin.branch} />
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-black/30 p-4 text-xs text-[var(--muted)]">
        <p className="font-medium text-foreground">바로 수정하기</p>
        <p className="mt-1 leading-relaxed">
          신호등이 노랑·빨강이면 위 &ldquo;비서에게 점검 요청&rdquo; 버튼으로 어시스턴트를 부르세요. 어시스턴트가 원인 분석 + 실행할 명령어(<code className="rounded bg-black/40 px-1">suggest_command</code> 액션)를 제안하면 채팅 패널에 [복사] 버튼이 함께 뜹니다. 복사해서 로컬 터미널에 붙여넣어 실행하세요.
        </p>
      </section>
    </div>
  );
}

function MetaCell({
  label,
  value,
  href,
  tone = "neutral",
}: {
  label: string;
  value: string;
  href?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const toneCls =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
        ? "text-rose-300"
        : "text-foreground";
  const inner = (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className={`mt-1 truncate font-mono text-xs ${toneCls}`}>{value}</p>
    </div>
  );
  if (!href) return inner;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="block transition hover:opacity-80"
    >
      {inner}
    </a>
  );
}
