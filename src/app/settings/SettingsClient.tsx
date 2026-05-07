"use client";

import { useEffect, useState } from "react";

type EnvStatus = {
  key: string;
  label: string;
  group: string;
  set: boolean;
  required: boolean;
};

const GUIDE: Record<string, { desc: string; link?: string; hint?: string }> = {
  SESSION_SECRET:           { desc: "세션 쿠키 암호화에 사용됩니다.", hint: "openssl rand -base64 32" },
  GOOGLE_CLIENT_ID:         { desc: "Google Calendar 연동에 필요합니다.", link: "https://console.cloud.google.com/apis/credentials" },
  GOOGLE_CLIENT_SECRET:     { desc: "Google OAuth 인증에 필요합니다.", link: "https://console.cloud.google.com/apis/credentials" },
  GOOGLE_REDIRECT_URI:      { desc: "로컬: http://localhost:3000/api/google/callback\nVercel: https://도메인/api/google/callback" },
  UPSTASH_REDIS_REST_URL:   { desc: "계획, 알림 구독 저장에 사용됩니다.", link: "https://console.upstash.com" },
  UPSTASH_REDIS_REST_TOKEN: { desc: "Upstash Redis 인증 토큰입니다.", link: "https://console.upstash.com" },
  GEMINI_API_KEY:           { desc: "AI 비서·계획 리뷰에 사용됩니다.", link: "https://aistudio.google.com/app/apikey" },
  GITHUB_TOKEN:             { desc: "허브에서 비공개 레포 정보를 가져올 때 필요합니다.", link: "https://github.com/settings/tokens" },
  BLOB_READ_WRITE_TOKEN:    { desc: "AI 비서 파일 업로드에 사용됩니다.", link: "https://vercel.com/dashboard/stores" },
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: { desc: "PWA 푸시 알림에 필요합니다. 이미 기본값이 설정되어 있습니다." },
  VAPID_PRIVATE_KEY:        { desc: "PWA 푸시 알림 서버 키입니다. 이미 기본값이 설정되어 있습니다." },
  APTHOME_API_KEY:          { desc: "청약홈 실시간 데이터를 가져옵니다. 없으면 데모 데이터를 사용합니다.", link: "https://www.data.go.kr" },
  CRON_SECRET:              { desc: "Vercel Cron 호출 인증에 사용됩니다 (선택)." },
};

const GROUP_ORDER = ["필수", "캘린더", "Redis", "AI", "허브", "파일", "푸시", "청약"];

export function SettingsClient() {
  const [items, setItems] = useState<EnvStatus[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json() as Promise<{ items: EnvStatus[] }>)
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  }, []);

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: items.filter((i) => i.group === g),
  })).filter((g) => g.items.length > 0);

  const missing = items.filter((i) => i.required && !i.set).length;
  const configured = items.filter((i) => i.set).length;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">woong / settings</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">환경 설정</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        각 기능에 필요한 API 키와 환경 변수 설정 상태입니다.
      </p>

      {!loading && (
        <div className={`mt-5 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
          missing > 0
            ? "border-red-500/20 bg-red-500/5 text-red-400"
            : "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
        }`}>
          <span className="text-lg">{missing > 0 ? "⚠️" : "✅"}</span>
          <span>
            {missing > 0
              ? `필수 변수 ${missing}개 미설정`
              : `전체 ${configured}/${items.length}개 설정됨`}
          </span>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-xs text-[var(--muted)]">
        <p className="font-medium text-foreground">로컬 개발 설정 방법</p>
        <p className="mt-1">
          프로젝트 루트의{" "}
          <code className="rounded bg-white/5 px-1 font-mono">.env.local.example</code>
          을 복사해서{" "}
          <code className="rounded bg-white/5 px-1 font-mono">.env.local</code>
          로 저장하고 값을 채우세요.
        </p>
        <p className="mt-1.5">
          Vercel 배포는 대시보드 →{" "}
          <strong className="text-foreground">Settings → Environment Variables</strong>
          에 추가하면 됩니다.
        </p>
      </div>

      {loading ? (
        <div className="mt-8 py-10 text-center text-sm text-[var(--muted)]">불러오는 중...</div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {grouped.map(({ group, items: gItems }) => (
            <div key={group}>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">{group}</p>
              <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                {gItems.map((item, i) => {
                  const guide = GUIDE[item.key];
                  const isOpen = open === item.key;
                  return (
                    <div key={item.key} className={i !== 0 ? "border-t border-[var(--border)]" : ""}>
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : item.key)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${item.set ? "bg-emerald-400" : item.required ? "bg-red-400" : "bg-zinc-600"}`} />
                        <span className="flex-1 text-sm">{item.label}</span>
                        <code className="font-mono text-[10px] text-[var(--muted)]">{item.key}</code>
                        <span className={`text-xs ${item.set ? "text-emerald-400" : item.required ? "text-red-400" : "text-zinc-500"}`}>
                          {item.set ? "설정됨" : item.required ? "필수" : "미설정"}
                        </span>
                        <span className="text-[var(--muted)]">{isOpen ? "▲" : "▼"}</span>
                      </button>
                      {isOpen && guide && (
                        <div className="border-t border-[var(--border)] bg-black/20 px-4 py-3 text-xs text-[var(--muted)]">
                          <p className="whitespace-pre-line leading-relaxed">{guide.desc}</p>
                          {guide.hint && (
                            <code className="mt-2 block rounded bg-black/30 px-2 py-1.5 font-mono text-[11px] text-[var(--accent)]">
                              {guide.hint}
                            </code>
                          )}
                          {guide.link && (
                            <a
                              href={guide.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                            >
                              발급 받으러 가기 ↗
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 text-xs text-[var(--muted)]">
        <p className="font-medium text-foreground">Google Calendar 로그인이 안 될 때</p>
        <ol className="mt-2 flex flex-col gap-1.5 leading-relaxed">
          <li>1. <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">Google Cloud Console</a> → OAuth 2.0 클라이언트 ID 클릭</li>
          <li>2. <strong className="text-foreground">승인된 리디렉션 URI</strong>에 아래 추가:</li>
          <li className="ml-4">
            <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              {typeof window !== "undefined" ? `${window.location.origin}/api/google/callback` : "https://도메인/api/google/callback"}
            </code>
          </li>
          <li>3. <strong className="text-foreground">GOOGLE_REDIRECT_URI</strong> 환경 변수를 위 주소와 동일하게 설정</li>
        </ol>
      </div>
    </div>
  );
}
