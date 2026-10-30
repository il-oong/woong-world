import { test } from "node:test";
import assert from "node:assert/strict";
import { aiRequestSchema, practiceSchema } from "../src/lib/mental-health";
import { momentContext, momentPractice } from "../src/lib/mental-health-moment";
import { generateSupport } from "../src/lib/mental-health-ai";

test("순간 도움도 사용자 발화와 명시적 전송 동의가 있어야 한다", () => {
  const valid = {
    mode: "moment",
    consent: true,
    messages: [{ role: "user", text: "지금 불안해요" }],
    context: "",
  };
  assert.equal(aiRequestSchema.safeParse(valid).success, true);
  assert.equal(
    aiRequestSchema.safeParse({ ...valid, consent: false }).success,
    false,
  );
  assert.equal(
    aiRequestSchema.safeParse({ ...valid, messages: [] }).success,
    false,
  );
  assert.equal(
    aiRequestSchema.safeParse({
      ...valid,
      messages: [{ role: "assistant", text: "hi" }],
    }).success,
    false,
  );
});
test("현재 상황만 전송하고 평가하지 않은 점수는 만들어내지 않는다", () => {
  const context = JSON.parse(momentContext("답장을 기다리는 중", null));
  assert.equal(context.selfReportedAnxiety, null);
  assert.equal(context.situation, "답장을 기다리는 중");
  assert.deepEqual(Object.keys(context).sort(), [
    "scope",
    "selfReportedAnxiety",
    "situation",
  ]);
  const record = momentPractice(
    { situation: "", before: null, after: null, action: "" },
    crypto.randomUUID(),
    "2026-10-30",
  );
  assert.equal(practiceSchema.safeParse(record).success, true);
  assert.equal(record.kind, "moment");
  assert.equal(record.done, false);
  assert.ok(record.reflection.includes("평가하지 않음"));
  assert.ok(!record.reflection.includes("5/10"));
});
test("사용자가 남긴 전후 점수와 행동은 기록하되 개선이나 완료를 가정하지 않는다", () => {
  const id = crypto.randomUUID();
  const record = momentPractice(
    {
      situation: "대화가 걱정됨",
      before: 7,
      after: 8,
      action: "믿는 사람과 이야기하기",
    },
    id,
    "2026-10-30",
  );
  assert.equal(record.id, id);
  assert.equal(record.plan, "믿는 사람과 이야기하기");
  assert.ok(record.reflection.includes("7/10"));
  assert.ok(record.reflection.includes("8/10"));
  assert.equal(record.done, false);
  assert.ok(!record.reflection.includes("호전"));
});
test("순간 도움 모드는 짧은 응답·의학적 응급상황 구분·반복 확신 제한을 시스템 지침으로 보낸다", async () => {
  const originalFetch = globalThis.fetch;
  const key = process.env.GEMINI_API_KEY;
  const reviewed = process.env.MENTAL_HEALTH_AI_PRIVACY_REVIEWED;
  try {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.MENTAL_HEALTH_AI_PRIVACY_REVIEWED = "true";
    let prompt = "";
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      prompt = body.systemInstruction.parts[0].text;
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: "테스트 응답" }] },
          },
        ],
      });
    };
    const input = {
      consent: true as const,
      messages: [{ role: "user" as const, text: "설명하기 어려워요" }],
      context: "",
    };
    await generateSupport({ ...input, mode: "moment" });
    assert.ok(prompt.includes("질문 최대 하나"));
    assert.ok(prompt.includes("흉통"));
    assert.ok(prompt.includes("반드시 괜찮다"));
    assert.ok(prompt.includes("호흡을 강하게"));
    assert.ok(prompt.includes("끝낼 선택"));
    await generateSupport({ ...input, mode: "chat" });
    assert.ok(!prompt.includes("현재 모드는 불안이 올라온 바로 그 순간"));
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = key;
    if (reviewed === undefined)
      delete process.env.MENTAL_HEALTH_AI_PRIVACY_REVIEWED;
    else process.env.MENTAL_HEALTH_AI_PRIVACY_REVIEWED = reviewed;
  }
});
