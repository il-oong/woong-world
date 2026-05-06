"use client";

import { useEffect, useState, useCallback } from "react";
import type { CheongakItem } from "@/app/api/cheongak/route";

type Profile = {
  name: string;
  region: string;
  isHomeless: boolean;
  homelessYears: number;
  savingsMonths: number;
  dependents: number;
  income: "low" | "mid" | "high";
  preferredAreas: string[];
};

const DEFAULT_PROFILE: Profile = {
  name: "",
  region: "전체",
  isHomeless: true,
  homelessYears: 3,
  savingsMonths: 24,
  dependents: 0,
  income: "mid",
  preferredAreas: [],
};

// 가점제 점수 계산 (최대 84점)
function calcGajeom(p: Profile): number {
  // 무주택 기간 점수 (최대 32점)
  const homelessScore = p.isHomeless
    ? Math.min(32, p.homelessYears <= 0 ? 2 : p.homelessYears >= 15 ? 32 : 2 + Math.floor(p.homelessYears) * 2)
    : 0;

  // 부양가족 수 점수 (최대 35점: 0명=5, 1명=10, ... 6명 이상=35)
  const depScore = Math.min(35, 5 + Math.min(p.dependents, 6) * 5);

  // 청약통장 가입기간 점수 (최대 17점)
  const years = p.savingsMonths / 12;
  const savingsScore = years < 1 ? 1
    : years < 2 ? 2
    : years < 3 ? 3
    : years < 4 ? 4
    : years < 5 ? 5
    : years < 6 ? 6
    : years < 7 ? 7
    : years < 8 ? 8
    : years < 9 ? 9
    : years < 10 ? 10
    : years < 11 ? 11
    : years < 12 ? 12
    : years < 13 ? 13
    : years < 14 ? 14
    : years < 15 ? 15
    : 17;

  return homelessScore + depScore + savingsScore;
}

const REGIONS = ["전체", "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
const AREAS = ["39㎡", "49㎡", "59㎡", "74㎡", "84㎡", "101㎡", "114㎡", "120㎡ 이상"];

function loadProfile(): Profile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const s = localStorage.getItem("cheongak-profile");
    return s ? { ...DEFAULT_PROFILE, ...(JSON.parse(s) as Partial<Profile>) } : DEFAULT_PROFILE;
  } catch { return DEFAULT_PROFILE; }
}

function saveProfile(p: Profile) {
  localStorage.setItem("cheongak-profile", JSON.stringify(p));
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function matchScore(item: CheongakItem, profile: Profile): number {
  let score = 0;
  if (profile.region !== "전체" && (item.region === profile.region || item.location.includes(profile.region))) score += 3;
  if (profile.isHomeless && item.conditions.some((c) => c.includes("무주택"))) score += 2;
  if (profile.savingsMonths >= 12 && item.conditions.some((c) => c.includes("12개월"))) score += 1;
  if (profile.savingsMonths >= 6 && item.conditions.some((c) => c.includes("6개월"))) score += 1;
  if (profile.preferredAreas.length > 0 && item.areas.some((a) => profile.preferredAreas.includes(a))) score += 2;
  return score;
}

type PushState = "unsupported" | "denied" | "unsubscribed" | "subscribed";

export function CheongakClient() {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [editingProfile, setEditingProfile] = useState(false);
  const [draft, setDraft] = useState<Profile>(DEFAULT_PROFILE);
  const [items, setItems] = useState<CheongakItem[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pushState, setPushState] = useState<PushState>("unsubscribed");
  const [pushLoading, setPushLoading] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    const p = loadProfile();
    setProfile(p);
    setDraft(p);
    setProfileLoaded(true);
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported");
    }
  }, []);

  useEffect(() => {
    if (!profileLoaded) return;
    setLoading(true);
    const region = profile.region !== "전체" ? profile.region : "";
    const url = region ? `/api/cheongak?region=${encodeURIComponent(region)}` : "/api/cheongak";
    fetch(url)
      .then((r) => r.json() as Promise<{ items: CheongakItem[]; isDemo: boolean }>)
      .then((d) => {
        setItems(d.items);
        setIsDemo(d.isDemo);
      })
      .finally(() => setLoading(false));
  }, [profile.region, profileLoaded]);

  useEffect(() => {
    if (pushState === "unsupported" || typeof window === "undefined") return;
    if (Notification.permission === "denied") { setPushState("denied"); return; }
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setPushState(sub ? "subscribed" : "unsubscribed");
    }).catch(() => {});
  }, [pushState]);

  const subscribePush = useCallback(async () => {
    setPushLoading(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setPushState("denied"); return; }
      const reg = await navigator.serviceWorker.ready;
      const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!pub) { alert("VAPID 키가 설정되지 않았습니다."); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8(pub),
      });
      const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subJson),
      });
      setPushState("subscribed");
    } finally {
      setPushLoading(false);
    }
  }, []);

  const unsubscribePush = useCallback(async () => {
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushState("unsubscribed");
    } finally {
      setPushLoading(false);
    }
  }, []);

  const saveAndClose = () => {
    setProfile(draft);
    saveProfile(draft);
    setEditingProfile(false);
  };

  const gajeom = calcGajeom(profile);

  const scored = [...items]
    .map((item) => ({ item, score: matchScore(item, profile) }))
    .sort((a, b) => b.score - a.score || new Date(a.item.startDate).getTime() - new Date(b.item.startDate).getTime());

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
            woong / cheongak
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">청약알리미 🏠</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            내 조건에 맞는 청약만 골라서 알려드려요
          </p>
          {profile.isHomeless && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-1.5 text-xs">
              <span className="text-[var(--muted)]">예상 가점</span>
              <span className="font-mono text-lg font-bold text-[var(--accent)]">{gajeom}</span>
              <span className="text-[var(--muted)]">/ 84점</span>
              <GajeomBar score={gajeom} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <PushButton state={pushState} loading={pushLoading} onSubscribe={subscribePush} onUnsubscribe={unsubscribePush} />
          <button
            onClick={() => { setDraft(profile); setEditingProfile(true); }}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm transition hover:border-[var(--accent)]/50 hover:text-foreground"
          >
            ⚙️ 내 조건
          </button>
        </div>
      </div>

      {editingProfile && (
        <ProfileModal
          draft={draft}
          setDraft={setDraft}
          onSave={saveAndClose}
          onClose={() => setEditingProfile(false)}
        />
      )}

      {isDemo && (
        <div className="mb-5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300/90">
          <span className="font-medium">데모 데이터입니다.</span>{" "}
          실제 청약 정보를 보려면{" "}
          <code className="rounded bg-black/30 px-1 font-mono">APTHOME_API_KEY</code>
          를 환경 변수에 추가하세요.{" "}
          <a href="https://www.data.go.kr" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-200">data.go.kr</a>
          에서 &ldquo;청약홈 분양정보&rdquo; 검색 후 신청하면 됩니다.
        </div>
      )}

      <div className="mb-4 flex items-center gap-2 text-xs text-[var(--muted)]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        {profile.region !== "전체" ? `${profile.region} 지역` : "전국"} ·{" "}
        {scored.length}건
        {profile.name && ` · ${profile.name}님 맞춤`}
      </div>

      {loading ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center text-sm text-[var(--muted)]">
          청약 정보 불러오는 중...
        </div>
      ) : scored.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center text-sm text-[var(--muted)]">
          조건에 맞는 청약이 없습니다
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {scored.map(({ item, score }) => (
            <CheongakCard key={item.id} item={item} score={score} />
          ))}
        </div>
      )}
    </div>
  );
}

function PushButton({
  state, loading, onSubscribe, onUnsubscribe,
}: {
  state: PushState; loading: boolean;
  onSubscribe: () => void; onUnsubscribe: () => void;
}) {
  if (state === "unsupported") return null;
  if (state === "denied") return (
    <span className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
      알림 차단됨
    </span>
  );
  if (state === "subscribed") return (
    <button
      onClick={onUnsubscribe}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-sm text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
    >
      🔔 알림 ON
    </button>
  );
  return (
    <button
      onClick={onSubscribe}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:text-foreground"
    >
      🔕 알림 OFF
    </button>
  );
}

function CheongakCard({ item, score }: { item: CheongakItem; score: number }) {
  const days = daysUntil(item.startDate);
  const endDays = daysUntil(item.endDate);
  const isOpen = days <= 0 && endDays >= 0;
  const isSoon = days > 0 && days <= 7;
  const isPast = endDays < 0;

  return (
    <div className={`group flex flex-col gap-3 rounded-xl border p-5 transition ${
      isPast ? "opacity-50 border-[var(--border)]" :
      isOpen ? "border-emerald-500/40 bg-emerald-500/5" :
      isSoon ? "border-amber-500/30 bg-amber-500/5" :
      "border-[var(--border)] bg-[var(--card)]"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent)]">
              {item.region} · {item.type === "apt" ? "아파트" : item.type === "officetel" ? "오피스텔" : "빌라"}
            </span>
            {score >= 3 && (
              <span className="rounded-md bg-[var(--accent)]/20 px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
                맞춤
              </span>
            )}
          </div>
          <h3 className="mt-1 font-medium leading-snug">{item.name}</h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{item.location}</p>
        </div>
        <div className="shrink-0 text-right">
          {isPast ? (
            <span className="text-xs text-[var(--muted)]">마감</span>
          ) : isOpen ? (
            <span className="text-xs font-medium text-emerald-400">접수중 D-{endDays}</span>
          ) : (
            <span className={`text-xs font-medium ${isSoon ? "text-amber-400" : "text-[var(--muted)]"}`}>
              D-{days}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-md bg-white/5 px-2 py-0.5 text-[var(--muted)]">
          {formatDate(item.startDate)}~{formatDate(item.endDate)} 접수
        </span>
        {item.winDate && (
          <span className="rounded-md bg-white/5 px-2 py-0.5 text-[var(--muted)]">
            {formatDate(item.winDate)} 당첨
          </span>
        )}
        <span className="rounded-md bg-white/5 px-2 py-0.5 text-[var(--muted)]">
          {item.supply.toLocaleString()}세대
        </span>
        {item.minPrice && (
          <span className="rounded-md bg-white/5 px-2 py-0.5 text-[var(--muted)]">
            {(item.minPrice / 10000).toFixed(0)}억~{item.maxPrice ? (item.maxPrice / 10000).toFixed(0) + "억" : ""}
          </span>
        )}
      </div>

      {item.areas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.areas.map((a) => (
            <span key={a} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-[var(--muted)]">{a}</span>
          ))}
        </div>
      )}

      {item.conditions.length > 0 && (
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          {item.conditions.join(" · ")}
        </p>
      )}

      <div className="flex gap-2">
        <a
          href={item.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-center text-xs font-medium text-black transition hover:bg-[var(--accent)]/90"
        >
          청약 신청하기 ↗
        </a>
        <a
          href="https://www.applyhome.co.kr"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:text-foreground"
          title="청약홈"
        >
          청약홈
        </a>
      </div>

      {item.source === "demo" && (
        <p className="text-[10px] text-[var(--muted)]/60">* 데모 데이터</p>
      )}
    </div>
  );
}

function ProfileModal({
  draft, setDraft, onSave, onClose,
}: {
  draft: Profile;
  setDraft: (p: Profile) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const toggle = (field: keyof Pick<Profile, "preferredAreas">, val: string) => {
    setDraft({
      ...draft,
      preferredAreas: draft.preferredAreas.includes(val)
        ? draft.preferredAreas.filter((v) => v !== val)
        : [...draft.preferredAreas, val],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-[#0b0b0f] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-5 py-3">
          <h2 className="text-sm font-medium">내 청약 조건</h2>
          <button onClick={onClose} className="rounded-md p-1 text-[var(--muted)] hover:text-foreground">✕</button>
        </header>
        <div className="flex flex-col gap-4 px-5 py-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--muted)]">이름 (선택)</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="홍길동"
              className="rounded-lg border border-[var(--border)] bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--muted)]">관심 지역</span>
            <select
              value={draft.region}
              onChange={(e) => setDraft({ ...draft, region: e.target.value })}
              className="rounded-lg border border-[var(--border)] bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
            >
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--muted)]">무주택 여부</span>
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setDraft({ ...draft, isHomeless: v })}
                  className={`flex-1 rounded-lg border py-2 text-sm transition ${
                    draft.isHomeless === v
                      ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/30"
                  }`}
                >
                  {v ? "무주택" : "유주택"}
                </button>
              ))}
            </div>
          </div>

          {draft.isHomeless && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[var(--muted)]">무주택 기간: <strong>{draft.homelessYears}년</strong> (가점 최대 32점)</span>
              <input
                type="range" min={0} max={15} step={1}
                value={draft.homelessYears}
                onChange={(e) => setDraft({ ...draft, homelessYears: parseInt(e.target.value) })}
                className="accent-[var(--accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--muted)]">
                <span>0년</span><span>5년</span><span>10년</span><span>15년+</span>
              </div>
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--muted)]">부양가족 수: <strong>{draft.dependents}명</strong> (가점 최대 35점)</span>
            <input
              type="range" min={0} max={6} step={1}
              value={draft.dependents}
              onChange={(e) => setDraft({ ...draft, dependents: parseInt(e.target.value) })}
              className="accent-[var(--accent)]"
            />
            <div className="flex justify-between text-[10px] text-[var(--muted)]">
              <span>0명</span><span>1명</span><span>2명</span><span>3명</span><span>4명</span><span>5명</span><span>6명+</span>
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--muted)]">청약통장 납입횟수: <strong>{draft.savingsMonths}개월</strong> (가점 최대 17점)</span>
            <input
              type="range" min={0} max={180} step={6}
              value={draft.savingsMonths}
              onChange={(e) => setDraft({ ...draft, savingsMonths: parseInt(e.target.value) })}
              className="accent-[var(--accent)]"
            />
            <div className="flex justify-between text-[10px] text-[var(--muted)]">
              <span>0</span><span>24</span><span>60</span><span>120</span><span>180개월</span>
            </div>
          </label>

          <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-2.5 text-xs">
            <span className="text-[var(--muted)]">예상 가점 </span>
            <span className="font-mono text-base font-bold text-[var(--accent)]">{calcGajeom(draft)}</span>
            <span className="text-[var(--muted)]"> / 84점</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--muted)]">소득 기준</span>
            <div className="flex gap-2">
              {(["low", "mid", "high"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDraft({ ...draft, income: v })}
                  className={`flex-1 rounded-lg border py-2 text-sm transition ${
                    draft.income === v
                      ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/30"
                  }`}
                >
                  {v === "low" ? "저소득" : v === "mid" ? "중간" : "일반"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--muted)]">선호 평형 (복수 선택)</span>
            <div className="flex flex-wrap gap-1.5">
              {AREAS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggle("preferredAreas", a)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                    draft.preferredAreas.includes(a)
                      ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/30"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-[var(--border)] px-5 py-3">
          <button
            onClick={onSave}
            className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-medium text-black hover:bg-[var(--accent)]/90"
          >
            저장하기
          </button>
        </div>
      </div>
    </div>
  );
}

function GajeomBar({ score }: { score: number }) {
  const pct = Math.round((score / 84) * 100);
  const color = pct >= 60 ? "#34d399" : pct >= 40 ? "#fbbf24" : "#a78bfa";
  return (
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function urlBase64ToUint8(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}
