import { redirect } from "next/navigation";
import { getAdminSession, isSuperAdminEmail } from "@/lib/admin";
import { AdminPeoplePanel } from "@/components/AdminPeoplePanel";

export const dynamic = "force-dynamic";

export default async function AdminPeoplePage() {
  const session = await getAdminSession();
  if (!session) redirect("/");
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--accent)]">
          woong / admin
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">관리자 권한</h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          지정한 관리자는 플러그인 허브와 내부 앱을 사용할 수 있습니다. 권한 지정과 해제는 기본 관리자만 할 수 있습니다.
        </p>
      </header>
      <AdminPeoplePanel canManage={isSuperAdminEmail(session.email)} />
    </div>
  );
}
