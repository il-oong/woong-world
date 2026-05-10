import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminSession } from "@/lib/admin";
import { getPlugins } from "@/lib/plugins";
import { getAllPluginStatuses } from "@/lib/github-status";

export const dynamic = "force-dynamic";

const LEVEL_COLOR = {
  green: "#34d399",
  yellow: "#fbbf24",
  red: "#f87171",
  unknown: "#64748b",
} as const;

export default async function PluginsIndexPage() {
  const isAdmin = await isAdminSession();
  if (!isAdmin) redirect("/");

  const plugins = getPlugins();
  const statuses = await getAllPluginStatuses(plugins).catch(() => []);
  const statusMap = new Map(statuses.map((s) => [s.pluginId, s]));

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 md:py-16">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
          woong / plugins
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
          플러그인 관리
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          허브에 연결된 모든 플러그인의 상태를 확인하고 점검합니다.
        </p>
      </header>

      <ul className="grid gap-3">
        {plugins.map((p) => {
          const s = statusMap.get(p.id);
          const level = (s?.level ?? "unknown") as keyof typeof LEVEL_COLOR;
          return (
            <li key={p.id}>
              <Link
                href={`/plugins/${p.id}`}
                className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--accent)]/40"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: LEVEL_COLOR[level] }}
                  aria-label={s?.label ?? "상태"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-sm font-medium">{p.name}</h2>
                    <span className="font-mono text-[10px] text-[var(--muted)]">
                      {p.repo}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--muted)]">
                    {s?.detail ?? p.description}
                  </p>
                </div>
                <span className="font-mono text-[10px] text-[var(--muted)]">
                  {s?.label ?? "—"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
