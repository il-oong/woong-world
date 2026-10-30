import { readSession } from "@/lib/session";
import { MentalHealthApp } from "@/components/MentalHealth/MentalHealthApp";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "심리치료 · 마음결 | 비서",
  robots: { index: false, follow: false },
};
export default async function Page() {
  const session = await readSession();
  if (!session?.email)
    return (
      <main className="mx-auto max-w-xl px-6 py-20">
        <h1 className="text-2xl font-semibold">나만의 마음 기록</h1>
        <p className="my-5 text-zinc-300">
          개인 기록을 보호하기 위해 먼저 로그인해 주세요. AI 자기관리 지원이며
          전문 치료를 대체하지 않습니다.
        </p>
        <a className="text-teal-300 underline" href="/api/google/auth">
          Google로 로그인
        </a>
      </main>
    );
  return <MentalHealthApp key={session.email} owner={session.email} />;
}
