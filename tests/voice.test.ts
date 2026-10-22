import { test } from "node:test";
import assert from "node:assert/strict";
import { toSpeakable } from "../src/components/useVoiceChat";

test("strips actions, code, links and markdown for speech", () => {
  const out = toSpeakable(
    '**오늘** 일정은 [캘린더](https://x.y/z) 에서 봐. <action>{"type":"add_event"}</action>\n```ts\nconst a=1\n```',
  );
  assert.ok(!out.includes("<action>"));
  assert.ok(!out.includes("https://"));
  assert.ok(!out.includes("**"));
  assert.ok(!out.includes("const a"));
  assert.ok(out.includes("오늘 일정은 캘린더 에서 봐."));
});

test("bare urls are read as 링크", () => {
  assert.equal(toSpeakable("여기 https://example.com/a?b=1 확인"), "여기 링크 확인");
});
