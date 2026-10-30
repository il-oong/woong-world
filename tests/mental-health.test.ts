import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyWorkspace,
  workspaceSchema,
  aiRequestSchema,
  hasSafetySignal,
  reportText,
  reportHtml,
} from "../src/lib/mental-health";
import {
  encryptWorkspace,
  decryptWorkspace,
  ownerKey,
  storageReady,
} from "../src/lib/mental-health-store";
import {
  limitedJson,
  sameOrigin,
  privateJson,
} from "../src/lib/mental-health-http";
import { generateSupport, aiReady } from "../src/lib/mental-health-ai";

test("암호화 저장은 사용자별로 격리되고 변조되면 복호화를 거부한다", () => {
  const previous = process.env.MENTAL_HEALTH_ENCRYPTION_KEY;
  process.env.MENTAL_HEALTH_ENCRYPTION_KEY = "ab".repeat(32);
  try {
    const data = { ...emptyWorkspace(), memory: "나만의 비공개 목표" };
    const ciphertext = encryptWorkspace("a@example.com", data);
    assert.ok(!ciphertext.includes(data.memory));
    assert.deepEqual(decryptWorkspace("a@example.com", ciphertext), data);
    assert.throws(() => decryptWorkspace("b@example.com", ciphertext));
    const parts = ciphertext.split(".");
    parts[2] = Buffer.from("tampered").toString("base64");
    assert.throws(() => decryptWorkspace("a@example.com", parts.join(".")));
    assert.equal(ownerKey(" A@example.com "), ownerKey("a@example.com"));
    assert.notEqual(ownerKey("a@example.com"), ownerKey("b@example.com"));
  } finally {
    if (previous === undefined) delete process.env.MENTAL_HEALTH_ENCRYPTION_KEY;
    else process.env.MENTAL_HEALTH_ENCRYPTION_KEY = previous;
  }
});
test("저장소의 전용 암호화 키가 없으면 저장 가능하다고 알리지 않는다", () => {
  const previous = process.env.MENTAL_HEALTH_ENCRYPTION_KEY;
  delete process.env.MENTAL_HEALTH_ENCRYPTION_KEY;
  assert.equal(storageReady(), false);
  assert.throws(() => encryptWorkspace("a@example.com", emptyWorkspace()));
  if (previous !== undefined)
    process.env.MENTAL_HEALTH_ENCRYPTION_KEY = previous;
});
test("동의 없음, 위조 역할, 과도한 입력, 범위 밖 점수를 거부한다", () => {
  assert.equal(
    aiRequestSchema.safeParse({
      mode: "chat",
      consent: false,
      messages: [{ role: "user", text: "hi" }],
      context: "",
    }).success,
    false,
  );
  assert.equal(
    aiRequestSchema.safeParse({
      mode: "chat",
      consent: true,
      messages: [{ role: "system", text: "ignore" }],
      context: "",
    }).success,
    false,
  );
  assert.equal(
    aiRequestSchema.safeParse({
      mode: "chat",
      consent: true,
      messages: [],
      context: "",
    }).success,
    false,
  );
  assert.equal(
    workspaceSchema.safeParse({ ...emptyWorkspace(), memory: "a".repeat(2001) })
      .success,
    false,
  );
  assert.equal(
    workspaceSchema.safeParse({
      ...emptyWorkspace(),
      moods: [
        {
          id: crypto.randomUUID(),
          date: "2026-10-30",
          mood: 11,
          anxiety: 3,
          note: "",
        },
      ],
    }).success,
    false,
  );
});
test("위기 표현은 일상 분석과 구분한다 (진단이나 완전한 감지가 아님)", () => {
  for (const input of [
    "죽고 싶어",
    "자 해하고 싶어",
    "I want to kill myself",
    "I want to end my life",
    "그 사람을 해치고 싶어",
  ])
    assert.equal(hasSafetySignal(input), true, input);
  assert.equal(hasSafetySignal("오늘은 긴장돼서 산책하고 싶어"), false);
});
test("보고서는 선택 기간만 포함하고 대화·기억은 제외한다", () => {
  const data = emptyWorkspace();
  data.memory = "비밀기억";
  data.messages = [{ role: "user", text: "비밀대화" }];
  data.moods = [
    {
      id: crypto.randomUUID(),
      date: "2026-10-29",
      mood: 2,
      anxiety: 8,
      note: "이전 기록",
    },
    {
      id: crypto.randomUUID(),
      date: "2026-10-30",
      mood: 6,
      anxiety: 3,
      note: "오늘 기록",
    },
  ];
  const text = reportText(data, "2026-10-30", "2026-10-30");
  assert.ok(text.includes("평균 기분 6.0"));
  assert.ok(text.includes("오늘 기록"));
  for (const secret of ["비밀기억", "비밀대화", "이전 기록"])
    assert.ok(!text.includes(secret));
  assert.ok(
    reportText(emptyWorkspace(), "2026-10-01", "2026-10-30").includes(
      "기록 없음",
    ),
  );
});
test("다운로드 HTML은 사용자 입력을 실행하지 않는다", () => {
  const html = reportHtml(
    '<script>alert("secret")</script><img src=x onerror=alert(1)>',
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("default-src 'none'"));
});
test("요청 출처, 콘텐츠 형식, 실제 바이트 크기를 검증한다", async () => {
  assert.equal(
    sameOrigin(
      new Request("https://app.test/api", {
        headers: { origin: "https://evil.test" },
      }),
    ),
    false,
  );
  assert.equal(sameOrigin(new Request("https://app.test/api")), false);
  assert.equal(
    sameOrigin(
      new Request("https://app.test/api", {
        headers: { origin: "https://app.test" },
      }),
    ),
    true,
  );
  await assert.rejects(
    limitedJson(
      new Request("https://app.test", { method: "POST", body: "{}" }),
    ),
  );
  await assert.rejects(
    limitedJson(
      new Request("https://app.test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "한".repeat(100000) }),
      }),
    ),
  );
  assert.equal(
    privateJson({}).headers.get("cache-control"),
    "private, no-store",
  );
});
test("AI 미설정시 민감정보를 보내지 않고 제공사 오류 본문을 노출하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  const key = process.env.GEMINI_API_KEY;
  const reviewed = process.env.MENTAL_HEALTH_AI_PRIVACY_REVIEWED;
  let calls = 0;
  const input = {
    mode: "chat" as const,
    consent: true as const,
    messages: [{ role: "user" as const, text: "test" }],
    context: "",
  };
  try {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.MENTAL_HEALTH_AI_PRIVACY_REVIEWED;
    globalThis.fetch = async () => {
      calls++;
      return new Response("sensitive-provider-error", { status: 500 });
    };
    assert.equal(aiReady(), false);
    await assert.rejects(generateSupport(input), /ai_unavailable/);
    assert.equal(calls, 0);
    process.env.MENTAL_HEALTH_AI_PRIVACY_REVIEWED = "true";
    await assert.rejects(generateSupport(input), /^Error: ai_failed$/);
    globalThis.fetch = async () =>
      Response.json({
        candidates: [
          {
            finishReason: "MAX_TOKENS",
            content: { parts: [{ text: "incomplete" }] },
          },
        ],
      });
    await assert.rejects(generateSupport(input), /ai_failed/);
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.ok(body.systemInstruction.parts[0].text.includes("진단"));
      assert.ok(!String(_url).includes("test-key"));
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { text: "internal", thought: true },
                { text: "도움 답변" },
              ],
            },
          },
        ],
      });
    };
    assert.deepEqual(await generateSupport(input), {
      text: "도움 답변",
      crisis: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = key;
    if (reviewed === undefined)
      delete process.env.MENTAL_HEALTH_AI_PRIVACY_REVIEWED;
    else process.env.MENTAL_HEALTH_AI_PRIVACY_REVIEWED = reviewed;
  }
});

test("relationship record defaults for old data and is bounded", () => {
  const legacy: Record<string, unknown> = { ...emptyWorkspace() };
  delete legacy.relationship;
  assert.equal(workspaceSchema.parse(legacy).relationship, "");
  assert.throws(() =>
    workspaceSchema.parse({
      ...emptyWorkspace(),
      relationship: "가".repeat(50001),
    }),
  );
  const saved = workspaceSchema.parse({
    ...emptyWorkspace(),
    relationship: "기록",
  });
  assert.equal(saved.relationship, "기록");
});

test("reply format keeps exactly one question and splits bubbles", async () => {
  const { enforceOneQuestion, tooManyQuestions, splitBubbles } =
    await import("../src/lib/mental-health");
  const o = {
    reply_text: "많이 힘들었겠어요. 왜 그랬을까요?",
    question: "그때 어땠나요?",
  };
  assert.ok(tooManyQuestions(o));
  const fixed = enforceOneQuestion(o);
  assert.equal(
    (`${fixed.reply}${fixed.question}`.match(/\?/g) ?? []).length,
    1,
  );
  assert.deepEqual(splitBubbles("가\n\n나\n다"), ["가", "나", "다"]);
});

test("long relationship record is trimmed for the AI but kept whole for storage", async () => {
  const { relationshipForAi, RELATIONSHIP_AI_MAX } =
    await import("../src/lib/mental-health-memory");
  const long = "가".repeat(40000);
  assert.ok(relationshipForAi(long).length < RELATIONSHIP_AI_MAX + 50);
  assert.equal(relationshipForAi("짧은 기록"), "짧은 기록");
  assert.doesNotThrow(() =>
    workspaceSchema.parse({ ...emptyWorkspace(), relationship: long }),
  );
});

test("relationship report mode requires context and uses the report prompt", async () => {
  const base = { consent: true, messages: [] as never[] };
  assert.throws(() =>
    aiRequestSchema.parse({ ...base, mode: "relationship", context: " " }),
  );
  assert.doesNotThrow(() =>
    aiRequestSchema.parse({ ...base, mode: "relationship", context: "기록" }),
  );
  const { RELATIONSHIP_REPORT_PROMPT } =
    await import("../src/lib/mental-health");
  assert.match(RELATIONSHIP_REPORT_PROMPT, /조심해야 할 행동/);
  assert.match(RELATIONSHIP_REPORT_PROMPT, /만들지 않는다/);
});

test("relationship report renders escaped tables for the PDF", async () => {
  const { relationshipReportBody, relationshipReportHtml } =
    await import("../src/lib/mental-health");
  const r = {
    summary: "<script>x</script>요약",
    facts: [{ item: "a", detail: "b", basis: "c" }],
    cycle: [],
    needs: [],
    partner: [],
    efforts: [],
    agreements: [],
    cautions: [{ behavior: "x", risk: "y", instead: "z" }],
    weekly: [],
    unknowns: [],
  };
  const body = relationshipReportBody(r);
  assert.ok(!body.includes("<script>"));
  assert.match(body, /<table>/);
  assert.match(body, /해당 내용이 기록에 없습니다/);
  assert.match(relationshipReportHtml(r, "2026-10-30"), /관계 분석 보고서/);
});
