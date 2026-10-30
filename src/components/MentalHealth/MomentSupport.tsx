"use client";

import { useEffect, useRef, useState } from "react";
import {
  CRISIS_TEXT,
  hasSafetySignal,
  todayKorea,
  type Message,
  type Practice,
} from "@/lib/mental-health";
import { momentContext, momentPractice } from "@/lib/mental-health-moment";
import styles from "./mental-health.module.css";

const situations = [
  "답장을 기다리며 불안해요",
  "내 감정을 말하기가 두려워요",
  "다툰 뒤 생각이 멈추지 않아요",
  "이유를 모르겠는데 불안해요",
];
const grounding = [
  {
    title: "지금은 해결을 잠깐 미뤄도 괜찮아요.",
    text: "안전한 곳에 있다면 발바닥이나 의자가 몸을 받쳐 주는 감각을 가볍게 알아차려 보세요. 불편하면 건너뛰어도 됩니다.",
  },
  {
    title: "눈앞의 사물로 시선을 옮겨 봐요.",
    text: "주변에서 보이는 사물 하나의 색이나 모양을 살펴보세요. 괜찮다면 다른 사물도 찾아보세요. 호흡은 억지로 바꾸지 않아도 됩니다.",
  },
  {
    title: "이제 작은 선택 하나만 해 볼까요?",
    text: "‘지금 불안한 마음이 있구나’라고 이름 붙여 보세요. 당장 결론 내리지 않고, 지금 필요한 작은 행동을 하나 골라도 괜찮아요.",
  },
];
function Rating({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label} (선택)</span>
      <select
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
      >
        <option value="">지금은 평가하지 않을게요</option>
        {Array.from({ length: 11 }, (_, n) => (
          <option key={n} value={n}>
            {n} ·{" "}
            {n === 0 ? "불안 없음" : n === 10 ? "매우 강한 불안" : "불안 강도"}
          </option>
        ))}
      </select>
    </label>
  );
}
export function MomentSupport({
  active,
  aiReady,
  recordReady,
  owner,
  memory,
  onRecord,
  onBusyChange,
  onDirtyChange,
}: {
  active: boolean;
  aiReady: boolean;
  recordReady: boolean;
  owner: string;
  memory: string;
  onRecord: (practice: Practice) => boolean;
  onBusyChange: (busy: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const [situation, setSituation] = useState("");
  const [before, setBefore] = useState<number | null>(null);
  const [after, setAfter] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [consent, setConsent] = useState(false);
  const [approvedMemory, setApprovedMemory] = useState("");
  const includeMemory = Boolean(memory && approvedMemory === memory);
  const [pending, setPending] = useState(false);
  const [safety, setSafety] = useState(false);
  const [action, setAction] = useState("");
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRef<AbortController | null>(null);
  const recordIdentity = useRef<{ id: string; date: string } | null>(null);
  useEffect(() => {
    if (active) heading.current?.focus();
  }, [active]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    onDirtyChange(Boolean(situation || draft || messages.length || action));
  }, [situation, draft, messages.length, action, onDirtyChange]);

  async function send(text: string) {
    if (pending || !text.trim()) return;
    if (messages.length >= 24) {
      setNotice(
        "이번 상황의 대화가 길어졌어요. 아래에서 작은 행동을 정하고 잠시 쉬어도 괜찮아요. 다른 상황은 새로 시작할 수 있어요.",
      );
      return;
    }
    const next: Message[] = [...messages, { role: "user", text: text.trim() }];
    // Local support remains available without a connection or AI consent.
    if (
      hasSafetySignal(
        [
          situation,
          ...next.filter((m) => m.role === "user").map((m) => m.text),
        ].join("\n"),
      )
    ) {
      setSafety(true);
      setMessages([...next, { role: "assistant", text: CRISIS_TEXT }]);
      setDraft("");
      return;
    }
    if (!aiReady || !consent) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    onBusyChange(true);
    setNotice("");
    try {
      const response = await fetch("/api/mental-health/ai", {
        method: "POST",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Mental-Owner": owner,
        },
        body: JSON.stringify({
          mode: "moment",
          consent: true,
          messages: next,
          context: momentContext(
            situation,
            before,
            includeMemory ? memory : "",
          ),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (controller.signal.aborted) return;
      setMessages([...next, { role: "assistant", text: result.text }]);
      setDraft("");
      setSaved(false);
      if (result.safety) setSafety(true);
    } catch (error) {
      if (controller.signal.aborted) return;
      const code = error instanceof Error ? error.message : "";
      setNotice(
        code === "not_connected" || code === "account_changed"
          ? "로그인 상태가 바뀌었습니다. 현재 대화를 마친 뒤 다시 로그인해 주세요."
          : code === "rate_limited"
            ? "요청이 많아 잠시 쉬어야 해요. 위의 짧은 안내는 계속 이용할 수 있습니다."
            : "AI에 연결하지 못했어요. 입력은 그대로 있어요. 위의 짧은 안내를 이용하거나 믿을 수 있는 사람에게 연락해 보세요.",
      );
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
        onBusyChange(false);
      }
    }
  }
  function reset() {
    if (
      (situation || messages.length || action) &&
      !confirm(
        "이번 순간 도움을 마치고 새로 시작할까요? 별도로 내 기록에 추가한 내용은 유지됩니다.",
      )
    )
      return;
    setStep(0);
    setSituation("");
    setBefore(null);
    setAfter(null);
    setMessages([]);
    setDraft("");
    setConsent(false);
    setApprovedMemory("");
    setSafety(false);
    setAction("");
    setSaved(false);
    setNotice("");
    recordIdentity.current = null;
  }
  function cancelRequest() {
    request.current?.abort();
    setPending(false);
    onBusyChange(false);
    setNotice(
      "응답 기다리기를 멈췄어요. 이미 전송한 내용은 회수되지 않습니다. 짧은 안내를 보거나 여기서 쉬어도 괜찮아요.",
    );
  }
  return (
    <section hidden={!active} aria-label="지금 불안할 때 도움">
      <div className={styles.momentHeading}>
        <div>
          <p className={styles.eyebrow}>RIGHT HERE, RIGHT NOW</p>
          <h2 ref={heading} tabIndex={-1}>
            지금 이 순간부터, 함께 정리해요.
          </h2>
          <p>길게 설명하지 않아도 괜찮아요. 필요한 부분만 골라 이용하세요.</p>
        </div>
        <button onClick={reset} disabled={pending}>
          다른 상황으로 새로 시작
        </button>
      </div>
      <p className={styles.small}>
        운전이나 위험한 작업 중이라면 안전하게 멈춘 뒤 이용하세요. 새롭거나 심한
        흉통·호흡곤란·실신은 불안으로 단정하지 말고 즉시 현지 긴급 서비스나
        응급실의 도움을 받으세요.
      </p>
      <div className={styles.grid}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>1 · 잠시 멈추기</p>
          <h3>{grounding[step].title}</h3>
          <p>{grounding[step].text}</p>
          <div className={styles.actions}>
            <span>
              {step + 1} / {grounding.length}
            </span>
            <button disabled={step === 0} onClick={() => setStep(step - 1)}>
              이전 안내
            </button>
            <button
              disabled={step === grounding.length - 1}
              onClick={() => setStep(step + 1)}
            >
              다음 안내
            </button>
          </div>
          <p className={styles.small}>
            AI 응답을 기다리지 않아도 볼 수 있는 안내입니다. 불편하면 멈추거나
            아래 이야기로 바로 넘어가도 됩니다. 불안이 줄지 않아도 실패가
            아니에요.
          </p>
          <a
            target="_blank"
            rel="noreferrer"
            href="https://www.who.int/thailand/activities/doing-what-matters-in-times-of-stress"
          >
            참고: WHO 스트레스 자기관리 안내
          </a>
        </section>
        <section className={styles.card}>
          <p className={styles.eyebrow}>2 · 지금의 상황</p>
          <h3>어떤 순간에 불안해졌나요?</h3>
          <div className={styles.actions}>
            {situations.map((s) => (
              <button
                key={s}
                disabled={messages.length > 0}
                onClick={() => {
                  setSituation(s);
                  setSaved(false);
                }}
                aria-pressed={situation === s}
              >
                {s}
              </button>
            ))}
          </div>
          <label className={styles.field}>
            <span>지금 있었던 일 한 줄 (선택)</span>
            <textarea
              maxLength={1000}
              rows={3}
              value={situation}
              disabled={messages.length > 0}
              onChange={(e) => {
                setSituation(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <fieldset disabled={messages.length > 0} className={styles.content}>
            <Rating
              label="시작할 때 불안"
              value={before}
              onChange={(n) => {
                setBefore(n);
                setSaved(false);
              }}
            />
          </fieldset>
          <p className={styles.small}>
            설명 없이 시작해도 괜찮아요. 다른 상황은 ‘새로 시작’으로 분리할 수
            있어요.
          </p>
          <label className={styles.choices}>
            <span>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              이번 상황·불안 점수·이번 대화와 아래에서 선택한 기억을 Google
              Gemini로 전송하는 데 동의합니다. 과거 대화 원문은 보내지 않습니다.
            </span>
          </label>
          <label className={styles.choices}>
            <span>
              <input
                type="checkbox"
                checked={includeMemory && Boolean(memory)}
                disabled={!memory}
                onChange={(e) =>
                  setApprovedMemory(e.target.checked ? memory : "")
                }
              />
              이전에 정리한 개인 기억도 참고하기 (선택)
            </span>
          </label>
          {includeMemory && memory && (
            <details>
              <summary>이번 상담에 함께 보낼 기억 확인</summary>
              <pre>{memory}</pre>
            </details>
          )}
          {!aiReady && (
            <p className={styles.small}>
              AI 연결 설정 전에는 아래 대화 버튼이 비활성화됩니다. 짧은 안내와
              행동 선택은 지금도 이용할 수 있어요.
            </p>
          )}
          {!messages.length && (
            <button
              className={styles.primary}
              disabled={pending || !aiReady || !consent}
              onClick={() =>
                void send(
                  situation.trim() ||
                    "지금 불안한데 설명하기 어려워요. 바로 할 수 있는 작은 도움부터 주세요.",
                )
              }
            >
              지금 상황으로 짧게 상담하기
            </button>
          )}
        </section>
      </div>
      <p role="status" aria-live="polite" className={styles.status}>
        {pending
          ? "상황에 맞는 답을 준비하고 있어요. 위의 짧은 안내를 보며 잠시 기다려 주세요."
          : notice}
      </p>
      {pending && <button onClick={cancelRequest}>응답 기다리기 중단</button>}
      {messages.length > 0 && (
        <section className={styles.card}>
          <h3>지금 상황에 맞춰 한 번에 하나씩</h3>
          <div className={styles.chat} aria-label="순간 도움 대화">
            {messages.map((message, i) => (
              <article
                key={i}
                className={
                  message.role === "user"
                    ? styles.userMessage
                    : styles.aiMessage
                }
              >
                <strong>
                  {message.role === "user" ? "나" : "마음결 · AI"}
                </strong>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
          {safety && (
            <aside className={styles.help}>
              <h3>지금은 사람의 도움이 먼저예요.</h3>
              <p>{CRISIS_TEXT}</p>
              <a href="tel:+82109?oai_link_source=model_response_hotline">
                한국 자살예방상담전화 109
              </a>
              <p>앱이 위험을 감시하거나 구조를 요청하지는 못합니다.</p>
            </aside>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <label className={styles.field}>
              <span>지금 떠오른 생각이나 달라진 상황</span>
              <textarea
                maxLength={2000}
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            <button
              disabled={pending || !aiReady || !consent || !draft.trim()}
              className={styles.primary}
            >
              이어서 도움 받기
            </button>
          </form>
        </section>
      )}
      {!safety && (
        <section className={styles.card + " " + styles.momentFinish}>
          <p className={styles.eyebrow}>3 · 다음 한 걸음</p>
          <h3>지금 할 수 있는 작은 행동은?</h3>
          <p>
            대화를 계속하지 않고 여기서 마쳐도 괜찮아요. 급하지 않은 확인만 잠시
            미루고, 실제 위험이나 꼭 필요한 확인은 미루지 마세요.
          </p>
          <div className={styles.actions}>
            {[
              "주변 사물 하나를 천천히 살펴보기",
              "급하지 않은 메시지 확인을 1분 미루기",
              "믿을 수 있는 사람에게 이야기하기",
            ].map((s) => (
              <button
                key={s}
                aria-pressed={action === s}
                onClick={() => {
                  setAction(s);
                  setSaved(false);
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <label className={styles.field}>
            <span>내가 선택한 행동 (직접 수정 가능)</span>
            <textarea
              maxLength={1000}
              rows={2}
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <Rating
            label="지금의 불안"
            value={after}
            onChange={(n) => {
              setAfter(n);
              setSaved(false);
            }}
          />
          <button
            disabled={saved || pending || !recordReady}
            onClick={() => {
              recordIdentity.current ??= {
                id: crypto.randomUUID(),
                date: todayKorea(),
              };
              if (
                onRecord(
                  momentPractice(
                    { situation, before, after, action },
                    recordIdentity.current.id,
                    recordIdentity.current.date,
                  ),
                )
              ) {
                setSaved(true);
                setNotice(
                  "이번 상황과 선택한 행동을 ‘작은 실천’에 추가했어요. 다음에도 보려면 상단 암호화 저장을 눌러 주세요.",
                );
              } else
                setNotice(
                  "기록 한도 때문에 추가하지 못했어요. 기존 기록을 내보내고 정리해 주세요.",
                );
            }}
          >
            {saved ? "내 기록에 추가했어요" : "이번 상황을 내 기록에 추가"}
          </button>
          <p className={styles.small}>
            자동 저장·자동 전송하지 않습니다. 이 버튼은 상황·점수·선택한 행동만
            기록에 추가하며, 대화 원문은 새로고침하거나 페이지를 떠나면
            사라집니다.
          </p>
        </section>
      )}
    </section>
  );
}
