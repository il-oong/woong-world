"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface Command {
  id: string;
  label: string;
  description: string;
  action: () => void;
  category: "navigate" | "crew" | "project" | "admin";
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  const commands: Command[] = [
    { id: "home", label: "성좌도", description: "메인 화면으로 이동", action: () => router.push("/"), category: "navigate" },
    { id: "admin", label: "관리자 대시보드", description: "사령관 모드 진입", action: () => router.push("/admin"), category: "admin" },
    { id: "crew", label: "크루 허브", description: "AI 팀원 목록", action: () => router.push("/admin/crew"), category: "crew" },
    { id: "missions", label: "미션 센터", description: "업무/회의/이슈", action: () => router.push("/admin/missions"), category: "admin" },
    { id: "workspace", label: "AI 개발실", description: "에이전트 작업 환경", action: () => router.push("/admin/workspace"), category: "admin" },
    { id: "plans", label: "기획서 보드", description: "전체 프로젝트 기획서", action: () => router.push("/admin/plans"), category: "admin" },
  ];

  const filtered = query
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setSelectedIndex(0);
      }
      if (!open) return;
      if (e.key === "Escape") {
        setOpen(false);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        setOpen(false);
      }
    },
    [open, filtered, selectedIndex]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const categoryColors: Record<string, string> = {
    navigate: "text-cyan-400",
    crew: "text-amber-400",
    project: "text-emerald-400",
    admin: "text-yellow-400",
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={() => setOpen(false)}
          />
          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50"
          >
            <div className="bg-[#111118] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
              {/* Search */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                <svg className="w-5 h-5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedIndex(0);
                  }}
                  placeholder="명령어 검색..."
                  className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-sm"
                />
                <kbd className="text-[10px] text-white/20 border border-white/10 rounded px-1.5 py-0.5">ESC</kbd>
              </div>
              {/* Results */}
              <div className="max-h-64 overflow-y-auto py-2">
                {filtered.length === 0 ? (
                  <div className="px-4 py-8 text-center text-white/30 text-sm">결과 없음</div>
                ) : (
                  filtered.map((cmd, i) => (
                    <button
                      key={cmd.id}
                      onClick={() => {
                        cmd.action();
                        setOpen(false);
                      }}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        i === selectedIndex ? "bg-white/5" : ""
                      }`}
                    >
                      <span className={`text-xs font-mono ${categoryColors[cmd.category]}`}>
                        {cmd.category === "navigate" && "→"}
                        {cmd.category === "crew" && "👤"}
                        {cmd.category === "project" && "★"}
                        {cmd.category === "admin" && "⚡"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white/90">{cmd.label}</div>
                        <div className="text-xs text-white/30 truncate">{cmd.description}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {/* Footer */}
              <div className="px-4 py-2 border-t border-white/5 flex items-center gap-4 text-[10px] text-white/20">
                <span>↑↓ 이동</span>
                <span>↵ 실행</span>
                <span>Ctrl+K 토글</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
