import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { AdminPeoplePanel } from "@/components/AdminPeoplePanel";

export const dynamic = "force-dynamic";

export default async function AdminPeoplePage() {
  if (!(await isAdminSession())) redirect("/");
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--accent)]">
          woong / admin
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">관리자 권한</h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          웅허브 기능(플러그인 허브, 내부 앱 등)을 사용할 수 있는 사용자를 추가/제거합니다.
        </p>
      </header>
      <AdminPeoplePanel />
    </div>
  );
}
