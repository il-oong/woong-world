import Link from "next/link";
export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl">아직 등록되지 않은 청약입니다</h1>
      <p className="my-4 text-slate-400">
        공고번호를 확인하거나 공고 등록을 먼저 진행해주세요.
      </p>
      <Link href="/housing" className="text-teal-300">
        청약 달력으로 돌아가기 →
      </Link>
    </div>
  );
}
