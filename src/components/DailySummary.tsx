"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SummaryData = {
  todayEvents: number;
  cheongakDue: { name: string; days: number } | null;
  plansProgress: { done: number; total: number } | null;
};

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function DailySummary() {
  const [data, setData] = useState<SummaryData | null>(null);

  useEffect(() => {
    const cheongakP = fetch("/api/cheongak")
      .then((r) => r.json() as Promise<{ items: Array<{ id: string; name: string; endDate: string }> }>)
      .then((d) => {
        const upcoming = d.items
          .map((i) => ({ name: i.name, days: daysUntil(i.endDate) }))
          .filter((i) => i.days >= 0)
          .sort((a, b) => a.days - b.days);
        return upcoming[0] ?? null;
      })
      .catch(() => null);

    const plansP = fetch("/api/plans")
      .then((r) => r.json() as Promise<{ plans?: Array<{ status?: string }> }>)
      .then((d) => {
        const plans = d.plans ?? [];
        if (plans.length === 0) return null;
        const done = plans.filter((p) => p.status === "done").length;
        return { done, total: plans.length };
      })
      .catch(() => null);

    const eventsP = fetch("/api/google/events")
      .then((r) => r.json() as Promise<{ events?: unknown[] }>)
      .then((d) => (d.events ?? []).length)
      .catch(() => 0);

    Promise.all([cheongakP, plansP, eventsP]).then(([cheongakDue, plansProgress, todayEvents]) => {
      setData({ todayEvents, cheongakDue, plansProgress });
    });
  }, []);

  if (!data) return null;

  const { todayEvents, cheongakDue, plansProgress } = data;
  const hasAnything = todayEvents > 0 || cheongakDue !== null || plansProgress !== null;
  if (!hasAnything) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-xs">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">오늘</span>

      {todayEvents > 0 && (
        <Link href="/calendar" className="flex items-center gap-1.5 text-[var(--muted)] transition hover:text-foreground">
          <span>📅</span>
          <span>일정 <strong className="text-foreground">{todayEvents}개</strong></span>
        </Link>
      )}

      {cheongakDue && (
        <Link href="/cheongak" className="flex items-center gap-1.5 text-[var(--muted)] transition hover:text-foreground">
          <span>🏠</span>
          <span className="max-w-[140px] truncate" title={cheongakDue.name}>
            {cheongakDue.days === 0
              ? <><strong className="text-emerald-400">오늘 마감</strong> {cheongakDue.name}</>
              : <><strong className="text-foreground">D-{cheongakDue.days}</strong> {cheongakDue.name}</>
            }
          </span>
        </Link>
      )}

      {plansProgress && (
        <Link href="/plans" className="flex items-center gap-1.5 text-[var(--muted)] transition hover:text-foreground">
          <span>📋</span>
          <span>
            계획 <strong className="text-foreground">{plansProgress.done}/{plansProgress.total}</strong>
          </span>
          <div className="h-1 w-14 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${Math.round((plansProgress.done / plansProgress.total) * 100)}%` }}
            />
          </div>
        </Link>
      )}
    </div>
  );
}
