"use client";

import { useEffect, useState } from "react";
import type { MonthlyStats, Routine, WeeklyStat } from "@/lib/routines";

type Data = {
  routines: Routine[];
  todayChecked: string[];
  today: string;
  weekly: WeeklyStat[];
  monthly?: MonthlyStats;
};

// 월요일부터 표시 (한국 관례). 값은 JS getDay() 기준 (0=일).
const WEEKDAY_PICKERS: { value: number; label: string }[] = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" },
];

function isActiveOnWeekday(weekdays: number[] | undefined, weekday: number): boolean {
  if (!weekdays || weekdays.length === 0) return true;
  return weekdays.includes(weekday);
}

function formatWeekdays(weekdays: number[] | undefined): string {
  if (!weekdays || weekdays.length === 0 || weekdays.length === 7) return "매일";
  return WEEKDAY_PICKERS.filter((p) => weekdays.includes(p.value))
    .map((p) => p.label)
    .join("·");
}

export function RoutineApp() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newWeekdays, setNewWeekdays] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statsView, setStatsView] = useState<"week" | "month">("week");

  const refresh = async () => {
    try {
      const res = await fetch("/api/routines?include=monthly");
      const d = (await res.json().catch(() => ({}))) as
        | Data
        | { error: string };
      if (!res.ok || "error" in d) {
        setError(("error" in d && d.error) || `http_${res.status}`);
        return;
      }
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const add = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, weekdays: newWeekdays }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? `add_failed_${res.status}`);
        return;
      }
      setNewName("");
      setNewWeekdays([]);
      await refresh();
    } finally {
      setAdding(false);
    }
  };

  const toggleNewWeekday = (value: number) => {
    setNewWeekdays((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const updateWeekdays = async (routineId: string, weekdays: number[]) => {
    try {
      const res = await fetch(
        `/api/routines/${encodeURIComponent(routineId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekdays }),
        },
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? `update_failed_${res.status}`);
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "update_failed");
    }
  };

  const toggleToday = async (routineId: string) => {
    if (!data) return;
    // Optimistic update
    const has = data.todayChecked.includes(routineId);
    const optimisticChecked = has
      ? data.todayChecked.filter((x) => x !== routineId)
      : [...data.todayChecked, routineId];
    setData({ ...data, todayChecked: optimisticChecked });
    try {
      const res = await fetch(
        `/api/routines/${encodeURIComponent(routineId)}/check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        // Revert on failure
        setData({ ...data, todayChecked: data.todayChecked });
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? `toggle_failed_${res.status}`);
      } else {
        // Refresh weekly stats
        await refresh();
      }
    } catch {
      setData({ ...data, todayChecked: data.todayChecked });
      setError("network_error");
    }
  };

  const remove = async (routine: Routine) => {
    if (!confirm(`"${routine.name}" 루틴을 삭제할까요? (지난 체크 기록은 남습니다)`)) {
      return;
    }
    try {
      const res = await fetch(
        `/api/routines/${encodeURIComponent(routine.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? `delete_failed_${res.status}`);
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete_failed");
    }
  };

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-xs text-[var(--muted)]">
        {error ?? "불러오는 중..."}
      </div>
    );
  }

  const todayWeekday = (() => {
    const [y, m, d] = data.today.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  })();
  const activeToday = data.routines.filter((r) =>
    isActiveOnWeekday(r.weekdays, todayWeekday),
  );
  const activeIdsToday = new Set(activeToday.map((r) => r.id));
  const checkedCount = data.todayChecked.filter((id) => activeIdsToday.has(id)).length;
  const total = activeToday.length;
  const progress = total === 0 ? 0 : Math.round((checkedCount / total) * 100);

  return (
    <>
      <header className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
          plugin / routine
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
          루틴 트래커
        </h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          매일 체크하는 루틴 — 지금까지 7일 중 평균 {avgWeekly(data.weekly)}회 완료
        </p>
      </header>

      <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-medium">
            오늘 [{checkedCount}/{total}]
          </span>
          <span className="font-mono text-[10px] text-[var(--muted)]">
            {data.today}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full bg-[var(--accent)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </section>

      {error && (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {error}
        </div>
      )}

      <ul className="mb-4 flex flex-col gap-2">
        {data.routines.map((r) => {
          const checked = data.todayChecked.includes(r.id);
          const activeToday = isActiveOnWeekday(r.weekdays, todayWeekday);
          const editing = editingId === r.id;
          return (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
              style={{ opacity: activeToday ? 1 : 0.45 }}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => activeToday && void toggleToday(r.id)}
                  disabled={!activeToday}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition disabled:cursor-not-allowed"
                  style={{
                    background: checked && activeToday ? "var(--accent)" : "transparent",
                    borderColor: checked && activeToday ? "var(--accent)" : "var(--border)",
                    color: "#000",
                  }}
                  aria-label={
                    !activeToday
                      ? "오늘은 비활성 요일"
                      : checked
                      ? "완료 취소"
                      : "완료"
                  }
                  title={!activeToday ? "오늘은 이 루틴의 활성 요일이 아닙니다" : undefined}
                >
                  {checked && activeToday && (
                    <svg
                      viewBox="0 0 16 16"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M3 8l3.5 3.5L13 5" />
                    </svg>
                  )}
                </button>
                <span
                  className="flex-1 text-sm"
                  style={{
                    color: checked && activeToday ? "var(--muted)" : "var(--foreground)",
                    textDecoration: checked && activeToday ? "line-through" : "none",
                  }}
                >
                  {r.name}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingId(editing ? null : r.id)}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
                  title="활성 요일 변경"
                >
                  {formatWeekdays(r.weekdays)}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(r)}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-rose-300/70 hover:border-rose-500/40 hover:text-rose-300"
                >
                  삭제
                </button>
              </div>
              {editing && (
                <div className="flex flex-wrap items-center gap-1.5 pl-9">
                  {WEEKDAY_PICKERS.map((p) => {
                    const current = r.weekdays ?? [];
                    const on = current.length === 0 || current.includes(p.value);
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => {
                          const base =
                            r.weekdays && r.weekdays.length > 0
                              ? r.weekdays
                              : WEEKDAY_PICKERS.map((x) => x.value);
                          const next = base.includes(p.value)
                            ? base.filter((v) => v !== p.value)
                            : [...base, p.value];
                          void updateWeekdays(r.id, next);
                        }}
                        className="h-7 w-7 rounded-full border text-[11px] transition"
                        style={{
                          background: on ? "var(--accent)" : "transparent",
                          borderColor: on ? "var(--accent)" : "var(--border)",
                          color: on ? "#000" : "var(--muted)",
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => void updateWeekdays(r.id, [])}
                    className="ml-1 rounded-md border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
                  >
                    매일
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mb-8 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
            placeholder="새 루틴 (예: 물 2L 마시기)"
            className="flex-1 rounded-md border border-[var(--border)] bg-black/30 px-3 py-2 text-sm focus:border-[var(--accent)]/50 focus:outline-none"
            maxLength={80}
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={!newName.trim() || adding}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-medium text-black disabled:opacity-40"
          >
            {adding ? "..." : "추가"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {WEEKDAY_PICKERS.map((p) => {
            const on = newWeekdays.includes(p.value);
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => toggleNewWeekday(p.value)}
                className="h-7 w-7 rounded-full border text-[11px] transition"
                style={{
                  background: on ? "var(--accent)" : "transparent",
                  borderColor: on ? "var(--accent)" : "var(--border)",
                  color: on ? "#000" : "var(--muted)",
                }}
              >
                {p.label}
              </button>
            );
          })}
          <span className="ml-1 text-[10px] text-[var(--muted)]">
            {newWeekdays.length === 0 || newWeekdays.length === 7
              ? "미선택 = 매일"
              : `선택: ${formatWeekdays(newWeekdays)}`}
          </span>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-wider text-[var(--muted)]">
            {statsView === "week" || !data.monthly
              ? "지난 7일"
              : `${data.monthly.year}년 ${data.monthly.month}월`}
          </h2>
          <div className="flex gap-1 rounded-md border border-[var(--border)] p-0.5 text-[10px]">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setStatsView(v)}
                className="rounded px-2 py-0.5 transition"
                style={{
                  background: statsView === v ? "var(--accent)" : "transparent",
                  color: statsView === v ? "#000" : "var(--muted)",
                }}
              >
                {v === "week" ? "주간" : "월간"}
              </button>
            ))}
          </div>
        </div>
        {statsView === "week" ? (
          <div className="flex items-end gap-1">
            {data.weekly.map((w) => {
              const ratio = w.total === 0 ? 0 : w.completed / w.total;
              const isToday = w.date === data.today;
              return (
                <div
                  key={w.date}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${w.date} — ${w.completed}/${w.total}`}
                >
                  <div className="flex h-20 w-full items-end overflow-hidden rounded bg-black/30">
                    <div
                      className="w-full transition-all"
                      style={{
                        height: `${Math.round(ratio * 100)}%`,
                        background: isToday ? "var(--accent)" : "rgba(255,255,255,0.2)",
                      }}
                    />
                  </div>
                  <span
                    className="font-mono text-[10px]"
                    style={{ color: isToday ? "var(--accent)" : "var(--muted)" }}
                  >
                    {w.weekday}
                  </span>
                  <span className="font-mono text-[9px] text-[var(--muted)]">
                    {w.completed}/{w.total || "—"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : data.monthly ? (
          <MonthHeatmap monthly={data.monthly} todayIso={data.today} />
        ) : null}
      </section>
    </>
  );
}

function MonthHeatmap({
  monthly,
  todayIso,
}: {
  monthly: MonthlyStats;
  todayIso: string;
}) {
  // 일~토 7열 그리드. 1일을 firstWeekday 칸에 배치, 앞은 빈 칸.
  // 한국 관례에 맞춰 월요일 시작으로 표시: 일=0이면 6번째 칸, 월=1이면 0번째 칸 ...
  const HEADER = ["월", "화", "수", "목", "금", "토", "일"];
  const colFor = (weekday: number) => (weekday + 6) % 7; // 일(0)→6, 월(1)→0, ..., 토(6)→5
  const leadingBlanks = colFor(monthly.firstWeekday);
  const cells: (typeof monthly.days[number] | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...monthly.days,
  ];
  // 행은 7개씩 묶음.
  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-black/20 p-3">
      <div className="mb-2 grid grid-cols-7 gap-1.5 text-center font-mono text-[9px] text-[var(--muted)]">
        {HEADER.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((row, ri) => (
          <div key={ri} className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }).map((_, ci) => {
              const cell = row[ci] ?? null;
              if (!cell) {
                return <div key={ci} className="aspect-square rounded" />;
              }
              const ratio = cell.total === 0 ? 0 : cell.completed / cell.total;
              const isToday = cell.date === todayIso;
              const opacity = cell.isFuture
                ? 0.15
                : cell.total === 0
                ? 0.2
                : 0.25 + ratio * 0.75;
              return (
                <div
                  key={ci}
                  className="relative flex aspect-square items-center justify-center rounded text-[9px] font-mono"
                  title={
                    cell.isFuture
                      ? `${cell.date}`
                      : `${cell.date} — ${cell.completed}/${cell.total}`
                  }
                  style={{
                    background: cell.isFuture
                      ? "rgba(255,255,255,0.04)"
                      : `rgba(94,234,212,${opacity})`,
                    color: cell.isFuture
                      ? "var(--muted)"
                      : ratio > 0.5
                      ? "#000"
                      : "var(--muted)",
                    outline: isToday ? "1px solid var(--accent)" : "none",
                    outlineOffset: isToday ? "1px" : undefined,
                  }}
                >
                  {cell.day}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-[9px] text-[var(--muted)]">
        <span>적음</span>
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <span
            key={r}
            className="h-3 w-3 rounded"
            style={{ background: `rgba(94,234,212,${r})` }}
          />
        ))}
        <span>완료</span>
      </div>
    </div>
  );
}

function avgWeekly(weekly: WeeklyStat[]): string {
  if (weekly.length === 0) return "0";
  const sum = weekly.reduce((acc, w) => acc + w.completed, 0);
  return (sum / weekly.length).toFixed(1);
}
