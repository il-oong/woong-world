"use client";

import { useEffect, useState } from "react";
import type { Routine, WeeklyStat } from "@/lib/routines";

type Data = {
  routines: Routine[];
  todayChecked: string[];
  today: string;
  weekly: WeeklyStat[];
};

export function RoutineApp() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch("/api/routines");
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
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? `add_failed_${res.status}`);
        return;
      }
      setNewName("");
      await refresh();
    } finally {
      setAdding(false);
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

  const checkedCount = data.todayChecked.length;
  const total = data.routines.length;
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
          return (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
            >
              <button
                type="button"
                onClick={() => void toggleToday(r.id)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition"
                style={{
                  background: checked ? "var(--accent)" : "transparent",
                  borderColor: checked ? "var(--accent)" : "var(--border)",
                  color: "#000",
                }}
                aria-label={checked ? "완료 취소" : "완료"}
              >
                {checked && (
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
                  color: checked ? "var(--muted)" : "var(--foreground)",
                  textDecoration: checked ? "line-through" : "none",
                }}
              >
                {r.name}
              </span>
              <button
                type="button"
                onClick={() => void remove(r)}
                className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-rose-300/70 hover:border-rose-500/40 hover:text-rose-300"
              >
                삭제
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mb-8 flex gap-2">
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

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wider text-[var(--muted)]">
          지난 7일
        </h2>
        <div className="flex items-end gap-1">
          {data.weekly.map((w, i) => {
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
                {/* Used to silence unused index warning if any */}
                <span className="hidden">{i}</span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function avgWeekly(weekly: WeeklyStat[]): string {
  if (weekly.length === 0) return "0";
  const sum = weekly.reduce((acc, w) => acc + w.completed, 0);
  return (sum / weekly.length).toFixed(1);
}
