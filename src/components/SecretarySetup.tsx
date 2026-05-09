"use client";

import { useState } from "react";
import { VOICES, type SecretaryProfile, type VoiceId } from "@/lib/secretary";

export function SecretarySetup({
  onSave,
  onClose,
  initialProfile,
}: {
  onSave: (profile: SecretaryProfile) => void;
  onClose?: () => void;
  initialProfile?: SecretaryProfile;
}) {
  const isEditing = Boolean(initialProfile);
  const [name, setName] = useState(initialProfile?.name ?? "");
  const [voiceId, setVoiceId] = useState<VoiceId>(
    initialProfile?.voiceId ?? "ko-KR-Wavenet-A",
  );
  const [briefingHour, setBriefingHour] = useState(
    initialProfile?.briefingHour ?? 8,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) { setError("비서 이름을 입력해주세요."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/secretary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          voiceId,
          briefingHour,
          briefingMinute: 0,
        }),
      });
      const data = (await res.json()) as { profile?: SecretaryProfile; error?: string };
      if (!res.ok) throw new Error(data.error ?? "저장 실패");
      onSave(data.profile!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[#101015] p-8 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
              biseo / {isEditing ? "settings" : "setup"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              {isEditing ? "비서 설정" : "비서를 소개해주세요"}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {isEditing
                ? "이름, 목소리, 브리핑 시간을 변경할 수 있습니다."
                : "이름과 목소리를 설정하면 매일 브리핑해드립니다."}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="ml-4 mt-1 rounded-md p-1 text-[var(--muted)] hover:bg-white/5 hover:text-foreground transition"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs text-[var(--muted)]">비서 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 리아, 지수, 아린"
              maxLength={20}
              className="w-full rounded-lg border border-[var(--border)] bg-white/5 px-3 py-2.5 text-sm text-foreground placeholder:text-[var(--muted)] focus:border-[var(--accent)]/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-[var(--muted)]">목소리</label>
            <div className="grid grid-cols-2 gap-2">
              {VOICES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVoiceId(v.id)}
                  className="rounded-lg border px-3 py-2 text-left text-xs transition"
                  style={{
                    borderColor: voiceId === v.id ? "var(--accent)" : "var(--border)",
                    background:
                      voiceId === v.id
                        ? "rgba(94,234,212,0.08)"
                        : "rgba(255,255,255,0.03)",
                    color: voiceId === v.id ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-[var(--muted)]">
              브리핑 시간
            </label>
            <select
              value={briefingHour}
              onChange={(e) => setBriefingHour(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--border)] bg-[#101015] px-3 py-2.5 text-sm text-foreground focus:border-[var(--accent)]/60 focus:outline-none"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="mt-2 w-full rounded-lg bg-[var(--accent)] py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "저장 중..." : isEditing ? "저장" : "시작하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
