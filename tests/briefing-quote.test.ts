import { test } from "node:test";
import assert from "node:assert/strict";
import { FALLBACK_QUOTES, fallbackQuote, parseQuote, seoulDateKey } from "../src/lib/briefing-quote";

test("fallback quote changes from day to day and cycles through the list", () => {
  const a = fallbackQuote("2026-10-24");
  const b = fallbackQuote("2026-10-25");
  assert.notDeepEqual(a, b);
  assert.deepEqual(fallbackQuote("2026-10-24"), a);
  const seen = new Set<string>();
  for (let d = 1; d <= FALLBACK_QUOTES.length; d++) {
    seen.add(fallbackQuote(`2026-03-${String(d).padStart(2, "0")}`).text);
  }
  assert.equal(seen.size, FALLBACK_QUOTES.length);
});

test("Seoul date key uses Korea time", () => {
  assert.equal(seoulDateKey(new Date("2026-10-24T16:30:00Z")), "2026-10-25");
  assert.equal(seoulDateKey(new Date("2026-10-24T14:30:00Z")), "2026-10-24");
});

test("parseQuote accepts a good quote and strips quotes and tags from it", () => {
  const q = parseQuote('{"text":"“천 리 길도 한 걸음부터.”","author":"<b>속담</b>"}', []);
  assert.deepEqual(q, { text: "천 리 길도 한 걸음부터.", author: "속담" });
});

test("parseQuote rejects repeats, bad shapes and unreadably long text", () => {
  assert.equal(parseQuote('{"text":"천 리 길도 한 걸음부터","author":"속담"}', ["천 리 길도 한 걸음부터."]), null);
  assert.equal(parseQuote("not json", []), null);
  assert.equal(parseQuote('{"text":"짧","author":"a"}', []), null);
  assert.equal(parseQuote(JSON.stringify({ text: "가".repeat(120), author: "a" }), []), null);
  assert.equal(parseQuote('{"text":"충분히 긴 명언입니다 정말로","author":""}', []), null);
});

test("fallback list has no duplicates", () => {
  assert.equal(new Set(FALLBACK_QUOTES.map((q) => q.text)).size, FALLBACK_QUOTES.length);
});
