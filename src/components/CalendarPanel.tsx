"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MONTH_LABELS,
  eventOnDay,
  formatTimeRange,
  isAllDay,
  monthRange,
  toIso,
} from "@/lib/calendar-util";
import type { CalendarEvent } from "@/lib/google";
import {
  CATEGORIES,
  categoryFromEvent,
  type CategoryId,
} from "@/lib/categories";
import { CalendarMonthGrid, type CalendarSize } from "./CalendarMonthGrid";
import { EventForm, type EventFormSubmit } from "./EventForm";

const SIZE_STORAGE_KEY = "wh-calendar-size";
const SIZE_STEPS: CalendarSize[] = ["sm", "md", "lg", "xl"];
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

type Variant = "full" | "compact";

export function CalendarPanel({ variant = "full" }: { variant?: Variant }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedIso, setSelectedIso] = useState(toIso(today));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [formKind, setFormKind] = useState<"timed" | "allday" | "project">("timed");
  const [formCategory, setFormCategory] = useState<CategoryId | undefined>(
    undefined,
  );
  const [activeTab, setActiveTab] = useState<CategoryId | "all">("all");
  const [size, setSize] = useState<CalendarSize>(() => {
    if (variant === "compact") return "sm";
    if (typeof window === "undefined") return "md";
    const stored = window.localStorage.getItem(SIZE_STORAGE_KEY);
    return stored && SIZE_STEPS.includes(stored as CalendarSize)
      ? (stored as CalendarSize)
      : "md";
  });

  const changeSize = (next: CalendarSize) => {
    setSize(next);
    if (variant === "full" && typeof window !== "undefined") {
      window.localStorage.setItem(SIZE_STORAGE_KEY, next);
    }
  };

  const sizeIndex = SIZE_STEPS.indexOf(size);
  const zoomOut = () => {
    if (sizeIndex > 0) changeSize(SIZE_STEPS[sizeIndex - 1]);
  };
  const zoomIn = () => {
    if (sizeIndex < SIZE_STEPS.length - 1) changeSize(SIZE_STEPS[sizeIndex + 1]);
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
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;
    const { from, to } = monthRange(year, month + 1);
    fetch(
      `/api/google/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    )
      .then(async (r) => {
        if (!r.ok) {
          const data = (await r.json()) as { error?: string };
          throw new Error(data.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<{ events: CalendarEvent[] }>;
      })
      .then((data) => {
        if (!cancelled) {
          setEvents(data.events);
          setEventsError(null);
          setEventsLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setEventsError(e.message);
          setEventsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status?.connected, year, month, refresh]);

  const activeCategory = useMemo(
    () =>
      activeTab === "all"
        ? null
        : (CATEGORIES.find((c) => c.id === activeTab) ?? null),
    [activeTab],
  );

  const visibleEvents = useMemo(() => {
    if (activeTab === "all") return events;
    return events.filter((ev) => {
      const cat = categoryFromEvent(ev);
      return cat?.id === activeTab;
    });
  }, [events, activeTab]);

  const selectedEvents = useMemo(() => {
    return visibleEvents
      .filter((ev) => eventOnDay(ev, selectedIso))
      .sort((a, b) => {
        const aTime = a.start.dateTime ?? a.start.date ?? "";
        const bTime = b.start.dateTime ?? b.start.date ?? "";
        return aTime.localeCompare(bTime);
      });
  }, [visibleEvents, selectedIso]);

  const openForm = (kind: "timed" | "allday" | "project") => {
    setFormCategory(activeTab === "all" ? undefined : activeTab);
    setFormKind(kind);
    setFormOpen(true);
  };

  const goPrev = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const goNext = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };
  const goToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelectedIso(toIso(now));
  };

  const handleCreate = async (input: EventFormSubmit) => {
    const res = await fetch("/api/google/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    setRefresh((v) => v + 1);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 일정을 삭제할까요?")) return;
    const res = await fetch(`/api/google/events/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert("삭제 실패");
      return;
    }
    setRefresh((v) => v + 1);
  };

  const disconnect = async () => {
    if (!confirm("Google Calendar 연결을 해제할까요?")) return;
    await fetch("/api/google/disconnect", { method: "POST" });
    setEvents([]);
    setRefresh((v) => v + 1);
  };

  if (!status) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
        Calendar 상태 확인 중...
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-sm text-amber-200/90">
        <p className="font-medium">Google Calendar 연동이 설정되어 있지 않습니다.</p>
        <p className="mt-2 text-xs leading-relaxed text-amber-200/70">
          <code className="rounded bg-black/30 px-1 py-0.5 font-mono">.env.local</code>
          에 다음 환경 변수를 추가하세요:
        </p>
        <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-amber-100/90">{`GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
SESSION_SECRET=at-least-32-chars-of-random-data`}</pre>
        <p className="mt-2 text-[11px] leading-relaxed text-amber-200/60">
          Google Cloud Console에서 OAuth 2.0 클라이언트를 만들고 위 redirect URI를 등록하세요. Calendar API도 활성화 필요.
        </p>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div>
          <h3 className="text-base font-medium">Google Calendar에 연결</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            연결하면 이 페이지에서 일정을 보고 추가/삭제하고 알림을 설정할 수 있습니다.
          </p>
        </div>
        <a
          href="/api/google/auth"
          className="inline-flex w-fit items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
        >
          Google로 로그인
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-sm hover:bg-white/5"
            aria-label="Previous month"
          >
            ‹
          </button>
          <h2 className="font-mono text-base">
            {year} · {MONTH_LABELS[month]}
          </h2>
          <button
            type="button"
            onClick={goNext}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-sm hover:bg-white/5"
            aria-label="Next month"
          >
            ›
          </button>
          <button
            type="button"
            onClick={goToday}
            className="ml-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:text-foreground"
          >
            오늘
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openForm("timed")}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-black transition"
            style={{
              background: activeCategory?.color ?? "var(--accent)",
            }}
          >
            + 일정{activeCategory ? ` · ${activeCategory.label}` : ""}
          </button>
          <button
            type="button"
            onClick={() => openForm("project")}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-white/5"
          >
            + 프로젝트
          </button>
          {variant === "full" && (
            <div className="ml-1 flex items-center overflow-hidden rounded-md border border-[var(--border)]">
              <button
                type="button"
                onClick={zoomOut}
                disabled={sizeIndex === 0}
                aria-label="작게"
                title="작게"
                className="px-2 py-1 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-foreground disabled:opacity-30"
              >
                −
              </button>
              <span className="border-x border-[var(--border)] px-2 py-1 font-mono text-[10px] text-[var(--muted)]">
                {SIZE_LABEL[size]}
              </span>
              <button
                type="button"
                onClick={zoomIn}
                disabled={sizeIndex === SIZE_STEPS.length - 1}
                aria-label="크게"
                title="크게"
                className="px-2 py-1 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-foreground disabled:opacity-30"
              >
                +
              </button>
            </div>
          )}
          {variant === "full" && (
            <div className="ml-2 flex items-center gap-2 border-l border-[var(--border)] pl-2 text-[11px] text-[var(--muted)]">
              {status.email && <span>{status.email}</span>}
              <button
                type="button"
                onClick={disconnect}
                className="rounded px-2 py-0.5 hover:bg-white/5"
              >
                연결 해제
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1">
        <TabButton
          label="전체"
          active={activeTab === "all"}
          onClick={() => setActiveTab("all")}
        />
        {CATEGORIES.map((cat) => (
          <TabButton
            key={cat.id}
            label={cat.label}
            color={cat.color}
            bg={cat.bg}
            border={cat.border}
            active={activeTab === cat.id}
            onClick={() => setActiveTab(cat.id)}
          />
        ))}
      </div>

      <div
        className={
          variant === "full"
            ? size === "xl"
              ? "grid gap-4"
              : "grid gap-4 lg:grid-cols-[2fr_1fr]"
            : "grid gap-4"
        }
      >
        <CalendarMonthGrid
          year={year}
          month={month}
          events={visibleEvents}
          selectedIso={selectedIso}
          onSelect={setSelectedIso}
          size={size}
        />

        <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-sm font-medium">{selectedIso}</h3>
            <span className="text-xs text-[var(--muted)]">
              {selectedEvents.length} 건
            </span>
          </div>

          {eventsError && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-300/90">
              {eventsError}
            </div>
          )}

          {selectedEvents.length === 0 && !eventsLoading && (
            <p className="py-4 text-center text-xs text-[var(--muted)]">
              일정 없음
            </p>
          )}

          {selectedEvents.map((ev) => {
            const cat = categoryFromEvent(ev);
            return (
            <div
              key={ev.id}
              className="group flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-white/[0.02] p-2.5"
              style={cat ? { borderLeft: `3px solid ${cat.color}` } : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {cat && (
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: cat.color }}
                      aria-label={cat.label}
                    />
                  )}
                  {ev.summary ?? "(제목 없음)"}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(ev.id)}
                  aria-label="Delete event"
                  className="opacity-0 transition group-hover:opacity-100 text-[var(--muted)] hover:text-rose-300"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                <span className="font-mono">{formatTimeRange(ev)}</span>
                {isAllDay(ev) && (
                  <span className="rounded bg-white/5 px-1.5 py-0.5">all-day</span>
                )}
                {ev.reminders?.overrides?.[0] && (
                  <span className="rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[var(--accent)]">
                    🔔 {formatReminder(ev.reminders.overrides[0].minutes)}
                  </span>
                )}
              </div>
              {ev.description && (
                <p className="line-clamp-2 text-xs text-[var(--muted)]">
                  {ev.description}
                </p>
              )}
            </div>
            );
          })}
        </div>
      </div>

      <EventForm
        open={formOpen}
        defaultDate={selectedIso}
        defaultKind={formKind}
        defaultCategoryId={formCategory}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}

function formatReminder(minutes: number): string {
  if (minutes >= 60 * 24) return `${Math.floor(minutes / (60 * 24))}일 전`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}시간 전`;
  return `${minutes}분 전`;
}

function TabButton({
  label,
  color,
  bg,
  border,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  bg?: string;
  border?: string;
  active: boolean;
  onClick: () => void;
}) {
  const accent = color ?? "var(--accent)";
  const accentBg = bg ?? "color-mix(in oklab, var(--accent) 15%, transparent)";
  const accentBorder = border ?? "color-mix(in oklab, var(--accent) 45%, transparent)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition"
      style={{
        background: active ? accentBg : "transparent",
        color: active ? accent : "var(--muted)",
        border: `1px solid ${active ? accentBorder : "transparent"}`,
      }}
    >
      {color && (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: color }}
        />
      )}
      {label}
    </button>
  );
}
