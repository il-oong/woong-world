"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Plan, PlanPeriod } from "@/lib/plans";

const PERIOD_LABEL: Record<PlanPeriod, string> = {
  weekly: "주간",
  monthly: "월간",
  yearly: "연간",
};

const PERIODS: PlanPeriod[] = ["weekly", "monthly", "yearly"];

export default function HomePlansWidget() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [period, setPeriod] = useState<PlanPeriod>("weekly");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => r.ok ? r.json() as Promise<{ plans: Plan[] }> : null)
      .then((d) => {
        setPlans(d?.plans ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = plans
    .filter((p) => p.period === period)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);

  return (
    <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 gap-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">biseo / plans</p>
        <Link href="/plans" className="text-[10px] text-zinc-500 hover:text-zinc-300 transition">
          전체 보기 →
        </Link>
      </div>

      {/* Period switcher */}
      <div className="flex gap-1">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
              period === p
                ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[11px] text-zinc-600 animate-pulse">불러오는 중…</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-3">
          <p className="text-[11px] text-zinc-600">{PERIOD_LABEL[period]} 계획 없음</p>
          <Link
            href="/plans"
            className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:text-foreground hover:border-[var(--accent)]/40 transition"
          >
            + 계획 추가
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((plan) => {
            const total = plan.items.length;
            const done = plan.items.filter((i) => i.done).length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <Link
                key={plan.id}
                href="/plans"
                className="block rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 hover:border-zinc-700 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-zinc-200 leading-snug line-clamp-1">{plan.title}</span>
                  {plan.categoryId && (
                    <span className="shrink-0 rounded border border-zinc-700 px-1 py-0.5 text-[9px] text-zinc-500">
                      {plan.categoryId}
                    </span>
                  )}
                </div>
                {total > 0 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-600 shrink-0">{done}/{total}</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
