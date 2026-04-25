import type { Service } from "@/lib/types";

function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = Date.now() - then;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "today";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}w ago`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}mo ago`;
  return `${Math.floor(diff / (365 * day))}y ago`;
}

export function ServiceCard({ service }: { service: Service }) {
  const isExternal = !service.resolvedUrl.startsWith("/");
  const updated = relativeTime(service.pushedAt);

  return (
    <a
      href={service.resolvedUrl}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className="group relative flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--accent)]/40 hover:bg-[var(--card-hover)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 text-2xl">
          {service.icon ?? "📦"}
        </div>
        {!service.exists && (
          <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-400">
            unlinked
          </span>
        )}
        {service.exists && service.isPrivate && (
          <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
            private
          </span>
        )}
      </div>

      <div className="flex-1">
        <h3 className="text-base font-medium text-foreground">
          {service.resolvedTitle}
        </h3>
        {service.resolvedDescription && (
          <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">
            {service.resolvedDescription}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
        <span className="font-mono">{service.repo}</span>
        {service.language && (
          <>
            <span>·</span>
            <span>{service.language}</span>
          </>
        )}
        {updated && (
          <>
            <span>·</span>
            <span>{updated}</span>
          </>
        )}
      </div>
    </a>
  );
}
