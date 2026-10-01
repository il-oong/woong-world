import { test } from "node:test";
import assert from "node:assert/strict";
import feed from "../src/data/housing-feed.json";
import { catalog } from "../src/lib/housing/catalog";
import { estimateMortgage, loanRulesNeedReview, regulationForNotice } from "../src/lib/housing/loan-guidance";

test("multi-city Gyeyang supply text uses the actual block, while Gwangmyeong is regulated", () => {
  for (const id of ["2026000414", "2026820010"]) {
    const notice = feed.notices.find((item) => item.id === id);
    assert.ok(notice);
    assert.deepEqual(regulationForNotice(notice), { region: "ordinary", place: "인천 계양구" });
  }
  assert.deepEqual(regulationForNotice(catalog[0]), { region: "regulated", place: "경기 광명시" });
  assert.equal(regulationForNotice({ id: "test", address: "경기도 수원시 영통구" }).region, "regulated");
  assert.equal(regulationForNotice({ id: "test", address: "경기도 수원시 권선구" }).region, "ordinary");
  assert.equal(regulationForNotice({ id: "test", address: "경기도 수원시 일원" }).region, "unknown");
  assert.equal(regulationForNotice({ id: "test", address: "경기도 김포시 및 서울특별시 강서구" }).region, "unknown");
  assert.equal(loanRulesNeedReview("2026-10-31"), false);
  assert.equal(loanRulesNeedReview("2026-11-01"), true);
});

test("loan calculator takes the tightest LTV, price cap and stress DSR limit", () => {
  const common = { value: 900_000_000, desired: 500_000_000, capitalArea: true, annualIncome: 80_000_000,
    existingAnnualPayments: 5_000_000, rate: 4, stress: 3, years: 30 };
  const regulated = estimateMortgage({ ...common, region: "regulated", borrower: "homeless" });
  assert.equal(regulated.ltv, 40);
  assert.equal(regulated.ltvCap, 360_000_000);
  assert.equal(regulated.metroCap, 600_000_000);
  assert.ok(regulated.dsrCap! < regulated.ltvCap!);
  assert.equal(regulated.estimate, regulated.dsrCap);
  assert.ok(regulated.stressedMonthlyPayment > regulated.monthlyPayment);
  const first = estimateMortgage({ ...common, region: "regulated", borrower: "first", annualIncome: null });
  assert.equal(first.ltv, 70);
  assert.equal(first.estimate, 600_000_000);
  assert.equal(first.dsrCap, null);
  assert.equal(estimateMortgage({ ...common, value: 1_600_000_000, region: "ordinary", borrower: "first" }).metroCap, 400_000_000);
  assert.equal(estimateMortgage({ ...common, value: 2_600_000_000, region: "ordinary", borrower: "first" }).metroCap, 200_000_000);
  const unknown = estimateMortgage({ ...common, region: "unknown", borrower: "homeless" });
  assert.equal(unknown.estimate, null);
  assert.equal(estimateMortgage({ ...common, capitalArea: false, region: "ordinary", borrower: "homeless" }).metroCap, null);
  assert.equal(estimateMortgage({ ...common, region: "ordinary", borrower: "homeless", annualIncome: 10_000_000 }).dsrCap, 0);
});
