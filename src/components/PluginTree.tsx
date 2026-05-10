"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import type { Plugin, PluginStatus, StatusLevel } from "@/lib/plugins";

const LEVEL_COLOR: Record<StatusLevel, string> = {
  green: "#34d399",
  yellow: "#fbbf24",
  red: "#f87171",
  unknown: "#64748b",
};

const LEVEL_GLOW: Record<StatusLevel, string> = {
  green: "0 0 8px rgba(52, 211, 153, 0.7)",
  yellow: "0 0 8px rgba(251, 191, 36, 0.7)",
  red: "0 0 8px rgba(248, 113, 113, 0.8)",
  unknown: "0 0 4px rgba(100, 116, 139, 0.5)",
};

export type PluginTreeProps = {
  plugins: Plugin[];
  statuses: Map<string, PluginStatus>;
  /** Hub label rendered as the root node. */
  rootLabel?: string;
  /** Hub sublabel (e.g. owner/repo or status counts). */
  rootSubtitle?: string;
  /** Slot rendered inside each card after the description (e.g. delete button). */
  cardFooter?: (plugin: Plugin) => ReactNode;
  /** When set, each card becomes a link to /plugins/[id]. */
  asLinks?: boolean;
  /** Optional grid-cell rendered after the last card (no connector drawn). */
  trailing?: ReactNode;
};

/**
 * Visualization: parent "hub" header, then SVG bezier curves drawn from the
 * hub's bottom-center to each card's top-center, behind the cards. Curves
 * recompute on resize and whenever the card list changes.
 */
export function PluginTree({
  plugins,
  statuses,
  rootLabel = "웅허브",
  rootSubtitle,
  cardFooter,
  asLinks = false,
  trailing,
}: PluginTreeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hubRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [paths, setPaths] = useState<{ d: string; level: StatusLevel }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current;
      const hub = hubRef.current;
      if (!container || !hub) return;
      const cRect = container.getBoundingClientRect();
      const hRect = hub.getBoundingClientRect();
      const startX = hRect.left + hRect.width / 2 - cRect.left;
      const startY = hRect.bottom - cRect.top;

      const newPaths: { d: string; level: StatusLevel }[] = [];
      cardRefs.current.forEach((card, i) => {
        if (!card) return;
        const r = card.getBoundingClientRect();
        const x = r.left + r.width / 2 - cRect.left;
        const y = r.top - cRect.top;
        const dy = Math.max(20, y - startY);
        const c1y = startY + dy * 0.6;
        const c2y = y - dy * 0.4;
        newPaths.push({
          d: `M ${startX} ${startY} C ${startX} ${c1y}, ${x} ${c2y}, ${x} ${y}`,
          level: statuses.get(plugins[i]?.id ?? "")?.level ?? "unknown",
        });
      });
      setPaths(newPaths);
      setSize({ w: cRect.width, h: cRect.height });
    }
    measure();

    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    cardRefs.current.forEach((c) => c && ro.observe(c));
    if (hubRef.current) ro.observe(hubRef.current);

    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [plugins, statuses]);

  return (
    <div ref={containerRef} className="relative">
      {/* SVG sits absolutely behind the cards. */}
      <svg
        className="pointer-events-none absolute inset-0"
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${Math.max(1, size.w)} ${Math.max(1, size.h)}`}
        aria-hidden
      >
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill="none"
            stroke={LEVEL_COLOR[p.level]}
            strokeOpacity={p.level === "unknown" ? 0.35 : 0.55}
            strokeWidth={1.5}
            strokeDasharray={p.level === "unknown" ? "3 4" : "0"}
          />
        ))}
      </svg>

      <div className="relative flex justify-center">
        <div
          ref={hubRef}
          className="rounded-xl border border-[var(--accent)]/40 bg-[var(--card)] px-4 py-2.5 text-center shadow-[0_0_30px_rgba(125,211,252,0.06)]"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
            woong / hub
          </p>
          <p className="mt-0.5 text-sm font-medium">{rootLabel}</p>
          {rootSubtitle && (
            <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
              {rootSubtitle}
            </p>
          )}
        </div>
      </div>

      <div className="h-10" aria-hidden />

      <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plugins.map((p, i) => (
          <CardCell
            key={p.id}
            plugin={p}
            status={statuses.get(p.id)}
            asLink={asLinks}
            cardFooter={cardFooter}
            innerRef={(el) => {
              cardRefs.current[i] = el;
            }}
          />
        ))}
        {trailing}
      </div>
    </div>
  );
}

function CardCell({
  plugin,
  status,
  asLink,
  cardFooter,
  innerRef,
}: {
  plugin: Plugin;
  status?: PluginStatus;
  asLink: boolean;
  cardFooter?: (p: Plugin) => ReactNode;
  innerRef: (el: HTMLDivElement | null) => void;
}) {
  const level: StatusLevel = status?.level ?? "unknown";
  const card = (
    <div
      ref={innerRef}
      className="flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--accent)]/50"
      style={{
        background: `linear-gradient(135deg, ${plugin.accent}10 0%, var(--card) 60%)`,
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="break-keep text-sm font-medium leading-snug">
          {plugin.name}
        </h3>
        <span
          className="mt-1 block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            background: LEVEL_COLOR[level],
            boxShadow: LEVEL_GLOW[level],
          }}
          aria-label={status?.label ?? "상태"}
        />
      </div>

      <p className="break-keep text-[11px] leading-relaxed text-[var(--muted)]">
        {plugin.description}
      </p>

      {plugin.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {plugin.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2 text-[10px] text-[var(--muted)]">
        <span className="truncate font-mono" title={plugin.repo}>
          {plugin.repo}
          {plugin.pr != null ? ` · #${plugin.pr}` : ""}
        </span>
        {status?.latestCommit && (
          <span
            className="shrink-0 font-mono text-[10px] text-[var(--muted)]"
            title={status.latestCommit}
          >
            {status.latestCommit.split(":")[0]}
          </span>
        )}
      </div>

      {cardFooter && (
        <div
          className="mt-3 border-t border-[var(--border)] pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          {cardFooter(plugin)}
        </div>
      )}
    </div>
  );

  if (asLink) {
    return (
      <Link
        href={`/plugins/${plugin.id}`}
        className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
        aria-label={`${plugin.name} 열기`}
      >
        {card}
      </Link>
    );
  }
  return card;
}

/** Dashed "add new node" cell that fits into the same grid as the cards. */
export function TreeAddCard({
  onClick,
  label = "+ 새 노드",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-transparent p-4 text-xs text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:text-foreground"
    >
      <span className="text-2xl leading-none">+</span>
      <span>{label}</span>
    </button>
  );
}

/** Compose a status-summary subtitle for the hub root. */
export function buildHubSubtitle(
  plugins: Plugin[],
  statuses: Map<string, PluginStatus>,
): string {
  const counts: Record<StatusLevel, number> = {
    green: 0,
    yellow: 0,
    red: 0,
    unknown: 0,
  };
  for (const p of plugins) {
    const lvl = statuses.get(p.id)?.level ?? "unknown";
    counts[lvl]++;
  }
  const dots: string[] = [];
  if (counts.green) dots.push(`🟢 ${counts.green}`);
  if (counts.yellow) dots.push(`🟡 ${counts.yellow}`);
  if (counts.red) dots.push(`🔴 ${counts.red}`);
  if (counts.unknown) dots.push(`⚪ ${counts.unknown}`);
  return `${plugins.length}개 노드 · ${dots.join(" ")}`;
}
