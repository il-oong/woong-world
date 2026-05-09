"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarMonthGrid, type CalendarSize } from "./CalendarMonthGrid";
import {
  eventOnDay,
  formatTimeRange,
  monthRange,
  MONTH_LABELS,
  toIso,
} from "@/lib/calendar-util";
import type { CalendarEvent, UserCalendar } from "@/lib/google";

const SIZE_STORAGE_KEY = "wh-home-calendar-size";
const CAL_FILTER_KEY = "wh-home-calendar-filter";
const SIZE_STEPS: CalendarSize[] = ["sm", "md", "lg"];
const SIZE_LABEL: Record<CalendarSize, string> = {
  sm: "S",
  md: "M",
  lg: "L",
  xl: "XL",
};

type Status =
  | { configured: false; connected: false }
  | { configured: true; connected: false }
  | { configured: true; connected: true; email?: string };

export function CalendarWidget() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<UserCalendar[]>([]);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Status | null>(null);
  const [size, setSize] = useState<CalendarSize>(() => {
    if (typeof window === "undefined") return "md";
    const stored = window.localStorage.getItem(SIZE_STORAGE_KEY);
    return stored && SIZE_STEPS.includes(stored as CalendarSize)
      ? (stored as CalendarSize)
      : "md";
  });

  const changeSize = (next: CalendarSize) => {
    setSize(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SIZE_STORAGE_KEY, next);
    }
  };

  const sizeIndex = SIZE_STEPS.indexOf(size);

  const toggleCalendar = (id: string) => {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev; // 최소 1개는 켜둬야 함
        next.delete(id);
      } else {
        next.add(id);
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CAL_FILTER_KEY, JSON.stringify([...next]));
      }
      return next;
    });
  };

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
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;
    fetch("/api/google/calendars")
      .then((r) => (r.ok ? r.json() as Promise<{ calendars: UserCalendar[] }> : null))
      .then((data) => {
        if (!cancelled && data?.calendars) {
          setCalendars(data.calendars);
          const saved = typeof window !== "undefined"
            ? window.localStorage.getItem(CAL_FILTER_KEY)
            : null;
          if (saved) {
            try {
              const ids = JSON.parse(saved) as string[];
              const valid = ids.filter((id) => data.calendars.some((c) => c.id === id));
              setEnabledIds(valid.length > 0 ? new Set(valid) : new Set(data.calendars.map((c) => c.id)));
            } catch {
              setEnabledIds(new Set(data.calendars.map((c) => c.id)));
            }
          } else {
            setEnabledIds(new Set(data.calendars.map((c) => c.id)));
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [status?.connected]);

  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;
    const { from, to } = monthRange(year, month + 1);
    fetch(
      `/api/google/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&calendarId=all`,
    )
      .then((r) => (r.ok ? (r.json() as Promise<{ events: CalendarEvent[] }>) : null))
      .then((data) => {
        if (!cancelled && data) setEvents(data.events);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [status?.connected, year, month]);

  const filteredEvents = events.filter((ev) =>
    ev.calendarId ? enabledIds.has(ev.calendarId) : enabledIds.has("primary"),
  );

  const todayIso = toIso(today);
  const todayEvents = filteredEvents
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
              if (month === 0) { setMonth(11); setYear((y) => y - 1); }
              else setMonth((m) => m - 1);
            }}
            className="rounded px-1.5 py-0.5 text-sm text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => {
              if (month === 11) { setMonth(0); setYear((y) => y + 1); }
              else setMonth((m) => m + 1);
            }}
            className="rounded px-1.5 py-0.5 text-sm text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
          >
            ›
          </button>
          <div className="ml-1 flex items-center overflow-hidden rounded-md border border-[var(--border)]">
            <button
              type="button"
              onClick={() => sizeIndex > 0 && changeSize(SIZE_STEPS[sizeIndex - 1])}
              disabled={sizeIndex === 0}
              aria-label="작게"
              className="px-1.5 py-0.5 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-foreground disabled:opacity-30"
            >
              −
            </button>
            <span className="border-x border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)]">
              {SIZE_LABEL[size]}
            </span>
            <button
              type="button"
              onClick={() =>
                sizeIndex < SIZE_STEPS.length - 1 && changeSize(SIZE_STEPS[sizeIndex + 1])
              }
              disabled={sizeIndex === SIZE_STEPS.length - 1}
              aria-label="크게"
              className="px-1.5 py-0.5 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-foreground disabled:opacity-30"
            >
              +
            </button>
          </div>
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
          <Link href="/calendar" className="underline">설정 안내</Link>
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
          {calendars.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {calendars.map((cal) => {
                const on = enabledIds.has(cal.id);
                return (
                  <button
                    key={cal.id}
                    type="button"
                    onClick={() => toggleCalendar(cal.id)}
                    title={cal.summary}
                    className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition"
                    style={{
                      borderColor: on ? (cal.backgroundColor ?? "var(--accent)") : "var(--border)",
                      color: on ? (cal.backgroundColor ?? "var(--accent)") : "var(--muted)",
                      background: on ? `${cal.backgroundColor ?? "var(--accent)"}18` : "transparent",
                    }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: on ? (cal.backgroundColor ?? "var(--accent)") : "var(--border)" }}
                    />
                    {cal.summary}
                  </button>
                );
              })}
            </div>
          )}

          <CalendarMonthGrid
            year={year}
            month={month}
            events={filteredEvents}
            size={size}
          />
          <div className="mt-3 space-y-1.5">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]">
              오늘 · {todayIso}
            </p>
            {todayEvents.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">일정 없음</p>
            ) : (
              todayEvents.slice(0, 4).map((ev) => (
                <div key={ev.id} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 font-mono text-[var(--muted)]">
                    {formatTimeRange(ev).split("–")[0]?.trim() || "종일"}
                  </span>
                  <span className="truncate">{ev.summary ?? "(제목 없음)"}</span>
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
