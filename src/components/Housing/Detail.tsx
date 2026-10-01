"use client";
import { useState } from "react";
import Link from "next/link";
import { type HousingData } from "@/lib/housing/load";
import {
  type Notice,
  type Commute,
  ruleKeys,
  ruleLabels,
  applicationStatus,
  emptyProfile,
  won,
  todayKst,
} from "@/lib/housing/model";
import {
  roughAssess,
  funding,
  monthlyPayment,
  rankNotices,
} from "@/lib/housing/scoring";
import { isClosed } from "@/lib/housing/model";
import {
  Bars,
  button,
  HousingHeader,
  panel,
  request,
  External,
} from "./shared";
export function Detail({
  notice: n,
  data,
  initialUnit,
}: {
  notice: Notice;
  data: HousingData;
  initialUnit?: string;
}) {
  const [unitId, setUnitId] = useState(
      n.units.some((u) => u.id === initialUnit) ? initialUnit! : n.units[0].id,
    ),
    [commute, setCommute] = useState(data.commutes[n.id] ?? null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const unit = n.units.find((u) => u.id === unitId)!;
  const a = roughAssess(n, unit, data.profile, commute, todayKst(), data.notices);
  const ranked = rankNotices(
    data.notices.filter((v) => !isClosed(v)),
    data.profile,
    { ...data.commutes, [n.id]: commute },
    new Date(),
    data.notices,
  ).filter((r) => r.assessment.total !== null && !r.assessment.blockers.length);
  const rank = ranked.findIndex((v) => v.notice.id === n.id) + 1;
  const flows = funding(unit, data.profile ?? emptyProfile());
  const monthly =
    data.profile?.loan !== null && data.profile
      ? monthlyPayment(
          data.profile.loan,
          data.profile.interestRate,
          data.profile.loanYears,
        )
      : null;
  async function traffic() {
    setBusy(true);
    setMessage("");
    try {
      const result = await request<{ commute: Commute }>(
        "/api/housing/commute",
        "POST",
        { id: n.id },
      );
      setCommute(result.commute);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <HousingHeader
        title={n.title}
        description={`${n.supplyType} · ${n.address || "공급 위치 확인 필요"}`}
      >
        <Link href="/housing" className={button}>
          ← 달력·추천
        </Link>
        <External href={n.sourceUrl}>공고 원문</External>
      </HousingHeader>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-teal-300/10 px-4 py-2 text-sm text-teal-200">
          {applicationStatus(n)}
        </span>
        <span className="text-xs text-slate-400">
          공고일 {n.publishedAt} · 원문 대조 {n.reviewedAt ?? "검토 대기"}
        </span>
      </div>
      {n.changeNote && (
        <p className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">
          정정·변경 안내: {n.changeNote}
        </p>
      )}
      <section className={`${panel} mb-6`}>
        <h2 className="text-xl font-semibold">신청 전 필수 확인</h2>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          {n.supplyType} 기준 요약입니다. 세부 공급 유형에 따른 차이는 원문에서
          확인하세요. 자료가 없으면 제한 없음으로 판단하지 않습니다.
        </p>
        <dl className="mt-5 grid gap-4 md:grid-cols-2">
          {ruleKeys.map((key) => {
            const r = n.rules.find((v) => v.key === key);
            return (
              <div
                key={key}
                className="rounded-xl border border-white/5 bg-white/[.02] p-4"
              >
                <dt className="text-sm font-semibold text-teal-100">
                  {ruleLabels[key]}
                </dt>
                <dd className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">
                  {r?.summary || "확인 필요 · 공식 공고 원문을 확인해주세요"}
                </dd>
                {r && (
                  <dd className="mt-3 text-xs text-slate-500">
                    <a
                      href={n.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      근거: {r.page || "페이지 확인 필요"}
                    </a>
                    {r.quote && <p className="mt-1">“{r.quote}”</p>}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
        <h3 className="mt-6 text-sm font-semibold">내 조건 사전 점검</h3>
        {!data.profile ? (
          <Link href="/housing/profile" className={`${button} mt-3`}>
            내 정보 등록하기
          </Link>
        ) : (
          <ul className="mt-3 space-y-2">
            {a.checks.map((c) => (
              <li key={c.label} className="flex flex-wrap gap-2 text-sm">
                <span
                  className={
                    c.status === "pass"
                      ? "text-teal-300"
                      : c.status === "fail"
                        ? "text-rose-300"
                        : "text-amber-200"
                  }
                >
                  {c.status === "pass"
                    ? "✓ 조건 충족"
                    : c.status === "fail"
                      ? "× 불충족"
                      : "? 확인 필요"}
                </span>
                <span>{c.label}</span>
                <span className="text-xs leading-5 text-slate-500">
                  {c.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={`${panel} mb-6`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{data.profile ? "나와의 궁합" : "분양가·면적 예비 비교"}</h2>
            <p className="mt-2 text-sm text-slate-400">
              {rank
                ? `공고 예비 추천 ${rank}위 (대표 주택형 기준)`
                : "추천 순위 보류"}{" "}
              · 선택 주택형 {a.provisional ? "예비 점수" : "종합점수"}{" "}
              {a.total === null ? "분석 미완료" : `${a.total}점`}
              {" "}· {a.measuredCount ?? 0}/5항목 · 평가 비중 {a.coverage}%
            </p>
          </div>
          <label className="text-sm">
            주택형{" "}
            <select
              className="ml-3 rounded-xl border border-white/15 bg-[#10151d] px-4 py-3"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              {n.units.map((u) => (
                <option value={u.id} key={u.id}>
                  {u.name} · {won(u.price)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-6">
          <Bars assessment={a} />
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-500">
          점수가 나온 항목만 중요도를 반영해 평균을 냅니다. 미평가 항목은 0점으로 채우지 않습니다.
          ‘추정’은 납부 일정·실제 경로·시설 거리·실거래 자료를 대신해 공개 공급가·면적·지역으로 거칠게 비교한 값입니다.
          평가 항목이 다른 공고끼리는 예비 점수만으로 결정하지 말고 근거를 비교하세요. 자격과 전매제한은 추정하지 않습니다.
        </p>
        {a.blockers.length > 0 && (
          <p className="mt-4 text-sm text-amber-200">
            조건 확인: {a.blockers.join(" · ")}
          </p>
        )}
        <Link href="/housing/profile" className={`${button} mt-4`}>
          내 기준 수정
        </Link>
      </section>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className={panel}>
          <h2 className="text-xl font-semibold">공급 위치·교통</h2>
          <p className="my-3 text-sm text-slate-400">
            {n.address || "실제 공급 주소 확인 필요"}
          </p>
          {n.point ? (
            <iframe
              title={`${n.title} 위치 지도`}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-72 w-full rounded-xl border-0"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${n.point.lng - 0.012},${n.point.lat - 0.008},${n.point.lng + 0.012},${n.point.lat + 0.008}&layer=mapnik&marker=${n.point.lat},${n.point.lng}`}
            />
          ) : n.locationImageUrl ? (
            <div className="rounded-xl bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={n.locationImageUrl} alt={`${n.title} 공식 위치 안내 · 현장과 견본주택 구분`} className="h-72 w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
              <p className="mt-2 text-xs text-slate-600">공식 안내도입니다. ‘현장’이 공급 위치이며 견본주택과 다릅니다.</p>
            </div>
          ) : (
            <div className="grid h-56 place-items-center rounded-xl bg-white/5 p-5 text-center text-sm text-slate-400">
              검증된 단지 좌표가 없어 지도 표시를 기다리고 있습니다.
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {n.address && (
              <External
                href={n.locationUrl ?? `https://map.kakao.com/link/search/${encodeURIComponent(n.address)}`}
              >
                지도·길찾기
              </External>
            )}
            <button
              className={button}
              disabled={busy || !data.profile}
              onClick={traffic}
            >
              {busy ? "조회 중…" : "내 직장까지 교통 조회"}
            </button>
          </div>
          <p role="status" className="mt-3 text-sm text-amber-200">
            {message}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {a.metrics.transport.reason}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            교통 조회는 일반 경로 예상치입니다. 출근 시간의 혼잡·실시간 지연은
            반영하지 않습니다.
          </p>
          {n.nearby.length > 0 && (
            <ul className="mt-4 space-y-2 text-xs text-slate-400">
              {n.nearby.map((p, i) => (
                <li key={i}>
                  <a
                    className="underline"
                    href={p.source}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {p.kind} · {p.name} {p.meters}m
                  </a>{" "}
                  · {p.checkedAt} 확인
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={panel}>
          <h2 className="text-xl font-semibold">{unit.name} 평면도</h2>
          <p className="my-3 text-sm text-slate-400">
            전용 {unit.area ?? "미확인"}㎡ · 방 {unit.rooms ?? "미확인"}개 ·
            입주 {n.moveIn ?? (n.moveInNote || "확인 필요")}
          </p>
          {unit.floorPlanImageUrl ? (
            <div className="rounded-xl bg-white p-3">
              {/* Official external images are not fetched through the server image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={unit.floorPlanImageUrl}
                alt={`${n.title} ${unit.name} 공식 평면도`}
                className="max-h-96 w-full object-contain"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="grid h-56 place-items-center rounded-xl bg-white/5 p-6 text-center text-sm text-slate-400">
              등록된 평면도 이미지가 없습니다.
              <br />
              공식 자료에서 해당 주택형을 확인해주세요.
            </div>
          )}
          <div className="mt-4">
            <External href={unit.floorPlanUrl ?? n.sourceUrl}>
              {unit.floorPlanUrl ? "공식 평면도 자료" : "공고 원문에서 확인"}
            </External>
          </div>
        </section>
      </div>
      <section className={`${panel} mb-6`}>
        <h2 className="text-xl font-semibold">언제, 얼마가 필요할까요?</h2>
        <p className="mt-3 text-sm text-slate-300">
          {n.kind === "rent" ? "보증금" : "공급금액"} {won(unit.price)}
          {n.kind === "rent" ? ` · 월 임대료 ${won(unit.monthlyRent)}` : ""}
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          납부 일정에 따른 누적 필요액과 내 자금을 비교합니다. 대출은 잔금 때 한
          번 반영하며, 중도금 대출 전환은 별도 검토가 필요합니다.
          옵션·세금·이사비·관리비·대출 부대비용은 제외했습니다.
        </p>
        {n.priceNote && <p className="mt-3 text-sm text-amber-200">{n.priceNote}</p>}
        {flows.some((f) => f.estimated) && <p className="mt-3 text-sm text-amber-200">날짜가 미정인 납부액은 현재 입력한 자금 기준입니다. 날짜가 정해진 행에서만 월 저축액을 반영합니다. 입력하지 않은 저축액·대출액은 0원으로 둔 임시 계산이며, 전체 자금·돈 점수의 확정 판단은 보류합니다.</p>}
        {!data.profile && flows.length > 0 && <Link className={`${button} mt-3`} href="/housing/profile">내 정보 등록하기</Link>}
        {flows.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs text-slate-500">
                <tr>
                  {[
                    "납부 시점",
                    "이번 납부액",
                    "누적 필요액",
                    "가정한 가용 자금",
                    "부족액",
                  ].map((h) => (
                    <th key={h} className="pb-3 pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flows.map((f, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-4 pr-4">
                      {f.label}
                      {f.estimated && <span className="ml-2 text-xs text-amber-200">임시 계산</span>}
                      <span className="block text-xs text-slate-500">
                        {f.date ?? "개별 날짜 확인 필요"}
                        {f.past ? " · 지난 일정" : ""}
                      </span>
                    </td>
                    <td>{won(f.amount)}</td>
                    <td>{won(f.cumulative)}</td>
                    <td>{won(f.available)}</td>
                    <td
                      className={
                        f.shortfall ? "text-rose-300" : "text-teal-300"
                      }
                    >
                      {won(f.shortfall)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-5 text-sm text-amber-200">
            {data.profile
              ? "검증된 납부 일정이 없어 시점별 계산을 보류합니다."
              : "내 정보를 등록하면 부족액을 계산합니다."}
          </p>
        )}
        {data.profile && (
          <p className="mt-5 text-sm">
            예상 월 대출 상환액 {won(monthly)}
            {n.kind === "rent"
              ? ` + 월 임대료 ${won(unit.monthlyRent)}`
              : ""}{" "}
            <span className="text-xs text-slate-500">
              (연 {data.profile.interestRate}%, {data.profile.loanYears}년
              원리금균등)
            </span>
          </p>
        )}
        {n.comparable && (
          <p className="mt-3 text-xs text-slate-400">
            투자 비교 근거:{" "}
            <a
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
              href={n.comparable.source}
            >
              {n.comparable.note}
            </a>{" "}
            · {n.comparable.checkedAt}
          </p>
        )}
      </section>
      <section className={panel}>
        <h2 className="text-xl font-semibold">신청 일정</h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {[...n.events]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((e, i) => (
              <li
                key={i}
                className="flex justify-between gap-4 rounded-xl bg-white/[.03] p-4 text-sm"
              >
                <span>{e.label}</span>
                <span className="text-slate-400">
                  {e.date} {e.time ?? "시간 원문 확인"}
                </span>
              </li>
            ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <External href={n.applicationUrl}>공식 신청 사이트</External>
          <External href={n.sourceUrl}>원문과 최종 확인</External>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          공식 사이트에서 본인 인증 후 신청합니다. 유형별 접수일과 마감 시각을
          확인하세요.
        </p>
      </section>
    </>
  );
}
