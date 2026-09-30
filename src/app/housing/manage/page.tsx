import Link from "next/link";
import { loadHousing } from "@/lib/housing/load";
import { NoticeManager } from "@/components/Housing/NoticeManager";
export const dynamic = "force-dynamic";
export default async function Page() {
  const d = await loadHousing();
  if (!d.admin)
    return (
      <div className="py-14">
        <h1 className="text-2xl">관리자 로그인 필요</h1>
        <p className="my-5">
          공고 원문을 검토하고 등록하는 관리자 전용 화면입니다.
        </p>
        <Link className="text-teal-300" href="/api/google/auth">
          구글로 로그인 →
        </Link>
      </div>
    );
  return <NoticeManager notices={d.notices} />;
}
