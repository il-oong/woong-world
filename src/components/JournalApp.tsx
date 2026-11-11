"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type State = {
  hasPassword: boolean;
  unlocked: boolean;
  dates: string[];
  /** Epoch ms when the unlock cookie expires. Null when locked. */
  expiresAt: number | null;
};

type Entry = { ts: number; text: string };
type Day = { date: string; entries: Entry[] };

const ERRORS: Record<string, string> = {
  not_connected: "구글 계정 연결이 필요합니다.",
  storage_not_configured: "서버 저장소가 설정되지 않았어요.",
  password_too_short: "패스워드는 4자 이상이어야 해요.",
  bad_password: "패스워드가 달라요.",
  no_password: "먼저 패스워드를 설정해야 해요.",
  rate_limited: "시도가 너무 잦아요. 15분 뒤 다시 시도해 주세요.",
  locked: "잠겨 있어요. 패스워드를 다시 입력해 주세요.",
  empty: "내용이 비어있어요.",
  too_long: "한 번에 2만 자를 넘길 수 없어요.",
  day_full: "하루 100개가 꽉 찼어요. 기존 글을 지우고 다시 시도하세요.",
  not_found: "항목을 찾지 못했어요.",
  exists: "이미 패스워드가 있어요.",
  busy: "다른 곳에서 동시에 저장 중이에요. 잠시 후 다시 시도해 주세요.",
};

const describe = (code?: string) =>
  ERRORS[code ?? ""] ?? "요청을 처리하지 못했습니다.";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function JournalApp() {
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(todayIso());

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch("/api/journal?op=state", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        hasPassword?: boolean;
        unlocked?: boolean;
        dates?: string[];
        expiresAt?: number;
        error?: string;
      };
      if (!res.ok) {
        setLoadError(describe(data.error));
        return;
      }
      setLoadError(null);
      setState({
        hasPassword: Boolean(data.hasPassword),
        unlocked: Boolean(data.unlocked),
        dates: Array.isArray(data.dates) ? data.dates : [],
        expiresAt:
          typeof data.expiresAt === "number" && data.expiresAt > 0
            ? data.expiresAt
            : null,
      });
    } catch {
      setLoadError("네트워크 오류가 발생했어요.");
    }
  }, []);

  useEffect(() => {
    // Initial fetch; setState inside is intentional for mount-time load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshState();
  }, [refreshState]);

  if (loadError) {
    return <p className="text-sm text-red-400">{loadError}</p>;
  }
  if (!state) {
    return <p className="text-sm text-[var(--muted)]">불러오는 중…</p>;
  }

  if (!state.hasPassword) {
    return <SetupPassword onDone={refreshState} />;
  }
  if (!state.unlocked) {
    return <UnlockPrompt onDone={refreshState} />;
  }
  return (
    <UnlockedView
      dates={state.dates}
      expiresAt={state.expiresAt}
      selected={selected}
      onSelect={setSelected}
      onChanged={refreshState}
    />
  );
}

// ── Setup ──────────────────────────────────────────────────────────────

function SetupPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  async function submit() {
    setErr(null);
    if (pw.length < 4) return setErr(describe("password_too_short"));
    if (pw !== pw2) return setErr("두 입력이 달라요.");
    if (!acknowledged) return setErr("아래 체크를 확인해 주세요.");
    setBusy(true);
    const res = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "set_password", password: pw }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setErr(describe(data.error));
    onDone();
  }

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border)] p-6 text-sm">
      <div>
        <h2 className="text-lg font-semibold">패스워드 설정</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          일기는 이 패스워드로 암호화됩니다. 서버도 복호화할 수 없어요. 패스워드를
          잊으면 기존 글은 영원히 열 수 없게 됩니다 — 어디든 꼭 적어두세요.
        </p>
      </div>
      <label className="block">
        <span className="text-xs text-[var(--muted)]">패스워드 (4자 이상)</span>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
          className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-xs text-[var(--muted)]">패스워드 확인</span>
        <input
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password"
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-3 py-2"
        />
      </label>
      <label className="flex items-start gap-2 text-xs text-[var(--muted)]">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          패스워드를 잊으면 기존 일기는 복구할 수 없다는 점을 이해합니다.
        </span>
      </label>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="w-full rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
      >
        {busy ? "설정 중…" : "패스워드 설정하고 들어가기"}
      </button>
    </div>
  );
}

// ── Unlock ─────────────────────────────────────────────────────────────

function UnlockPrompt({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReset, setShowReset] = useState(false);

  async function submit() {
    setErr(null);
    if (!pw) return;
    setBusy(true);
    const res = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "unlock", password: pw }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setErr(describe(data.error));
    onDone();
  }

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border)] p-6 text-sm">
      <div>
        <h2 className="text-lg font-semibold">🔒 잠겨있어요</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          패스워드를 입력하면 30분 동안 열려있어요.
        </p>
      </div>
      <label className="block">
        <span className="text-xs text-[var(--muted)]">패스워드</span>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-3 py-2"
        />
      </label>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={busy || !pw}
        className="w-full rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
      >
        {busy ? "확인 중…" : "열기"}
      </button>
      <div className="border-t border-[var(--border)] pt-3">
        <button
          type="button"
          onClick={() => setShowReset((v) => !v)}
          className="text-xs text-[var(--muted)] hover:text-foreground"
        >
          패스워드를 잊어버렸어요 {showReset ? "▲" : "▼"}
        </button>
        {showReset && <ResetPassword onDone={onDone} />}
      </div>
    </div>
  );
}

function ResetPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmPhrase = "기존 일기 포기";

  async function submit() {
    setErr(null);
    if (pw.length < 4) return setErr(describe("password_too_short"));
    if (pw !== pw2) return setErr("두 입력이 달라요.");
    if (typed.trim() !== confirmPhrase) {
      return setErr(`확인을 위해 "${confirmPhrase}"를 정확히 입력해 주세요.`);
    }
    setBusy(true);
    const res = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "reset_password", password: pw }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setErr(describe(data.error));
    onDone();
  }

  return (
    <div className="mt-3 space-y-3 rounded border border-red-500/30 bg-red-500/5 p-4 text-xs">
      <p className="text-red-200">
        ⚠️ 리셋하면 지금까지 쓴 글은 <b>복구할 수 없게</b> 됩니다. 새 패스워드로
        처음부터 다시 시작하는 셈이에요.
      </p>
      <label className="block">
        <span className="text-[var(--muted)]">새 패스워드</span>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-[var(--muted)]">새 패스워드 확인</span>
        <input
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-[var(--muted)]">
          확인을 위해 <b className="text-red-300">{confirmPhrase}</b>을 입력하세요
        </span>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-3 py-2"
        />
      </label>
      {err && <p className="text-red-400">{err}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="w-full rounded bg-red-500 px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {busy ? "리셋 중…" : "기존 글 포기하고 새로 시작"}
      </button>
    </div>
  );
}

// ── Unlocked (calendar + day) ─────────────────────────────────────────

function UnlockedView({
  dates,
  expiresAt,
  selected,
  onSelect,
  onChanged,
}: {
  dates: string[];
  expiresAt: number | null;
  selected: string;
  onSelect: (date: string) => void;
  onChanged: () => void;
}) {
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const datesSet = useMemo(() => new Set(dates), [dates]);
  // Request id guards against a late response from a previously selected
  // date overwriting the day the user is now looking at.
  const requestSeq = useRef(0);

  const loadDay = useCallback(
    async (date: string) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/journal?op=day&date=${encodeURIComponent(date)}`,
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as {
          day?: Day;
          error?: string;
        };
        if (seq !== requestSeq.current) return; // user already moved on
        if (!res.ok) {
          // A 401 here means the cookie expired mid-session. Re-fetch state
          // so the UI returns to the locked view instead of showing a stale
          // error on top of plaintext entries.
          if (res.status === 401) {
            setDay(null);
            onChanged();
            return;
          }
          setError(describe(data.error));
          setDay(null);
        } else {
          setDay(data.day ?? { date, entries: [] });
        }
      } catch {
        if (seq !== requestSeq.current) return;
        setError("네트워크 오류가 발생했어요.");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [onChanged],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDay(selected);
  }, [selected, loadDay]);

  // Auto-lock: when the unlock cookie expires, flip back to the locked
  // view so plaintext entries stop being visible in an unattended tab.
  useEffect(() => {
    if (!expiresAt) return;
    const ms = expiresAt - Date.now();
    if (ms <= 0) {
      onChanged();
      return;
    }
    const id = setTimeout(() => {
      onChanged();
    }, ms);
    return () => clearTimeout(id);
  }, [expiresAt, onChanged]);

  async function lock() {
    await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "lock" }),
    });
    onChanged();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-xs">
        <p className="text-[var(--muted)]">
          열려있어요 · 30분 뒤 자동으로 다시 잠겨요
        </p>
        <button
          type="button"
          onClick={lock}
          className="rounded border border-[var(--border)] px-3 py-1 text-[var(--muted)] hover:text-foreground"
        >
          🔒 지금 잠그기
        </button>
      </div>

      <MonthCalendar
        datesSet={datesSet}
        selected={selected}
        onSelect={onSelect}
      />

      <DayView
        day={day}
        date={selected}
        loading={loading}
        error={error}
        onChanged={() => {
          void loadDay(selected);
          onChanged();
        }}
      />
    </div>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function MonthCalendar({
  datesSet,
  selected,
  onSelect,
}: {
  datesSet: Set<string>;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const [y, m] = selected.split("-").map(Number);
  const [year, setYear] = useState(y);
  const [month, setMonth] = useState(m); // 1-indexed

  useEffect(() => {
    // Sync internal nav when the selected day jumps to another month.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYear(y);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMonth(m);
  }, [y, m]);

  const first = new Date(year, month - 1, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = todayIso();

  const cells: ({ date: string; day: number } | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${year}-${pad(month)}-${pad(d)}`, day: d });
  }

  function prevMonth() {
    const nextMonth = month === 1 ? 12 : month - 1;
    const nextYear = month === 1 ? year - 1 : year;
    setMonth(nextMonth);
    setYear(nextYear);
  }
  function nextMonth() {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    setMonth(nm);
    setYear(ny);
  }

  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="rounded px-2 py-1 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
        >
          ‹
        </button>
        <span className="font-mono text-sm">
          {year}.{pad(month)}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="rounded px-2 py-1 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--muted)]">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`b-${i}`} />;
          const has = datesSet.has(cell.date);
          const isSelected = cell.date === selected;
          const isToday = cell.date === today;
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onSelect(cell.date)}
              className={`flex aspect-square flex-col items-center justify-center rounded text-xs transition ${
                isSelected
                  ? "bg-[var(--accent)] text-black"
                  : "text-foreground hover:bg-white/5"
              }`}
            >
              <span className={isToday && !isSelected ? "font-bold" : ""}>
                {cell.day}
              </span>
              <span
                className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                  has
                    ? isSelected
                      ? "bg-black/60"
                      : "bg-[var(--accent)]"
                    : "bg-transparent"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────────────────

function DayView({
  day,
  date,
  loading,
  error,
  onChanged,
}: {
  day: Day | null;
  date: string;
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  async function append() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setWriteError(null);
    const res = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "append", date, text }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setWriteError(describe(data.error));
    setDraft("");
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">
          {date} <span className="text-[var(--muted)]">쏟아내기</span>
        </h2>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="오늘 있었던 일, 지금 드는 감정, 떠오르는 생각 — 정돈하지 말고 그냥 쓰세요"
          rows={5}
          maxLength={20_000}
          className="mt-2 w-full resize-y rounded border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-[var(--muted)]">
            {draft.length.toLocaleString()} / 20,000자
          </span>
          <button
            type="button"
            onClick={append}
            disabled={busy || !draft.trim()}
            className="rounded bg-[var(--accent)] px-4 py-2 text-xs font-medium text-black disabled:opacity-40"
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
        {writeError && <p className="mt-1 text-xs text-red-400">{writeError}</p>}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs text-[var(--muted)]">이 날 기록</h3>
        {loading && <p className="text-xs text-[var(--muted)]">불러오는 중…</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!loading && !error && (!day || day.entries.length === 0) && (
          <p className="text-xs text-[var(--muted)]">아직 비어있어요.</p>
        )}
        {!loading && day && day.entries.length > 0 && (
          <div className="space-y-2">
            {day.entries
              .slice()
              .sort((a, b) => a.ts - b.ts)
              .map((entry) => (
                <EntryCard
                  key={entry.ts}
                  entry={entry}
                  date={date}
                  onChanged={onChanged}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EntryCard({
  entry,
  date,
  onChanged,
}: {
  entry: Entry;
  date: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const time = new Date(entry.ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  async function save() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "update", date, ts: entry.ts, text: draft }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setErr(describe(data.error));
    setEditing(false);
    onChanged();
  }

  async function remove() {
    if (!confirm("이 기록을 지울까요?")) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "delete", date, ts: entry.ts }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setErr(describe(data.error));
    onChanged();
  }

  if (editing) {
    return (
      <div className="rounded border border-[var(--border)] p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          maxLength={20_000}
          className="w-full resize-y rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
        />
        {err && <p className="mt-1 text-xs text-red-400">{err}</p>}
        <div className="mt-2 flex justify-end gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(entry.text);
              setErr(null);
            }}
            disabled={busy}
            className="rounded px-3 py-1 text-[var(--muted)] hover:text-foreground"
          >
            취소
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !draft.trim()}
            className="rounded bg-[var(--accent)] px-3 py-1 font-medium text-black disabled:opacity-40"
          >
            저장
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-[var(--border)] p-3">
      <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--muted)]">
        <span className="font-mono">{time}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="hover:text-foreground"
          >
            수정
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="hover:text-red-300"
          >
            삭제
          </button>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{entry.text}</p>
      {err && <p className="mt-1 text-xs text-red-400">{err}</p>}
    </div>
  );
}
