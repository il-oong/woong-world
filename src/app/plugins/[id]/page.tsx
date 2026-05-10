import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { isAdminSession } from "@/lib/admin";
import { getPlugin, pluginEmbedUrl, pluginGitHubUrl } from "@/lib/plugins";
import { getPluginStatus } from "@/lib/github-status";
import { PluginEmbed } from "@/components/PluginEmbed";

export const dynamic = "force-dynamic";

const LEVEL_COLOR = {
  green: "#34d399",
  yellow: "#fbbf24",
  red: "#f87171",
  unknown: "#64748b",
} as const;

const LEVEL_GLOW = {
  green: "0 0 10px rgba(52, 211, 153, 0.7)",
  yellow: "0 0 10px rgba(251, 191, 36, 0.7)",
  red: "0 0 10px rgba(248, 113, 113, 0.8)",
  unknown: "0 0 6px rgba(100, 116, 139, 0.5)",
} as const;

export default async function PluginViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const isAdmin = await isAdminSession();
  if (!isAdmin) redirect("/");

  const { id } = await params;
  const plugin = getPlugin(id);
  if (!plugin) notFound();

  const status = await getPluginStatus(plugin).catch(() => null);
  const level = (status?.level ?? "unknown") as keyof typeof LEVEL_COLOR;
  const embedUrl = pluginEmbedUrl(plugin);
  const githubUrl = pluginGitHubUrl(plugin);

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--card)]/80 px-4 py-3 backdrop-blur">
        <Link
          href="/plugins"
          className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)]/40 hover:text-foreground"
          aria-label="플러그인 목록으로"
        >
          ←
        </Link>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            background: LEVEL_COLOR[level],
            boxShadow: LEVEL_GLOW[level],
          }}
          aria-label={status?.label ?? "상태"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="truncate text-sm font-medium">{plugin.name}</h1>
            <span className="font-mono text-[10px] text-[var(--muted)]">
              {plugin.repo}
              {plugin.pr != null ? ` · #${plugin.pr}` : ""}
            </span>
          </div>
          {status?.detail && (
            <p className="truncate text-[11px] text-[var(--muted)]">
              {status.detail}
            </p>
          )}
        </div>
        <a
          href={githubUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)]/40 hover:text-foreground"
        >
          GitHub
        </a>
      </header>

      <div className="relative flex-1 bg-black/40">
        {embedUrl ? (
          <PluginEmbed src={embedUrl} title={plugin.name} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-[var(--muted)]">
              아직 배포된 URL이 없습니다.
            </p>
            <p className="text-xs text-[var(--muted)]">
              {plugin.pr != null
                ? `PR #${plugin.pr}이 머지되고 배포되면 여기서 바로 사용할 수 있어요.`
                : "플러그인 배포 후 plugins.json에 URL을 추가하세요."}
            </p>
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-foreground"
            >
              GitHub에서 진행 상황 보기 →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
