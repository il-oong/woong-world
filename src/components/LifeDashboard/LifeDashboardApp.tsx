"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { computeStats } from "@/lib/life-dashboard";

const HabitTracker = dynamic(() => import("./HabitTracker"), { ssr: false });
const HabitStats = dynamic(() => import("./HabitStats"), { ssr: false });
const IdentitySheet = dynamic(() => import("./IdentitySheet"), { ssr: false });
const RoadmapSheet = dynamic(() => import("./RoadmapSheet"), { ssr: false });
const FinanceSheet = dynamic(() => import("./FinanceSheet"), { ssr: false });

type Tab = "tracker" | "stats" | "identity" | "roadmap" | "finance";

const TABS: { id: Tab; label: string }[] = [
  { id: "tracker", label: "습관 트래커" },
  { id: "stats", label: "통계" },
  { id: "identity", label: "연간 목표" },
  { id: "roadmap", label: "로드맵" },
  { id: "finance", label: "재정" },
];

export default function LifeDashboardApp() {
  const [tab, setTab] = useState<Tab>("tracker");
  const [stats, setStats] = useState<ReturnType<typeof computeStats> | null>(null);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
              tab === t.id
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {tab === "tracker" && <HabitTracker onStatsChange={setStats} />}
        {tab === "stats" && <HabitStats stats={stats} />}
        {tab === "identity" && <IdentitySheet />}
        {tab === "roadmap" && <RoadmapSheet />}
        {tab === "finance" && <FinanceSheet />}
      </div>
    </div>
  );
}
