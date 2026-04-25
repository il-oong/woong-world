"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarMonthGrid } from "./CalendarMonthGrid";
import {
  eventOnDay,
  formatTimeRange,
  monthRange,
  MONTH_LABELS,
  toIso,
} from "@/lib/calendar-util";
import type { CalendarEvent } from "@/lib/google";

type Status =
  | { configured: false; connected: false }
  | { configured: true; connected: false }
  | { configured: true; connected: true; email?: string };

export function CalendarWidget() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/google/status")
      .then((r) => r.json() as Promise<Status>)
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ configured: false, connected: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;
    const { from, to } = monthRange(year, month);
    fetch(
      `/api/google/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    )
      .then((r) => (r.ok ? (r.json() as Promise<{ events: CalendarEvent[] }>) : null))
      .then((data) => {
        if (!cancelled && data) setEvents(data.events);
      })
      .catch(() => {
        // best-effort
      });
    return () => {
      cancelled = true;
    };
  }, [status?.connected, year, month]);

  const todayIso = toIso(today);
  const todayEvents = events
    .filter((ev) => eventOnDay(ev, todayIso))
    .sort((a, b) => {
      const aT = a.start.dateTime ?? a.start.date ?? "";
      const bT = b.start.dateTime ?? b.start.date ?? "";
      return aT.localeCompare(bT);
    });

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium">Calendar</h2>
          <span className="font-mono text-xs text-[var(--muted)]">
            {year} · {MONTH_LABELS[month]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => {
              if (month === 0) {
                setMonth(11);
                setYear((y) => y - 1);
              } else setMonth((m) => m - 1);
            }}
            className="rounded px-1.5 py-0.5 text-sm text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => {
              if (month === 11) {
                setMonth(0);
                setYear((y) => y + 1);
              } else setMonth((m) => m + 1);
            }}
            className="rounded px-1.5 py-0.5 text-sm text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
          >
            ›
          </button>
          <Link
            href="/calendar"
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-foreground"
          >
            전체보기 →
          </Link>
        </div>
      </div>

      {status?.configured === false && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-200/80">
          Google Calendar 미설정 —{" "}
          <Link href="/calendar" className="underline">
            설정 안내
          </Link>
        </div>
      )}

      {status?.configured && !status.connected && (
        <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-white/[0.02] p-3 text-xs">
          <span className="text-[var(--muted)]">Google Calendar 미연결</span>
          <a
            href="/api/google/auth"
            className="rounded-md bg-white px-2.5 py-1 font-medium text-black hover:bg-zinc-200"
          >
            연결
          </a>
        </div>
      )}

      {status?.connected && (
        <>
          <CalendarMonthGrid
            year={year}
            month={month}
            events={events}
            size="sm"
          />
          <div className="mt-3 space-y-1.5">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]">
              오늘 · {todayIso}
            </p>
            {todayEvents.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">일정 없음</p>
            ) : (
              todayEvents.slice(0, 4).map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="w-20 shrink-0 font-mono text-[var(--muted)]">
                    {formatTimeRange(ev).split("–")[0]?.trim() || "종일"}
                  </span>
                  <span className="truncate">
                    {ev.summary ?? "(제목 없음)"}
                  </span>
                </div>
              ))
            )}
            {todayEvents.length > 4 && (
              <Link
                href="/calendar"
                className="text-[11px] text-[var(--muted)] hover:text-foreground"
              >
                +{todayEvents.length - 4}개 더 →
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
