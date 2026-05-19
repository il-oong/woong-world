"use client";

import { useEffect, useState, useCallback } from "react";
import type { Routine } from "@/lib/routines";
import type { Todo, TodoScope } from "@/lib/todos";
import type { Finance, Goals, WeeklyGoal } from "@/lib/life-dashboard";

type RoutineData = { routines: Routine[]; todayChecked: string[]; today: string };
type TodoData = { todos: Todo[] };
type FinanceData = { finance: Finance | null };
type GoalsData = { goals: Goals | null };

const SCOPE_LABEL: Record<TodoScope, string> = { day: "일간", week: "주간", month: "월간" };

function fmtKRW(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만원`;
  return `${n.toLocaleString()}원`;
}

function getWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getDaysToSunday(): number {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  // Days until next Sunday (if today is Sunday, return 0)
  return day === 0 ? 0 : 7 - day;
}

export default function HomeOverview() {
  const [routineData, setRoutineData] = useState<RoutineData | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [finance, setFinance] = useState<Finance | null>(null);
  const [subMonthly, setSubMonthly] = useState<number>(0);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [newTodo, setNewTodo] = useState("");
  const [todoScope, setTodoScope] = useState<TodoScope>("day");
  const [newGoalText, setNewGoalText] = useState("");
  const [loading, setLoading] = useState(true);

  const currentWeek = getWeekString(new Date());
  const daysToSunday = getDaysToSunday();

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [rRes, tRes, fRes, sRes, gRes] = await Promise.all([
      fetch("/api/routines"),
      fetch("/api/todos"),
      fetch("/api/life-dashboard/finance"),
      fetch("/api/subscriptions"),
      fetch("/api/life-dashboard/goals"),
    ]);
    if (rRes.ok) setRoutineData(await rRes.json() as RoutineData);
    if (tRes.ok) setTodos(((await tRes.json() as TodoData).todos ?? []));
    if (fRes.ok) setFinance(((await fRes.json() as FinanceData).finance));
    if (sRes.ok) {
      const sData = await sRes.json() as { monthlyTotal?: number };
      setSubMonthly(sData.monthlyTotal ?? 0);
    }
    if (gRes.ok) setGoals(((await gRes.json() as GoalsData).goals));
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggleRoutine = async (routineId: string) => {
    if (!routineData) return;
    await fetch(`/api/routines/${routineId}/check`, { method: "POST" });
    const res = await fetch("/api/routines");
    if (res.ok) setRoutineData(await res.json() as RoutineData);
  };

  const toggleTodo = async (id: string, done: boolean) => {
    await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !done }),
    });
    const res = await fetch("/api/todos");
    if (res.ok) setTodos((await res.json() as TodoData).todos ?? []);
  };

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;
    await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newTodo.trim(), scope: todoScope }),
    });
    setNewTodo("");
    const res = await fetch("/api/todos");
    if (res.ok) setTodos((await res.json() as TodoData).todos ?? []);
  };

  const saveGoals = async (updatedGoals: Goals) => {
    await fetch("/api/life-dashboard/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedGoals),
    });
  };

  const toggleWeeklyGoal = async (goalId: string) => {
    if (!goals) return;
    const weeklyGoals = (goals.weeklyGoals ?? []).map((g) =>
      g.id === goalId ? { ...g, done: !g.done } : g
    );
    const updatedGoals = { ...goals, weeklyGoals };
    setGoals(updatedGoals);
    await saveGoals(updatedGoals);
  };

  const addWeeklyGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalText.trim()) return;
    const newGoal: WeeklyGoal = {
      id: crypto.randomUUID(),
      text: newGoalText.trim(),
      done: false,
      week: currentWeek,
    };
    const base = goals ?? {
      year: new Date().getFullYear(),
      keywords: [],
      statements: [],
      domains: [],
      books: [],
    };
    const weeklyGoals = [...(base.weeklyGoals ?? []), newGoal];
    const updatedGoals = { ...base, weeklyGoals };
    setGoals(updatedGoals);
    setNewGoalText("");
    await saveGoals(updatedGoals);
  };

  if (loading) {
    return <p className="text-xs text-zinc-600 py-8 text-center animate-pulse">불러오는 중…</p>;
  }

  // Routine: today's active
  const today = routineData?.today ?? new Date().toISOString().slice(0, 10);
  const weekday = new Date(today + "T00:00:00").getDay();
  const activeRoutines = (routineData?.routines ?? []).filter((r) => {
    const wd = r.weekdays;
    if (!wd || wd.length === 0) return true;
    return wd.includes(weekday);
  });
  const checkedSet = new Set(routineData?.todayChecked ?? []);
  const routineDone = activeRoutines.filter((r) => checkedSet.has(r.id)).length;

  // Finance
  const income = finance?.lines.filter(l => l.category === "income").reduce((s, l) => s + l.amount, 0) ?? 0;
  const fixed = finance?.lines.filter(l => l.category === "fixed").reduce((s, l) => s + l.amount, 0) ?? 0;
  const variable = finance?.lines.filter(l => l.category === "variable").reduce((s, l) => s + l.amount, 0) ?? 0;
  const totalExpense = fixed + variable + subMonthly;
  const net = income - totalExpense;

  // Todos by scope
  const scopedTodos = todos.filter((t) => !t.done && (t.scope === todoScope || !t.scope));
  const doneTodos = todos.filter((t) => t.done).slice(0, 5);

  // Weekly goals for current week
  const weeklyGoals = (goals?.weeklyGoals ?? []).filter((g) => g.week === currentWeek);

  return (
    <div className="space-y-5">
      {/* Weekly Goals */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">이번 주 목표</h2>
          <span className="text-[10px] text-zinc-600">
            D-{daysToSunday}일 남음
          </span>
        </div>
        <div className="space-y-1.5">
          {weeklyGoals.length === 0 && (
            <p className="text-xs text-zinc-700">이번 주 목표 없음</p>
          )}
          {weeklyGoals.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => toggleWeeklyGoal(g.id)}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-xs transition ${
                g.done
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              <span className={`text-base shrink-0 ${g.done ? "text-emerald-500" : "text-zinc-600"}`}>
                {g.done ? "✓" : "□"}
              </span>
              <span className={g.done ? "line-through text-emerald-400/70" : ""}>{g.text}</span>
            </button>
          ))}
        </div>
        <form onSubmit={addWeeklyGoal} className="flex gap-2 mt-2">
          <input
            value={newGoalText}
            onChange={(e) => setNewGoalText(e.target.value)}
            placeholder="+ 목표 추가…"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-blue-500/40 focus:outline-none"
          />
          <button type="submit" className="rounded-lg border border-zinc-700 px-3 text-xs text-zinc-400 hover:text-zinc-200 transition">
            추가
          </button>
        </form>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Routine */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">오늘 루틴</h2>
            <span className="text-xs text-zinc-500">
              {routineDone}/{activeRoutines.length}
            </span>
          </div>
          {activeRoutines.length === 0 ? (
            <p className="text-xs text-zinc-700">오늘 활성 루틴 없음</p>
          ) : (
            <div className="space-y-1">
              {activeRoutines.map((r) => {
                const done = checkedSet.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRoutine(r.id)}
                    className={`w-full flex items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs transition ${
                      done
                        ? "bg-blue-500/10 border border-blue-500/20 text-blue-300 line-through"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    <span className={`text-sm shrink-0 ${done ? "text-blue-500" : "text-zinc-600"}`}>
                      {done ? "✓" : "○"}
                    </span>
                    {r.name}
                  </button>
                );
              })}
            </div>
          )}
          {activeRoutines.length > 0 && (
            <div className="mt-2 h-1 w-full rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${activeRoutines.length > 0 ? (routineDone / activeRoutines.length) * 100 : 0}%` }}
              />
            </div>
          )}
        </section>

        {/* Todo */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">할 일</h2>
            <div className="flex gap-1">
              {(["day", "week", "month"] as TodoScope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTodoScope(s)}
                  className={`rounded px-2 py-0.5 text-[10px] transition ${
                    todoScope === s
                      ? "bg-blue-500/20 text-blue-400"
                      : "text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {SCOPE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={addTodo} className="flex gap-2 mb-2">
            <input
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder={`${SCOPE_LABEL[todoScope]} 할일 추가…`}
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-blue-500/40 focus:outline-none"
            />
            <button type="submit" className="rounded-lg border border-zinc-700 px-3 text-xs text-zinc-400 hover:text-zinc-200 transition">
              +
            </button>
          </form>

          <div className="space-y-1 max-h-52 overflow-y-auto">
            {scopedTodos.length === 0 && (
              <p className="text-xs text-zinc-700 py-2">{SCOPE_LABEL[todoScope]} 할일 없음</p>
            )}
            {scopedTodos.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTodo(t.id, t.done)}
                className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-600 transition"
              >
                <span className="text-zinc-600">○</span>
                <span>{t.text}</span>
              </button>
            ))}
            {doneTodos.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTodo(t.id, t.done)}
                className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs bg-zinc-900/40 border border-zinc-800/50 text-zinc-700 transition hover:border-zinc-700"
              >
                <span className="text-zinc-700">✓</span>
                <span className="line-through">{t.text}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Finance — net summary only */}
      <section>
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">재정</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <p className={`text-2xl font-bold font-mono ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            ₩ {net >= 0 ? "+" : ""}{fmtKRW(net)}{" "}
            <span className="text-sm font-normal">{net >= 0 ? "잉여" : "초과"}</span>
          </p>
          <p className="text-[10px] text-zinc-600 mt-1">
            수입 {fmtKRW(income)} · 지출 {fmtKRW(totalExpense)}
          </p>
          <p className="text-[10px] text-zinc-700 mt-0.5">수입 - 고정지출 - 구독료</p>
        </div>
      </section>
    </div>
  );
}
