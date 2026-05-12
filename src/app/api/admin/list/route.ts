import {
  addAdmin,
  isAdminSession,
  listAdmins,
  removeAdmin,
} from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminSession())) {
    return Response.json({ error: "not_admin" }, { status: 403 });
  }
  const data = await listAdmins();
  return Response.json(data);
}

export async function POST(req: Request) {
  if (!(await isAdminSession())) {
    return Response.json({ error: "not_admin" }, { status: 403 });
  }
  let body: { email?: unknown };
  try {
    body = (await req.json()) as { email?: unknown };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email : "";
  try {
    await addAdmin(email);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "add_failed";
    const status = msg === "invalid_email" ? 400 : msg === "storage_not_configured" ? 503 : 500;
    return Response.json({ error: msg }, { status });
  }
  const data = await listAdmins();
  return Response.json(data);
}

export async function DELETE(req: Request) {
  if (!(await isAdminSession())) {
    return Response.json({ error: "not_admin" }, { status: 403 });
  }
  const email = new URL(req.url).searchParams.get("email") ?? "";
  try {
    await removeAdmin(email);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "remove_failed";
    const status =
      msg === "cannot_remove_super"
        ? 400
        : msg === "storage_not_configured"
          ? 503
          : 500;
    return Response.json({ error: msg }, { status });
  }
  const data = await listAdmins();
  return Response.json(data);
}
