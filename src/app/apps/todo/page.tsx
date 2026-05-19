import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function TodoPage() {
  redirect("/apps/life-dashboard");
}
