import { strict as assert } from "node:assert";
import { test } from "node:test";
import { REGION_LABELS, regionOf, regionsPresent } from "../src/lib/housing/region";
import type { Notice } from "../src/lib/housing/model";

test("regionOf parses common address prefixes", () => {
  assert.equal(regionOf("서울특별시 강남구 역삼동 123"), "seoul");
  assert.equal(regionOf("서울 강서구 마곡동"), "seoul");
  assert.equal(regionOf("경기도 성남시 분당구"), "gyeonggi");
  assert.equal(regionOf("경기 수원시"), "gyeonggi");
  assert.equal(regionOf("인천광역시 계양구"), "incheon");
  assert.equal(regionOf("부산광역시 해운대구"), "busan");
  assert.equal(regionOf("세종특별자치시 한솔동"), "sejong");
  assert.equal(regionOf("강원특별자치도 춘천시"), "gangwon");
  assert.equal(regionOf("전북특별자치도 전주시"), "jeonbuk");
  assert.equal(regionOf("제주특별자치도 제주시"), "jeju");
});

test("regionOf is robust to whitespace and empties", () => {
  assert.equal(regionOf("  서울특별시   강남구  "), "seoul");
  assert.equal(regionOf(""), null);
  assert.equal(regionOf(undefined), null);
  assert.equal(regionOf(null), null);
});

test("regionOf does not match a region word that only appears inside the address", () => {
  // The prefix wins — a block label mentioning another region doesn't flip the region.
  assert.equal(regionOf("경기도 광주시 오포읍"), "gyeonggi");
  assert.equal(regionOf("인천광역시 중구 전남동"), "incheon");
});

test("regionsPresent returns display-ordered unique codes from a notice list", () => {
  const notices = [
    { address: "경기도 성남시" },
    { address: "서울특별시 강남구" },
    { address: "서울 영등포구" },
    { address: "부산광역시" },
    { address: "" },
  ] as Notice[];
  const present = regionsPresent(notices);
  assert.deepEqual(present, ["seoul", "gyeonggi", "busan"]);
  for (const code of present) {
    assert.ok(code in REGION_LABELS);
  }
});
