"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const HomeOverview = dynamic(() => import("./HomeOverview"), { ssr: false });
const IdentitySheet = dynamic(() => import("./IdentitySheet"), { ssr: false });
const RoadmapSheet = dynamic(() => import("./RoadmapSheet"), { ssr: false });
const FinanceSheet = dynamic(() => import("./FinanceSheet"), { ssr: false });
const AnalyticsSheet = dynamic(() => import("./AnalyticsSheet"), { ssr: false });
// Reuse existing standalone apps
const RoutineApp = dynamic(() => import("../RoutineApp").then(m => ({ default: m.RoutineApp })), { ssr: false });
const TodoApp = dynamic(() => import("../TodoApp").then(m => ({ default: m.TodoApp })), { ssr: false });

type Tab = "home" | "routine" | "todo" | "goal" | "finance" | "analytics";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "홈", icon: "⌂" },
  { id: "routine", label: "루틴", icon: "↺" },
  { id: "todo", label: "할일", icon: "✓" },
  { id: "goal", label: "목표", icon: "◎" },
  { id: "finance", label: "재정", icon: "₩" },
  { id: "analytics", label: "분석", icon: "↗" },
];

export default function LifeDashboardApp() {
  const [tab, setTab] = useState<Tab>("home");

  return (
    <div className="space-y-5">
      {/* Tab bar — scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="flex gap-0.5 border-b border-zinc-800 pb-0 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 shrink-0 rounded-t-md px-3.5 py-2 text-xs font-medium transition ${
                tab === t.id
                  ? "border border-b-0 border-zinc-700 bg-zinc-900 text-blue-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className="text-[11px]">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div>
        {tab === "home" && <HomeOverview />}
        {tab === "routine" && <RoutineApp />}
        {tab === "todo" && <TodoApp />}
        {tab === "goal" && (
          <div className="space-y-8">
            <IdentitySheet />
            <RoadmapSheet />
          </div>
        )}
        {tab === "finance" && <FinanceSheet />}
        {tab === "analytics" && <AnalyticsSheet />}
      </div>
    </div>
  );
}
