import type { Notice } from "./model";

export const loanSources = {
  regions: "https://rt.molit.go.kr/pt/gis/gis.do?mobileAt=&srhThingSecd=C",
  rules: "https://www.fsc.go.kr/po020201/85518",
  dsr: "https://fsc.go.kr/po040200/78432",
  mortgage: "https://www.hf.go.kr/ko/sub01/sub01_01_01.do",
  honeymoon: "https://www.lh.or.kr/menu.es?mid=a10402010200",
  compare: "https://finlife.fss.or.kr/finlife/main/main.do",
} as const;

export type Regulation = "regulated" | "ordinary" | "unknown";
export type Borrower = "homeless" | "first" | "disposal" | "unknown";
export const loanRulesReviewedAt = "2026-10-01";
export function loanRulesNeedReview(today: string) {
  return Date.parse(`${today}T00:00:00Z`) - Date.parse(`${loanRulesReviewedAt}T00:00:00Z`) > 30 * 86400000;
}

// Official MOLIT GIS list checked 2026-10-01. Only classify a notice when its
// supply municipality is unambiguous; its marketing title may contain other cities.
export function regulationForNotice(notice: Pick<Notice, "id" | "address">): { region: Regulation; place: string } {
  if (notice.id === "2026000414" || notice.id === "2026820010")
    return { region: "ordinary", place: "인천 계양구" };
  const address = notice.address;
  const cities = ["서울특별시", "인천광역시", "경기도"].filter((name) => address.includes(name));
  if (cities.length !== 1) return { region: "unknown", place: "공급 지역 확인 필요" };
  if (cities[0] === "서울특별시") return { region: "regulated", place: "서울특별시" };
  if (cities[0] === "인천광역시") return { region: "ordinary", place: "인천광역시" };
  const city = address.match(/(?:경기도|경기)\s+([가-힣]+시)/)?.[1];
  if (!city) return { region: "unknown", place: "경기도 시·군 확인 필요" };
  const always = ["구리시", "과천시", "광명시", "의왕시", "하남시"];
  if (always.includes(city)) return { region: "regulated", place: `경기 ${city}` };
  const districts: Record<string, string[]> = {
    성남시: ["분당구", "수정구", "중원구"],
    수원시: ["영통구", "장안구", "팔달구"],
    안양시: ["동안구"],
    용인시: ["기흥구", "수지구"],
    화성시: ["동탄구"],
  };
  if (districts[city]) {
    const district = address.match(new RegExp(`${city}\\s+([가-힣]+구)`))?.[1];
    if (!district) return { region: "unknown", place: `경기 ${city} 구 확인 필요` };
    return { region: districts[city].includes(district) ? "regulated" : "ordinary", place: `경기 ${city} ${district}` };
  }
  return { region: "ordinary", place: `경기 ${city}` };
}

export function paymentPerWon(ratePercent: number, years: number) {
  const months = years * 12;
  const monthlyRate = ratePercent / 1200;
  return monthlyRate === 0 ? 1 / months : monthlyRate / (1 - (1 + monthlyRate) ** -months);
}

export function estimateMortgage(input: {
  value: number;
  desired: number;
  region: Regulation;
  capitalArea: boolean;
  borrower: Borrower;
  annualIncome: number | null;
  existingAnnualPayments: number | null;
  rate: number;
  stress: number;
  years: number;
}) {
  const { value, desired, region, capitalArea, borrower, annualIncome, existingAnnualPayments, rate, stress, years } = input;
  const ltv = region === "unknown" || borrower === "unknown" ? null : borrower === "first" ? 70 : region === "regulated" ? 40 : 70;
  const ltvCap = ltv === null ? null : Math.floor(value * ltv / 100);
  const metroCap = !capitalArea && region !== "regulated" ? null : value <= 1_500_000_000 ? 600_000_000 : value <= 2_500_000_000 ? 400_000_000 : 200_000_000;
  const dsrCap = annualIncome === null || existingAnnualPayments === null
    ? null
    : Math.max(0, Math.floor((annualIncome * 0.4 - existingAnnualPayments) / 12 / paymentPerWon(rate + stress, years)));
  const caps = [ltvCap, metroCap, dsrCap].filter((cap): cap is number => cap !== null);
  const estimate = ltvCap === null ? null : Math.min(...caps);
  const monthlyPayment = Math.round(desired * paymentPerWon(rate, years));
  const stressedMonthlyPayment = Math.round(desired * paymentPerWon(rate + stress, years));
  return {
    ltv, ltvCap, metroCap, dsrCap, estimate,
    monthlyPayment, stressedMonthlyPayment,
    dsrPercent: annualIncome && existingAnnualPayments !== null
      ? Math.round((stressedMonthlyPayment * 12 + existingAnnualPayments) / annualIncome * 1000) / 10
      : null,
  };
}
