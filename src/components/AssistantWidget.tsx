"use client";

import { useState } from "react";
import { AssistantPanel } from "./AssistantPanel";

const OPEN_KEY = "wh-assistant-open";

export function AssistantWidget() {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(OPEN_KEY) === "1";
  });

  const setOpenAndPersist = (next: boolean) => {
    setOpen(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    }
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-end p-0 sm:items-end sm:justify-end sm:p-4">
          <div
            className="pointer-events-auto flex h-[100dvh] w-full flex-col overflow-hidden border border-[var(--border)] bg-[#0b0b0f] shadow-2xl sm:h-[600px] sm:max-h-[85vh] sm:w-[400px] sm:rounded-2xl"
          >
            <AssistantPanel onClose={() => setOpenAndPersist(false)} />
          </div>
        </div>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpenAndPersist(true)}
          className="group fixed bottom-4 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-black shadow-2xl transition hover:scale-105"
          aria-label="비서 열기"
          title="비서 열기"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}
    </>
  );
}
