"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface Task {
  name: string;
  status: "pending" | "in_progress" | "done";
  priority: string;
  team: string;
}

interface Meeting {
  date: string;
  type: string;
  time: string;
  content: string;
}

interface Issue {
  date: string;
  slot: string;
  content: string;
}

export default function MissionsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"meetings" | "tasks" | "issues">("meetings");

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      fetch("/api/meetings").then((r) => r.json()),
    ]).then(([taskData, mtgData]) => {
      setTasks(taskData.tasks || []);
      setIssues(taskData.issues || []);
      setConnected(taskData.connected || false);
      setMeetings(mtgData.meetings || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  const pending = tasks.filter((t) => t.status === "pending");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-baseline justify-between border-b border-white/[0.06] pb-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white/90">Missions</h1>
          <p className="text-xs font-mono text-white/20 mt-1">{today}</p>
        </div>
        <div className="text-[10px] font-mono">
          {connected ? (
            <span className="text-emerald-400/50">VAULT CONNECTED</span>
          ) : (
            <span className="text-white/15">VAULT OFFLINE</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-8 mb-8 border-b border-white/[0.03]">
        {(["meetings", "tasks", "issues"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-[11px] font-mono tracking-wider uppercase pb-3 transition-colors ${
              activeTab === tab ? "text-white/70 border-b border-white/30" : "text-white/20 hover:text-white/40"
            }`}
          >
            {tab === "meetings" ? `Briefings (${meetings.length})` :
             tab === "tasks" ? `Tasks (${tasks.length})` :
             `Issues (${issues.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-white/15 text-sm font-mono animate-pulse">Loading...</div>
      ) : (
        <>
          {/* MEETINGS TAB */}
          {activeTab === "meetings" && (
            <div className="space-y-4">
              {meetings.length === 0 ? (
                <div className="text-white/15 text-sm font-mono">회의록 데이터 없음</div>
              ) : (
                meetings.map((m, i) => (
                  <motion.div
                    key={`${m.date}-${m.time}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-t border-white/[0.03] pt-4"
                  >
                    <div className="flex items-baseline gap-4 mb-2">
                      <span className="text-[10px] font-mono text-white/20">{m.date}</span>
                      <span className="text-[10px] font-mono text-white/30">{m.time}</span>
                      <span className="text-xs text-white/40">{m.type}</span>
                    </div>
                    <pre className="text-xs text-white/25 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                      {m.content.slice(0, 500)}{m.content.length > 500 ? "..." : ""}
                    </pre>
                  </motion.div>
                ))
              )}
            </div>
          )}

          {/* TASKS TAB */}
          {activeTab === "tasks" && (
            <div className="grid grid-cols-3 gap-6">
              {[
                { label: "Pending", items: pending, color: "text-white/30" },
                { label: "In Progress", items: inProgress, color: "text-[#e8c547]/60" },
                { label: "Done", items: done, color: "text-emerald-400/50" },
              ].map((col) => (
                <div key={col.label}>
                  <div className={`text-[10px] font-mono tracking-wider uppercase mb-4 ${col.color}`}>
                    {col.label} ({col.items.length})
                  </div>
                  <div className="space-y-2">
                    {col.items.length === 0 ? (
                      <div className="text-[10px] text-white/10 font-mono">—</div>
                    ) : (
                      col.items.slice(0, 15).map((task, i) => (
                        <div key={i} className="text-xs text-white/30 py-1 border-t border-white/[0.02]">
                          <span className={task.priority === "high" ? "text-red-400/40" : task.priority === "medium" ? "text-yellow-400/40" : "text-white/15"}>
                            {task.priority === "high" ? "!" : task.priority === "medium" ? "·" : ""}
                          </span>{" "}
                          {task.name}
                          <span className="text-[9px] text-white/10 ml-2 font-mono">{task.team}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ISSUES TAB */}
          {activeTab === "issues" && (
            <div className="space-y-4">
              {issues.length === 0 ? (
                <div className="text-white/15 text-sm font-mono">이슈 데이터 없음</div>
              ) : (
                issues.map((issue, i) => (
                  <motion.div
                    key={`${issue.date}-${issue.slot}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-t border-white/[0.03] pt-4"
                  >
                    <div className="flex items-baseline gap-4 mb-2">
                      <span className="text-[10px] font-mono text-white/20">{issue.date}</span>
                      <span className="text-[10px] font-mono text-white/30">{issue.slot}</span>
                    </div>
                    <pre className="text-xs text-white/25 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                      {issue.content.slice(0, 400)}
                    </pre>
                  </motion.div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
