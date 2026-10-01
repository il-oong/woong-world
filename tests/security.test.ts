import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedSheetUrl } from "../src/lib/google-sheet-url";
import { isSubscriptionOwner, type PushRecord } from "../src/lib/push";
import { processUploadedFile } from "../src/lib/files";

test("시트 가져오기는 Google HTTPS 주소와 Google 소유 리디렉션만 허용한다", () => {
  assert.ok(allowedSheetUrl("https://docs.google.com/spreadsheets/d/example/export?format=csv"));
  assert.equal(allowedSheetUrl("https://docs.google.com.evil.test/spreadsheets/d/x"), null);
  assert.equal(allowedSheetUrl("http://docs.google.com/spreadsheets/d/x"), null);
  assert.equal(allowedSheetUrl("https://docs.google.com:444/spreadsheets/d/x"), null);
  assert.ok(allowedSheetUrl("https://doc-abc.googleusercontent.com/export", true));
  assert.equal(allowedSheetUrl("https://evil.test/export", true), null);
});

test("푸시 알림 기록은 로그인한 소유자만 변경할 수 있다", () => {
  const record: PushRecord = {
    ownerEmail: "owner@example.com",
    endpoint: "https://push.example.com/a",
    keys: { p256dh: "key", auth: "auth" },
    briefingHour: 8,
  };
  assert.equal(isSubscriptionOwner(record, " OWNER@EXAMPLE.COM "), true);
  assert.equal(isSubscriptionOwner(record, "other@example.com"), false);
  assert.equal(isSubscriptionOwner(null, "owner@example.com"), false);
});

test("사용자 첨부 파일에서 실행 가능한 SVG 이미지를 거부한다", async () => {
  const svg = new File(["<svg onload='alert(1)'></svg>"], "image.svg", { type: "image/svg+xml" });
  await assert.rejects(processUploadedFile(svg), /Only PNG, JPEG, WebP, or GIF/);
});
