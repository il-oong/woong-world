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
    workspaceSchema.safeParse({ ...emptyWorkspace(), memory: "a".repeat(8001) })
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
    assert.equal(await generateSupport(input), "도움 답변");
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = key;
    if (reviewed === undefined)
      delete process.env.MENTAL_HEALTH_AI_PRIVACY_REVIEWED;
    else process.env.MENTAL_HEALTH_AI_PRIVACY_REVIEWED = reviewed;
  }
});
