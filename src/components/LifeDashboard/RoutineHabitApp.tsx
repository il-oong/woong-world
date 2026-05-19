"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const RoutineApp = dynamic(
  () => import("../RoutineApp").then((m) => ({ default: m.RoutineApp })),
  { ssr: false },
);
const HabitTracker = dynamic(() => import("./HabitTracker"), { ssr: false });

type SubTab = "today" | "monthly";

export default function RoutineHabitApp() {
  const [sub, setSub] = useState<SubTab>("today");

  return (
    <div className="space-y-4">
      <div className="flex gap-0 border-b border-zinc-800">
        {(
          [
            ["today", "오늘 체크"],
            ["monthly", "월간 기록"],
          ] as [SubTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSub(id)}
            className={`rounded-t-md px-4 py-1.5 text-xs font-medium transition ${
              sub === id
                ? "border border-b-0 border-zinc-700 bg-zinc-900 text-blue-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {sub === "today" && <RoutineApp />}
      {sub === "monthly" && <HabitTracker onStatsChange={() => {}} />}
    </div>
  );
}
