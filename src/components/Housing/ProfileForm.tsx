"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  amenities,
  dimensions,
  labels,
  emptyProfile,
  profileSchema,
  type Profile,
} from "@/lib/housing/model";
import { button, input, panel, HousingHeader, request } from "./shared";
const moneyFields = [
  ["cash", "현재 사용할 수 있는 현금"],
  ["monthlySaving", "월 추가 저축액"],
  ["loan", "잔금 때 사용할 예상 대출"],
  ["monthlyBudget", "감당 가능한 월 주거비"],
  ["accountDeposit", "청약통장 예치금"],
] as const;
export function ProfileForm({
  initial,
  connected,
  error,
}: {
  initial: Profile | null;
  connected: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState(initial ?? emptyProfile()),
    [message, setMessage] = useState(error ?? ""),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false);
  const router = useRouter();
  function change<K extends keyof Profile>(k: K, v: Profile[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const parsed = profileSchema.safeParse(form);
      if (!parsed.success) throw Error(parsed.error.issues[0].message);
      await request("/api/housing/profile", "PUT", parsed.data);
      router.push("/housing");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await request("/api/housing/profile", "DELETE");
      setForm(emptyProfile());
      setDeleting(false);
      setMessage("내 정보와 관심 청약, 저장한 교통 조회 결과를 삭제했습니다.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <HousingHeader
        title="나의 청약 프로필"
        description="내 생활과 예산에 맞춰 추천을 조정합니다. 모르는 금액은 비워두세요. 0원과 미입력은 다르게 계산합니다."
      >
        <Link className={button} href="/housing">
          달력으로
        </Link>
      </HousingHeader>
      {!connected && (
        <div className={`${panel} mb-6`}>
          저장하려면{" "}
          <Link className="text-teal-300 underline" href="/api/google/auth">
            구글로 로그인
          </Link>
          해주세요.
        </div>
      )}
      <form onSubmit={save} className="space-y-6">
        <section className={panel}>
          <h2 className="text-lg font-semibold">01 / 자금 계획</h2>
          <p className="mt-2 text-xs text-slate-400">
            금액 단위는 만원입니다. 대출은 승인 금액이 아닌 직접 입력한
            가정이며, 잔금 때 한 번만 반영됩니다.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {moneyFields.map(([key, label]) => (
              <label className="text-sm text-slate-300" key={key}>
                {label} (만원)
                <input
                  className={input}
                  type="number"
                  min="0"
                  max="10000000"
                  step="0.0001"
                  value={form[key] === null ? "" : form[key] / 10000}
                  onChange={(e) =>
                    change(
                      key,
                      e.target.value === ""
                        ? null
                        : Math.round(Number(e.target.value) * 10000),
                    )
                  }
                />
              </label>
            ))}
            <label className="text-sm">
              대출 금리 (%)
              <input
                className={input}
                type="number"
                min="0"
                max="30"
                step="0.1"
                value={form.interestRate}
                onChange={(e) => change("interestRate", Number(e.target.value))}
              />
            </label>
            <label className="text-sm">
              상환 기간 (년·원리금균등)
              <input
                className={input}
                type="number"
                min="1"
                max="50"
                value={form.loanYears}
                onChange={(e) => change("loanYears", Number(e.target.value))}
              />
            </label>
          </div>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">02 / 이동과 집의 조건</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="text-sm">
              직장 또는 자주 가는 곳의 도로명 주소
              <input
                className={input}
                maxLength={200}
                value={form.workplace}
                onChange={(e) => change("workplace", e.target.value)}
                placeholder="예: 서울특별시 중구 세종대로 110"
              />
            </label>
            <label className="text-sm">
              살고 싶은 선호 지역 (예비 입지 비교)
              <input className={input} maxLength={100} value={form.preferredRegion}
                onChange={(e) => change("preferredRegion", e.target.value)}
                placeholder="예: 경기도 광명시 또는 인천광역시 계양구" />
              <span className="mt-2 block text-xs text-slate-400">현재 거주 지역과 별도로 저장합니다. 시설 거리 자료가 없을 때 지역 일치도를 비교합니다.</span>
            </label>
            {(
              [
                ["maxCommute", "최대 통근시간 (분)", 240],
                ["minArea", "최소 전용면적 (㎡)", 400],
                ["minRooms", "최소 방 개수", 10],
              ] as const
            ).map(([key, label, max]) => (
              <label key={key} className="text-sm">
                {label}
                <input
                  className={input}
                  type="number"
                  min="1"
                  max={max}
                  step={key === "minArea" ? "0.01" : "1"}
                  value={form[key]}
                  onChange={(e) => change(key, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
          <fieldset className="mt-5">
            <legend className="text-sm text-slate-300">중요한 주변 시설</legend>
            <div className="mt-3 flex flex-wrap gap-4">
              {amenities.map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.preferredAmenities.includes(a)}
                    onChange={(e) =>
                      change(
                        "preferredAmenities",
                        e.target.checked
                          ? [...form.preferredAmenities, a]
                          : form.preferredAmenities.filter((v) => v !== a),
                      )
                    }
                  />
                  {a}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-4 text-xs text-slate-400">
            교통 조회 시 입력한 직장 주소가 카카오 주소 검색에, 단지·직장 좌표가
            ODsay에 전달됩니다.
          </p>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">03 / 청약 조건</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="text-sm">
              현재 거주 지역
              <input
                className={input}
                maxLength={100}
                value={form.region}
                onChange={(e) => change("region", e.target.value)}
              />
            </label>
            {(
              [
                ["account", "청약통장 보유"],
                ["homeless", "무주택 여부"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm">
                {label}
                <select
                  className={input}
                  value={form[key]}
                  onChange={(e) =>
                    change(key, e.target.value as Profile[typeof key])
                  }
                >
                  <option value="unknown">확인 필요</option>
                  <option value="yes">예</option>
                  <option value="no">아니오</option>
                </select>
              </label>
            ))}
            <label className="text-sm">
              청약통장 가입 기간 (개월)
              <input
                className={input}
                type="number"
                min="0"
                max="1200"
                value={form.accountMonths ?? ""}
                onChange={(e) =>
                  change(
                    "accountMonths",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </label>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            지역·소득·세대별 세부 자격은 원문 확인 대상으로 표시됩니다. 입력
            정보만으로 실제 청약 순위나 당첨을 확정하지 않습니다.
          </p>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">04 / 나만의 능력치 비중</h2>
          <p className="mt-2 text-xs text-slate-400">
            높일수록 종합점수에 크게 반영됩니다. 0이면 순위 계산에서 제외합니다.
          </p>
          <div className="mt-5 space-y-5">
            {dimensions.map((k) => (
              <label key={k} className="flex items-center gap-5 text-sm">
                <span className="w-16">{labels[k]}</span>
                <input
                  className="flex-1 accent-teal-300"
                  type="range"
                  min="0"
                  max="100"
                  value={form.weights[k]}
                  onChange={(e) =>
                    change("weights", {
                      ...form.weights,
                      [k]: Number(e.target.value),
                    })
                  }
                />
                <span className="w-12 text-right">{form.weights[k]}</span>
              </label>
            ))}
          </div>
        </section>
        <p role="status" className="text-sm text-amber-200">
          {message}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            className={`${button} bg-teal-300 !text-slate-950 font-semibold`}
            disabled={!connected || busy}
            type="submit"
          >
            {busy ? "처리 중…" : "저장하고 추천 보기"}
          </button>
          {initial && (
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => setDeleting(true)}
            >
              내 정보 삭제
            </button>
          )}
        </div>
        {deleting && (
          <div className={`${panel} space-y-4`}>
            <p>내 정보와 관심 청약, 교통 조회 결과를 삭제할까요?</p>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={remove}
            >
              삭제하기
            </button>{" "}
            <button
              type="button"
              className={button}
              onClick={() => setDeleting(false)}
            >
              취소
            </button>
          </div>
        )}
      </form>
    </>
  );
}
