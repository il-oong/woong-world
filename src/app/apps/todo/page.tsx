import { redirect } from "next/navigation";
import { getValidSession } from "@/lib/google";
import { TodoApp } from "@/components/TodoApp";

export const dynamic = "force-dynamic";

export default async function TodoPage() {
  // Session-only (not admin-gated). Anyone signed in via Google can use this.
  const session = await getValidSession();
  if (!session?.email) redirect("/");

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 md:py-12">
      <TodoApp />
    </div>
  );
}
