"use client";

import { useEffect, useRef, useState } from "react";
import type { Habit, MonthLogs } from "@/lib/life-dashboard";
import { computeStats } from "@/lib/life-dashboard";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function ymOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function dayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay();
}

type Props = {
  onStatsChange?: (stats: ReturnType<typeof computeStats> | null) => void;
};

export default function HabitTracker({ onStatsChange }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<MonthLogs>({});
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const days = daysInMonth(year, month);
  const ym = ymOf(year, month);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/life-dashboard/habits").then((r) => r.json()),
      fetch(`/api/life-dashboard/logs?ym=${ym}`).then((r) => r.json()),
    ]).then(([h, l]) => {
      setHabits(h.habits ?? []);
      setLogs(l.logs ?? {});
      setLoading(false);
    });
  }, [ym]);

  useEffect(() => {
    if (!loading && onStatsChange) {
      onStatsChange(habits.length > 0 ? computeStats(habits, logs, days) : null);
    }
  }, [habits, logs, days, loading, onStatsChange]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  async function toggle(day: number, habitId: string) {
    const key = `${day}-${habitId}`;
    if (pending.has(key)) return;
    const next = !logs[key];
    setLogs(prev => {
      const copy = { ...prev };
      if (next) copy[key] = true; else delete copy[key];
      return copy;
    });
    setPending(s => new Set(s).add(key));
    await fetch("/api/life-dashboard/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ym, day, habitId, checked: next }),
    });
    setPending(s => { const n = new Set(s); n.delete(key); return n; });
  }

  async function addHabit() {
    if (!newName.trim()) return;
    setAdding(true);
    const r = await fetch("/api/life-dashboard/habits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const { habit } = await r.json();
    setHabits(prev => [...prev, habit]);
    setNewName("");
    setAdding(false);
    inputRef.current?.focus();
  }

  async function removeHabit(id: string) {
    await fetch("/api/life-dashboard/habits", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setHabits(prev => prev.filter(h => h.id !== id));
    setLogs(prev => {
      const copy = { ...prev };
      for (const k of Object.keys(copy)) {
        if (k.endsWith(`-${id}`)) delete copy[k];
      }
      return copy;
    });
  }

  if (loading) {
    return <div className="py-16 text-center text-zinc-500 text-sm">불러오는 중...</div>;
  }

  const weekDayRow: number[] = Array.from({ length: days }, (_, i) =>
    dayOfWeek(year, month, i + 1),
  );

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="px-2 py-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">‹</button>
        <span className="text-white font-semibold text-base">
          {year}년 {month}월
        </span>
        <button onClick={nextMonth} className="px-2 py-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">›</button>
      </div>

      {habits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 py-12 text-center text-zinc-500 text-sm">
          습관을 추가해 트래킹을 시작하세요
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="text-xs border-collapse min-w-full">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-zinc-900 px-3 py-2 text-left text-zinc-400 font-normal w-32 border-b border-zinc-800">
                  습관
                </th>
                {weekDayRow.map((dow, i) => (
                  <th
                    key={i}
                    className={`px-0 py-2 text-center font-normal border-b border-zinc-800 w-7 min-w-[28px] ${
                      dow === 0 ? "text-red-400" : dow === 6 ? "text-blue-400" : "text-zinc-500"
                    }`}
                  >
                    <div className="leading-none">{i + 1}</div>
                    <div className="leading-none mt-0.5 text-[10px] opacity-60">{DAY_LABELS[dow]}</div>
                  </th>
                ))}
                <th className="px-3 py-2 text-center text-zinc-400 font-normal border-b border-zinc-800 w-14">달성률</th>
                <th className="px-2 py-2 border-b border-zinc-800 w-6" />
              </tr>
            </thead>
            <tbody>
              {habits.map((habit) => {
                const count = Array.from({ length: days }, (_, i) => (logs[`${i + 1}-${habit.id}`] ? 1 : 0) as number).reduce((a, b) => a + b, 0);
                const rate = Math.round((count / days) * 100);
                return (
                  <tr key={habit.id} className="group hover:bg-zinc-800/40 transition-colors">
                    <td className="sticky left-0 z-10 bg-zinc-900 group-hover:bg-zinc-800/80 px-3 py-1.5 border-b border-zinc-800/60">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: habit.color }} />
                        <span className="text-zinc-200 truncate">{habit.name}</span>
                      </div>
                    </td>
                    {Array.from({ length: days }, (_, i) => {
                      const day = i + 1;
                      const key = `${day}-${habit.id}`;
                      const checked = !!logs[key];
                      const isPending = pending.has(key);
                      return (
                        <td key={day} className="px-0 py-1.5 text-center border-b border-zinc-800/60">
                          <button
                            onClick={() => toggle(day, habit.id)}
                            disabled={isPending}
                            className={`w-5 h-5 rounded transition-all mx-auto block border ${
                              checked
                                ? "border-transparent"
                                : "border-zinc-700 hover:border-zinc-500 bg-transparent"
                            } ${isPending ? "opacity-50" : ""}`}
                            style={checked ? { backgroundColor: habit.color } : {}}
                            aria-label={`${month}월 ${day}일 ${habit.name}`}
                          >
                            {checked && (
                              <svg viewBox="0 0 12 12" className="w-3 h-3 mx-auto" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-center border-b border-zinc-800/60">
                      <span className={`font-semibold ${rate >= 70 ? "text-emerald-400" : rate >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                        {rate}%
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center border-b border-zinc-800/60">
                      <button
                        onClick={() => removeHabit(habit.id)}
                        className="text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        aria-label="삭제"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add habit */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addHabit()}
          placeholder="새 습관 이름"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
        />
        <button
          onClick={addHabit}
          disabled={adding || !newName.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
        >
          추가
        </button>
      </div>
    </div>
  );
}
