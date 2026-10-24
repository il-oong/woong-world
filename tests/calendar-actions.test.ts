import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProposedAction, validateActionParams, type ProposedAction } from "../src/lib/assistant";
import { isEventTypeRestriction, normalizeEventActions } from "../src/lib/calendar-actions";
import type { CalendarEvent } from "../src/lib/google";

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

const events: CalendarEvent[] = [
  { id: "ev1", summary: "팀 회의", start: { dateTime: "2026-10-23T14:00:00+09:00" }, end: { dateTime: "2026-10-23T15:00:00+09:00" } },
  { id: "ev2", summary: "치과", start: { date: "2026-10-24" }, end: { date: "2026-10-25" } },
];
const del = (eventId: string, summary: string, calendarId?: string) =>
  parseProposedAction({ type: "delete_event", params: { eventId, summary, calendarId } }) as ProposedAction;

test("delete cards show the real event, not the model's wording", () => {
  const { actions, dropped } = normalizeEventActions([del("ev1", "다른 일정 이름")], events);
  assert.equal(dropped, 0);
  const a = actions[0];
  assert.ok(a.type === "delete_event" && a.params.summary === "팀 회의");
  assert.ok(a.type === "delete_event" && a.params.start === "2026-10-23T14:00:00+09:00");
});

test("all-day events use their date, untitled events get a placeholder", () => {
  const { actions } = normalizeEventActions(
    [del("ev2", "x"), del("ev3", "x")],
    [...events, { id: "ev3", start: { date: "2026-11-01" }, end: { date: "2026-11-02" } }],
  );
  assert.ok(actions[0].type === "delete_event" && actions[0].params.start === "2026-10-24");
  assert.ok(actions[1].type === "delete_event" && actions[1].params.summary === "(제목 없음)");
});

test("ids outside the visible calendar are dropped and counted", () => {
  const upd = parseProposedAction({ type: "update_event", params: { eventId: "nope", ...base } }) as ProposedAction;
  const { actions, dropped } = normalizeEventActions(
    [del("ghost", "x"), upd, del("ev1", "x", "other@group.calendar.google.com"), del("ev1", "x")],
    events,
  );
  assert.equal(dropped, 3);
  assert.equal(actions.length, 1);
});

test("other action types pass through untouched", () => {
  const add = parseProposedAction({ type: "add_event", params: base }) as ProposedAction;
  const { actions, dropped } = normalizeEventActions([add], []);
  assert.equal(dropped, 0);
  assert.equal(actions[0], add);
});

test("recognizes Google's event type restriction error", () => {
  assert.ok(isEventTypeRestriction(new Error('Update failed: 400 {"reason":"eventTypeRestriction","message":"Event type cannot be changed."}')));
  assert.ok(!isEventTypeRestriction(new Error("Update failed: 500")));
  assert.ok(!isEventTypeRestriction("eventTypeRestriction"));
});
