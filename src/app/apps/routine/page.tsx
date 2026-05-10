import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { RoutineApp } from "@/components/RoutineApp";

export const dynamic = "force-dynamic";

export default async function RoutinePage() {
  if (!(await isAdminSession())) redirect("/");
  return (
    <div className="mx-auto max-w-2xl px-6 py-8 md:py-12">
      <RoutineApp />
    </div>
  );
}
