"use client";

import { CATEGORY_BY_ID, type Service } from "@/lib/types";

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

export function ServiceCard({
  service,
  favorited,
  onToggleFavorite,
  onPreview,
}: {
  service: Service;
  favorited: boolean;
  onToggleFavorite: (slug: string) => void;
  onPreview?: (service: Service) => void;
}) {
  const updated = relativeTime(service.pushedAt);
  const category = CATEGORY_BY_ID[service.category];

  const isInternal = service.internal === true;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    if (isInternal) return;
    if (!onPreview) return;
    e.preventDefault();
    onPreview(service);
  };

  return (
    <a
      href={isInternal ? (service.path ?? "/") : service.githubUrl}
      target={isInternal ? "_self" : "_blank"}
      rel={isInternal ? undefined : "noopener noreferrer"}
      onClick={handleClick}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:bg-[var(--card-hover)]"
      style={
        {
          "--cat": category.color,
        } as React.CSSProperties
      }
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${category.color}66`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "";
      }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px opacity-0 transition group-hover:opacity-100"
        style={{ background: category.color }}
      />

      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg text-2xl"
          style={{ background: `${category.color}1a` }}
        >
          {service.icon ?? "📦"}
        </div>

        <div className="flex items-center gap-1.5">
          {service.pinned && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
              style={{ background: `${category.color}1a`, color: category.color }}
            >
              pinned
            </span>
          )}
          {isInternal && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
              style={{ background: `${category.color}1a`, color: category.color }}
            >
              built-in
            </span>
          )}
          {!isInternal && !service.exists && (
            <span
              className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-400"
              title="레포에 접근할 수 없습니다. 비공개 레포라면 .env.local에 GITHUB_TOKEN을 추가하세요."
            >
              unlinked
            </span>
          )}
          {!isInternal && service.exists && service.isPrivate && (
            <span
              className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400"
              title="비공개 레포 — GitHub에 로그인되어 있어야 접근 가능합니다."
            >
              private
            </span>
          )}
          {!isInternal && (
            <a
              href={service.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label="GitHub에서 새 탭으로 열기"
              title="GitHub에서 새 탭으로 열기"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-white/10 hover:text-foreground"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.95 10.95 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
            </a>
          )}
          <button
            type="button"
            aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite(service.repo);
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-white/10 ${
              favorited ? "text-amber-400" : "text-[var(--muted)] hover:text-foreground"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill={favorited ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-[10px] uppercase tracking-wider"
            style={{ color: category.color }}
          >
            {category.label}
          </span>
        </div>
        <h3 className="mt-1 text-base font-medium text-foreground">
          {service.resolvedTitle}
        </h3>
        {service.resolvedDescription && (
          <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">
            {service.resolvedDescription}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
        <span className="font-mono">{service.repo}</span>
        {service.language && (
          <>
            <span>·</span>
            <span>{service.language}</span>
          </>
        )}
        {typeof service.stars === "number" && service.stars > 0 && (
          <>
            <span>·</span>
            <span>★ {service.stars}</span>
          </>
        )}
        {updated && (
          <>
            <span>·</span>
            <span>{updated}</span>
          </>
        )}
      </div>

      {!service.exists && (
        <div className="-mx-5 -mb-5 mt-1 border-t border-amber-500/15 bg-amber-500/[0.04] px-5 py-2.5 text-[11px] leading-relaxed text-amber-300/80">
          <span className="font-medium">접근 불가.</span> 비공개 레포라면{" "}
          <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[10px]">
            .env.local
          </code>
          에{" "}
          <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[10px]">
            GITHUB_TOKEN
          </code>
          을 추가하세요.
        </div>
      )}
      {service.exists && service.isPrivate && (
        <div className="-mx-5 -mb-5 mt-1 border-t border-white/5 bg-white/[0.02] px-5 py-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
          🔒 비공개 — 클릭 시 GitHub 로그인이 필요할 수 있습니다.
        </div>
      )}
    </a>
  );
}
