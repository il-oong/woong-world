import { getValidSession, deleteCalendar } from "@/lib/google";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getValidSession();
  if (!session) return Response.json({ error: "not_connected" }, { status: 401 });
  const { id } = await params;
  if (id === "primary") return Response.json({ error: "cannot_delete_primary" }, { status: 400 });
  try {
    await deleteCalendar(session, decodeURIComponent(id));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "delete_failed" }, { status: 500 });
  }
}
