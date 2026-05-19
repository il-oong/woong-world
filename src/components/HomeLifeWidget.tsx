"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Routine } from "@/lib/routines";
import type { Todo, TodoScope } from "@/lib/todos";
import type { Finance } from "@/lib/life-dashboard";

type RoutineData = {
  routines: Routine[];
  todayChecked: string[];
  today: string;
};

type TodoData = {
  todos: Todo[];
};

type FinanceData = {
  finance: Finance | null;
  monthlyTotal?: number;
};

const SCOPE_LABEL: Record<TodoScope, string> = { day: "오늘", week: "이번 주", month: "이번 달" };
const SCOPES: TodoScope[] = ["day", "week", "month"];

export default function HomeLifeWidget() {
  const [routineData, setRoutineData] = useState<RoutineData | null>(null);
  const [todoData, setTodoData] = useState<TodoData | null>(null);
  const [financeData, setFinanceData] = useState<FinanceData | null>(null);
  const [todoScope, setTodoScope] = useState<TodoScope>("day");
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [newTodo, setNewTodo] = useState("");
  const [addingTodo, setAddingTodo] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/routines").then((r) => r.ok ? r.json() as Promise<RoutineData> : null),
      fetch("/api/todos").then((r) => r.ok ? r.json() as Promise<TodoData> : null),
      fetch("/api/life-dashboard/finance").then((r) => r.ok ? r.json() as Promise<FinanceData> : null),
    ]).then(([rd, td, fd]) => {
      setRoutineData(rd);
      setTodoData(td);
      setFinanceData(fd);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function toggleRoutine(id: string) {
    if (!routineData || toggling) return;
    const checked = routineData.todayChecked.includes(id);
    setToggling(id);
    const method = checked ? "DELETE" : "POST";
    await fetch(`/api/routines/${id}/check`, { method });
    setRoutineData((d) =>
      d
        ? {
            ...d,
            todayChecked: checked
              ? d.todayChecked.filter((x) => x !== id)
              : [...d.todayChecked, id],
          }
        : d,
    );
    setToggling(null);
  }

  async function toggleTodo(id: string, done: boolean) {
    await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !done }),
    });
    setTodoData((d) =>
      d
        ? { todos: d.todos.map((t) => (t.id === id ? { ...t, done: !done } : t)) }
        : d,
    );
  }

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const text = newTodo.trim();
    if (!text || addingTodo) return;
    setAddingTodo(true);
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, scope: todoScope }),
    });
    if (res.ok) {
      const { todo } = (await res.json()) as { todo: Todo };
      setTodoData((d) => (d ? { todos: [...d.todos, todo] } : { todos: [todo] }));
      setNewTodo("");
    }
    setAddingTodo(false);
  }

  const todayRoutines = (routineData?.routines ?? []).filter((r) => {
    if (!r.weekdays || r.weekdays.length === 0) return true;
    const day = new Date().getDay();
    return r.weekdays.includes(day);
  });
  const checkedSet = new Set(routineData?.todayChecked ?? []);
  const routineDone = todayRoutines.filter((r) => checkedSet.has(r.id)).length;
  const routineTotal = todayRoutines.length;

  const scopedTodos = (todoData?.todos ?? []).filter(
    (t) => (t.scope ?? "day") === todoScope && !t.done,
  );
  const doneTodos = (todoData?.todos ?? []).filter(
    (t) => (t.scope ?? "day") === todoScope && t.done,
  );

  const finance = financeData?.finance ?? null;
  const subMonthly = financeData?.monthlyTotal ?? 0;
  const income = finance ? finance.lines.filter((l) => l.category === "income").reduce((s, l) => s + l.amount, 0) : 0;
  const fixed = finance ? finance.lines.filter((l) => l.category === "fixed").reduce((s, l) => s + l.amount, 0) : 0;
  const variable = finance ? finance.lines.filter((l) => l.category === "variable").reduce((s, l) => s + l.amount, 0) : 0;
  const totalExpense = fixed + variable + subMonthly;
  const net = income - totalExpense;
  const expenseRate = income > 0 ? Math.round((totalExpense / income) * 100) : 0;

  return (
    <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 gap-5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-blue-400">biseo / life</p>
        <Link href="/apps/life-dashboard" className="text-[10px] text-zinc-500 hover:text-zinc-300 transition">
          전체 보기 →
        </Link>
      </div>

      {loading ? (
        <p className="text-[11px] text-zinc-600 animate-pulse text-center py-4">불러오는 중…</p>
      ) : (
        <>
          {/* 오늘 루틴 */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-zinc-300">오늘 루틴</p>
              {routineTotal > 0 && (
                <span className="text-[10px] text-zinc-500">{routineDone}/{routineTotal}</span>
              )}
            </div>
            {routineTotal === 0 ? (
              <p className="text-[11px] text-zinc-600">오늘 루틴 없음</p>
            ) : (
              <>
                <div className="h-1 w-full rounded-full bg-zinc-800 mb-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${routineTotal > 0 ? (routineDone / routineTotal) * 100 : 0}%` }}
                  />
                </div>
                <div className="space-y-1">
                  {todayRoutines.slice(0, 5).map((r) => {
                    const done = checkedSet.has(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleRoutine(r.id)}
                        disabled={toggling === r.id}
                        className="flex items-center gap-2 w-full text-left group"
                      >
                        <span className={`w-3.5 h-3.5 rounded-sm border shrink-0 flex items-center justify-center text-[9px] transition ${
                          done ? "bg-blue-500 border-blue-500 text-white" : "border-zinc-700 group-hover:border-zinc-500"
                        }`}>
                          {done && "✓"}
                        </span>
                        <span className={`text-[11px] transition ${done ? "line-through text-zinc-600" : "text-zinc-300"}`}>
                          {r.name}
                        </span>
                      </button>
                    );
                  })}
                  {todayRoutines.length > 5 && (
                    <p className="text-[10px] text-zinc-600 pl-5">+{todayRoutines.length - 5}개 더</p>
                  )}
                </div>
              </>
            )}
          </section>

          {/* 할일 */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-zinc-300">할일</p>
              <div className="flex gap-1">
                {SCOPES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTodoScope(s)}
                    className={`rounded px-1.5 py-0.5 text-[10px] transition ${
                      todoScope === s ? "bg-zinc-700 text-zinc-200" : "text-zinc-600 hover:text-zinc-400"
                    }`}
                  >
                    {SCOPE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              {scopedTodos.slice(0, 4).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTodo(t.id, t.done)}
                  className="flex items-center gap-2 w-full text-left group"
                >
                  <span className="w-3.5 h-3.5 rounded-sm border border-zinc-700 group-hover:border-zinc-500 shrink-0 transition" />
                  <span className="text-[11px] text-zinc-300 truncate">{t.text}</span>
                </button>
              ))}
              {doneTodos.length > 0 && (
                <p className="text-[10px] text-zinc-600 pl-5">{doneTodos.length}개 완료됨</p>
              )}
              {scopedTodos.length === 0 && doneTodos.length === 0 && (
                <p className="text-[11px] text-zinc-600">{SCOPE_LABEL[todoScope]} 할일 없음</p>
              )}
            </div>
            <form onSubmit={addTodo} className="mt-2 flex gap-1">
              <input
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                placeholder="+ 빠른 추가"
                className="flex-1 bg-zinc-800/60 border border-zinc-700/50 rounded px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              <button
                type="submit"
                disabled={!newTodo.trim() || addingTodo}
                className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 rounded text-[11px] text-zinc-200 transition"
              >
                추가
              </button>
            </form>
          </section>

          {/* 재정 요약 */}
          {income > 0 && (
            <section>
              <p className="text-xs font-semibold text-zinc-300 mb-2">재정</p>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[11px] text-zinc-500">월 순수입</span>
                <span className={`text-sm font-bold font-mono ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  ₩{net.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden flex">
                <div className="h-full bg-amber-500/70" style={{ width: `${Math.min(100, (fixed / income) * 100)}%` }} />
                <div className="h-full bg-orange-500/70" style={{ width: `${Math.min(100, (subMonthly / income) * 100)}%` }} />
                <div className="h-full bg-zinc-500/70" style={{ width: `${Math.min(100, (variable / income) * 100)}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
                <span>지출 {expenseRate}%</span>
                <span>저축 {Math.max(0, 100 - expenseRate)}%</span>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
