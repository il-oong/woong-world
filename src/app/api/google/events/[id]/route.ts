import { deleteEvent, getValidSession } from "@/lib/google";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getValidSession();
  if (!session) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const { id } = await params;
  try {
    await deleteEvent(session, id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "delete_failed" },
      { status: 500 },
    );
  }
}
