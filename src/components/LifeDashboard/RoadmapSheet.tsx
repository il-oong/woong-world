"use client";

import { useEffect, useState } from "react";
import type { Roadmap, Milestone } from "@/lib/life-dashboard";

const QUARTER_LABEL: Record<number, string> = { 1: "1Q (1–3월)", 2: "2Q (4–6월)", 3: "3Q (7–9월)", 4: "4Q (10–12월)" };

function emptyRoadmap(): Roadmap {
  const year = new Date().getFullYear();
  return {
    year,
    milestones: [],
    monthGoals: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, detail: "", note: "" })),
  };
}

export default function RoadmapSheet() {
  const [roadmap, setRoadmap] = useState<Roadmap>(emptyRoadmap());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/life-dashboard/roadmap")
      .then(r => r.json())
      .then(({ roadmap: r }) => {
        if (r) setRoadmap(r);
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/life-dashboard/roadmap", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(roadmap),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addMilestone() {
    const id = `m_${Date.now().toString(36)}`;
    setRoadmap(r => ({
      ...r,
      milestones: [...r.milestones, { id, quarter: 1, label: "", successCriteria: "" }],
    }));
  }

  function setMilestone(id: string, field: keyof Milestone, val: string | number) {
    setRoadmap(r => ({
      ...r,
      milestones: r.milestones.map(m => m.id === id ? { ...m, [field]: val } : m),
    }));
  }

  function removeMilestone(id: string) {
    setRoadmap(r => ({ ...r, milestones: r.milestones.filter(m => m.id !== id) }));
  }

  function setMonthGoal(month: number, field: "detail" | "note", val: string) {
    setRoadmap(r => ({
      ...r,
      monthGoals: r.monthGoals.map(g => g.month === month ? { ...g, [field]: val } : g),
    }));
  }

  if (loading) return <div className="py-16 text-center text-zinc-500 text-sm">불러오는 중...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">ROADMAP — {roadmap.year}년 마일스톤</h3>
          <p className="text-xs text-zinc-500 mt-0.5">목표를 보고 뛰세요</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
        >
          {saved ? "저장됨 ✓" : saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* Quarterly milestones */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <div className="bg-zinc-800/60 px-4 py-2.5 border-b border-zinc-800">
          <div className="grid grid-cols-[100px_1fr_1fr] text-xs font-semibold text-zinc-400 uppercase tracking-wide gap-4">
            <span>분기</span><span>마일스톤</span><span>성공기준</span>
          </div>
        </div>
        {roadmap.milestones.length === 0 ? (
          <div className="px-4 py-6 text-center text-zinc-600 text-sm">마일스톤이 없습니다</div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {roadmap.milestones.map(m => (
              <div key={m.id} className="grid grid-cols-[100px_1fr_1fr_24px] divide-x divide-zinc-800 group">
                <select
                  value={m.quarter}
                  onChange={e => setMilestone(m.id, "quarter", Number(e.target.value))}
                  className="px-3 py-2.5 bg-transparent text-sm text-zinc-300 focus:outline-none focus:bg-zinc-800/40"
                >
                  {[1, 2, 3, 4].map(q => <option key={q} value={q}>{QUARTER_LABEL[q]}</option>)}
                </select>
                <input
                  value={m.label}
                  onChange={e => setMilestone(m.id, "label", e.target.value)}
                  className="px-3 py-2.5 bg-transparent text-sm text-zinc-200 focus:outline-none focus:bg-zinc-800/40 placeholder-zinc-600"
                  placeholder="마일스톤"
                />
                <input
                  value={m.successCriteria}
                  onChange={e => setMilestone(m.id, "successCriteria", e.target.value)}
                  className="px-3 py-2.5 bg-transparent text-sm text-zinc-200 focus:outline-none focus:bg-zinc-800/40 placeholder-zinc-600"
                  placeholder="성공기준"
                />
                <button
                  onClick={() => removeMilestone(m.id)}
                  className="flex items-center justify-center text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={addMilestone}
          className="w-full px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 transition-colors text-left"
        >
          + 마일스톤 추가
        </button>
      </div>

      {/* Monthly goals */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <div className="bg-zinc-800/60 px-4 py-2.5 border-b border-zinc-800">
          <div className="grid grid-cols-[60px_1fr_1fr] text-xs font-semibold text-zinc-400 uppercase tracking-wide gap-4">
            <span>월</span><span>상세 목표</span><span>비고</span>
          </div>
        </div>
        <div className="divide-y divide-zinc-800">
          {roadmap.monthGoals.map(g => (
            <div key={g.month} className="grid grid-cols-[60px_1fr_1fr] divide-x divide-zinc-800">
              <div className="px-3 py-2.5 text-sm text-zinc-400">{g.month}월</div>
              <input
                value={g.detail}
                onChange={e => setMonthGoal(g.month, "detail", e.target.value)}
                className="px-3 py-2.5 bg-transparent text-sm text-zinc-200 focus:outline-none focus:bg-zinc-800/40 placeholder-zinc-600"
                placeholder="목표 나열"
              />
              <input
                value={g.note}
                onChange={e => setMonthGoal(g.month, "note", e.target.value)}
                className="px-3 py-2.5 bg-transparent text-sm text-zinc-200 focus:outline-none focus:bg-zinc-800/40 placeholder-zinc-600"
                placeholder="비고"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
