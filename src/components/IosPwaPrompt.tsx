"use client";

import { useEffect, useState } from "react";

export function IosPwaPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|opios/i.test(ua);
    const isStandalone = ("standalone" in navigator) && (navigator as { standalone?: boolean }).standalone === true;
    const dismissed = localStorage.getItem("pwa-prompt-dismissed");
    if (isIos && isSafari && !isStandalone && !dismissed) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-[var(--border)] bg-[#18181f] px-4 py-3 shadow-2xl">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg">📲</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">앱으로 설치하기</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Safari 하단의 <strong className="text-foreground">공유 버튼(↑)</strong>을 탭한 후{" "}
            <strong className="text-foreground">"홈 화면에 추가"</strong>를 선택하세요.
          </p>
        </div>
        <button
          onClick={() => {
            localStorage.setItem("pwa-prompt-dismissed", "1");
            setShow(false);
          }}
          className="mt-0.5 text-xs text-[var(--muted)] hover:text-foreground"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
