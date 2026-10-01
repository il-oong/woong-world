import { noticeSchema, type Notice } from "./model";
import feed from "@/data/housing-feed.json";
import { withReviewedFloorplans } from "./floorplans";

// Public facts manually checked against the official notice PDF on 2026-09-30.
// Evidence and update instructions: docs/housing.md. Never include personal data here.
const website = "https://xn--hc0bz5m11b1ue95n2zf6zxvzd.com";
const units = [
  ["59A", 59.9742, 879000000], ["59B", 59.7421, 877000000],
  ["84A", 84.8481, 1185000000], ["84B", 84.9648, 1197000000],
  ["84C", 84.9558, 1180000000], ["84D", 84.9796, 1198000000],
  ["84E", 84.9149, 1180000000],
] as const;
const a17Feed = feed.notices.find((notice) => notice.id === "2026820010");
if (!a17Feed) throw Error("인천계양 A17 공식 API 기본정보가 없습니다");

export const catalog: Notice[] = [noticeSchema.parse({
  id: "2026000453",
  title: "광명 시티프라디움 에듀하임",
  kind: "sale", supplyType: "민영 일반공급 1순위 기준",
  address: "경기도 광명시 소하동 광명 구름산지구 도시개발사업지구 A6BL",
  sourceUrl: "https://static.applyhome.co.kr/ai/aia/getAtchmnfl.do?houseManageNo=2026000453&pblancNo=2026000453&atchmnflSeqNo=1971127&atchmnflSn=7",
  applicationUrl: "https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=2026000453&pblancNo=2026000453",
  publishedAt: "2026-09-18", reviewedAt: "2026-09-30",
  moveInNote: "2029년 3월 예정 · 지정일 추후 안내",
  priceNote: "주택형별 최고층 구간 공급금액 기준(원문 9~10쪽). 실제 동·층에 따라 달라집니다. 계약금 10%(1차 3천만원, 2차 1개월 내 나머지), 중도금 40%, 잔금 50%. 옵션·세금 등 별도.",
  locationUrl: "https://place.map.kakao.com/328464023",
  locationImageUrl: "/housing/gwangmyeong/location.png",
  events: [
    { label: "특별공급 접수 시작", date: "2026-09-29", type: "open", time: "09:00" },
    { label: "특별공급 접수 마감", date: "2026-09-29", type: "close", time: "17:30" },
    { label: "1순위 해당지역 접수 시작", date: "2026-09-30", type: "open", time: "09:00" },
    { label: "1순위 해당지역 접수 마감", date: "2026-09-30", type: "close", time: "17:30" },
    { label: "1순위 기타지역 접수 시작", date: "2026-10-01", type: "open", time: "09:00" },
    { label: "1순위 기타지역 접수 마감", date: "2026-10-01", type: "close", time: "17:30" },
    { label: "2순위 접수 시작", date: "2026-10-02", type: "open", time: "09:00" },
    { label: "2순위 접수 마감", date: "2026-10-02", type: "close", time: "17:30" },
    { label: "당첨자 발표", date: "2026-10-12", type: "result" },
    { label: "정당계약 시작", date: "2026-10-24", type: "contract", time: "10:00" },
    { label: "정당계약 종료", date: "2026-10-26", type: "contract", time: "17:00" },
  ],
  units: units.map(([id, area, price]) => ({
    id, name: id, area, price,
    floorPlanUrl: `${website}/pages/unit?tab=${id}`,
    floorPlanImageUrl: `/housing/gwangmyeong/${id}.jpg`,
    payments: [
      { label: "계약금 1차 · 계약 시", date: null, amount: 30000000 },
      { label: "계약금 2차 · 계약 후 1개월 내", date: null, amount: price / 10 - 30000000 },
      ...["2027-04-30", "2027-11-30", "2028-05-31", "2028-11-30"].map((date, i) => ({ label: `중도금 ${i + 1}회 (10%)`, date, amount: price / 10 })),
      { label: "잔금 (50%) · 입주지정일", date: null, amount: price / 2 },
    ],
  })),
  requirements: { accountRequired: true, accountMonths: 24 },
  rules: [
    { key: "account", page: "2, 25쪽", quote: "", summary: "일반공급 1순위는 통장 가입 24개월 이상과 지역별 예치금 충족이 필요합니다. 전용 85㎡ 이하 예치금은 공고일 거주지 기준 서울 300만원·인천 250만원·경기 200만원입니다. 2순위 및 특별공급은 별도 기준입니다." },
    { key: "eligibility", page: "5, 25쪽", quote: "", summary: "공고일 기준 수도권 거주 만 19세 이상 등 신청 대상에 해당해야 합니다. 광명 2년 이상 계속 거주자에게 우선권이 있습니다. 일반공급 1순위는 세대주, 2주택 이상 보유 세대가 아닐 것, 최근 5년 내 당첨된 사람의 세대가 아닐 것 등의 조건을 확인해야 합니다." },
    { key: "income", page: "13~25쪽", quote: "", summary: "소득·자산·무주택 요건은 특별공급 유형마다 다릅니다. 이 화면의 1순위 통장 점검만으로 특별공급 자격을 판단할 수 없습니다. 본인 유형의 원문 기준을 대조하세요." },
    { key: "resale", page: "6, 43쪽", quote: "", summary: "당첨자 발표일(2026.10.12.)부터 3년. 그 전에 소유권이전등기를 완료하면 등기 완료 때까지입니다. 최초 분양 이후 매매에는 토지거래허가 등 별도 규제가 적용될 수 있습니다." },
    { key: "residence", page: "1, 6쪽", quote: "", summary: "모집공고 표상 거주의무기간은 없습니다. 다만 토지거래허가구역의 후속 매매·이용 조건과는 별개이므로 이를 임대·매매 무제한으로 해석하면 안 됩니다." },
    { key: "rewinning", page: "5쪽", quote: "", summary: "당첨자 발표일로부터 재당첨 제한 10년이 적용됩니다. 기존 재당첨 제한 중인 본인·세대원은 신청 제한을 확인해야 하며, 특별공급 혼인 관련 예외는 원문을 확인하세요." },
    { key: "other", page: "5~6쪽", quote: "", summary: "서류접수는 10월 14~19일, 정당계약은 10월 24~26일 예정입니다. 중복당첨은 당첨일·접수시각·부부 여부에 따라 처리 기준이 다릅니다. 최종 자격과 일정은 청약홈 및 정정공고로 확인하세요." },
  ],
}), withReviewedFloorplans(noticeSchema.parse({
  ...a17Feed,
  supplyType: "LH 신혼희망타운 공공분양 · 신혼부부·예비신혼부부·한부모가족",
  sourceUrl: "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=68807314",
  applicationUrl: "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?aisTpCd=39&ccrCnntSysDsCd=02&mi=1027&panId=0000061179&uppAisTpCd=39",
  reviewedAt: "2026-10-01",
  moveInNote: "2029년 11월 예정 · 정확한 입주일은 추후 안내",
  priceNote: "주택형별 최고 공급금액은 청약홈 API 기준입니다. 실제 계약금액은 동·층에 따라 다릅니다. LH 공고문 4~8쪽에서 해당 층의 가격과 납부액을 확인하세요.",
  events: [
    { label: "사전청약 당첨자 접수 시작", date: "2026-10-19", type: "open", time: "10:00" },
    { label: "사전청약 당첨자 접수 마감", date: "2026-10-20", type: "close", time: "17:00" },
    { label: "본청약 신혼부부·예비신혼부부·한부모가족 접수 시작", date: "2026-10-26", type: "open", time: "10:00" },
    { label: "본청약 신혼부부·예비신혼부부·한부모가족 접수 마감", date: "2026-10-27", type: "close", time: "17:00" },
    { label: "당첨자 발표", date: "2026-11-05", type: "result", time: null },
    { label: "계약 시작", date: "2027-02-23", type: "contract", time: null },
    { label: "계약 마감", date: "2027-02-26", type: "contract", time: null },
  ],
  requirements: { accountRequired: true, accountMonths: 6, accountDeposit: 0, homelessRequired: true },
  rules: [
    { key: "account", page: "15쪽", quote: "", summary: "본청약 신혼부부·예비신혼부부·한부모가족은 입주자저축 가입 후 6개월 경과와 월납입금 6회 이상 납입이 필요합니다. 별도 예치금 기준은 제시되지 않습니다. 납입인정 횟수는 청약홈 순위확인서로 확인해야 하며 통장 가입기간만으로 자격을 확정할 수 없습니다. 사전청약 당첨자는 해당 유형의 별도 기준을 확인하세요." },
    { key: "eligibility", page: "8, 15쪽", quote: "", summary: "공고일(2026.09.30.) 현재 수도권 거주자 중 신혼부부(혼인 7년 이내 또는 6세 이하 자녀), 입주 전 혼인을 증명할 예비신혼부부, 또는 6세 이하 자녀가 있는 한부모가족이 대상입니다. 인천 거주자에게 단계별 물량 50%를 우선 공급하고 나머지 50%는 수도권 거주자에게 공급합니다. 사전청약 당첨자는 별도 접수 대상입니다." },
    { key: "income", page: "10~12, 15쪽", quote: "", summary: "본청약은 유형별 무주택세대구성원 또는 혼인 예정 세대의 소득·총자산을 심사합니다. 일반 신청자격의 월평균소득은 전년도 도시근로자 가구당 월평균소득 130% 이하(신혼부부·예비신혼부부 맞벌이 200% 이하), 총자산은 3억 6,200만원 이하가 기본입니다. 우선·일반공급 단계와 출산가구 완화 기준은 별도이므로 본인 세대원 수·소득 유형을 공고 표와 대조해야 합니다. 사전청약 당첨자는 소득·자산 재심사 여부가 다릅니다." },
    { key: "resale", page: "2, 17쪽", quote: "", summary: "당첨자 발표일인 2026.11.05.부터 3년간 전매제한입니다. 제한기간 안에 소유권이전등기를 완료하면 등기 완료 시 제한기간이 지난 것으로 봅니다. 부득이한 전매에는 LH 우선매입 등 별도 절차가 있습니다." },
    { key: "residence", page: "2쪽", quote: "", summary: "공고문 규제표상 거주의무기간은 없습니다. 다만 입주 시까지 무주택세대구성원 자격 유지 등 신청 조건은 별도로 적용됩니다." },
    { key: "rewinning", page: "2, 17쪽", quote: "", summary: "당첨자 발표일부터 재당첨 제한 10년이 적용됩니다. 당첨자와 배우자·세대원에게 영향을 주므로 과거 당첨·제한 상태도 청약 전 확인해야 합니다." },
    { key: "other", page: "1~3, 13, 17쪽", quote: "", summary: "동일 세대 중복 신청과 동일 당첨일 중복 청약에는 무효·부적격 규정이 있습니다. 부부의 같은 발표일 각각 신청은 예외가 있으나 중복 당첨 시 선접수분만 인정됩니다(예비신혼부부 제외). 이 단지는 신혼희망타운 전용 수익공유형 모기지를 주택가격의 30% 이상 의무 가입해야 하며, 사전청약 당첨자와 본청약자의 접수일이 다릅니다." },
  ],
}))];

// The LH document gives the true supply-type schedule. The generic APT API
// labels its dates as first/second priority, so compare future API refreshes
// against the values reviewed on 2026-10-01 rather than these LH events.
const a17ApiBaseline = {
  title: "인천계양 A17블록 신혼희망타운(공공분양)(본청약)",
  publishedAt: "2026-09-30",
  prices: [508440000, 508260000, 507170000],
  eventDates: [
    "close:2026-10-22", "close:2026-10-27", "contract:2027-02-23",
    "contract:2027-02-26", "open:2026-10-19", "open:2026-10-23",
    "result:2026-11-05",
  ],
};

function reviewedFactsChanged(reviewed: Notice, latest: Notice) {
  if (latest.id === "2026820010") {
    return latest.title !== a17ApiBaseline.title ||
      latest.publishedAt !== a17ApiBaseline.publishedAt ||
      JSON.stringify(latest.units.map((unit) => unit.price)) !== JSON.stringify(a17ApiBaseline.prices) ||
      JSON.stringify([...new Set(latest.events.map((event) => `${event.type}:${event.date}`))].sort()) !== JSON.stringify(a17ApiBaseline.eventDates);
  }
  const dates = new Set(reviewed.events.map((event) => `${event.type}:${event.date}`));
  return reviewed.title !== latest.title ||
    reviewed.publishedAt !== latest.publishedAt ||
    JSON.stringify(reviewed.units.map((unit) => unit.price).sort()) !== JSON.stringify(latest.units.map((unit) => unit.price).sort()) ||
    latest.events.some((event) => !dates.has(`${event.type}:${event.date}`));
}

// Null is a persistent removal marker, so a deleted bundled notice stays hidden.
export function mergeCatalog(records: Record<string, unknown> = {}, daily: unknown[] = feed.notices): Notice[] {
  const merged = new Map(catalog.map((n) => [n.id, n]));
  for (const value of daily) {
    const latest = noticeSchema.parse(value);
    const reviewed = merged.get(latest.id);
    if (!reviewed) { merged.set(latest.id, withReviewedFloorplans(latest)); continue; }
    // The reviewed summary is only valid while the official core facts still match.
    if (reviewedFactsChanged(reviewed, latest))
      merged.set(latest.id, noticeSchema.parse({ ...latest, changeNote: "공식 기본정보가 이전 분석과 달라졌습니다. 청약통장·전매제한 등은 정정공고 원문 확인 전까지 보류합니다." }));
  }
  for (const [id, value] of Object.entries(records)) {
    if (value === null) merged.delete(id);
    else {
      const notice = noticeSchema.parse(value);
      if (notice.id !== id) throw Error("공고 저장 ID 불일치");
      merged.set(id, notice);
    }
  }
  return [...merged.values()];
}
