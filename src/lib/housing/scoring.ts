import {
  dimensions,
  type Commute,
  type Dimension,
  type Notice,
  type Profile,
  type Unit,
  todayKst,
} from "./model";
import { approximateAssessment } from "./estimates";
export type Metric = { value: number | null; reason: string; estimated?: boolean; missingLabel?: string };
export type Assessment = {
  metrics: Record<Dimension, Metric>;
  total: number | null;
  coverage: number;
  provisional?: boolean;
  measuredCount?: number;
  verifiedCoverage?: number;
  blockers: string[];
  checks: {
    label: string;
    status: "pass" | "fail" | "unknown";
    detail: string;
  }[];
};
const clamp = (n: number) => Math.round(Math.max(0, Math.min(100, n)));
export function monthlyPayment(principal: number, rate: number, years: number) {
  const months = years * 12,
    r = rate / 1200;
  return Math.round(
    r === 0
      ? principal / months
      : (principal * r) / (1 - Math.pow(1 + r, -months)),
  );
}
export function funding(unit: Unit, profile: Profile, today = todayKst()) {
  let cumulative = 0;
  const datesKnown = unit.payments.every((p) => p.date !== null);
  // Relative deadlines stay in the published order; never invent calendar dates.
  const payments = datesKnown
    ? [...unit.payments].sort((a, b) => a.date!.localeCompare(b.date!))
    : unit.payments;
  return payments.map((p, i) => {
    cumulative += p.amount;
    // An undated payment can still be compared with today's cash. Do not add
    // future savings when its deadline is unknown.
    let months = 0;
    if (p.date !== null) {
      const start = new Date(today), end = new Date(p.date);
      const lastDay = new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
      ).getUTCDate();
      months = Math.max(
        0,
        (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
          end.getUTCMonth() - start.getUTCMonth() -
          (end.getUTCDate() < Math.min(start.getUTCDate(), lastDay) ? 1 : 0),
      );
    }
    // Loan is a single final-payment assumption, never also counted at interim stages.
    const loan = i === payments.length - 1 ? profile.loan : 0;
    const available = profile.cash === null
      ? null
      : profile.cash + months * (profile.monthlySaving ?? 0) + (loan ?? 0);
    return {
      ...p,
      cumulative,
      available,
      shortfall:
        available === null ? null : Math.max(0, cumulative - available),
      estimated: p.date === null || profile.monthlySaving === null || loan === null,
      past: p.date !== null && p.date < today,
    };
  });
}
export function assess(
  n: Notice,
  u: Unit,
  p: Profile | null,
  commute: Commute | null = null,
  today = todayKst(),
): Assessment {
  const metrics = Object.fromEntries(
    dimensions.map((k) => [
      k,
      { value: null, reason: "내 정보를 등록하면 분석합니다" },
    ]),
  ) as Record<Dimension, Metric>;
  const checks: Assessment["checks"] = [],
    blockers: string[] = [];
  if (!p) return { metrics, total: null, coverage: 0, blockers, checks };
  const req = n.requirements;
  const rule = (
    label: string,
    required: boolean | null,
    actual: Profile["account"],
  ) => {
    const status =
      !n.reviewedAt || required === null || (required && actual === "unknown")
        ? "unknown"
        : !required || actual === "yes"
          ? "pass"
          : "fail";
    checks.push({
      label,
      status,
      detail:
        status === "unknown"
          ? "공고 또는 내 정보 확인 필요"
          : required
            ? "입력 정보 기준 사전 점검"
            : "검토된 공고상 요구하지 않음",
    });
    if (status === "fail") blockers.push(`${label} 조건 불충족`);
  };
  rule("청약통장 보유", req.accountRequired, p.account);
  rule("무주택", req.homelessRequired, p.homeless);
  for (const [label, min, actual] of [
    ["통장 가입 개월", req.accountMonths, p.accountMonths],
    ["통장 예치금", req.accountDeposit, p.accountDeposit],
  ] as const) {
    const status =
      !n.reviewedAt || min === null || actual === null
        ? "unknown"
        : actual >= min
          ? "pass"
          : "fail";
    checks.push({
      label,
      status,
      detail:
        min === null
          ? "공고 확인 필요"
          : `공고 기준 ${min.toLocaleString()} 이상`,
    });
    if (status === "fail") blockers.push(`${label} 부족`);
  }
  checks.push({
    label: "지역·소득·자산·공급 유형별 세부 자격",
    status: "unknown",
    detail:
      "원문과 본인 조건을 직접 대조해야 합니다. 실제 청약 1순위·당첨 가능성을 확정하지 않습니다.",
  });
  const cashflow = funding(u, p, today);
  const monthly =
    p.loan === null
      ? null
      : monthlyPayment(p.loan, p.interestRate, p.loanYears) +
        (n.kind === "rent" ? (u.monthlyRent ?? 0) : 0);
  if (
    u.price !== null &&
    cashflow.length &&
    cashflow.every((r) => r.shortfall !== null && !r.estimated) &&
    p.monthlyBudget !== null &&
    monthly !== null &&
    (n.kind !== "rent" || u.monthlyRent !== null)
  ) {
    const missing = Math.max(...cashflow.map((r) => r.shortfall!));
    const burden = monthly === 0 ? 1 : Math.min(1, p.monthlyBudget / monthly);
    metrics.money = {
      value: clamp(
        100 * (1 - Math.min(1, missing / Math.max(1, u.price))) * burden,
      ),
      reason: `납부 시점 최대 부족액 ${missing.toLocaleString()}원 · 예상 월 부담 ${monthly.toLocaleString()}원 (대출 가정, 별도 비용 제외)`,
    };
    if (missing > 0) blockers.push("납부 시점 자금 부족");
    if (monthly > p.monthlyBudget) blockers.push("월 주거비 한도 초과");
  } else
    metrics.money = {
      value: null,
      reason: "공급금액·납부 일정·내 자금·월 부담 정보가 필요합니다",
    };
  if (commute) {
    metrics.transport = {
      value: clamp(
        100 -
          (50 * commute.minutes) / p.maxCommute -
          commute.transfers * 5 -
          commute.walkMinutes * 0.3,
      ),
      reason: `${commute.destination}까지 예상 ${commute.minutes}분 · 환승 ${commute.transfers}회 · 도보 ${commute.walkMinutes}분 (${commute.checkedAt} 조회)`,
    };
    if (commute.minutes > p.maxCommute) blockers.push("희망 통근시간 초과");
  } else
    metrics.transport = {
      value: null,
      reason: "직장 주소와 대중교통 조회 결과가 필요합니다",
    };
  const places = p.preferredAmenities.map(
    (kind) =>
      n.nearby
        .filter(
          (a) =>
            a.kind === kind &&
            a.checkedAt <= today &&
            Date.parse(today) - Date.parse(a.checkedAt) <= 180 * 86400000,
        )
        .sort((a, b) => a.meters - b.meters)[0],
  );
  metrics.location =
    places.length && places.every(Boolean)
      ? {
          value: clamp(
            places.reduce(
              (sum, a) => sum + Math.max(0, 100 - a.meters / 20),
              0,
            ) / places.length,
          ),
          reason:
            places.map((a) => `${a.kind} ${a.name} ${a.meters}m`).join(" · ") +
            " (자료상 거리, 도보시간 아님)",
        }
      : {
          value: null,
          reason: "선호 시설별 위치·거리 자료가 필요합니다 (180일 이내)",
        };
  metrics.condition =
    u.area !== null && u.rooms !== null
      ? {
          value: clamp(
            50 * Math.min(1, u.area / p.minArea) +
              50 * Math.min(1, u.rooms / p.minRooms),
          ),
          reason: `전용 ${u.area}㎡ · 방 ${u.rooms}개 / 희망 ${p.minArea}㎡ · ${p.minRooms}개. 층·향·마감은 원문 확인`,
        }
      : { value: null, reason: "전용면적과 방 구성 확인 필요" };
  if (u.area !== null && u.area < p.minArea) blockers.push("희망 면적 미달");
  if (u.rooms !== null && u.rooms < p.minRooms)
    blockers.push("희망 방 개수 미달");
  metrics.investment =
    n.kind === "rent"
      ? { value: null, reason: "임대 공고는 투자 점수에서 제외합니다" }
      : n.comparable &&
          n.comparable.checkedAt <= today &&
          u.price &&
          u.area &&
          Date.parse(today) - Date.parse(n.comparable.checkedAt) <=
            180 * 86400000
        ? {
            value: clamp(
              50 + (1 - u.price / u.area / n.comparable.pricePerM2) * 100,
            ),
            reason: `주변 비교가격 대비 공급가격 지표 · ${n.comparable.checkedAt} 기준. ${n.comparable.note} · 미래 수익 예측 아님`,
          }
        : {
            value: null,
            reason: "180일 이내 비교 가능한 거래가격과 전용면적 자료 필요",
          };
  const applicable = dimensions.filter(
    (k) => !(n.kind === "rent" && k === "investment"),
  );
  const denominator = applicable.reduce((s, k) => s + p.weights[k], 0);
  const known = applicable.reduce(
    (s, k) => s + (metrics[k].value !== null ? p.weights[k] : 0),
    0,
  );
  const coverage =
    denominator > 0 ? Math.round((known / denominator) * 100) : 0;
  // Missing data never inflates the score: only complete weighted dimensions receive a rank.
  const total =
    denominator > 0 && known === denominator
      ? clamp(
          applicable.reduce(
            (s, k) => s + (metrics[k].value ?? 0) * p.weights[k],
            0,
          ) / denominator,
        )
      : null;
  return { metrics, total, coverage, blockers, checks };
}
export function rankNotices(
  notices: Notice[],
  p: Profile | null,
  commutes: Record<string, Commute | null> = {},
  now = new Date(),
  peers: Notice[] = notices,
) {
  return notices
    .map((notice) => {
      const options = notice.units.map((unit) => ({
        unit,
        assessment: roughAssess(
          notice,
          unit,
          p,
          commutes[notice.id] ?? null,
          todayKst(now),
          peers,
        ),
      }));
      options.sort(
        (a, b) =>
          (b.assessment.verifiedCoverage ?? b.assessment.coverage) - (a.assessment.verifiedCoverage ?? a.assessment.coverage) ||
          b.assessment.coverage - a.assessment.coverage ||
          Number(a.assessment.blockers.length > 0) -
            Number(b.assessment.blockers.length > 0) ||
          (b.assessment.total ?? -1) - (a.assessment.total ?? -1),
      );
      return { notice, ...options[0] };
    })
    .sort(
      (a, b) =>
        Number(a.assessment.blockers.length > 0) -
          Number(b.assessment.blockers.length > 0) ||
        (b.assessment.total ?? -1) - (a.assessment.total ?? -1) ||
        a.notice.id.localeCompare(b.notice.id),
    );
}

export function roughAssess(
  n: Notice, u: Unit, p: Profile | null, commute: Commute | null = null,
  today = todayKst(), peers: Notice[] = [n],
): Assessment {
  return approximateAssessment(assess(n, u, p, commute, today), n, u, p, peers, today);
}
