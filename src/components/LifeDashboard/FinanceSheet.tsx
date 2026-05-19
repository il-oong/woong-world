"use client";

import { useEffect, useState } from "react";
import type { Finance, FinanceLine } from "@/lib/life-dashboard";
import type { Subscription } from "@/lib/subscriptions";

const CATEGORY_LABEL = { income: "수입", fixed: "고정지출", variable: "변동지출" } as const;

function emptyFinance(): Finance {
  return {
    year: new Date().getFullYear(),
    lines: [
      { id: "l1", category: "income", label: "수입", subLabel: "급여", amount: 0 },
      { id: "l2", category: "income", label: "수입", subLabel: "부수입", amount: 0 },
      { id: "l3", category: "fixed", label: "고정지출", subLabel: "주거비", amount: 0 },
      { id: "l4", category: "fixed", label: "고정지출", subLabel: "보험료", amount: 0 },
      { id: "l5", category: "fixed", label: "고정지출", subLabel: "통신비", amount: 0 },
      { id: "l6", category: "variable", label: "변동지출", subLabel: "식비", amount: 0 },
      { id: "l7", category: "variable", label: "변동지출", subLabel: "여가/문화", amount: 0 },
    ],
  };
}

function parseAmount(s: string): number {
  const n = Number(s.replace(/[^0-9]/g, ""));
  return isNaN(n) ? 0 : n;
}

export default function FinanceSheet() {
  const [finance, setFinance] = useState<Finance>(emptyFinance());
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [subMonthly, setSubMonthly] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSubs, setShowSubs] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/life-dashboard/finance").then((r) => r.json()),
      fetch("/api/subscriptions").then((r) => r.json()),
    ]).then(([fd, sd]) => {
      if (fd.finance) setFinance(fd.finance as Finance);
      if (Array.isArray(sd.subscriptions)) {
        setSubs(sd.subscriptions as Subscription[]);
        setSubMonthly((sd.monthlyTotal as number) ?? 0);
      }
      setLoading(false);
    });
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/life-dashboard/finance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finance),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function setLine(id: string, field: keyof FinanceLine, val: string | number) {
    setFinance((f) => ({ ...f, lines: f.lines.map((l) => (l.id === id ? { ...l, [field]: val } : l)) }));
  }

  function addLine(category: FinanceLine["category"]) {
    const id = `l_${Date.now().toString(36)}`;
    setFinance((f) => ({
      ...f,
      lines: [...f.lines, { id, category, label: CATEGORY_LABEL[category], subLabel: "", amount: 0 }],
    }));
  }

  function removeLine(id: string) {
    setFinance((f) => ({ ...f, lines: f.lines.filter((l) => l.id !== id) }));
  }

  if (loading) return <div className="py-16 text-center text-zinc-500 text-sm">불러오는 중…</div>;

  const totals = {
    income: finance.lines.filter((l) => l.category === "income").reduce((s, l) => s + l.amount, 0),
    fixed: finance.lines.filter((l) => l.category === "fixed").reduce((s, l) => s + l.amount, 0),
    variable: finance.lines.filter((l) => l.category === "variable").reduce((s, l) => s + l.amount, 0),
  };
  const totalExpense = totals.fixed + totals.variable + subMonthly;
  const netIncome = totals.income - totalExpense;
  const savingsRate = totals.income > 0 ? Math.round((netIncome / totals.income) * 100) : 0;
  const expenseRate = totals.income > 0 ? Math.round((totalExpense / totals.income) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">재정 플랜 — {finance.year}년 월 평균</h3>
          <p className="text-xs text-zinc-500 mt-0.5">구독료는 자동 반영됩니다</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
        >
          {saved ? "저장됨 ✓" : saving ? "저장 중…" : "저장"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card label="총 수입" value={totals.income} color="emerald" />
        <Card label="고정지출" value={totals.fixed} color="amber" />
        <Card label={`구독료 (${subs.length}개)`} value={subMonthly} color="orange" />
        <Card
          label={netIncome >= 0 ? `잉여 (${savingsRate}%)` : `초과 (${Math.abs(expenseRate - 100)}%)`}
          value={Math.abs(netIncome)}
          color={netIncome >= 0 ? "blue" : "rose"}
        />
      </div>

      {/* Expense ratio bar */}
      {totals.income > 0 && (
        <div>
          <div className="flex justify-between text-[10px] text-zinc-600 mb-1">
            <span>지출률 {expenseRate}%</span>
            <span>저축률 {Math.max(0, savingsRate)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden flex">
            <div className="h-full bg-amber-500/70" style={{ width: `${Math.min(100, (totals.fixed / totals.income) * 100)}%` }} />
            <div className="h-full bg-orange-500/70" style={{ width: `${Math.min(100, (subMonthly / totals.income) * 100)}%` }} />
            <div className="h-full bg-zinc-500/70" style={{ width: `${Math.min(100, (totals.variable / totals.income) * 100)}%` }} />
          </div>
          <div className="flex gap-3 mt-1 text-[9px] text-zinc-600">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-amber-500/70" />고정지출</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-orange-500/70" />구독</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-zinc-500/70" />변동지출</span>
          </div>
        </div>
      )}

      {/* Detail table */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <div className="bg-zinc-800/60 px-4 py-2.5 border-b border-zinc-800">
          <div className="grid grid-cols-[80px_1fr_140px] text-xs font-semibold text-zinc-400 uppercase tracking-wide gap-4">
            <span>유형</span><span>항목</span><span className="text-right">월 평균</span>
          </div>
        </div>

        {(["income", "fixed", "variable"] as const).map((cat) => {
          const lines = finance.lines.filter((l) => l.category === cat);
          const total = totals[cat];
          return (
            <div key={cat}>
              <div className="divide-y divide-zinc-800/60">
                {lines.map((line) => (
                  <div key={line.id} className="grid grid-cols-[80px_1fr_140px_24px] gap-0 divide-x divide-zinc-800/60 group">
                    <div className="px-3 py-2.5 text-xs text-zinc-500 flex items-center">{CATEGORY_LABEL[cat]}</div>
                    <input
                      value={line.subLabel}
                      onChange={(e) => setLine(line.id, "subLabel", e.target.value)}
                      className="px-3 py-2.5 bg-transparent text-sm text-zinc-200 focus:outline-none focus:bg-zinc-800/40 placeholder-zinc-600"
                      placeholder="항목명"
                    />
                    <input
                      value={line.amount === 0 ? "" : line.amount}
                      onChange={(e) => setLine(line.id, "amount", parseAmount(e.target.value))}
                      className="px-3 py-2.5 bg-transparent text-sm text-zinc-200 text-right focus:outline-none focus:bg-zinc-800/40 placeholder-zinc-600"
                      placeholder="₩0"
                    />
                    <button
                      onClick={() => removeLine(line.id)}
                      className="flex items-center justify-center text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/30 border-t border-zinc-800">
                <button onClick={() => addLine(cat)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                  + {CATEGORY_LABEL[cat]} 추가
                </button>
                <span className="text-xs font-semibold text-zinc-300">₩{total.toLocaleString()}</span>
              </div>
            </div>
          );
        })}

        {/* Subscription rows (read-only, auto-synced) */}
        <div>
          <div className="divide-y divide-zinc-800/60">
            <div
              className="flex items-center justify-between px-4 py-2.5 bg-orange-500/5 cursor-pointer"
              onClick={() => setShowSubs((v) => !v)}
            >
              <span className="text-xs text-orange-400">구독료 ({subs.length}개) — 자동 연동</span>
              <span className="text-xs text-orange-400 font-mono">₩{subMonthly.toLocaleString()} {showSubs ? "▲" : "▼"}</span>
            </div>
            {showSubs && subs.map((s) => {
              const monthly = s.cycle === "yearly" ? Math.round(s.amount / 12) : s.amount;
              return (
                <div key={s.id} className="grid grid-cols-[80px_1fr_140px] divide-x divide-zinc-800/60 opacity-70">
                  <div className="px-3 py-2 text-xs text-orange-400/70 flex items-center">구독</div>
                  <div className="px-3 py-2 text-xs text-zinc-400">
                    {s.name}
                    {s.cycle === "yearly" && <span className="ml-1 text-[10px] text-zinc-600">(연간÷12)</span>}
                  </div>
                  <div className="px-3 py-2 text-xs text-zinc-400 text-right">₩{monthly.toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-zinc-700 flex justify-between items-center bg-zinc-800/50">
          <span className="text-sm font-semibold text-zinc-300">순 잉여금</span>
          <span className={`text-sm font-bold ${netIncome >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            ₩{netIncome.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: number; color: string }) {
  const cls: Record<string, string> = {
    emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    amber: "text-amber-400 border-amber-500/20 bg-amber-500/5",
    orange: "text-orange-400 border-orange-500/20 bg-orange-500/5",
    blue: "text-blue-400 border-blue-500/20 bg-blue-500/5",
    rose: "text-rose-400 border-rose-500/20 bg-rose-500/5",
  };
  return (
    <div className={`rounded-xl border p-3 ${cls[color] ?? "border-zinc-800 bg-zinc-900"}`}>
      <p className="text-[10px] text-zinc-500 mb-1 leading-tight">{label}</p>
      <p className={`text-sm font-bold font-mono ${cls[color]?.split(" ")[0] ?? "text-zinc-300"}`}>
        {value > 0 ? `₩${value.toLocaleString()}` : "—"}
      </p>
    </div>
  );
}
