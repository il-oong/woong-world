export const metadata = {
  title: "청약 | 나에게 맞는 집 찾기",
  description:
    "청약 일정, 내 조건별 추천, 지도와 자금 계획을 한 곳에서 확인하세요.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-9 pb-24 sm:px-6 sm:py-12">
      {children}
    </main>
  );
}
