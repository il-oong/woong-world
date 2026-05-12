"use client";

import { useEffect, useState } from "react";
import { toIso } from "@/lib/calendar-util";
import { CATEGORIES, type Category, type CategoryId } from "@/lib/categories";
import type { CalendarEvent, UserCalendar } from "@/lib/google";

type EventKind = "timed" | "allday" | "project";

const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "없음" },
  { value: 5, label: "5분 전" },
  { value: 30, label: "30분 전" },
  { value: 60, label: "1시간 전" },
  { value: 60 * 24, label: "1일 전" },
];

export type EventFormSubmit = {
  summary: string;
  description?: string;
  kind: EventKind;
  start: string;
  end: string;
  reminderMinutes: number | null;
  categoryId: CategoryId;
  calendarId: string;
};

function parseExistingEvent(ev: CalendarEvent): {
  kind: EventKind;
  categoryId: CategoryId;
  summary: string;
  description: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  reminder: number | null;
} {
  const hasDT = Boolean(ev.start.dateTime);
  let kind: EventKind = "allday";
  let startDate = toIso(new Date());
  let endDate = startDate;
  let startTime = "09:00";
  let endTime = "10:00";

  if (hasDT) {
    kind = "timed";
    const s = new Date(ev.start.dateTime!);
    const e = new Date(ev.end.dateTime!);
    startDate = toIso(s);
    endDate = toIso(e);
    startTime = `${String(s.getHours()).padStart(2, "0")}:${String(s.getMinutes()).padStart(2, "0")}`;
    endTime = `${String(e.getHours()).padStart(2, "0")}:${String(e.getMinutes()).padStart(2, "0")}`;
  } else if (ev.start.date) {
    startDate = ev.start.date;
    // Google stores exclusive end; subtract 1 day for display
    const endRaw = ev.end.date ?? ev.start.date;
    const d = new Date(endRaw);
    d.setDate(d.getDate() - 1);
    endDate = toIso(d);
    kind = startDate !== endDate ? "project" : "allday";
  }

  const rawCat = ev.extendedProperties?.private?.category ?? "";
  const categoryId: CategoryId =
    (CATEGORIES.find((c) => c.id === rawCat)?.id ?? CATEGORIES[0].id) as CategoryId;

  const reminderMin = ev.reminders?.overrides?.[0]?.minutes ?? null;
  const reminder = REMINDER_OPTIONS.find((o) => o.value === reminderMin)
    ? reminderMin
    : null;

  return {
    kind,
    categoryId,
    summary: ev.summary ?? "",
    description: ev.description ?? "",
    startDate,
    endDate,
    startTime,
    endTime,
    reminder,
  };
}

export function EventForm({
  open,
  defaultDate,
  defaultKind = "timed",
  defaultCategoryId,
  defaultCalendarId,
  calendars,
  initialEvent,
  categories,
  onClose,
  onSubmit,
}: {
  open: boolean;
  defaultDate?: string;
  defaultKind?: EventKind;
  defaultCategoryId?: CategoryId;
  defaultCalendarId?: string;
  calendars?: UserCalendar[];
  initialEvent?: CalendarEvent;
  categories?: Category[];
  onClose: () => void;
  onSubmit: (input: EventFormSubmit) => Promise<void>;
}) {
  if (!open) return null;
  return (
    <FormBody
      defaultDate={defaultDate}
      defaultKind={defaultKind}
      defaultCategoryId={defaultCategoryId}
      defaultCalendarId={defaultCalendarId}
      calendars={calendars ?? []}
      initialEvent={initialEvent}
      categories={categories ?? CATEGORIES}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function FormBody({
  defaultDate,
  defaultKind,
  defaultCategoryId,
  defaultCalendarId,
  calendars,
  initialEvent,
  categories,
  onClose,
  onSubmit,
}: {
  defaultDate?: string;
  defaultKind: EventKind;
  defaultCategoryId?: CategoryId;
  defaultCalendarId?: string;
  calendars: UserCalendar[];
  initialEvent?: CalendarEvent;
  categories: Category[];
  onClose: () => void;
  onSubmit: (input: EventFormSubmit) => Promise<void>;
}) {
  const isEdit = Boolean(initialEvent);
  const parsed = initialEvent ? parseExistingEvent(initialEvent) : null;

  const today = defaultDate ?? toIso(new Date());
  const [kind, setKind] = useState<EventKind>(parsed?.kind ?? defaultKind);
  const [categoryId, setCategoryId] = useState<CategoryId>(
    parsed?.categoryId ?? defaultCategoryId ?? (categories[0]?.id ?? CATEGORIES[0].id),
  );
  const [summary, setSummary] = useState(parsed?.summary ?? "");
  const [description, setDescription] = useState(parsed?.description ?? "");
  const [startDate, setStartDate] = useState(parsed?.startDate ?? today);
  const [endDate, setEndDate] = useState(parsed?.endDate ?? today);
  const [startTime, setStartTime] = useState(parsed?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(parsed?.endTime ?? "10:00");
  const [reminder, setReminder] = useState<number | null>(parsed?.reminder ?? 30);
  const [calendarId, setCalendarId] = useState<string>(
    initialEvent?.calendarId ?? defaultCalendarId ?? calendars[0]?.id ?? "primary",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const writableCalendars = calendars.filter(
    (c) => c.accessRole === "owner" || c.accessRole === "writer",
  );
  // Editing: lock to the event's calendar (Google API can't move events between calendars).
  const calendarPickerEnabled = !isEdit && writableCalendars.length > 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (!summary.trim()) {
      setError("제목을 입력하세요");
      return;
    }
    if (kind === "timed" && endTime <= startTime) {
      setError("종료 시각이 시작 시각보다 늦어야 합니다.");
      return;
    }
    if (kind === "project" && endDate < startDate) {
      setError("종료일이 시작일보다 빠를 수 없습니다.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let start: string;
      let end: string;
      if (kind === "timed") {
        start = `${startDate}T${startTime}:00`;
        end = `${startDate}T${endTime}:00`;
      } else {
        start = startDate;
        end = kind === "project" ? endDate : startDate;
      }
      await onSubmit({
        summary: summary.trim(),
        description: description.trim() || undefined,
        kind,
        start,
        end,
        reminderMinutes: reminder,
        categoryId,
        calendarId,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-[#101015] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-sm font-medium text-foreground">
            {isEdit ? "일정 수정" : "새 일정"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--muted)] hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex gap-1.5">
            {(
              [
                { id: "timed", label: "일정" },
                { id: "allday", label: "종일" },
                { id: "project", label: "프로젝트" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setKind(opt.id)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition ${
                  kind === opt.id
                    ? "border-[var(--accent)]/60 bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {calendarPickerEnabled && (
            <Field label="캘린더">
              <select
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--accent)]/50 focus:outline-none"
              >
                {writableCalendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.summary}
                    {cal.primary ? " (기본)" : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="카테고리">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => {
                const active = categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className="rounded-full border px-3 py-1 text-xs transition"
                    style={{
                      borderColor: active ? cat.border : "var(--border)",
                      background: active ? cat.bg : "transparent",
                      color: active ? cat.color : "var(--muted)",
                    }}
                  >
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ background: cat.color }}
                    />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="제목">
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="회의, 마감, ..."
              className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--accent)]/50 focus:outline-none"
              autoFocus
            />
          </Field>

          <Field label="메모">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--accent)]/50 focus:outline-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={kind === "project" ? "시작일" : "날짜"}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--accent)]/50 focus:outline-none"
              />
            </Field>
            {kind === "project" && (
              <Field label="종료일">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--accent)]/50 focus:outline-none"
                />
              </Field>
            )}
            {kind === "timed" && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="시작">
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStartTime(v);
                      // 종료가 새 시작 이하면 +1시간으로 자동 보정 (24시 넘으면 23:59)
                      if (v && endTime && endTime <= v) {
                        const [h, m] = v.split(":").map(Number);
                        const next = h * 60 + m + 60;
                        if (next >= 24 * 60) {
                          setEndTime("23:59");
                        } else {
                          const nh = Math.floor(next / 60);
                          const nm = next % 60;
                          setEndTime(`${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`);
                        }
                      }
                    }}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm focus:border-[var(--accent)]/50 focus:outline-none"
                  />
                </Field>
                <Field label="종료">
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm focus:border-[var(--accent)]/50 focus:outline-none"
                  />
                </Field>
              </div>
            )}
          </div>

          <Field label="알림">
            <div className="flex flex-wrap gap-1.5">
              {REMINDER_OPTIONS.map((opt) => {
                const active = reminder === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setReminder(opt.value)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      active
                        ? "border-[var(--accent)]/60 bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--muted)] hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </Field>

          {error && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-[var(--muted)] hover:text-foreground"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black hover:bg-[var(--accent)]/90 disabled:opacity-50"
          >
            {submitting ? "저장 중..." : isEdit ? "수정" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}
