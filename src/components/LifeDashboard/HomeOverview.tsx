"use client";

import { useEffect, useState, useCallback } from "react";
import type { Routine } from "@/lib/routines";
import type { Todo, TodoScope } from "@/lib/todos";
import type { Subscription } from "@/lib/subscriptions";
import type { Finance } from "@/lib/life-dashboard";

type RoutineData = { routines: Routine[]; todayChecked: string[]; today: string };
type TodoData = { todos: Todo[] };
type SubData = { subscriptions: Subscription[]; monthlyTotal: number };
type FinanceData = { finance: Finance | null };

const SCOPE_LABEL: Record<TodoScope, string> = { day: "일간", week: "주간", month: "월간" };

function fmtKRW(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만원`;
  return `${n.toLocaleString()}원`;
}

export default function HomeOverview() {
  const [routineData, setRoutineData] = useState<RoutineData | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [finance, setFinance] = useState<Finance | null>(null);
  const [subMonthly, setSubMonthly] = useState<number>(0);
  const [newTodo, setNewTodo] = useState("");
  const [todoScope, setTodoScope] = useState<TodoScope>("day");
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [rRes, tRes, fRes, sRes] = await Promise.all([
      fetch("/api/routines"),
      fetch("/api/todos"),
      fetch("/api/life-dashboard/finance"),
      fetch("/api/subscriptions"),
    ]);
    if (rRes.ok) setRoutineData(await rRes.json() as RoutineData);
    if (tRes.ok) setTodos(((await tRes.json() as TodoData).todos ?? []));
    if (fRes.ok) setFinance(((await fRes.json() as FinanceData).finance));
    if (sRes.ok) setSubMonthly(((await sRes.json() as SubData).monthlyTotal ?? 0));
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

  return (
    <div className="space-y-5">
      {/* Asset Summary */}
      <section>
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">이번달 자산 플랜</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <AssetCard label="수입" value={income} color="emerald" />
          <AssetCard label="고정지출" value={fixed} color="amber" />
          <AssetCard label="구독료" value={subMonthly} color="orange" />
          <AssetCard label={net >= 0 ? "잉여" : "초과"} value={Math.abs(net)} color={net >= 0 ? "blue" : "rose"} />
        </div>
        {income > 0 && (
          <div className="mt-2 h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500"
              style={{ width: `${Math.min(100, (totalExpense / income) * 100).toFixed(1)}%` }}
            />
          </div>
        )}
        {income > 0 && (
          <p className="mt-1 text-[10px] text-zinc-600">
            지출률 {income > 0 ? ((totalExpense / income) * 100).toFixed(0) : 0}% · 변동지출 {fmtKRW(variable)} 별도
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Routine */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">오늘 루틴</h2>
            <span className="text-xs text-zinc-500">
              {routineDone}/{activeRoutines.length}
            </span>
          </div>
          {activeRoutines.length === 0 ? (
            <p className="text-xs text-zinc-700">오늘 활성 루틴 없음</p>
          ) : (
            <div className="space-y-1.5">
              {activeRoutines.map((r) => {
                const done = checkedSet.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRoutine(r.id)}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-xs transition ${
                      done
                        ? "bg-blue-500/10 border border-blue-500/20 text-blue-300 line-through"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    <span className={`text-base ${done ? "text-blue-500" : "text-zinc-600"}`}>
                      {done ? "✓" : "○"}
                    </span>
                    {r.name}
                  </button>
                );
              })}
            </div>
          )}
          {activeRoutines.length > 0 && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${activeRoutines.length > 0 ? (routineDone / activeRoutines.length) * 100 : 0}%` }}
              />
            </div>
          )}
        </section>

        {/* Todo */}
        <section>
          <div className="flex items-center justify-between mb-3">
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

          <form onSubmit={addTodo} className="flex gap-2 mb-3">
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

          <div className="space-y-1.5 max-h-52 overflow-y-auto">
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
    </div>
  );
}

function AssetCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    amber: "text-amber-400 border-amber-500/20 bg-amber-500/5",
    orange: "text-orange-400 border-orange-500/20 bg-orange-500/5",
    blue: "text-blue-400 border-blue-500/20 bg-blue-500/5",
    rose: "text-rose-400 border-rose-500/20 bg-rose-500/5",
  };
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color] ?? "border-zinc-800 bg-zinc-900"}`}>
      <p className="text-[10px] text-zinc-500 mb-1">{label}</p>
      <p className={`text-sm font-bold font-mono ${colorMap[color]?.split(" ")[0] ?? "text-zinc-300"}`}>
        {value > 0 ? fmtKRW(value) : "—"}
      </p>
    </div>
  );
}
