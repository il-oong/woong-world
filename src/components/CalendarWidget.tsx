"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarMonthGrid, type CalendarSize } from "./CalendarMonthGrid";
import { EventForm, type EventFormSubmit } from "./EventForm";
import {
  eventOnDay,
  formatTimeRange,
  monthRange,
  MONTH_LABELS,
  toIso,
} from "@/lib/calendar-util";
import type { CalendarEvent, UserCalendar } from "@/lib/google";

const SIZE_STORAGE_KEY = "wh-home-calendar-size";
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
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        if (next.size === 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      const ids = [...next];
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch("/api/google/calendars/filter", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        }).catch(() => {});
      }, 500);
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/google/status")
      .then((r) => r.json() as Promise<Status>)
      .then((data) => { if (!cancelled) setStatus(data); })
      .catch(() => { if (!cancelled) setStatus({ configured: false, connected: false }); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;

    Promise.all([
      fetch("/api/google/calendars").then((r) => r.ok ? r.json() as Promise<{ calendars: UserCalendar[] }> : null),
      fetch("/api/google/calendars/filter").then((r) => r.ok ? r.json() as Promise<{ ids: string[] | null }> : null),
    ]).then(([calData, filterData]) => {
      if (cancelled || !calData?.calendars) return;
      const cals = calData.calendars;
      setCalendars(cals);
      const allIds = cals.map((c) => c.id);
      const saved = filterData?.ids;
      if (saved && saved.length > 0) {
        const valid = saved.filter((id) => allIds.includes(id));
        setEnabledIds(valid.length > 0 ? new Set(valid) : new Set(allIds));
      } else {
        setEnabledIds(new Set(allIds));
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [status?.connected]);

  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;
    const { from, to } = monthRange(year, month + 1);
    fetch(
      `/api/google/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&calendarId=all`,
    )
      .then((r) => (r.ok ? r.json() as Promise<{ events: CalendarEvent[] }> : null))
      .then((data) => { if (!cancelled && data) setEvents(data.events); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [status?.connected, year, month, refreshTick]);

  const handleCreate = async (input: EventFormSubmit) => {
    const res = await fetch("/api/google/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, calendarId: "primary" }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    setAddOpen(false);
    setRefreshTick((v) => v + 1);
  };

  const handleUpdate = async (input: EventFormSubmit) => {
    if (!editingEvent) return;
    const calendarId = editingEvent.calendarId ?? "primary";
    const res = await fetch(`/api/google/events/${encodeURIComponent(editingEvent.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, calendarId }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    setEditingEvent(null);
    setRefreshTick((v) => v + 1);
  };

  const handleDelete = async (ev: CalendarEvent) => {
    if (!confirm("이 일정을 삭제할까요?")) return;
    const calId = ev.calendarId ?? "primary";
    const res = await fetch(
      `/api/google/events/${encodeURIComponent(ev.id)}?calendarId=${encodeURIComponent(calId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) { alert("삭제 실패"); return; }
    setRefreshTick((v) => v + 1);
  };

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
            selectedIso={selectedIso ?? undefined}
            onSelect={(iso) => setSelectedIso(iso)}
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
              <Link href="/calendar" className="text-[11px] text-[var(--muted)] hover:text-foreground">
                +{todayEvents.length - 4}개 더 →
              </Link>
            )}
          </div>

          {selectedIso && (
            <DayEventsModal
              iso={selectedIso}
              events={filteredEvents.filter((ev) => eventOnDay(ev, selectedIso))}
              onClose={() => setSelectedIso(null)}
              onEdit={(ev) => setEditingEvent(ev)}
              onDelete={(ev) => void handleDelete(ev)}
              onAdd={() => setAddOpen(true)}
            />
          )}

          <EventForm
            open={addOpen}
            defaultDate={selectedIso ?? toIso(today)}
            onClose={() => setAddOpen(false)}
            onSubmit={handleCreate}
          />

          <EventForm
            open={editingEvent !== null}
            initialEvent={editingEvent ?? undefined}
            onClose={() => setEditingEvent(null)}
            onSubmit={handleUpdate}
          />
        </>
      )}
    </div>
  );
}

function DayEventsModal({
  iso,
  events,
  onClose,
  onEdit,
  onDelete,
  onAdd,
}: {
  iso: string;
  events: CalendarEvent[];
  onClose: () => void;
  onEdit: (ev: CalendarEvent) => void;
  onDelete: (ev: CalendarEvent) => void;
  onAdd: () => void;
}) {
  const sorted = [...events].sort((a, b) => {
    const aT = a.start.dateTime ?? a.start.date ?? "";
    const bT = b.start.dateTime ?? b.start.date ?? "";
    return aT.localeCompare(bT);
  });

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[#0b0b0f] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--accent)]">
              biseo / day
            </p>
            <h3 className="mt-0.5 text-sm font-medium">{iso}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
            aria-label="닫기"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {sorted.length === 0 ? (
            <p className="py-6 text-center text-xs text-[var(--muted)]">
              이 날 일정이 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {sorted.map((ev) => (
                <li
                  key={ev.id}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs"
                >
                  <span className="w-20 shrink-0 font-mono text-[var(--muted)]">
                    {formatTimeRange(ev).split("–")[0]?.trim() || "종일"}
                  </span>
                  <span className="flex-1 truncate text-foreground">
                    {ev.summary ?? "(제목 없음)"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onEdit(ev)}
                    className="shrink-0 rounded border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-foreground"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(ev)}
                    className="shrink-0 rounded border border-[var(--border)] px-2 py-0.5 text-[10px] text-rose-300/80 hover:border-rose-500/40 hover:bg-rose-500/10"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-black hover:opacity-90"
          >
            + 일정 추가
          </button>
        </footer>
      </div>
    </div>
  );
}
