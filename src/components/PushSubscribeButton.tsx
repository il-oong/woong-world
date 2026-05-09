"use client";

import { useEffect, useState } from "react";

const DEVICE_ID_KEY = "biseo-device-id";

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  return new Uint8Array(Array.from(raw, (c) => c.charCodeAt(0)));
}

type Props = {
  briefingHour: number;
};

type Status = "checking" | "unsupported" | "denied" | "unsubscribed" | "subscribed";

export function PushSubscribeButton({ briefingHour }: Props) {
  const [status, setStatus] = useState<Status>("checking");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    // 현재 구독 여부 확인
    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription(),
    ).then((sub) => {
      setStatus(sub ? "subscribed" : "unsubscribed");
    }).catch(() => setStatus("unsubscribed"));
  }, []);

  async function subscribe() {
    setLoading(true);
    try {
      const keyRes = await fetch("/api/push/subscribe");
      if (!keyRes.ok) throw new Error("push_not_configured");
      const { publicKey } = (await keyRes.json()) as { publicKey: string };

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      const deviceId = getOrCreateDeviceId();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          subscription: { endpoint: json.endpoint, keys: json.keys },
          briefingHour,
        }),
      });
      if (!res.ok) throw new Error("subscribe_failed");
      setStatus("subscribed");
    } catch (e) {
      if (Notification.permission === "denied") setStatus("denied");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      await sub?.unsubscribe();

      const deviceId = localStorage.getItem(DEVICE_ID_KEY);
      if (deviceId) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, briefingHour }),
        });
      }
      setStatus("unsubscribed");
    } catch {
      // 구독 해제 실패해도 로컬은 해제 처리
      setStatus("unsubscribed");
    } finally {
      setLoading(false);
    }
  }

  if (status === "checking") return null;

  if (status === "unsupported") {
    return (
      <p className="text-[11px] text-[var(--muted)]">
        이 브라우저는 알림을 지원하지 않습니다.
      </p>
    );
  }

  if (status === "denied") {
    return (
      <p className="text-[11px] text-amber-400/80">
        브라우저 알림이 차단됐습니다. 설정에서 허용해주세요.
      </p>
    );
  }

  if (status === "subscribed") {
    return (
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--accent)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          {String(briefingHour).padStart(2, "0")}:00 알림 설정됨
        </span>
        <button
          type="button"
          onClick={unsubscribe}
          disabled={loading}
          className="text-[11px] text-[var(--muted)] underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
        >
          {loading ? "..." : "해제"}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={subscribe}
      disabled={loading}
      className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:border-[var(--accent)]/40 hover:text-foreground disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {loading ? "설정 중..." : `${String(briefingHour).padStart(2, "0")}:00 브리핑 알림 받기`}
    </button>
  );
}
