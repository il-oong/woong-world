"use client";

import { useEffect, useState } from "react";
import type { Goals } from "@/lib/life-dashboard";

const DOMAIN_DEFAULTS = ["커리어", "건강", "재정", "자기계발", "취미", "관계"];

const EMPTY_GOALS: Goals = {
  year: new Date().getFullYear(),
  keywords: ["성장", "건강", "재정", "관계", "학습"],
  statements: [
    { keyword: "성장", statement: "나는 매일 1%씩 성장할 것이다" },
    { keyword: "건강", statement: "나는 규칙적인 운동으로 건강을 유지할 것이다" },
    { keyword: "재정", statement: "나는 수입의 30%를 저축할 것이다" },
    { keyword: "관계", statement: "나는 소중한 사람들과 시간을 보낼 것이다" },
    { keyword: "학습", statement: "나는 매월 2권의 책을 읽을 것이다" },
  ],
  domains: DOMAIN_DEFAULTS.map(d => ({ domain: d, goal: "", metric: "" })),
  books: [],
};

export default function IdentitySheet() {
  const [goals, setGoals] = useState<Goals>(EMPTY_GOALS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/life-dashboard/goals")
      .then(r => r.json())
      .then(({ goals: g }) => {
        if (g) setGoals(g);
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/life-dashboard/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goals),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function setStatement(idx: number, field: "keyword" | "statement", val: string) {
    setGoals(g => ({
      ...g,
      statements: g.statements.map((s, i) => i === idx ? { ...s, [field]: val } : s),
    }));
  }

  function setDomain(idx: number, field: "goal" | "metric", val: string) {
    setGoals(g => ({
      ...g,
      domains: g.domains.map((d, i) => i === idx ? { ...d, [field]: val } : d),
    }));
  }

  if (loading) return <div className="py-16 text-center text-zinc-500 text-sm">불러오는 중...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">IDENTITY — {goals.year}년 목표</h3>
          <p className="text-xs text-zinc-500 mt-0.5">정확한 골인지점을 설정하세요</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
        >
          {saved ? "저장됨 ✓" : saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* I Will Statements */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <div className="bg-zinc-800/60 px-4 py-2.5 border-b border-zinc-800">
          <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">핵심 키워드 / 선언문 (I Will Statement)</p>
        </div>
        <div className="divide-y divide-zinc-800">
          {goals.statements.map((s, i) => (
            <div key={i} className="grid grid-cols-[120px_1fr] divide-x divide-zinc-800">
              <input
                value={s.keyword}
                onChange={e => setStatement(i, "keyword", e.target.value)}
                className="px-3 py-2.5 bg-transparent text-sm text-zinc-300 focus:outline-none focus:bg-zinc-800/40 placeholder-zinc-600"
                placeholder="키워드"
              />
              <input
                value={s.statement}
                onChange={e => setStatement(i, "statement", e.target.value)}
                className="px-3 py-2.5 bg-transparent text-sm text-zinc-200 focus:outline-none focus:bg-zinc-800/40 placeholder-zinc-600"
                placeholder="나는 ... 할 것이다"
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => setGoals(g => ({ ...g, statements: [...g.statements, { keyword: "", statement: "" }] }))}
          className="w-full px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 transition-colors text-left"
        >
          + 항목 추가
        </button>
      </div>

      {/* Domain goals */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <div className="bg-zinc-800/60 px-4 py-2.5 border-b border-zinc-800">
          <div className="grid grid-cols-[100px_1fr_1fr] text-xs font-semibold text-zinc-400 uppercase tracking-wide gap-4">
            <span>분야</span><span>목표</span><span>측정지표</span>
          </div>
        </div>
        <div className="divide-y divide-zinc-800">
          {goals.domains.map((d, i) => (
            <div key={i} className="grid grid-cols-[100px_1fr_1fr] divide-x divide-zinc-800">
              <div className="px-3 py-2.5 text-sm text-zinc-400">{d.domain}</div>
              <input
                value={d.goal}
                onChange={e => setDomain(i, "goal", e.target.value)}
                className="px-3 py-2.5 bg-transparent text-sm text-zinc-200 focus:outline-none focus:bg-zinc-800/40 placeholder-zinc-600"
                placeholder="목표"
              />
              <input
                value={d.metric}
                onChange={e => setDomain(i, "metric", e.target.value)}
                className="px-3 py-2.5 bg-transparent text-sm text-zinc-200 focus:outline-none focus:bg-zinc-800/40 placeholder-zinc-600"
                placeholder="측정지표 (예: 연봉 15% 인상)"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
