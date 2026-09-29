import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function MemoPage() {
  redirect("/apps/life-dashboard");
}
