import { dimensions, emptyProfile, type Notice, type Profile, type Unit } from "./model";
import type { Assessment, Metric } from "./scoring";

const clamp = (value: number) => Math.round(Math.max(0, Math.min(100, value)));

// A numeric housing type can support an area estimate. Never use SUPLY_AR.
export function referenceArea(unit: Unit): { value: number; estimated: boolean } | null {
  if (unit.area !== null) return { value: unit.area, estimated: false };
  const match = unit.name.match(/^0*(\d{2,3}(?:\.\d+)?)(?:[A-Z][A-Z0-9]*)?(?:\s|\(|$)/i);
  const value = match ? Number(match[1]) : NaN;
  return value > 0 && value <= 500 ? { value, estimated: true } : null;
}

const provinces: Record<string, string> = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시",
  광주: "광주광역시", 대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시",
  경기: "경기도", 강원: "강원특별자치도", 충북: "충청북도", 충남: "충청남도",
  전북: "전북특별자치도", 전남: "전라남도", 경북: "경상북도", 경남: "경상남도", 제주: "제주특별자치도",
};
export function addressRegion(address: string) {
  const tokens = address.trim().split(/\s+/);
  const province = provinces[tokens[0]] ?? Object.values(provinces).find((v) => v === tokens[0]);
  if (!province) return null;
  const local = tokens.slice(1, 3).filter((v) => /(?:시|군|구)$/.test(v));
  return { province, locality: [province, ...local].join(" ") };
}

function rankedPrice(value: number, values: number[]) {
  return clamp(100 * (values.filter((other) => other > value).length +
    values.filter((other) => other === value).length / 2) / values.length);
}

export function approximateAssessment(
  original: Assessment, notice: Notice, unit: Unit, profile: Profile | null,
  peers: Notice[], today: string,
): Assessment {
  const p = profile ?? emptyProfile();
  const metrics = Object.fromEntries(dimensions.map((key) => [key, { ...original.metrics[key] }])) as Assessment["metrics"];
  const area = referenceArea(unit);
  const recent = peers.filter((n) => n.kind === notice.kind && n.publishedAt <= today &&
    Date.parse(today) - Date.parse(n.publishedAt) <= 120 * 86400000);
  const comparison = recent.map((n) => {
    const choices = n.units.filter((u) => u.price !== null && u.price > 0 && referenceArea(u));
    choices.sort((a, b) => Math.abs(referenceArea(a)!.value - (area?.value ?? 59)) - Math.abs(referenceArea(b)!.value - (area?.value ?? 59)));
    const selected = choices[0];
    return selected ? { notice: n, unit: selected, area: referenceArea(selected)!.value } : null;
  }).filter((v) => v !== null).filter((v) => !area || Math.abs(v.area - area.value) / area.value <= 0.2);
  const approximate = (value: number, reason: string): Metric => ({ value: clamp(value), reason, estimated: true });

  if (metrics.money.value === null && unit.price !== null && unit.price > 0) {
    if (profile && p.cash !== null && p.loan !== null) {
      const budget = p.cash + p.loan;
      metrics.money = approximate(100 * Math.min(1, budget / unit.price),
        `입력 자금 합계 ${budget.toLocaleString()}원 / 공급금액 ${unit.price.toLocaleString()}원으로 예비 비교. 납부시점·향후 저축·월 부담·별도 비용은 미반영`);
    } else if (comparison.length >= 2) {
      metrics.money = approximate(rankedPrice(unit.price, comparison.map((v) => v.unit.price!)),
        `최근 120일 비슷한 크기의 청약 ${comparison.length}개 공급가 상대 비교(낮을수록 높은 점수). 개인 자금 적합도는 내 정보 등록 후 반영`);
    }
  }
  if (metrics.condition.value === null && area) {
    metrics.condition = approximate(100 * Math.min(1, area.value / p.minArea),
      `${area.estimated ? "주택형에서 읽은 약 " : "전용 "}${area.value}㎡ / ${profile ? "희망" : "기본 비교 기준"} ${p.minArea}㎡. 면적만 비교하며 방·층·향·마감은 미반영`);
  }
  const location = addressRegion(notice.address);
  const workplace = addressRegion(p.workplace);
  if (metrics.transport.value === null && location && workplace) {
    const sameLocality = location.locality === workplace.locality && location.locality !== location.province;
    metrics.transport = approximate(sameLocality ? 80 : location.province === workplace.province ? 50 : 20,
      `직장(${workplace.locality})과 공고(${location.locality}) 행정구역만 비교: 같은 시·구 80 / 같은 시·도 50 / 다른 시·도 20. 실제 거리·통근시간·환승은 미반영`);
  }
  const preferred = addressRegion(p.preferredRegion);
  if (metrics.location.value === null && location && preferred) {
    const exact = location.locality === preferred.locality || location.locality.startsWith(`${preferred.locality} `);
    const provinceOnly = preferred.locality === preferred.province;
    metrics.location = approximate(exact || (provinceOnly && location.province === preferred.province) ? 100 : location.province === preferred.province ? 50 : 0,
      `선호 지역(${preferred.locality}) 일치도만 비교: 일치 100 / 같은 시·도 50 / 다른 시·도 0. 마트·병원·학교·공원 접근성은 미반영`);
  }
  if (metrics.investment.value === null && notice.kind === "sale" && area && unit.price && location) {
    const local = comparison.filter((v) => addressRegion(v.notice.address)?.locality === location.locality);
    if (local.length >= 2) {
      metrics.investment = approximate(rankedPrice(unit.price / area.value, local.map((v) => v.unit.price! / v.area)),
        `${location.locality}의 비슷한 크기 청약 ${local.length}개 공급가/㎡ 상대 비교(공급 유형·조건 차이 있음). 청약 공급가만 비교하며 실거래가·전매제한·예상 수익률은 미반영`);
    }
  }
  metrics.money.missingLabel = unit.price === null ? "가격 필요" : profile ? "자금 입력" : "비교 부족";
  metrics.transport.missingLabel = p.workplace ? "주소 확인" : "직장 입력";
  metrics.location.missingLabel = p.preferredRegion ? "지역 확인" : "지역 입력";
  metrics.condition.missingLabel = "면적 필요";
  metrics.investment.missingLabel = notice.kind === "rent" ? "임대 제외" : "비교 부족";
  const applicable = dimensions.filter((k) => !(notice.kind === "rent" && k === "investment"));
  const denominator = applicable.reduce((sum, k) => sum + p.weights[k], 0);
  const known = applicable.filter((k) => metrics[k].value !== null && p.weights[k] > 0);
  const weight = known.reduce((sum, k) => sum + p.weights[k], 0);
  return {
    ...original, metrics,
    total: weight > 0 ? clamp(known.reduce((sum, k) => sum + metrics[k].value! * p.weights[k], 0) / weight) : null,
    coverage: denominator > 0 ? Math.round(100 * weight / denominator) : 0,
    measuredCount: known.length,
    verifiedCoverage: denominator > 0 ? 100 * known.filter((k) => !metrics[k].estimated).reduce((sum, k) => sum + p.weights[k], 0) / denominator : 0,
    provisional: !profile || weight !== denominator || known.some((k) => metrics[k].estimated),
  };
}
