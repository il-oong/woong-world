import Link from "next/link";
import { redirect } from "next/navigation";
import { loadHousing } from "@/lib/housing/load";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ houseManageNo?: string; pblancNo?: string }>;
}) {
  const { houseManageNo, pblancNo } = await searchParams;
  if (
    !houseManageNo ||
    !pblancNo ||
    !/^\d{10}$/.test(houseManageNo) ||
    !/^\d{10}$/.test(pblancNo)
  )
    return (
      <p>
        공고번호가 올바르지 않습니다. <Link href="/housing">달력으로</Link>
      </p>
    );
  const d = await loadHousing();
  if (d.notices.some((n) => n.id === pblancNo))
    redirect(`/housing/${pblancNo}`);
  const source = `https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=${houseManageNo}&pblancNo=${pblancNo}`;
  return (
    <div className="rounded-2xl border border-white/10 p-8">
      <h1 className="text-2xl">공고 분석을 준비하고 있습니다</h1>
      <p className="my-5 text-slate-400">
        {d.error ??
          `공고 ${pblancNo}의 검증된 분석이 아직 등록되지 않았습니다. 청약홈 원문은 바로 확인할 수 있습니다.`}
      </p>
      <a
        className="text-teal-300 underline"
        href={source}
        target="_blank"
        rel="noopener noreferrer"
      >
        청약홈 공고 원문 열기 ↗
      </a>
      <div className="mt-5">
        <Link href="/housing">청약 달력으로 돌아가기</Link>
      </div>
    </div>
  );
}
