import { test } from "node:test";
import assert from "node:assert/strict";
import { collectHousing } from "../src/lib/housing/sync";
import { fetchApplyhomePage } from "../src/lib/housing/applyhome";
import { catalog, mergeCatalog } from "../src/lib/housing/catalog";

const row = {
  HOUSE_MANAGE_NO: "2026000123", PBLANC_NO: "2026000123", HOUSE_NM: "새 분양",
  RENT_SECD: "0", RCRIT_PBLANC_DE: "2026-09-30", HSSPLY_ADRES: "서울특별시",
  RCEPT_BGNDE: "2026-10-01", RCEPT_ENDDE: "2026-10-05",
};
const model = { MODEL_NO: "01", HOUSE_TY: "59A", LTTOT_TOP_AMOUNT: "80,000" };

test("daily collection validates detail and model pages before publishing", async () => {
  const calls: string[] = [];
  const read: typeof fetchApplyhomePage = async (endpoint, page, filters) => {
    calls.push(`${endpoint}:${page}`);
    if (endpoint === "getAPTLttotPblancDetail") {
      assert.equal(filters?.["cond[RCRIT_PBLANC_DE::GTE]"], "2026-06-02");
      return { data: [row], totalCount: 1 };
    }
    assert.equal(filters?.["cond[PBLANC_NO::EQ]"], row.PBLANC_NO);
    return { data: [model], totalCount: 1 };
  };
  const result = await collectHousing(new Date("2026-09-30T03:00:00Z"), read);
  assert.deepEqual(calls, ["getAPTLttotPblancDetail:1", "getAPTLttotPblancMdl:1"]);
  assert.equal(result.notices[0].units[0].price, 800000000);
  assert.equal(result.notices[0].reviewedAt, null);
  assert.equal(mergeCatalog({}, result.notices).length, 2);
});

test("official API uses filtered matchCount rather than all-time totalCount", async () => {
  const previous = process.env.APPLYHOME_SERVICE_KEY;
  process.env.APPLYHOME_SERVICE_KEY = "test-key";
  try {
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("cond[RCRIT_PBLANC_DE::GTE]"), "2026-06-02");
      return new Response(JSON.stringify({ data: [row], totalCount: 2885, matchCount: 1 }), { status: 200 });
    };
    const result = await fetchApplyhomePage("getAPTLttotPblancDetail", 1, { "cond[RCRIT_PBLANC_DE::GTE]": "2026-06-02" }, fetcher);
    assert.equal(result.totalCount, 1);
  } finally {
    if (previous === undefined) delete process.env.APPLYHOME_SERVICE_KEY;
    else process.env.APPLYHOME_SERVICE_KEY = previous;
  }
});

test("incomplete model response rejects the complete update", async () => {
  const read: typeof fetchApplyhomePage = async (endpoint) => endpoint === "getAPTLttotPblancDetail"
    ? { data: [row], totalCount: 1 }
    : { data: [], totalCount: 1 };
  await assert.rejects(collectHousing(new Date("2026-09-30T03:00:00Z"), read), /불완전/);
});

test("changed official facts clear previously reviewed rules", () => {
  const reviewed = catalog[0];
  const updated = { ...reviewed, units: reviewed.units.map((unit, i) => i === 0
    ? { ...unit, price: (unit.price ?? 0) + 1000000, payments: [] }
    : unit), reviewedAt: null, rules: [], requirements: {
    accountRequired: null, accountMonths: null, accountDeposit: null, homelessRequired: null,
  } };
  const merged = mergeCatalog({}, [updated]);
  assert.equal(merged[0].reviewedAt, null);
  assert.equal(merged[0].rules.length, 0);
  assert.match(merged[0].changeNote, /정정공고/);
  assert.equal(mergeCatalog({}, [{ ...updated, units: reviewed.units }])[0].reviewedAt, reviewed.reviewedAt);
});
