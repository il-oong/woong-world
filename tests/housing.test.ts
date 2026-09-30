import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, profile, commute } from "./housing-fixture";
import {
  assess,
  funding,
  monthlyPayment,
  rankNotices,
} from "../src/lib/housing/scoring";
import {
  noticeSchema,
  profileSchema,
  isClosed,
  todayKst,
  httpsUrl,
} from "../src/lib/housing/model";
import { fromApplyhome } from "../src/lib/housing/applyhome";
const today = "2026-09-30";
test("an incomplete unit cannot hide a known cash shortfall in the representative card", () => {
  const ranked = rankNotices(
    [fixture],
    { ...profile, cash: 10000000 },
    {},
    new Date(today),
  );
  assert.equal(ranked[0].unit.id, "59a");
  assert.ok(ranked[0].assessment.blockers.includes("납부 시점 자금 부족"));
});
test("future evidence is not treated as verified current investment data", () => {
  assert.equal(
    assess(
      {
        ...fixture,
        comparable: { ...fixture.comparable!, checkedAt: "2027-01-01" },
      },
      fixture.units[0],
      profile,
      commute,
      today,
    ).metrics.investment.value,
    null,
  );
});
test("missing dimensions cannot produce a misleading overall rank", () => {
  const a = assess(fixture, fixture.units[0], profile, null, today);
  assert.equal(a.total, null);
  assert.equal(a.coverage, 75);
  assert.equal(a.metrics.transport.value, null);
});
test("all known dimensions produce bounded overall score", () => {
  const a = assess(fixture, fixture.units[0], profile, commute, today);
  assert.equal(a.coverage, 100);
  assert.ok(a.total! >= 0 && a.total! <= 100);
  assert.deepEqual(a.blockers, []);
});
test("zero-weight missing dimension does not block ranking", () => {
  const a = assess(
    fixture,
    fixture.units[0],
    { ...profile, weights: { ...profile.weights, transport: 0 } },
    null,
    today,
  );
  assert.notEqual(a.total, null);
});
test("unknown cash differs from zero cash", () => {
  assert.equal(
    assess(
      fixture,
      fixture.units[0],
      { ...profile, cash: null },
      commute,
      today,
    ).metrics.money.value,
    null,
  );
  assert.ok(
    assess(
      fixture,
      fixture.units[0],
      { ...profile, cash: 0 },
      commute,
      today,
    ).blockers.includes("납부 시점 자금 부족"),
  );
});
test("loan is counted only once at final payment and contract shortfall remains", () => {
  const rows = funding(
    fixture.units[0],
    { ...profile, cash: 0, monthlySaving: 0, loan: 500000000 },
    today,
  );
  assert.equal(rows[0].available, 0);
  assert.equal(rows[0].shortfall, 50000000);
  assert.equal(rows[1].available, 0);
  assert.equal(rows[2].available, 500000000);
  assert.equal(rows[2].shortfall, 0);
});
test("zero-interest loan calculation", () =>
  assert.equal(monthlyPayment(120000000, 0, 10), 1000000));
test("savings count complete calendar months, including month ends", () => {
  const u = {
    ...fixture.units[0],
    payments: [{ label: "납부", date: "2027-09-30", amount: 1 }],
  };
  assert.equal(
    funding(u, { ...profile, cash: 0, monthlySaving: 100, loan: 0 }, today)[0]
      .available,
    1200,
  );
  assert.equal(
    funding(
      { ...u, payments: [{ label: "납부", date: "2027-02-28", amount: 1 }] },
      { ...profile, cash: 0, monthlySaving: 100, loan: 0 },
      "2027-01-31",
    )[0].available,
    100,
  );
});
test("unreviewed requirements do not assert eligibility", () => {
  const a = assess(
    { ...fixture, reviewedAt: null },
    fixture.units[0],
    { ...profile, account: "no" },
    commute,
    today,
  );
  assert.equal(a.checks[0].status, "unknown");
});
test("account failure is a recommendation blocker", () => {
  const a = assess(
    fixture,
    fixture.units[0],
    { ...profile, account: "no" },
    commute,
    today,
  );
  assert.equal(a.checks[0].status, "fail");
  assert.ok(a.blockers.includes("청약통장 보유 조건 불충족"));
});
test("rent omits investment weighting", () => {
  const n = { ...fixture, kind: "rent" as const };
  const a = assess(
    n,
    { ...n.units[0], monthlyRent: 300000 },
    profile,
    commute,
    today,
  );
  assert.equal(a.metrics.investment.value, null);
  assert.equal(a.coverage, 100);
  assert.notEqual(a.total, null);
});
test("stale transaction evidence cannot yield investment score", () => {
  const a = assess(
    {
      ...fixture,
      comparable: { ...fixture.comparable!, checkedAt: "2025-01-01" },
    },
    fixture.units[0],
    profile,
    commute,
    today,
  );
  assert.equal(a.metrics.investment.value, null);
  assert.equal(a.total, null);
});
test("weighted preference changes change ordering", () => {
  const a = {
    ...fixture,
    id: "a",
    units: [{ ...fixture.units[0], area: 100, rooms: 5 }],
    nearby: fixture.nearby.map((v) => ({ ...v, meters: 1900 })),
  };
  const b = { ...fixture, id: "b", units: [fixture.units[0]] };
  const p = { ...profile, minArea: 50, minRooms: 2 };
  const result = rankNotices(
    [a, b],
    {
      ...p,
      weights: {
        money: 0,
        transport: 0,
        location: 100,
        condition: 0,
        investment: 0,
      },
    },
    {},
    new Date("2026-09-30"),
  );
  assert.equal(result[0].notice.id, "b");
});
test("Korean midnight and explicit deadline", () => {
  assert.equal(todayKst(new Date("2026-09-30T16:00:00Z")), "2026-10-01");
  assert.equal(isClosed(fixture, new Date("2026-10-05T08:29:00Z")), false);
  assert.equal(isClosed(fixture, new Date("2026-10-05T08:31:00Z")), true);
});
test("validation rejects invalid dates, amount totals and unsafe URLs", () => {
  assert.equal(
    noticeSchema.safeParse({ ...fixture, publishedAt: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    noticeSchema.safeParse({
      ...fixture,
      units: [{ ...fixture.units[0], price: 1 }],
    }).success,
    false,
  );
  assert.equal(httpsUrl.safeParse("javascript:alert(1)").success, false);
  assert.equal(
    httpsUrl.safeParse("https://user:secret@example.com").success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...profile, cash: -1 }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({
      ...profile,
      weights: {
        money: 0,
        transport: 0,
        location: 0,
        condition: 0,
        investment: 0,
      },
    }).success,
    false,
  );
});
test("official import converts ten-thousand won and never confuses supply area with exclusive area", () => {
  const n = fromApplyhome(
    {
      HOUSE_MANAGE_NO: "2026000453",
      PBLANC_NO: "2026000453",
      HOUSE_NM: "테스트",
      RENT_SECD: "0",
      RCRIT_PBLANC_DE: today,
      RCEPT_BGNDE: "2026-10-01",
      RCEPT_ENDDE: "2026-10-05",
    },
    [
      {
        MODEL_NO: "01",
        HOUSE_TY: "059.9742A",
        SUPLY_AR: "78.5038",
        LTTOT_TOP_AMOUNT: "87,900",
      },
    ],
  );
  assert.equal(n.units[0].price, 879000000);
  assert.equal(n.units[0].area, null);
  assert.equal(n.requirements.accountRequired, null);
  assert.equal(n.reviewedAt, null);
});
