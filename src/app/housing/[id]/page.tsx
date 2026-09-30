import Link from "next/link";
import { loadHousing } from "@/lib/housing/load";
import { Detail } from "@/components/Housing/Detail";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const [{ id }, query, data] = await Promise.all([
    params,
    searchParams,
    loadHousing(),
  ]);
  if (data.error && !data.notices.length)
    return (
      <div role="alert">
        <h1 className="text-2xl">공고를 불러올 수 없습니다</h1>
        <p className="my-5">{data.error}</p>
        <Link href="/housing">청약 달력으로 돌아가기</Link>
      </div>
    );
  const notice = data.notices.find((n) => n.id === id);
  if (!notice) notFound();
  return <Detail notice={notice} data={data} initialUnit={query.unit} />;
}
