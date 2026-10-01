import { test } from "node:test";
import assert from "node:assert/strict";
import { eventsThroughNextMonth, scheduleWindow } from "../src/lib/housing/schedule";
import type { Notice } from "../src/lib/housing/model";

test("schedule runs from the reference day through the following month, including year rollover", () => {
  assert.deepEqual(scheduleWindow("2026-10-01"), { months: ["2026-10", "2026-11"], end: "2026-11-30" });
  assert.deepEqual(scheduleWindow("2026-12-31"), { months: ["2026-12", "2027-01"], end: "2027-01-31" });
});

test("upcoming schedule includes the next month end and respects event filters", () => {
  const notices = [{
    id: "1", title: "공고", events: [
      { date: "2026-09-30", type: "open", label: "지난 일정", time: null },
      { date: "2026-10-01", type: "open", label: "접수", time: null },
      { date: "2026-11-30", type: "result", label: "발표", time: null },
      { date: "2026-12-01", type: "contract", label: "계약", time: null },
    ],
  }] as Notice[];
  assert.deepEqual(eventsThroughNextMonth(notices, "2026-10-01", ["open", "result"])
    .map(({ event }) => event.date), ["2026-10-01", "2026-11-30"]);
  assert.deepEqual(eventsThroughNextMonth(notices, "2026-10-01", ["result"])
    .map(({ event }) => event.date), ["2026-11-30"]);
});
