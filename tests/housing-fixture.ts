import {
  noticeSchema,
  profileSchema,
  type Commute,
} from "../src/lib/housing/model";
export const fixture = noticeSchema.parse({
  id: "test-housing",
  title: "테스트 전용 · 한강 가든",
  kind: "sale",
  supplyType: "테스트 일반공급",
  address: "서울특별시 중구 세종대로 110",
  sourceUrl: "https://www.applyhome.co.kr",
  applicationUrl: "https://www.applyhome.co.kr",
  publishedAt: "2026-09-01",
  reviewedAt: "2026-09-30",
  point: { lat: 37.5665, lng: 126.978 },
  events: [
    { label: "청약 접수", date: "2026-10-01", type: "open", time: "09:00" },
    { label: "청약 마감", date: "2026-10-05", type: "close", time: "17:30" },
    { label: "당첨 발표", date: "2026-10-12", type: "result" },
  ],
  units: [
    {
      id: "59a",
      name: "59A",
      area: 59,
      rooms: 3,
      price: 500000000,
      payments: [
        { label: "계약금", date: "2026-10-20", amount: 50000000 },
        { label: "중도금", date: "2027-10-20", amount: 300000000 },
        { label: "잔금", date: "2028-10-20", amount: 150000000 },
      ],
    },
    { id: "84a", name: "84A", area: 84, rooms: 4, price: 700000000 },
  ],
  requirements: {
    accountRequired: true,
    accountMonths: 12,
    accountDeposit: 3000000,
    homelessRequired: true,
  },
  rules: [
    {
      key: "account",
      summary: "테스트 통장 조건입니다. 실제 공고가 아닙니다.",
      page: "테스트 1쪽",
      quote: "테스트 조건",
    },
  ],
  nearby: [
    {
      kind: "마트",
      name: "테스트 마트",
      meters: 300,
      source: "https://www.applyhome.co.kr",
      checkedAt: "2026-09-30",
    },
    {
      kind: "병원",
      name: "테스트 병원",
      meters: 500,
      source: "https://www.applyhome.co.kr",
      checkedAt: "2026-09-30",
    },
  ],
  comparable: {
    pricePerM2: 10000000,
    source: "https://www.applyhome.co.kr",
    checkedAt: "2026-09-30",
    note: "테스트 비교 자료",
  },
});
export const profile = profileSchema.parse({
  cash: 400000000,
  monthlySaving: 1000000,
  loan: 200000000,
  monthlyBudget: 2000000,
  workplace: "서울특별시 강남구 테헤란로 152",
  account: "yes",
  accountMonths: 24,
  accountDeposit: 5000000,
  homeless: "yes",
});
export const commute: Commute = {
  minutes: 35,
  transfers: 1,
  walkMinutes: 8,
  checkedAt: "2026-09-30",
  destination: profile.workplace,
};
