"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  DISCLAIMER,
  CRISIS_TEXT,
  emptyWorkspace,
  splitBubbles,
  workspaceSchema,
  todayKorea,
  recordContext,
  reportText,
  reportHtml,
  relationshipReportHtml,
  relationshipReportBody,
  type RelationshipReport,
  type Workspace,
  type Message,
  type Thought,
  type Practice,
} from "@/lib/mental-health";
import {
  RELATIONSHIP_FILE_MAX_BYTES,
  RELATIONSHIP_MAX_LENGTH,
  relationshipForAi,
  relationshipText,
  relationshipChars,
} from "@/lib/mental-health-memory";
import styles from "./mental-health.module.css";
import { MomentSupport } from "./MomentSupport";
import { MemoryImport } from "./MemoryImport";

const tabs = [
  "오늘의 마음",
  "순간 도움",
  "상담 대화",
  "사고기록",
  "작은 실천",
  "보고서",
  "관계 기록",
  "기억·개인정보",
] as const;
const errors: Record<string, string> = {
  not_connected:
    "로그인이 만료되었습니다. 기록을 다운로드한 뒤 다시 로그인해 주세요.",
  account_changed:
    "로그인 계정이 바뀌었습니다. 이 화면의 기록을 다른 계정에 저장하지 않습니다. 새로고침해 주세요.",
  conflict:
    "다른 화면에서 저장하거나 삭제한 기록이 있습니다. 현재 기록을 다운로드한 뒤 새로고침해 주세요.",
  ai_unavailable:
    "상담 AI의 개인정보 보호 설정이 아직 준비되지 않았습니다. 기록과 다운로드는 이용할 수 있어요.",
  storage_unavailable:
    "암호화 저장소에 연결할 수 없습니다. 현재 화면의 기록은 유지됩니다.",
  rate_limited: "요청이 많습니다. 1분 후 다시 시도해 주세요.",
  ai_failed:
    "AI 응답을 완료하지 못했습니다. 입력은 유지됩니다. 잠시 후 다시 시도해 주세요.",
  invalid_input:
    "입력 분량이 한도를 넘었거나 형식이 맞지 않습니다. 기록을 내보내고 분량을 줄여 주세요.",
};
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function TextField({
  label,
  value,
  onChange,
  maxLength = 2000,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  maxLength?: number;
}) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        rows={3}
      />
    </Field>
  );
}
function Typing({ label }: { label: boolean }) {
  return (
    <article
      className={`${styles.aiMessage} ${styles.typing}`}
      aria-label="마음결이 입력 중"
      role="status"
    >
      {label && <strong>마음결 · AI</strong>}
      <span className={styles.dots} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </article>
  );
}
function Score({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Field label={`${label} · ${value}/10`}>
      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const newThought = () => ({
  situation: "",
  feeling: "",
  thought: "",
  evidence: "",
  against: "",
  alternative: "",
  before: 5,
  after: 5,
});

export function MentalHealthApp({ owner }: { owner: string }) {
  const [data, setData] = useState<Workspace>(emptyWorkspace);
  const [tab, setTab] = useState<(typeof tabs)[number]>("오늘의 마음");
  const [ready, setReady] = useState(false);
  const [storage, setStorage] = useState(false);
  const [ai, setAi] = useState(false);
  const [aiMissing, setAiMissing] = useState<string[]>([]);
  const [revision, setRevision] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [relReport, setRelReport] = useState<RelationshipReport | null>(null);
  const [relConsent, setRelConsent] = useState(false);
  const [pickDays, setPickDays] = useState<string[]>([]);
  const [logText, setLogText] = useState("");
  const [logDate, setLogDate] = useState(todayKorea());
  const [pending, setPending] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ at: number; n: number } | null>(null);
  const [momentBusy, setMomentBusy] = useState(false);
  const [momentDirty, setMomentDirty] = useState(false);
  const [momentVersion, setMomentVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const [consent, setConsent] = useState(false);
  const [memoryConsent, setMemoryConsent] = useState(false);
  const [recordConsent, setRecordConsent] = useState(false);
  const [relationshipConsent, setRelationshipConsent] = useState(true);
  const [help, setHelp] = useState(false);
  const [draft, setDraft] = useState("");
  const [mood, setMood] = useState(5);
  const [anxiety, setAnxiety] = useState(5);
  const [moodNote, setMoodNote] = useState("");
  const [thought, setThought] = useState(newThought);
  const [editingThought, setEditingThought] = useState<Thought | null>(null);
  const [kind, setKind] = useState<Practice["kind"]>("activity");
  const [plan, setPlan] = useState("");
  const [from, setFrom] = useState(() => todayKorea().slice(0, 8) + "01");
  const [to, setTo] = useState(todayKorea);
  const [analysis, setAnalysis] = useState("");
  const [reportDraft, setReportDraft] = useState("");
  const [reportPreview, setReportPreview] = useState(false);
  const [timerEnd, setTimerEnd] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [minutes, setMinutes] = useState(2);

  async function api(path = "", method = "GET", body?: unknown) {
    const response = await fetch("/api/mental-health" + path, {
      method,
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Mental-Owner": owner },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        errors[result.error] ||
          "요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    return result;
  }
  useEffect(() => {
    let active = true;
    fetch("/api/mental-health", {
      cache: "no-store",
      headers: { "X-Mental-Owner": owner },
    })
      .then(async (res) => {
        const result = await res.json();
        if (!res.ok)
          throw new Error(
            errors[result.error] || "기록을 불러오지 못했습니다.",
          );
        return result;
      })
      .then((result) => {
        if (!active) return;
        if (result.data) setData(workspaceSchema.parse(result.data));
        setRevision(result.revision);
        setExpiry(result.expiresAt);
        setStorage(result.storageReady);
        setAi(result.aiReady);
        setAiMissing(Array.isArray(result.aiMissing) ? result.aiMissing : []);
        setReady(true);
      })
      .catch((e) => {
        if (active) {
          setNotice(e.message);
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [owner]);
  useEffect(() => {
    if (
      !dirty &&
      !momentDirty &&
      !draft &&
      !moodNote &&
      !plan &&
      !Object.values(thought).some((v) => typeof v === "string" && v)
    )
      return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    const preventLink = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest("a");
      if (
        link?.href &&
        !link.download &&
        !link.href.startsWith("tel:") &&
        link.target !== "_blank" &&
        new URL(link.href).origin === location.origin
      ) {
        if (
          !confirm(
            "저장하지 않은 마음 기록이나 입력이 사라질 수 있습니다. 이동할까요?",
          )
        )
          event.preventDefault();
      }
    };
    document.addEventListener("click", preventLink, true);
    return () => {
      window.removeEventListener("beforeunload", prevent);
      document.removeEventListener("click", preventLink, true);
    };
  }, [dirty, momentDirty, draft, moodNote, plan, thought]);
  useEffect(() => {
    if (!timerEnd) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
      setSeconds(left);
      if (!left) {
        setTimerEnd(null);
        setNotice(
          "잠시 멈추는 시간이 끝났어요. 지금 필요한 행동을 스스로 선택해 보세요.",
        );
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timerEnd]);

  function update(next: Workspace) {
    const parsed = workspaceSchema.safeParse(next);
    if (!parsed.success) {
      setNotice(
        "기록 한도에 도달했습니다. 보고서를 다운로드하고 필요 없는 기록을 삭제해 주세요.",
      );
      return false;
    }
    setData(parsed.data);
    setDirty(true);
    setAnalysis("");
    setReportDraft("");
    setReportPreview(false);
    return true;
  }
  async function save() {
    if (
      !confirm(
        "현재 대화·기분·사고기록·실천·기억을 서버에 암호화해 30일간 저장할까요? 저장할 때마다 보관 기간이 새로 시작됩니다.",
      )
    )
      return;
    setBusy(true);
    try {
      const at = new Date().toISOString();
      const stamp = <T extends { savedAt?: string }>(x: T): T =>
        x.savedAt ? x : { ...x, savedAt: at };
      const stamped: Workspace = {
        ...data,
        messages: data.messages.map(stamp),
        moods: data.moods.map(stamp),
        thoughts: data.thoughts.map(stamp),
        practices: data.practices.map(stamp),
        relationshipLog: data.relationshipLog.map(stamp),
        relationshipSavedAt:
          data.relationship && !data.relationshipSavedAt
            ? at
            : data.relationshipSavedAt,
      };
      const result = await api("", "PUT", {
        consent: true,
        data: stamped,
        revision,
      });
      setData(stamped);
      setRevision(result.revision);
      setExpiry(result.expiresAt);
      setDirty(false);
      setNotice(
        "암호화 저장했습니다. 이후 변경은 다시 저장 버튼을 눌러 주세요.",
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function erase() {
    if (
      !confirm(
        "이 화면의 모든 마음 기록과 서버에 저장한 사본을 삭제할까요? 이미 다운로드한 파일과 AI 제공사 처리 기록은 별도로 관리해야 합니다.",
      )
    )
      return;
    setBusy(true);
    try {
      // Always attempt deletion; never claim deletion after an unavailable store.
      const result = await api("", "DELETE");
      setRevision(result.revision);
      setData(emptyWorkspace());
      setMomentVersion((v) => v + 1);
      setExpiry(null);
      setDirty(false);
      setAnalysis("");
      setDraft("");
      setMoodNote("");
      setThought(newThought());
      setEditingThought(null);
      setPlan("");
      setReportDraft("");
      setReportPreview(false);
      setConsent(false);
      setMemoryConsent(false);
      setReveal(null);
      setRecordConsent(false);
      setTimerEnd(null);
      setSeconds(0);
      setNotice(
        "앱 서버의 저장 사본과 현재 화면의 기록을 삭제했습니다. 다운로드 파일과 제공사 처리 기록은 이 삭제에 포함되지 않습니다.",
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const context = [
    memoryConsent && data.memory ? `내가 직접 작성한 기억: ${data.memory}` : "",
    relationshipConsent && (data.relationship || data.relationshipLog.length)
      ? `내가 직접 정리한 연애 관계 기록(이미 아는 사실로 쓰고 처음부터 다시 묻지 말 것):\n<자료>\n${relationshipForAi(relationshipText(data)).replace(/<\/?자료>/g, "")}\n</자료>`
      : "",
    recordConsent ? recordContext(data, todayKorea(), todayKorea()) : "",
  ]
    .filter(Boolean)
    .join("\n");
  const report = reportText(data, from, to, analysis);
  const revealText = reveal ? (data.messages[reveal.at]?.text ?? "") : "";
  useEffect(() => {
    if (!reveal) return;
    const parts = splitBubbles(revealText);
    if (reveal.n >= parts.length) return;
    const t = setTimeout(
      () => setReveal({ at: reveal.at, n: reveal.n + 1 }),
      Math.min(2200, 700 + (parts[reveal.n] ?? "").length * 28),
    );
    return () => clearTimeout(t);
  }, [reveal, revealText]);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy || !consent) return;
    if (data.messages.length > 77) {
      setNotice(
        "대화 80개 한도에 도달했습니다. 필요한 내용을 기억에 정리한 뒤 대화를 비워 주세요.",
      );
      return;
    }
    const messages: Message[] = [
      ...data.messages,
      { role: "user", text: draft.trim() },
    ];
    const sent = draft;
    setBusy(true);
    setNotice("");
    setPending(draft.trim());
    setDraft("");
    try {
      const result = await api("/ai", "POST", {
        mode: "chat",
        consent: true,
        messages: messages.slice(-24),
        context,
      });
      update({
        ...data,
        messages: [...messages, { role: "assistant", text: result.text }],
      });
      setReveal({ at: messages.length, n: 0 });
      if (result.safety) setHelp(true);
    } catch (e) {
      setDraft(sent);
      setNotice((e as Error).message);
    } finally {
      setPending(null);
      setBusy(false);
    }
  }
  async function analyzeRelationship() {
    if (!relConsent || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await api("/ai", "POST", {
        mode: "relationship",
        consent: true,
        messages: [],
        context: `<자료>\n${relationshipForAi(relationshipText(data)).replace(/<\/?자료>/g, "")}\n</자료>`,
      });
      try {
        setRelReport(JSON.parse(result.text) as RelationshipReport);
      } catch {
        throw new Error("보고서 형식이 올바르지 않아요. 다시 분석해 주세요.");
      }
      if (result.safety) setHelp(true);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function analyze() {
    if (!consent || from > to) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await api("/ai", "POST", {
        mode: "report",
        consent: true,
        messages: [],
        context: reportDraft,
      });
      if (result.safety) {
        setHelp(true);
        setNotice(result.text);
        return;
      }
      setAnalysis(result.text);
      setReportPreview(false);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function addMood(event: FormEvent) {
    event.preventDefault();
    const day = todayKorea();
    const existing = data.moods.find((m) => m.date === day);
    if (
      update({
        ...data,
        moods: [
          ...data.moods.filter((m) => m.date !== day),
          {
            id: existing?.id || crypto.randomUUID(),
            date: day,
            mood,
            anxiety,
            note: moodNote,
          },
        ],
      })
    ) {
      setMoodNote("");
      setNotice(
        "오늘의 기분을 화면에 기록했어요. 다음에 이어 보려면 암호화 저장을 눌러 주세요.",
      );
    }
  }
  function addThought(event: FormEvent) {
    event.preventDefault();
    if (!thought.situation.trim() || !thought.thought.trim()) {
      setNotice("상황과 떠오른 생각을 적어 주세요.");
      return;
    }
    const entry = {
      ...thought,
      id: editingThought?.id ?? crypto.randomUUID(),
      date: editingThought?.date ?? todayKorea(),
    };
    if (
      update({
        ...data,
        thoughts: editingThought
          ? data.thoughts.map((t) => (t.id === entry.id ? entry : t))
          : [...data.thoughts, entry],
      })
    ) {
      setThought(newThought());
      setEditingThought(null);
      setNotice("사고기록을 반영했어요. 감정이 바로 줄지 않아도 괜찮습니다.");
    }
  }
  function addPractice(event: FormEvent) {
    event.preventDefault();
    if (!plan.trim()) return;
    if (
      update({
        ...data,
        practices: [
          ...data.practices,
          {
            id: crypto.randomUUID(),
            date: todayKorea(),
            kind,
            plan,
            reflection: "",
            done: false,
          },
        ],
      })
    )
      setPlan("");
  }
  function changePeriod(which: "from" | "to", value: string) {
    if (which === "from") setFrom(value);
    else setTo(value);
    setAnalysis("");
    setReportPreview(false);
    setReportDraft("");
  }
  return (
    <main className={styles.app}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>심리치료 · AI 자기관리</p>
          <h1>마음결</h1>
          <p className={styles.lead}>
            마음을 알아차리고,
            <br />내 속도로 한 걸음.
          </p>
          <p>차분하게 듣고 함께 정리하는 나만의 공간</p>
        </div>
        <div className={styles.heroCard}>
          <span>오늘의 작은 약속</span>
          <strong>
            잘 설명하지 않아도
            <br />
            괜찮아요.
          </strong>
          <p>
            감정은 채점할 대상이 아니에요.
            <br />
            지금 느끼는 만큼만 남겨 보세요.
          </p>
        </div>
      </header>
      <p className={styles.disclaimer}>{DISCLAIMER}</p>
      <div className={styles.toolbar}>
        <button className={styles.primary} onClick={() => setTab("순간 도움")}>
          지금 불안해요
        </button>
        <span>
          {!ready
            ? "기록을 확인하는 중…"
            : dirty
              ? "● 화면에만 반영된 변경이 있어요"
              : expiry
                ? `저장됨 · ${new Date(expiry).toLocaleDateString("ko-KR")}까지 보관`
                : "현재 화면에서만 유지 · 새로고침하면 사라져요"}
        </span>
        <button disabled={!ready || busy || !storage} onClick={save}>
          암호화 저장 · 30일
        </button>
        <button onClick={() => setHelp(!help)} aria-expanded={help}>
          지금 도움이 필요해요
        </button>
      </div>
      {help && (
        <aside className={styles.help} aria-label="긴급 도움">
          <h2>안전이 먼저예요</h2>
          <p>{CRISIS_TEXT}</p>
          <a href="tel:+82109?oai_link_source=model_response_hotline">
            한국 자살예방상담전화 109
          </a>
          <p>
            다른 나라에 있다면 현지 긴급 서비스에 연락하세요. 이 앱의 자동
            감지는 위험을 놓칠 수 있습니다.
          </p>
          <a
            target="_blank"
            rel="noreferrer"
            href="https://www.129.go.kr/109?oai_link_source=model_response_hotline"
          >
            상담전화 안내
          </a>
        </aside>
      )}
      <p className={styles.status} role="status" aria-live="polite">
        {busy ? "처리 중이에요. 잠시만 기다려 주세요." : notice}
      </p>
      <nav className={styles.tabs} aria-label="마음결 메뉴">
        {tabs.map((t) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      <fieldset disabled={busy} className={styles.content}>
        <MomentSupport
          key={momentVersion}
          active={tab === "순간 도움"}
          aiReady={ai}
          aiMissing={aiMissing}
          recordReady={ready}
          owner={owner}
          memory={data.memory}
          onBusyChange={setMomentBusy}
          onDirtyChange={setMomentDirty}
          onRecord={(practice) =>
            update({
              ...data,
              practices: data.practices.some((p) => p.id === practice.id)
                ? data.practices.map((p) =>
                    p.id === practice.id ? { ...practice, done: p.done } : p,
                  )
                : [...data.practices, practice],
            })
          }
        />
      </fieldset>
      <fieldset disabled={!ready || busy} className={styles.content}>
        {tab === "오늘의 마음" && (
          <div className={styles.grid}>
            <section className={styles.card}>
              <p className={styles.eyebrow}>DAILY CHECK-IN</p>
              <h2>오늘, 어떤 마음인가요?</h2>
              <p>하루 한 번 기록하고 같은 날에는 수정할 수 있어요.</p>
              <form onSubmit={addMood}>
                <Score
                  label="기분 · 0 매우 힘듦 / 10 매우 좋음"
                  value={mood}
                  onChange={setMood}
                />
                <Score
                  label="불안 · 0 없음 / 10 매우 강함"
                  value={anxiety}
                  onChange={setAnxiety}
                />
                <TextField
                  label="오늘 마음에 영향을 준 일 (선택)"
                  value={moodNote}
                  onChange={setMoodNote}
                />
                <button className={styles.primary}>오늘의 기분 기록</button>
              </form>
            </section>
            <section className={styles.card}>
              <h2>최근 마음의 흐름</h2>
              <p>점수는 내 느낌을 나타낼 뿐, 진단 결과가 아니에요.</p>
              {!data.moods.length && (
                <p className={styles.empty}>
                  첫 기록을 남기면 이곳에서 변화를 볼 수 있어요.
                </p>
              )}
              {data.moods
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 14)
                .map((m) => (
                  <div key={m.id} className={styles.entry}>
                    <strong>{m.date}</strong>
                    <span>
                      기분 {m.mood} · 불안 {m.anxiety}
                    </span>
                    <meter
                      aria-label={`${m.date} 기분`}
                      min={0}
                      max={10}
                      value={m.mood}
                    />
                    <p>{m.note}</p>
                    <button
                      onClick={() => {
                        setMood(m.mood);
                        setAnxiety(m.anxiety);
                        setMoodNote(m.note);
                        setNotice(
                          "선택한 내용을 입력란에 가져왔어요. 기록 버튼을 누르면 오늘 날짜로 반영됩니다.",
                        );
                      }}
                    >
                      입력란에 가져오기
                    </button>
                    <button
                      onClick={() =>
                        update({
                          ...data,
                          moods: data.moods.filter((x) => x.id !== m.id),
                        })
                      }
                    >
                      기록 삭제
                    </button>
                  </div>
                ))}
            </section>
          </div>
        )}
        {tab === "상담 대화" && (
          <section className={styles.card}>
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.eyebrow}>A SPACE TO TALK</p>
                <h2>마음결과 이야기하기</h2>
              </div>
              <span className={styles.badge}>AI 자기관리 동반자</span>
            </div>
            <p>
              숙련된 상담자의 차분한 태도를 지향합니다. 실제 학위·임상 경력이
              있는 상담사는 아닙니다. 확답을 반복하기보다 사실과 해석을 함께
              살펴봐요.
            </p>
            {!ai && (
              <p className={styles.help}>
                AI 연결 준비가 필요합니다. 아래에서 입력을 준비하고 다른 메뉴의
                기록 기능을 이용할 수 있어요.
                {aiMissing.length > 0 &&
                  ` (서버 설정 필요: ${aiMissing.join(", ")})`}
              </p>
            )}
            <div className={styles.choices}>
              <label>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                최근 대화 최대 24개와 아래에서 선택한 내용을 Google Gemini로
                전송하는 데 동의합니다. 제공사의 처리·보관 정책이 적용됩니다.
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={memoryConsent}
                  onChange={(e) => setMemoryConsent(e.target.checked)}
                />
                내가 작성한 기억도 포함
              </label>
              {(data.relationship || data.relationshipLog.length > 0) && (
                <label>
                  <input
                    type="checkbox"
                    checked={relationshipConsent}
                    onChange={(e) => setRelationshipConsent(e.target.checked)}
                  />
                  관계 기록도 포함 (매번 처음부터 설명하지 않아도 돼요)
                </label>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={recordConsent}
                  onChange={(e) => setRecordConsent(e.target.checked)}
                />
                오늘의 기분·사고기록·실천도 포함
              </label>
            </div>
            <details>
              <summary>AI로 전송할 추가 내용 확인</summary>
              <pre>
                {context ||
                  "추가 기록 없음. 이 대화의 최근 메시지만 전송합니다."}
              </pre>
            </details>
            <div className={styles.chat} aria-label="상담 대화 기록">
              {!data.messages.length && (
                <div className={styles.empty}>
                  <h3>어디서부터 시작해 볼까요?</h3>
                  <p>
                    오늘 있었던 일, 떠오른 생각, 몸에서 느껴지는 반응 중 하나만
                    말해도 좋아요.
                  </p>
                  <div className={styles.actions}>
                    {[
                      "지금 내 감정을 정리하고 싶어요.",
                      "사실과 내 추측을 구분하고 싶어요.",
                      "내 감정을 안전하게 전하는 말을 연습하고 싶어요.",
                    ].map((s) => (
                      <button key={s} onClick={() => setDraft(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {data.messages.map((m, i) => {
                if (m.role === "user")
                  return (
                    <article className={styles.userMessage} key={i}>
                      <strong>나</strong>
                      <p>{m.text}</p>
                    </article>
                  );
                const parts = splitBubbles(m.text);
                const revealing = reveal?.at === i && reveal.n < parts.length;
                const shown =
                  reveal?.at === i ? parts.slice(0, reveal.n) : parts;
                return (
                  <div className={styles.aiGroup} key={i}>
                    {shown.map((part, j) => (
                      <article className={styles.aiMessage} key={j}>
                        {j === 0 && <strong>마음결 · AI</strong>}
                        <p>{part}</p>
                      </article>
                    ))}
                    {revealing && <Typing label={shown.length === 0} />}
                  </div>
                );
              })}
              {pending && (
                <>
                  <article className={styles.userMessage}>
                    <strong>나</strong>
                    <p>{pending}</p>
                  </article>
                  <div className={styles.aiGroup}>
                    <Typing label />
                  </div>
                </>
              )}
            </div>
            <form onSubmit={send}>
              <TextField
                label="마음결에게 하고 싶은 이야기"
                value={draft}
                onChange={setDraft}
                maxLength={4000}
              />
              <div className={styles.actions}>
                <button
                  className={styles.primary}
                  disabled={!consent || !ai || !draft.trim()}
                >
                  보내기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        "현재 대화를 비울까요? 저장된 사본에도 반영하려면 다시 암호화 저장을 눌러 주세요.",
                      )
                    )
                      update({ ...data, messages: [] });
                  }}
                >
                  대화 비우기
                </button>
              </div>
            </form>
            <p className={styles.small}>
              한 대화에 최대 80개 메시지. 이름·주소 등 불필요한 신원 정보는 빼고
              적어 주세요.
            </p>
          </section>
        )}
        {tab === "사고기록" && (
          <div className={styles.grid}>
            <section className={styles.card}>
              <p className={styles.eyebrow}>THOUGHT JOURNAL</p>
              <h2>사실과 생각 사이에 공간 만들기</h2>
              <p>
                억지로 긍정적으로 바꾸기보다, 확인한 것과 아직 모르는 것을 나눠
                보세요.
              </p>
              <form onSubmit={addThought}>
                {(
                  [
                    ["situation", "상황 · 직접 보고 들은 사실"],
                    ["feeling", "느낀 감정과 몸의 반응"],
                    ["thought", "자동적으로 떠오른 생각 · 추측"],
                    ["evidence", "그 생각을 뒷받침하는 구체적 근거"],
                    ["against", "반대 근거 · 아직 모르는 점"],
                    ["alternative", "균형 잡힌 다른 해석"],
                  ] as const
                ).map(([key, label]) => (
                  <TextField
                    key={key}
                    label={label}
                    value={thought[key]}
                    onChange={(value) =>
                      setThought({ ...thought, [key]: value })
                    }
                  />
                ))}
                <Score
                  label="작성 전 감정 강도"
                  value={thought.before}
                  onChange={(before) => setThought({ ...thought, before })}
                />
                <Score
                  label="작성 후 감정 강도"
                  value={thought.after}
                  onChange={(after) => setThought({ ...thought, after })}
                />
                <button className={styles.primary}>사고기록 추가</button>
              </form>
            </section>
            <section className={styles.card}>
              <h2>내가 남긴 사고기록</h2>
              {!data.thoughts.length && (
                <p className={styles.empty}>
                  정답은 없어요. 빈 항목은 나중에 생각해도 괜찮아요.
                </p>
              )}
              {data.thoughts
                .slice()
                .reverse()
                .map((t: Thought) => (
                  <details key={t.id} className={styles.entry}>
                    <summary>
                      {t.date} · {t.situation.slice(0, 45)}
                    </summary>
                    <p>
                      감정: {t.feeling} · {t.before} → {t.after}
                    </p>
                    <p>생각: {t.thought}</p>
                    <p>근거: {t.evidence}</p>
                    <p>반대 근거: {t.against}</p>
                    <p>대안: {t.alternative}</p>
                    <button
                      onClick={() => {
                        setThought(t);
                        setEditingThought(t);
                        setNotice(
                          "기록을 입력란에 가져왔어요. 수정 후 추가 버튼을 누르면 원래 기록이 갱신됩니다.",
                        );
                      }}
                    >
                      수정하기
                    </button>
                    <button
                      onClick={() =>
                        update({
                          ...data,
                          thoughts: data.thoughts.filter((x) => x.id !== t.id),
                        })
                      }
                    >
                      삭제
                    </button>
                  </details>
                ))}
            </section>
          </div>
        )}
        {tab === "작은 실천" && (
          <div className={styles.grid}>
            <section className={styles.card}>
              <p className={styles.eyebrow}>ONE SMALL STEP</p>
              <h2>오늘 할 수 있는 만큼</h2>
              <form onSubmit={addPractice}>
                <Field label="연습 선택">
                  <select
                    value={kind}
                    onChange={(e) =>
                      setKind(e.target.value as Practice["kind"])
                    }
                  >
                    <option value="activity">작은 활동 · 행동활성화</option>
                    <option value="pause">반복 확인 잠시 미루기</option>
                    <option value="boundary">감정 전달과 경계 연습</option>
                  </select>
                </Field>
                <p>
                  {kind === "activity"
                    ? "즐거움이나 의미가 있는 작은 행동을 골라 보세요. 예: 창가에서 차 마시기, 5분 걷기."
                    : kind === "pause"
                      ? "급하지 않은 반복 확인만 잠시 미뤄 보세요. 안전·의료·업무상 필요한 확인이나 실제 위험 상황에는 적용하지 마세요. 힘들면 언제든 중단할 수 있어요."
                      : "‘그 일이 있었을 때 나는 …라고 느꼈어. 지금 …를 부탁하고 싶어.’처럼 써 보세요. 위협이나 폭력이 있다면 대면 연습보다 안전과 주변의 도움을 우선하세요."}
                </p>
                <TextField
                  label="내가 선택한 작은 행동"
                  value={plan}
                  onChange={setPlan}
                />
                <button className={styles.primary} disabled={!plan.trim()}>
                  실천 추가
                </button>
              </form>
              <hr />
              <h3>반복 확인 잠시 멈추기</h3>
              <p>불편함을 견디는 시험이 아닙니다. 중단해도 실패가 아니에요.</p>
              <Field label="시간">
                <select
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                >
                  <option value={1}>1분</option>
                  <option value={2}>2분</option>
                  <option value={5}>5분</option>
                </select>
              </Field>
              <div className={styles.actions}>
                <button
                  onClick={() => {
                    setSeconds(minutes * 60);
                    setTimerEnd(Date.now() + minutes * 60000);
                  }}
                >
                  시작
                </button>
                <button
                  onClick={() => {
                    setTimerEnd(null);
                    setSeconds(0);
                  }}
                >
                  중단
                </button>
                <output aria-label="남은 시간">
                  {Math.floor(seconds / 60)}:
                  {String(seconds % 60).padStart(2, "0")}
                </output>
              </div>
            </section>
            <section className={styles.card}>
              <h2>실천 후 돌아보기</h2>
              {!data.practices.length && (
                <p className={styles.empty}>
                  작은 행동 하나를 정해 보세요. 완료 여부보다 무엇을 느꼈는지가
                  중요해요.
                </p>
              )}
              {data.practices
                .slice()
                .reverse()
                .map((p) => (
                  <div className={styles.entry} key={p.id}>
                    <strong>
                      {p.date} · {p.plan}
                    </strong>
                    <label>
                      <input
                        type="checkbox"
                        checked={p.done}
                        onChange={(e) =>
                          update({
                            ...data,
                            practices: data.practices.map((x) =>
                              x.id === p.id
                                ? { ...x, done: e.target.checked }
                                : x,
                            ),
                          })
                        }
                      />
                      해 봤어요
                    </label>
                    <TextField
                      label="예상과 실제 · 도움이 된 점 · 다음에는"
                      value={p.reflection}
                      onChange={(reflection) =>
                        update({
                          ...data,
                          practices: data.practices.map((x) =>
                            x.id === p.id ? { ...x, reflection } : x,
                          ),
                        })
                      }
                    />
                    <button
                      onClick={() =>
                        update({
                          ...data,
                          practices: data.practices.filter(
                            (x) => x.id !== p.id,
                          ),
                        })
                      }
                    >
                      삭제
                    </button>
                  </div>
                ))}
            </section>
          </div>
        )}
        {tab === "보고서" && (
          <section className={styles.card}>
            <p className={styles.eyebrow}>REFLECT & TAKE WITH YOU</p>
            <h2>마음 기록을 한눈에</h2>
            <p>
              선택한 기간의 기록을 내려받거나 전문가에게 보여 줄 자료로 정리할
              수 있어요. 진단서가 아니며 대화 원문·기억은 제외됩니다.
            </p>
            <div className={styles.actions}>
              <Field label="시작일">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => changePeriod("from", e.target.value)}
                />
              </Field>
              <Field label="종료일">
                <input
                  type="date"
                  value={to}
                  onChange={(e) => changePeriod("to", e.target.value)}
                />
              </Field>
            </div>
            {from > to && (
              <p role="alert">시작일을 종료일 이전으로 선택해 주세요.</p>
            )}
            <div className={styles.actions}>
              <button
                disabled={!from || !to || from > to}
                onClick={() =>
                  download(
                    `마음결-${from}-${to}.txt`,
                    report,
                    "text/plain;charset=utf-8",
                  )
                }
              >
                보고서 TXT 다운로드
              </button>
              <button
                disabled={!from || !to || from > to}
                onClick={() =>
                  download(
                    `마음결-${from}-${to}.html`,
                    reportHtml(report),
                    "text/html;charset=utf-8",
                  )
                }
              >
                인쇄용 보고서 다운로드
              </button>
              <button
                disabled={!ai || !from || !to || from > to}
                onClick={() => {
                  setReportDraft(recordContext(data, from, to));
                  setReportPreview(true);
                }}
              >
                AI 분석에 보낼 내용 검토
              </button>
            </div>
            <p className={styles.small}>
              인쇄용 HTML 파일을 열고 인쇄 → PDF로 저장을 선택하세요. 내려받은
              파일은 암호화되지 않으므로 보관·공유 대상을 확인해 주세요.
            </p>
            {reportPreview && (
              <div className={styles.help}>
                <TextField
                  label="AI로 보낼 기록 · 이름이나 공유하고 싶지 않은 내용을 지울 수 있어요"
                  value={reportDraft}
                  onChange={setReportDraft}
                  maxLength={24000}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  위 내용을 Google Gemini로 전송하는 데 동의합니다.
                </label>
                <button
                  className={styles.primary}
                  disabled={
                    !consent ||
                    !reportDraft.trim() ||
                    reportDraft.length > 24000
                  }
                  onClick={analyze}
                >
                  검토한 내용으로 분석 생성
                </button>
                <p>
                  AI 분석은 수정한 자료를 근거로 합니다. 다운로드에는 선택
                  기간의 원래 기록 요약도 함께 들어갑니다.
                </p>
              </div>
            )}
            <pre className={styles.report}>{report}</pre>
          </section>
        )}
        {tab === "관계 기록" && (
          <div className={styles.grid}>
            <section className={styles.card}>
              <p className={styles.eyebrow}>MY RELATIONSHIP RECORD</p>
              <h2>연애 관계 기록</h2>
              <p>
                상대와의 관계, 반복되는 갈등, 사건 경과, 내 감정을 한 번 정리해
                두면 상담 대화에서 AI가 이미 알고 있는 사실로 쓰고 처음부터 다시
                묻지 않습니다. 사실, 내 해석, 상대의 실제 발언을 구분해 쓰면 더
                정확해요.
              </p>
              <Field label="TXT 파일에서 불러오기 (700KB 이하)">
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (
                      !/\.txt$/i.test(file.name) ||
                      file.size > RELATIONSHIP_FILE_MAX_BYTES
                    ) {
                      setNotice("700KB 이하의 TXT 파일만 불러올 수 있습니다.");
                      return;
                    }
                    let text = (await file.text())
                      .replace(/\r\n?/g, "\n")
                      .trim();
                    if (!text) return setNotice("빈 파일입니다.");
                    if (text.length > RELATIONSHIP_MAX_LENGTH) {
                      if (
                        !confirm(
                          `파일이 ${text.length.toLocaleString()}자입니다. 저장 한도는 ${RELATIONSHIP_MAX_LENGTH.toLocaleString()}자라서 가장 최근 부분만 가져옵니다. 계속할까요?`,
                        )
                      )
                        return;
                      text = text.slice(-RELATIONSHIP_MAX_LENGTH);
                    }
                    if (
                      data.relationship.trim() &&
                      !confirm("기존 관계 기록을 파일 내용으로 바꿀까요?")
                    )
                      return;
                    update({ ...data, relationship: text });
                    setNotice(
                      "관계 기록에 불러왔어요. 서버에 보관하려면 암호화 저장을 눌러 주세요.",
                    );
                  }}
                />
              </Field>
              <Field label="관계 기록 (최대 50,000자)">
                <textarea
                  value={data.relationship}
                  onChange={(e) =>
                    update({ ...data, relationship: e.target.value })
                  }
                  maxLength={50000}
                  rows={18}
                  placeholder={
                    "예) 기본 정보 / 상대의 성향(내가 관찰한 모습) / 나의 연애 성향 / 반복된 갈등 / 날짜별 사건 경과 / 최근 화해 시도"
                  }
                />
              </Field>
              <p className={styles.small}>
                {data.relationship.length.toLocaleString()} / 50,000자 · 이
                내용은 ‘암호화 저장’을 누른 뒤에만 서버에 남고, 상담에서 ‘관계
                기록도 포함’을 켜 둘 때만 Google Gemini로 전송됩니다. 상대의
                실제 생각과 의도는 기록과 다를 수 있다는 점을 AI에게도 알려
                줍니다.
              </p>
              <div className={styles.actions}>
                <button disabled={!storage || busy} onClick={save}>
                  암호화 저장
                </button>
                <button
                  className={styles.danger}
                  onClick={() => update({ ...data, relationship: "" })}
                >
                  관계 기록 비우기
                </button>
              </div>
            </section>
            <section className={styles.card}>
              <h2>날짜별 기록</h2>
              <p>
                그날 있었던 일이나 마음을 날짜와 함께 남겨 두세요. 목록에서 보고
                지울 수 있고, 상담 때 함께 전달됩니다. (최대 40개, 한 개
                5,000자)
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = logText.trim();
                  if (!text) return;
                  if (relationshipChars(data) + text.length > 50000) {
                    setNotice("관계 기록 전체 50,000자 한도를 넘습니다.");
                    return;
                  }
                  update({
                    ...data,
                    relationshipLog: [
                      ...data.relationshipLog,
                      { id: crypto.randomUUID(), date: logDate, text },
                    ],
                  });
                  setLogText("");
                }}
              >
                <Field label="날짜">
                  <input
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                  />
                </Field>
                <Field label="기록">
                  <textarea
                    value={logText}
                    onChange={(e) => setLogText(e.target.value)}
                    maxLength={5000}
                    rows={5}
                  />
                </Field>
                <div className={styles.actions}>
                  <button
                    type="submit"
                    disabled={
                      !logText.trim() ||
                      !logDate ||
                      data.relationshipLog.length >= 40
                    }
                  >
                    기록 추가
                  </button>
                </div>
              </form>
              {data.relationshipLog.length === 0 ? (
                <p className={styles.small}>아직 날짜별 기록이 없어요.</p>
              ) : (
                <ul>
                  {[...data.relationshipLog]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((entry) => (
                      <li key={entry.id}>
                        <details>
                          <summary>
                            {entry.date} · {entry.text.slice(0, 40)}
                            {entry.text.length > 40 ? "…" : ""}
                          </summary>
                          <p style={{ whiteSpace: "pre-wrap" }}>{entry.text}</p>
                          <button
                            className={styles.danger}
                            type="button"
                            onClick={() => {
                              if (!confirm(`${entry.date} 기록을 삭제할까요?`))
                                return;
                              update({
                                ...data,
                                relationshipLog: data.relationshipLog.filter(
                                  (x) => x.id !== entry.id,
                                ),
                              });
                            }}
                          >
                            이 기록 삭제
                          </button>
                        </details>
                      </li>
                    ))}
                </ul>
              )}
              <p className={styles.small}>
                {data.relationshipLog.length}/40개 · 전체{" "}
                {relationshipChars(data).toLocaleString()} / 50,000자 ·
                추가하거나 삭제한 뒤에는 ‘암호화 저장’을 눌러야 서버에
                반영됩니다.
                {expiry &&
                  ` 마지막 저장: ${new Date(expiry - 30 * 86400000).toLocaleString("ko-KR")}`}
              </p>
              <div className={styles.actions}>
                <button disabled={!storage || busy} onClick={save}>
                  암호화 저장
                </button>
              </div>
            </section>
            <section className={styles.card}>
              <p className={styles.eyebrow}>RELATIONSHIP REPORT</p>
              <h2>관계 분석 보고서</h2>
              <p>
                위의 관계 기록과 날짜별 기록만 근거로, 앞으로 관계가 좋아지려면
                어떤 노력이 필요한지와 조심해야 할 행동을 정리합니다. 상대의
                마음을 단정하지 않고, 기록에 없는 내용은 만들지 않습니다.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={relConsent}
                  onChange={(e) => setRelConsent(e.target.checked)}
                />
                관계 기록 전체를 Google Gemini로 전송하는 데 동의합니다.
              </label>
              <div className={styles.actions}>
                <button
                  className={styles.primary}
                  disabled={
                    busy || !ai || !relConsent || relationshipChars(data) === 0
                  }
                  onClick={analyzeRelationship}
                >
                  {relReport ? "다시 분석하기" : "관계 분석 보고서 만들기"}
                </button>
                {relReport && (
                  <>
                    <button
                      onClick={() => {
                        const w = window.open("", "_blank");
                        if (!w) {
                          setNotice(
                            "팝업이 막혀 있어요. 허용한 뒤 다시 눌러 주세요.",
                          );
                          return;
                        }
                        w.document.open();
                        w.document.write(
                          relationshipReportHtml(relReport, todayKorea()),
                        );
                        w.document.close();
                        w.focus();
                        setTimeout(() => w.print(), 400);
                      }}
                    >
                      PDF로 저장
                    </button>
                    <button
                      onClick={() =>
                        download(
                          `관계분석보고서-${todayKorea()}.html`,
                          relationshipReportHtml(relReport, todayKorea()),
                          "text/html;charset=utf-8",
                        )
                      }
                    >
                      HTML 내려받기
                    </button>
                  </>
                )}
              </div>
              {!ai && (
                <p className={styles.small}>
                  AI 설정이 준비되지 않아 지금은 사용할 수 없어요.
                </p>
              )}
              {relReport && (
                <div
                  className={styles.relReport}
                  dangerouslySetInnerHTML={{
                    __html: relationshipReportBody(relReport),
                  }}
                />
              )}
              {relReport && (
                <p className={styles.small}>
                  ‘PDF로 저장’을 누르면 인쇄 창이 열려요. 프린터를 ‘PDF로
                  저장’으로 고르면 PDF 파일이 됩니다.
                </p>
              )}
              <p className={styles.small}>
                AI의 참고 의견이며 전문 상담을 대신하지 않습니다. 보고서는
                화면에만 있고 저장되지 않으니 필요하면 내려받아 주세요.
              </p>
            </section>
          </div>
        )}
        {tab === "기억·개인정보" && (
          <div className={styles.grid}>
            <section className={styles.card}>
              <p className={styles.eyebrow}>YOU ARE IN CONTROL</p>
              <h2>기억할 내용은 내가 정해요</h2>
              <MemoryImport
                key={momentVersion}
                current={data.memory}
                onApply={(memory) => {
                  update({ ...data, memory });
                  setMemoryConsent(false);
                }}
              />
              <p>
                AI가 자동으로 성격이나 핵심 믿음을 저장하지 않습니다. 원하는
                대화 방식, 목표, 다루고 싶지 않은 주제만 직접 적어 주세요.
                상담에서 ‘기억도 포함’을 선택할 때만 전송합니다.
              </p>
              <TextField
                label="내가 정한 기억"
                value={data.memory}
                onChange={(memory) => update({ ...data, memory })}
              />
              <button
                onClick={() => {
                  update({ ...data, memory: "" });
                  setMemoryConsent(false);
                }}
              >
                기억 비우기
              </button>
              <p className={styles.small}>
                수정·삭제한 기억은 다음 AI 요청부터 반영됩니다. 저장된 사본을
                바꾸려면 암호화 저장을 눌러 주세요.
              </p>
            </section>
            <section className={styles.card}>
              <h2>저장한 시점별로 골라 지우기</h2>
              <p>
                기록이 있는 날짜를 보고, 지우고 싶은 날의 기록만 골라 삭제할 수
                있어요. 기분 기록, 사고기록, 실천, 날짜별 관계 기록이 그날
                기준으로 함께 지워집니다.
              </p>
              {(() => {
                const LEGACY = "이전 기록";
                const groups = new Map<string, string[]>();
                const add = (at: string | undefined, label: string) =>
                  groups.set(at ?? LEGACY, [
                    ...(groups.get(at ?? LEGACY) ?? []),
                    label,
                  ]);
                data.messages.forEach((x) => add(x.savedAt, "대화"));
                data.moods.forEach((x) => add(x.savedAt, "기분"));
                data.thoughts.forEach((x) => add(x.savedAt, "사고기록"));
                data.practices.forEach((x) => add(x.savedAt, "실천"));
                data.relationshipLog.forEach((x) =>
                  add(x.savedAt, "날짜별 관계 기록"),
                );
                const list = [...groups.entries()].sort((a, b) =>
                  b[0].localeCompare(a[0], "ko"),
                );
                const title = (k: string) =>
                  k === LEGACY
                    ? "저장 시각이 없는 이전 기록"
                    : `${new Date(k).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 저장`;
                const count = (labels: string[]) =>
                  [...new Set(labels)]
                    .map((l) => `${l} ${labels.filter((x) => x === l).length}`)
                    .join(" · ");
                if (!list.length)
                  return (
                    <p className={styles.small}>
                      저장 시점이 있는 기록이 없어요.
                    </p>
                  );
                return (
                  <>
                    <ul>
                      {list.map(([k, labels]) => (
                        <li key={k}>
                          <label>
                            <input
                              type="checkbox"
                              checked={pickDays.includes(k)}
                              onChange={(e) =>
                                setPickDays(
                                  e.target.checked
                                    ? [...pickDays, k]
                                    : pickDays.filter((x) => x !== k),
                                )
                              }
                            />
                            {title(k)} · {count(labels)}
                          </label>
                        </li>
                      ))}
                    </ul>
                    <div className={styles.actions}>
                      <button
                        className={styles.danger}
                        disabled={!pickDays.length}
                        onClick={() => {
                          if (
                            !confirm(
                              `선택한 ${pickDays.length}개 저장 시점의 기록을 지울까요? 지운 뒤 ‘암호화 저장’을 눌러야 서버에도 반영됩니다.`,
                            )
                          )
                            return;
                          const gone = new Set(pickDays);
                          const keep = (x: { savedAt?: string }) =>
                            !gone.has(x.savedAt ?? LEGACY);
                          update({
                            ...data,
                            messages: data.messages.filter(keep),
                            moods: data.moods.filter(keep),
                            thoughts: data.thoughts.filter(keep),
                            practices: data.practices.filter(keep),
                            relationshipLog: data.relationshipLog.filter(keep),
                          });
                          setPickDays([]);
                        }}
                      >
                        선택한 저장 시점 기록 지우기
                      </button>
                    </div>
                  </>
                );
              })()}
              <p className={styles.small}>
                관계 기록 본문(통째로 적은 글)은 저장 시점별 묶음에 들어 있지
                않아요. 본문은 ‘관계 기록’ 탭에서 직접 고쳐 주세요.
              </p>
            </section>
            <section className={styles.card}>
              <h2>저장과 삭제</h2>
              <ul>
                <li>자동 저장과 브라우저 영구 저장을 사용하지 않습니다.</li>
                <li>
                  암호화 저장 버튼을 누른 기록만 서버에 보관합니다. 마지막 저장
                  후 30일이 지나면 만료됩니다.
                </li>
                <li>
                  일반 비서·캘린더·옵시디언과 상담 기록을 공유하지 않습니다.
                </li>
                <li>
                  AI 전송은 별도 동의가 필요합니다. 서버 저장 암호화가 AI
                  제공사의 처리를 막지는 않습니다.
                </li>
                <li>
                  보고서의 AI 분석은 화면에서만 유지됩니다. 필요하면 내려받아
                  주세요.
                </li>
                <li>
                  앱 삭제는 이미 내려받은 파일·제공사 기록·운영자 백업에 소급
                  적용되지 않습니다.
                </li>
              </ul>
              {!storage && (
                <p>
                  현재 암호화 저장 설정이 준비되지 않았습니다. 저장 버튼을
                  사용할 수 없어요.
                </p>
              )}
              <div className={styles.actions}>
                <button disabled={!storage} onClick={save}>
                  암호화 저장
                </button>
                <button
                  className={styles.danger}
                  disabled={momentBusy}
                  onClick={erase}
                >
                  서버와 화면의 기록 모두 삭제
                </button>
              </div>
              <p className={styles.small}>
                최대 기분 기록 90개 · 사고기록 30개 · 실천 60개 · 대화 80개.
                한도를 넘기기 전에 보고서로 보관해 주세요.
              </p>
              <a
                href="https://ai.google.dev/gemini-api/terms"
                target="_blank"
                rel="noreferrer"
              >
                Gemini 데이터 처리 정책
              </a>
            </section>
          </div>
        )}
      </fieldset>
      <footer className={styles.footer}>
        내 마음을 이해하는 연습 · 잠시 쉬어도 괜찮아요.
        <br />
        <a
          href="https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/thought-record/"
          target="_blank"
          rel="noreferrer"
        >
          사고기록 참고: NHS 자가관리 안내
        </a>
      </footer>
    </main>
  );
}
