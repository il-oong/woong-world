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
import { catalog, mergeCatalog } from "../src/lib/housing/catalog";
import { withReviewedFloorplans } from "../src/lib/housing/floorplans";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mapPreview, mapProviderQuery, mapSearchQuery, mapSearchUrl } from "../src/lib/housing/map-search";
import feed from "../src/data/housing-feed.json";
const today = "2026-09-30";
test("official Gyeyang floorplans match all current unit types and bundled images exist", () => {
  for (const [id, count] of [["2026000414", 13], ["2026820010", 3]] as const) {
    const notice = mergeCatalog().find((item) => item.id === id);
    assert.ok(notice);
    assert.equal(notice.units.length, count);
    for (const unit of notice.units) {
      assert.ok(unit.floorPlanUrl?.startsWith("https://"));
      assert.ok(unit.floorPlanImageUrl?.endsWith(".webp"));
      assert.ok(existsSync(join(process.cwd(), "public", unit.floorPlanImageUrl!.slice(1))));
    }
    assert.equal(withReviewedFloorplans({ ...notice, units: [{ ...notice.units[0], name: "새 주택형", floorPlanImageUrl: null }] }).units[0].floorPlanImageUrl, null);
  }
});
test("a multi-city supply address searches the actual project block", () => {
  const a6 = feed.notices.find((n) => n.title.includes("인천계양지구 A6블록"));
  const a17 = feed.notices.find((n) => n.title.includes("인천계양 A17블록"));
  assert.ok(a6 && a17);
  assert.equal(mapSearchQuery(a6.address, a6.title), "인천계양 테크노밸리 공공주택지구 A6블록");
  assert.equal(mapSearchQuery(a17.address, a17.title), "인천계양 테크노밸리 공공주택지구 A17블록");
  assert.equal(mapProviderQuery(a6.address, a6.title), "인천계양 A6");
  assert.equal(mapProviderQuery(a17.address, a17.title), "인천계양 A17");
  assert.equal(decodeURIComponent(mapSearchUrl(a6).split("/search/")[1]), "인천계양 A6");
  assert.equal(mapSearchUrl(catalog[0]), catalog[0].locationUrl);
  assert.deepEqual(mapPreview(a6)?.point, { lat: 37.5526540270373, lng: 126.75619766034752 });
  assert.equal(mapPreview(a17)?.sourceUrl, "https://place.map.kakao.com/1329340730");
  assert.equal(mapPreview({ ...a6, address: "다른 지역 다른 블록" }), null);
});
test("verified public notice survives missing Redis, while deletion and corrections override it", () => {
  const notice = catalog[0];
  assert.equal(mergeCatalog().find((n) => n.id === "2026000453")?.title, "광명 시티프라디움 에듀하임");
  assert.equal(mergeCatalog({ [notice.id]: null }).some((n) => n.id === notice.id), false);
  assert.equal(mergeCatalog({ [notice.id]: { ...notice, title: "정정 공고" } }).find((n) => n.id === notice.id)?.title, "정정 공고");
});

test("Gyeyang A17 uses the reviewed LH document instead of generic APT priority dates", () => {
  const notice = mergeCatalog().find((item) => item.id === "2026820010");
  assert.ok(notice);
  assert.equal(notice.reviewedAt, "2026-10-01");
  assert.equal(notice.rules.length, 7);
  assert.equal(notice.requirements.accountMonths, 6);
  assert.equal(notice.requirements.accountDeposit, 0);
  assert.ok(notice.events.some((event) => event.date === "2026-10-26" && event.label.includes("본청약")));
  assert.ok(!notice.events.some((event) => event.label.includes("1순위")));
  assert.match(notice.rules.find((rule) => rule.key === "resale")?.summary ?? "", /3년/);
  const changedFeed = feed.notices.find((item) => item.id === notice.id);
  assert.ok(changedFeed);
  const stale = mergeCatalog({}, [{ ...changedFeed, units: changedFeed.units.map((unit, index) => index === 0
    ? { ...unit, price: (unit.price ?? 0) + 10000 }
    : unit) }]).find((item) => item.id === notice.id);
  assert.equal(stale?.reviewedAt, null);
  assert.equal(stale?.rules.length, 0);
});

test("undated payments compare entered cash without inventing saving months or verified money score", () => {
  const unit = catalog[0].units[0];
  assert.equal(unit.payments.reduce((sum, payment) => sum + payment.amount, 0), unit.price);
  assert.deepEqual(unit.payments.slice(2, 6).map((p) => p.date), ["2027-04-30", "2027-11-30", "2028-05-31", "2028-11-30"]);
  const rows = funding(unit, profile, today);
  assert.equal(rows[0].available, profile.cash);
  assert.equal(rows[0].estimated, true);
  assert.equal(rows[2].estimated, false);
  assert.ok(rows[2].available! > profile.cash!);
  assert.equal(rows.at(-1)?.available, profile.cash! + profile.loan!);
  assert.equal(funding(unit, { ...profile, monthlySaving: null, loan: null }, today)[0].available, profile.cash);
  assert.equal(assess(catalog[0], unit, profile, null, today).metrics.money.value, null);
});
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
