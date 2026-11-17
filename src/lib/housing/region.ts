import type { Notice } from "./model";

/**
 * Korean administrative region codes used by the dashboard's region filter.
 * The order here is the display order in chips.
 */
export const REGION_LABELS = {
  seoul: "서울",
  gyeonggi: "경기",
  incheon: "인천",
  busan: "부산",
  daegu: "대구",
  gwangju: "광주",
  daejeon: "대전",
  ulsan: "울산",
  sejong: "세종",
  gangwon: "강원",
  chungbuk: "충북",
  chungnam: "충남",
  jeonbuk: "전북",
  jeonnam: "전남",
  gyeongbuk: "경북",
  gyeongnam: "경남",
  jeju: "제주",
} as const;

export type RegionCode = keyof typeof REGION_LABELS;

/**
 * Patterns run against the address prefix. First match wins. Both the
 * full official name ("서울특별시") and the short conversational form
 * ("서울") are accepted because feeds vary. Patterns are anchored with
 * `startsWith` after whitespace is normalized, so an address like
 * "서울특별시 ..." stays safe from false matches on substrings.
 */
const PATTERNS: Array<{ code: RegionCode; re: RegExp }> = [
  { code: "seoul", re: /^서울(?:특별시)?/ },
  { code: "gyeonggi", re: /^경기(?:도)?/ },
  { code: "incheon", re: /^인천(?:광역시)?/ },
  { code: "busan", re: /^부산(?:광역시)?/ },
  { code: "daegu", re: /^대구(?:광역시)?/ },
  { code: "gwangju", re: /^광주(?:광역시)?/ },
  { code: "daejeon", re: /^대전(?:광역시)?/ },
  { code: "ulsan", re: /^울산(?:광역시)?/ },
  { code: "sejong", re: /^세종(?:특별자치시)?/ },
  { code: "gangwon", re: /^강원(?:특별자치도|도)?/ },
  { code: "chungbuk", re: /^(?:충청북도|충북)/ },
  { code: "chungnam", re: /^(?:충청남도|충남)/ },
  { code: "jeonbuk", re: /^(?:전라북도|전북(?:특별자치도)?)/ },
  { code: "jeonnam", re: /^(?:전라남도|전남)/ },
  { code: "gyeongbuk", re: /^(?:경상북도|경북)/ },
  { code: "gyeongnam", re: /^(?:경상남도|경남)/ },
  { code: "jeju", re: /^제주(?:특별자치도)?/ },
];

export function regionOf(address: string | undefined | null): RegionCode | null {
  if (!address) return null;
  const head = address.trim().replace(/\s+/g, " ");
  for (const { code, re } of PATTERNS) {
    if (re.test(head)) return code;
  }
  return null;
}

/**
 * Returns the region codes that appear in the notice list, in the
 * canonical display order from REGION_LABELS. Lets the UI render chips
 * only for regions the user actually has listings in.
 */
export function regionsPresent(notices: Notice[]): RegionCode[] {
  const present = new Set<RegionCode>();
  for (const n of notices) {
    const code = regionOf(n.address);
    if (code) present.add(code);
  }
  return (Object.keys(REGION_LABELS) as RegionCode[]).filter((code) =>
    present.has(code),
  );
}
