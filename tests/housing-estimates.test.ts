import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, profile } from "./housing-fixture";
import { assess, roughAssess, rankNotices } from "../src/lib/housing/scoring";
import { addressRegion, referenceArea } from "../src/lib/housing/estimates";

const today = "2026-09-30";
const unit = { ...fixture.units[0], name: "059.0000A (최고 공급금액)", area: null, rooms: null, payments: [] };
const first = { ...fixture, id: "first", units: [unit], nearby: [], comparable: null, reviewedAt: null };
const second = { ...first, id: "second", units: [{ ...unit, price: 600000000 }] };

test("guest sees preliminary price and size comparison without inventing eligibility or commute", () => {
  const a = roughAssess(first, unit, null, null, today, [first, second]);
  assert.notEqual(a.total, null);
  assert.equal(a.provisional, true);
  assert.equal(a.measuredCount, 3);
  assert.equal(a.metrics.money.estimated, true);
  assert.equal(a.metrics.condition.estimated, true);
  assert.equal(a.metrics.transport.value, null);
  assert.equal(a.metrics.transport.missingLabel, "직장 입력");
  assert.deepEqual(a.checks, []);
  assert.equal(assess(first, unit, null, null, today).total, null);
});

test("undated payments allow only budget ratio estimate, never a verified cashflow claim", () => {
  const a = roughAssess(first, unit, { ...profile, cash: 100000000, loan: 200000000 }, null, today, [first, second]);
  assert.equal(a.metrics.money.value, 60);
  assert.equal(a.metrics.money.estimated, true);
  assert.equal(a.blockers.includes("납부 시점 자금 부족"), false);
  assert.match(a.metrics.money.reason, /납부시점/);
});

test("same district names in different provinces cannot imply a local commute", () => {
  const a = roughAssess(first, unit, { ...profile, workplace: "부산광역시 중구 중앙대로 1" }, null, today);
  assert.equal(a.metrics.transport.value, 20);
  assert.equal(a.metrics.transport.estimated, true);
  assert.match(a.metrics.transport.reason, /실제 거리·통근시간·환승은 미반영/);
  assert.notEqual(addressRegion("서울 중구")?.locality, addressRegion("부산 중구")?.locality);
});

test("current residence is not silently treated as a preferred location", () => {
  const a = roughAssess(first, unit, { ...profile, region: "서울 중구", preferredRegion: "" }, null, today);
  assert.equal(a.metrics.location.value, null);
  const preferred = roughAssess(first, unit, { ...profile, preferredRegion: "서울 중구" }, null, today);
  assert.equal(preferred.metrics.location.value, 100);
  assert.equal(preferred.metrics.location.estimated, true);
});

test("housing type area estimate keeps rooms unknown and never reads supply area", () => {
  assert.deepEqual(referenceArea(unit), { value: 59, estimated: true });
  assert.equal(referenceArea({ ...unit, name: "면적 미정" }), null);
  assert.equal(unit.rooms, null);
});

test("preliminary prices produce a stable rank even when the visible list is filtered", () => {
  const ranked = rankNotices([first, second], null, {}, new Date(today), [first, second]);
  assert.equal(ranked[0].notice.id, "first");
  const filtered = rankNotices([first], null, {}, new Date(today), [first, second]);
  assert.equal(filtered[0].assessment.total, ranked[0].assessment.total);
});
