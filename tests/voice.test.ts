import { test } from "node:test";
import assert from "node:assert/strict";
import { detectInterrupt, toSpeakable } from "../src/components/useVoiceChat";

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

test("interrupt words cut speech off, end words end voice mode", () => {
  assert.equal(detectInterrupt("중단", "오늘 일정은 세 개예요"), "stop");
  assert.equal(detectInterrupt("잠깐 멈춰줘", "오늘 일정은 세 개예요"), "stop");
  assert.equal(detectInterrupt("대화 종료", "오늘 일정은 세 개예요"), "end");
  assert.equal(detectInterrupt("음성종료", "오늘 일정은 세 개예요"), "end");
  assert.equal(detectInterrupt("네 알겠어요", "오늘 일정은 세 개예요"), null);
});

test("a longer phrase from the reply is echo and does not interrupt", () => {
  assert.equal(detectInterrupt("작업을 중단했어요", "작업을 중단했어요 다시 시작할까요"), null);
  assert.equal(detectInterrupt("중단하는 방법은", "작업을 중단하는 방법은 이렇습니다"), null);
});

test("a short command still works when the reply contains the word", () => {
  const reply = "작업을 중단하는 방법은 이렇습니다. 대화 종료도 가능합니다.";
  assert.equal(detectInterrupt("중단", reply), "stop");
  assert.equal(detectInterrupt("아 중단해줘", reply), "stop");
  assert.equal(detectInterrupt("대화 종료", reply), "end");
});
