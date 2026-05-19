import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function RoutinePage() {
  redirect("/apps/life-dashboard");
}
