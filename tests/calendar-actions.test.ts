import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProposedAction, validateActionParams } from "../src/lib/assistant";

const base = { summary: "회의", kind: "timed", start: "2026-10-23T14:00", end: "2026-10-23T15:00" };

test("delete_event accepts a real event id and keeps the summary for the approval card", () => {
  const out = validateActionParams("delete_event", {
    eventId: "abc123_20261023T050000Z",
    summary: "팀 회의",
    start: "2026-10-23T14:00",
  });
  assert.deepEqual(out, {
    eventId: "abc123_20261023T050000Z",
    calendarId: undefined,
    summary: "팀 회의",
    start: "2026-10-23T14:00",
  });
});

test("delete_event rejects ids and calendars that could escape the API path", () => {
  assert.equal(validateActionParams("delete_event", { eventId: "../calendars/x", summary: "a" }), null);
  assert.equal(validateActionParams("delete_event", { eventId: "a b", summary: "a" }), null);
  assert.equal(validateActionParams("delete_event", { eventId: "abc", summary: "" }), null);
  assert.equal(
    validateActionParams("delete_event", { eventId: "abc", summary: "a", calendarId: "x/../y" }),
    null,
  );
  assert.ok(
    validateActionParams("delete_event", {
      eventId: "abc",
      summary: "a",
      calendarId: "ko.south_korea#holiday@group.v.calendar.google.com",
    }),
  );
});

test("update_event needs a valid id and the full add_event fields", () => {
  const ok = validateActionParams("update_event", { eventId: "abc123", ...base });
  assert.ok(ok && "eventId" in ok && ok.eventId === "abc123");
  assert.equal(validateActionParams("update_event", { ...base }), null);
  assert.equal(validateActionParams("update_event", { eventId: "abc123", summary: "회의" }), null);
  assert.equal(validateActionParams("update_event", { eventId: "abc123", ...base, end: "2026-10-23T13:00" }), null);
});

test("model output with the new action types becomes a pending action", () => {
  const del = parseProposedAction({ type: "delete_event", params: { eventId: "abc", summary: "회의" } });
  assert.equal(del?.type, "delete_event");
  assert.equal(del?.status, "pending");
  assert.equal(parseProposedAction({ type: "delete_event", params: { summary: "회의" } }), null);
});
