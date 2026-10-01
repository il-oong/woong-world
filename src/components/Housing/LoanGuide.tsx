"use client";

import { useState } from "react";
import type { Notice, Profile, Unit } from "@/lib/housing/model";
import { todayKst, won } from "@/lib/housing/model";
import { estimateMortgage, loanRulesNeedReview, loanRulesReviewedAt, loanSources, regulationForNotice, type Borrower, type Regulation } from "@/lib/housing/loan-guidance";
import { panel } from "./shared";

const wonToMan = (value: number | null) => value === null ? "" : String(Math.round(value / 10000));
const fromMan = (value: string) => value.trim() === "" ? null : Number(value) * 10000;
const inputClass = "mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-white";

export function LoanGuide({ notice, unit, profile }: { notice: Notice; unit: Unit; profile: Profile | null }) {
  const detected = regulationForNotice(notice);
  const needsReview = loanRulesNeedReview(todayKst());
  const [region, setRegion] = useState<Regulation>(needsReview ? "unknown" : detected.region);
  const [borrower, setBorrower] = useState<Borrower>(profile?.homeless === "yes" ? "homeless" : "unknown");
  const [value, setValue] = useState(wonToMan(unit.price));
  const [desired, setDesired] = useState(wonToMan(profile?.loan ?? (unit.price === null ? null : Math.round(unit.price / 2))));
  const [cash, setCash] = useState(wonToMan(profile?.cash ?? null));
  const [income, setIncome] = useState("");
  const [existingPayments, setExistingPayments] = useState("");
  const [rate, setRate] = useState(String(profile?.interestRate ?? 4));
  const [stress, setStress] = useState(detected.region === "ordinary" || detected.region === "regulated" ? "3" : "0");
  const [years, setYears] = useState(String(profile?.loanYears ?? 30));
  if (notice.kind !== "sale" || unit.price === null) return null;

  const parsedValue = fromMan(value);
  const parsedDesired = fromMan(desired);
  const parsedCash = fromMan(cash);
  const annualIncome = fromMan(income);
  const debtPayments = fromMan(existingPayments);
  const interest = Number(rate);
  const stressRate = Number(stress);
  const duration = Number(years);
  const valid = parsedValue !== null && Number.isFinite(parsedValue) && parsedValue > 0 &&
    parsedDesired !== null && Number.isFinite(parsedDesired) && parsedDesired >= 0 &&
    (parsedCash === null || Number.isFinite(parsedCash) && parsedCash >= 0) &&
    Number.isFinite(interest) && interest >= 0 && interest <= 30 &&
    Number.isFinite(stressRate) && stressRate >= 0 && stressRate <= 5 &&
    Number.isInteger(duration) && duration >= 1 && duration <= 50 &&
    (annualIncome === null || Number.isFinite(annualIncome) && annualIncome >= 0) &&
    (debtPayments === null || Number.isFinite(debtPayments) && debtPayments >= 0);
  const result = valid ? estimateMortgage({
    value: parsedValue, desired: parsedDesired, region, capitalArea: /서울특별시|인천광역시|경기도/.test(notice.address), borrower,
    annualIncome, existingAnnualPayments: debtPayments,
    rate: interest, stress: stressRate, years: duration,
  }) : null;
  const isHoneymoon = notice.title.includes("신혼희망타운");
  const policyPrice = unit.price <= 600_000_000;

  return (
    <section className={`${panel} mb-6`} aria-labelledby="loan-guide-heading">
      <h2 id="loan-guide-heading" className="text-xl font-semibold">지역 대출규제 · 내 대출 계산기</h2>
      <p className="mt-2 text-sm text-slate-300">
        공급 위치 {detected.place} · {needsReview ? "현재 규제 여부 재확인 필요" : detected.region === "regulated" ? "규제지역" : detected.region === "ordinary" ? "비규제지역" : "규제 여부 확인 필요"}
        <span className="ml-2 text-xs text-slate-500">{loanRulesReviewedAt} 공식 자료 확인</span>
      </p>
      {needsReview && <p className="mt-2 text-sm text-amber-200">규제 자료를 확인한 지 30일이 지났습니다. 아래 공식 링크에서 현재 규제지역 여부를 확인한 뒤 선택해 주세요.</p>}
      <p className="mt-2 text-xs leading-5 text-slate-400">지역 분류는 공급지 기준입니다. 분양가격과 대출 심사 때의 담보평가액은 다를 수 있습니다. 중도금 집단대출과 잔금대출 규칙도 다릅니다.</p>
      <p className="mt-3 rounded-lg bg-white/5 p-3 text-sm leading-6 text-slate-300">무주택 일반 주택구입 주담대의 LTV 기준은 규제지역 40%, 비규제지역 70%이며 생애최초는 70%입니다. 수도권·규제지역의 주택가격별 총액 상한은 15억원 이하 6억원, 15억원 초과~25억원 이하 4억원, 25억원 초과 2억원입니다. 실제 가능액에는 DSR 등 추가 심사가 적용됩니다.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">규제지역 여부
          <select className={inputClass} value={region} onChange={(e) => setRegion(e.target.value as Regulation)}>
            <option value="unknown">확인 필요</option><option value="regulated">규제지역</option><option value="ordinary">비규제지역</option>
          </select>
        </label>
        <label className="text-sm">주택 보유·구입 조건
          <select className={inputClass} value={borrower} onChange={(e) => setBorrower(e.target.value as Borrower)}>
            <option value="unknown">확인 필요 / 추가주택</option><option value="homeless">무주택 일반</option>
            <option value="first">생애최초</option><option value="disposal">1주택 처분조건</option>
          </select>
        </label>
        <NumberField label="예상 담보평가액 (만원)" value={value} set={setValue} />
        <NumberField label="원하는 대출액 (만원)" value={desired} set={setDesired} />
        <NumberField label="보유 현금 (만원)" value={cash} set={setCash} />
        <NumberField label="연소득 (만원)" value={income} set={setIncome} />
        <NumberField label="기존 대출의 연간 원리금 (만원)" value={existingPayments} set={setExistingPayments} />
        <NumberField label="예상 대출금리 (%)" value={rate} set={setRate} step="0.1" />
        <NumberField label="DSR 심사용 가산금리 (%p)" value={stress} set={setStress} step="0.1" />
        <NumberField label="상환기간 (년)" value={years} set={setYears} />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">연소득·기존 대출 상환액은 저장하지 않습니다. DSR은 은행권 40%, 수도권 변동형 주담대 가산금리 3%p를 기본 가정합니다. 고정·주기형 대출은 적용률이 다를 수 있어 조정하세요.</p>
      {result ? (
        <div className="mt-5 rounded-xl border border-teal-300/20 bg-teal-300/5 p-4" aria-live="polite">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="일반 주담대 LTV" value={result.ltv === null ? "조건 확인 필요" : `${result.ltv}% · ${won(result.ltvCap)}`} />
            <Metric label="수도권 가격별 총액 상한" value={won(result.metroCap)} />
            <Metric label="은행 DSR 40% 추산" value={result.dsrCap === null ? "연소득·기존 상환액 입력 필요" : won(result.dsrCap)} />
            <Metric label="입력 조건의 참고 상한" value={won(result.estimate)} />
          </div>
          <p className="mt-4 text-sm">원하는 대출 {won(parsedDesired)} · 월 원리금균등 상환 약 {won(result.monthlyPayment)}
            {result.dsrPercent !== null && ` · 가산금리 반영 DSR 약 ${result.dsrPercent}%`}
          </p>
          {parsedCash !== null && <p className="mt-2 text-sm">공급가에서 대출액을 뺀 필요 자기자금 {won(Math.max(0, unit.price - parsedDesired!))} · 입력한 현금과의 차이 {won(Math.max(0, unit.price - parsedDesired! - parsedCash))}</p>}
          {result.estimate !== null && parsedDesired! > result.estimate && <p className="mt-2 text-sm text-amber-200">원하는 대출액이 입력 조건의 참고 상한을 넘습니다. 대출액·자기자금 계획을 다시 확인하세요.</p>}
        </div>
      ) : <p className="mt-5 text-sm text-amber-200">금액·금리·기간을 올바르게 입력하면 계산됩니다.</p>}
      <p className="mt-3 text-xs leading-5 text-slate-400">표시액은 승인액이 아닙니다. 담보평가, 소액임차보증금 공제, 신용·소득 증빙, 기존 대출 원금, 은행별 심사, 입주 때 규정 변동은 반영하지 못합니다. 현금 차이에는 취득세·옵션·이사비가 빠져 있습니다.</p>

      <h3 className="mt-7 text-lg font-semibold">먼저 비교할 대출</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {isHoneymoon && <LoanOption title="신혼희망타운 전용 모기지" description="LH 안내 기준 연 1.6% 고정·최대 4억원·주택가격 70% 이내입니다. 매각차익을 기금과 나누며, 의무가입 여부와 실행 시점 조건은 이 공고문에서 먼저 확인하세요." href={loanSources.honeymoon} />}
        {policyPrice && <LoanOption title="보금자리론" description="공급가가 6억원 이하라 가격요건을 우선 검토할 수 있습니다. 공사 안내 한도는 일반 최대 3.6억원, 생애최초 최대 4.2억원이며 소득·주택 보유·담보평가·DTI 등은 별도 확인이 필요합니다." href={loanSources.mortgage} />}
        {policyPrice && <LoanOption title="주택도시기금 디딤돌·신혼부부 상품" description="무주택, 소득·자산, 주택가격·면적 조건을 확인한 뒤 비교하세요. 이 계산기의 일반 주담대 한도가 정책대출 승인액을 뜻하지는 않습니다." href="https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030101.jsp" />}
        <LoanOption title="은행 주택구입 주담대" description="정책대출 요건을 충족하지 못하거나 추가 자금이 필요하면 은행 금리·상환방식·중도상환수수료와 집단대출 전환 조건을 비교하세요." href={loanSources.compare} linkLabel="금융감독원 상품 비교 ↗" />
      </div>
      <p className="mt-5 text-xs leading-5 text-slate-400">근거: <a className="underline" href={loanSources.regions} target="_blank" rel="noopener noreferrer">국토부 규제지역 현황</a> · <a className="underline" href={loanSources.rules} target="_blank" rel="noopener noreferrer">금융위 대출규제 문답</a> · <a className="underline" href={loanSources.dsr} target="_blank" rel="noopener noreferrer">금융위 DSR 기준</a>. 신청 전 최신 규정과 해당 공고의 집단대출 안내를 다시 확인하세요.</p>
    </section>
  );
}

function NumberField({ label, value, set, step = "1" }: { label: string; value: string; set: (value: string) => void; step?: string }) {
  return <label className="text-sm">{label}<input className={inputClass} type="number" min="0" step={step} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} /></label>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-semibold text-teal-100">{value}</p></div>;
}
function LoanOption({ title, description, href, linkLabel = "공식 조건 확인 ↗" }: { title: string; description: string; href: string; linkLabel?: string }) {
  return <div className="rounded-xl border border-white/10 p-4"><h4 className="font-semibold">{title}</h4><p className="mt-2 text-sm leading-6 text-slate-300">{description}</p><a className="mt-3 inline-block text-sm text-teal-200 underline" href={href} target="_blank" rel="noopener noreferrer">{linkLabel}</a></div>;
}
