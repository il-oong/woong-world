"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const dismissed = localStorage.getItem("pwa-install-dismissed");
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);
    if (dismissed || isStandalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    const installed = () => {
      setShow(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", installed);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!show || !deferredPrompt) return null;

  const handleInstall = async () => {
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setShow(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-install-dismissed", "1");
    setShow(false);
  };

  return (
    <div className="fixed bottom-20 left-1/2 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-[var(--border)] bg-[#18181f] px-4 py-3 shadow-2xl">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg">📲</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">앱으로 설치하기</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            홈 화면에 추가하면 더 빠르게 열 수 있어요.
          </p>
        </div>
        <button
          onClick={handleInstall}
          className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90"
        >
          설치
        </button>
        <button
          onClick={handleDismiss}
          aria-label="닫기"
          className="mt-0.5 text-xs text-[var(--muted)] hover:text-foreground"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
