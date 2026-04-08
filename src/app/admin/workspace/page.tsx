"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import crewData from "@/data/crew.json";
import PixelIcon from "@/components/shared/PixelIcon";

interface LogEntry {
  type: "command" | "response" | "system";
  agent?: string;
  content: string;
  timestamp: string;
}

export default function WorkspacePage() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([
    { type: "system", content: "Woong Agent Workspace v1.0 — Ready.", timestamp: new Date().toISOString() },
  ]);
  const [running, setRunning] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const devCrew = crewData.filter((m) =>
    ["dev", "codedev", "game", "webdesign", "design", "planning"].includes(m.teamId)
  );

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleRun = async () => {
    if (!selectedAgent || !command.trim() || running) return;

    const agent = devCrew.find((m) => m.id === selectedAgent);
    const cmd = command.trim();
    setCommand("");
    setRunning(true);

    setLogs((prev) => [
      ...prev,
      { type: "command", agent: agent?.name.split(" (")[0], content: cmd, timestamp: new Date().toISOString() },
    ]);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgent, command: cmd }),
      });
      const data = await res.json();

      setLogs((prev) => [
        ...prev,
        {
          type: "response",
          agent: agent?.name.split(" (")[0],
          content: data.reply || data.error || "No response",
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch {
      setLogs((prev) => [
        ...prev,
        { type: "system", content: "Connection failed.", timestamp: new Date().toISOString() },
      ]);
    }

    setRunning(false);
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-baseline justify-between border-b border-white/[0.06] pb-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white/90">Dev Lab</h1>
          <p className="text-xs font-mono text-white/20 mt-1">Agent Workspace</p>
        </div>
        {selectedAgent && (
          <span className="text-[10px] font-mono text-[#e8c547]/40">
            AGENT: {devCrew.find((m) => m.id === selectedAgent)?.name.split(" (")[0]}
          </span>
        )}
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Agent list */}
        <div className="col-span-12 lg:col-span-3">
          <div className="text-[10px] font-mono text-white/15 tracking-[0.2em] uppercase mb-4">Agents</div>
          <div className="space-y-1">
            {devCrew.map((member) => (
              <button
                key={member.id}
                onClick={() => setSelectedAgent(member.id)}
                className={`w-full flex items-center gap-3 py-2.5 px-3 -mx-3 transition-colors text-left ${
                  selectedAgent === member.id ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"
                }`}
              >
                <PixelIcon type="crew" id={member.teamId} size={20} />
                <div className="min-w-0">
                  <div className={`text-xs truncate ${selectedAgent === member.id ? "text-white/70" : "text-white/35"}`}>
                    {member.name.split(" (")[0]}
                  </div>
                  <div className="text-[9px] font-mono text-white/15 truncate">{member.role}</div>
                </div>
                {selectedAgent === member.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 ml-auto shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Terminal */}
        <div className="col-span-12 lg:col-span-9">
          <div className="border border-white/[0.04] overflow-hidden">
            {/* Terminal header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04] bg-white/[0.01]">
              <div className="w-2 h-2 rounded-full bg-red-400/30" />
              <div className="w-2 h-2 rounded-full bg-yellow-400/30" />
              <div className="w-2 h-2 rounded-full bg-green-400/30" />
              <span className="text-[9px] font-mono text-white/15 ml-2">
                {selectedAgent ? `agent.${selectedAgent}` : "select agent"}
              </span>
            </div>

            {/* Log output */}
            <div className="p-4 h-[400px] overflow-y-auto font-mono text-xs bg-[#06060a]">
              {logs.map((log, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mb-3"
                >
                  {log.type === "system" && (
                    <div className="text-white/15">$ {log.content}</div>
                  )}
                  {log.type === "command" && (
                    <div>
                      <span className="text-[#e8c547]/50">{log.agent}</span>
                      <span className="text-white/15"> ← </span>
                      <span className="text-white/40">{log.content}</span>
                    </div>
                  )}
                  {log.type === "response" && (
                    <div className="mt-1 pl-4 border-l border-white/[0.04]">
                      <pre className="text-white/30 whitespace-pre-wrap leading-relaxed">{log.content}</pre>
                    </div>
                  )}
                </motion.div>
              ))}
              {running && (
                <div className="text-white/15 animate-pulse">processing...</div>
              )}
              <div ref={logEndRef} />
            </div>

            {/* Input */}
            <div className="flex border-t border-white/[0.04]">
              <span className="text-[#e8c547]/30 text-xs px-3 py-3 font-mono">$</span>
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRun()}
                disabled={!selectedAgent || running}
                placeholder={selectedAgent ? "명령을 입력하세요..." : "좌측에서 에이전트를 선택하세요"}
                className="flex-1 bg-transparent text-white/60 text-xs font-mono placeholder:text-white/10 outline-none py-3 pr-3 disabled:opacity-30"
              />
              <button
                onClick={handleRun}
                disabled={!selectedAgent || !command.trim() || running}
                className="px-4 text-[10px] font-mono text-[#e8c547]/40 hover:text-[#e8c547]/70 transition-colors disabled:opacity-20 tracking-wider uppercase"
              >
                Run
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
