import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMemoryText,
  combineMemory,
} from "../src/lib/mental-health-memory";
import { momentContext } from "../src/lib/mental-health-moment";

test("기억 가져오기는 빈 파일과 과도한 길이를 거부하고 BOM을 제거한다", () => {
  assert.equal(parseMemoryText("\uFEFF  가상 기록  "), "가상 기록");
  assert.throws(() => parseMemoryText("  "), /empty_memory/);
  assert.throws(() => parseMemoryText("가".repeat(2001)), /memory_too_long/);
});
test("기존 기억을 조용히 덮어쓰거나 잘라내지 않는다", () => {
  assert.equal(
    combineMemory("기존 가상 기록", "새 가상 기록"),
    "기존 가상 기록\n\n새 가상 기록",
  );
  assert.equal(
    combineMemory("기존 가상 기록", "새 가상 기록", true),
    "새 가상 기록",
  );
  assert.equal(combineMemory("새 가상 기록", "새 가상 기록"), "새 가상 기록");
  assert.throws(
    () => combineMemory("가".repeat(1900), "나".repeat(101)),
    /memory_too_long/,
  );
});
test("순간 도움에는 명시적으로 전달한 기억만 포함한다", () => {
  assert.equal(
    "approvedMemory" in JSON.parse(momentContext("가상 상황", 4)),
    false,
  );
  const selected = JSON.parse(
    momentContext("가상 상황", 4, "선택한 가상 기억"),
  );
  assert.equal(selected.approvedMemory, "선택한 가상 기억");
  assert.equal(selected.situation, "가상 상황");
});
