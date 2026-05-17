"use client";

import { useEffect, useState } from "react";
import type { Finance, FinanceLine } from "@/lib/life-dashboard";

const CATEGORY_LABEL = { income: "수입", fixed: "고정지출", variable: "변동지출" } as const;

function emptyFinance(): Finance {
  return {
    year: new Date().getFullYear(),
    lines: [
      { id: "l1", category: "income", label: "수입", subLabel: "급여", amount: 0 },
      { id: "l2", category: "income", label: "수입", subLabel: "부수입 1", amount: 0 },
      { id: "l3", category: "fixed", label: "고정지출", subLabel: "주거비", amount: 0 },
      { id: "l4", category: "fixed", label: "고정지출", subLabel: "보험료", amount: 0 },
      { id: "l5", category: "fixed", label: "고정지출", subLabel: "통신비", amount: 0 },
      { id: "l6", category: "variable", label: "변동지출", subLabel: "식비", amount: 0 },
      { id: "l7", category: "variable", label: "변동지출", subLabel: "여가/문화", amount: 0 },
    ],
  };
}

function fmt(n: number): string {
  return n === 0 ? "" : `₩${n.toLocaleString()}`;
}

function parseAmount(s: string): number {
  const n = Number(s.replace(/[^0-9]/g, ""));
  return isNaN(n) ? 0 : n;
}

export default function FinanceSheet() {
  const [finance, setFinance] = useState<Finance>(emptyFinance());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/life-dashboard/finance")
      .then(r => r.json())
      .then(({ finance: f }) => {
        if (f) setFinance(f);
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
    setFinance(f => ({ ...f, lines: f.lines.map(l => l.id === id ? { ...l, [field]: val } : l) }));
  }

  function addLine(category: FinanceLine["category"]) {
    const id = `l_${Date.now().toString(36)}`;
    setFinance(f => ({
      ...f,
      lines: [...f.lines, { id, category, label: CATEGORY_LABEL[category], subLabel: "", amount: 0 }],
    }));
  }

  function removeLine(id: string) {
    setFinance(f => ({ ...f, lines: f.lines.filter(l => l.id !== id) }));
  }

  if (loading) return <div className="py-16 text-center text-zinc-500 text-sm">불러오는 중...</div>;

  const categories: FinanceLine["category"][] = ["income", "fixed", "variable"];
  const totals = {
    income: finance.lines.filter(l => l.category === "income").reduce((s, l) => s + l.amount, 0),
    fixed: finance.lines.filter(l => l.category === "fixed").reduce((s, l) => s + l.amount, 0),
    variable: finance.lines.filter(l => l.category === "variable").reduce((s, l) => s + l.amount, 0),
  };
  const netIncome = totals.income - totals.fixed - totals.variable;
  const savingsRate = totals.income > 0 ? Math.round((netIncome / totals.income) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">FINANCE — {finance.year}년 금융 오버뷰</h3>
          <p className="text-xs text-zinc-500 mt-0.5">월 평균 기준</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
        >
          {saved ? "저장됨 ✓" : saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-xs text-zinc-500">총 수입</p>
          <p className="text-lg font-bold text-emerald-400 mt-0.5">₩{totals.income.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-xs text-zinc-500">총 지출</p>
          <p className="text-lg font-bold text-red-400 mt-0.5">₩{(totals.fixed + totals.variable).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-xs text-zinc-500">저축 가능액 ({savingsRate}%)</p>
          <p className={`text-lg font-bold mt-0.5 ${netIncome >= 0 ? "text-blue-400" : "text-red-400"}`}>
            ₩{netIncome.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Detail table */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <div className="bg-zinc-800/60 px-4 py-2.5 border-b border-zinc-800">
          <div className="grid grid-cols-[80px_1fr_140px] text-xs font-semibold text-zinc-400 uppercase tracking-wide gap-4">
            <span>유형</span><span>항목</span><span className="text-right">월 평균</span>
          </div>
        </div>

        {categories.map(cat => {
          const lines = finance.lines.filter(l => l.category === cat);
          const total = totals[cat];
          return (
            <div key={cat}>
              <div className="divide-y divide-zinc-800/60">
                {lines.map(line => (
                  <div key={line.id} className="grid grid-cols-[80px_1fr_140px_24px] gap-0 divide-x divide-zinc-800/60 group">
                    <div className="px-3 py-2.5 text-xs text-zinc-500 flex items-center">{CATEGORY_LABEL[cat]}</div>
                    <input
                      value={line.subLabel}
                      onChange={e => setLine(line.id, "subLabel", e.target.value)}
                      className="px-3 py-2.5 bg-transparent text-sm text-zinc-200 focus:outline-none focus:bg-zinc-800/40 placeholder-zinc-600"
                      placeholder="항목명"
                    />
                    <input
                      value={line.amount === 0 ? "" : line.amount}
                      onChange={e => setLine(line.id, "amount", parseAmount(e.target.value))}
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
                <button
                  onClick={() => addLine(cat)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  + {CATEGORY_LABEL[cat]} 추가
                </button>
                <span className="text-xs font-semibold text-zinc-300">합계 ₩{total.toLocaleString()}</span>
              </div>
            </div>
          );
        })}

        <div className="px-4 py-3 border-t border-zinc-700 flex justify-between items-center bg-zinc-800/50">
          <span className="text-sm font-semibold text-zinc-300">순수입 (저축 가능)</span>
          <span className={`text-sm font-bold ${netIncome >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            ₩{netIncome.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
