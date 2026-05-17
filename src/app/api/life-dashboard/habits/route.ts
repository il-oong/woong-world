import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  addHabit,
  deleteHabit,
  isStorageConfigured,
  listHabits,
  reorderHabits,
  saveHabits,
} from "@/lib/life-dashboard";

export const dynamic = "force-dynamic";

async function email(): Promise<string | null> {
  const s = await getValidSession();
  return s?.email ?? null;
}

const COLORS = ["#60a5fa","#34d399","#f472b6","#fbbf24","#a78bfa","#fb923c","#22d3ee","#f87171"];

export async function GET() {
  if (!isStorageConfigured())
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  const em = await email();
  if (!em) return Response.json({ error: "not_connected" }, { status: 401 });
  const habits = await listHabits(em);
  return Response.json({ habits });
}

export async function POST(req: NextRequest) {
  if (!isStorageConfigured())
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  const em = await email();
  if (!em) return Response.json({ error: "not_connected" }, { status: 401 });

  const { name, color } = (await req.json()) as { name?: string; color?: string };
  if (!name?.trim())
    return Response.json({ error: "name_required" }, { status: 400 });

  const habits = await listHabits(em);
  const c = color ?? COLORS[habits.length % COLORS.length];
  const habit = await addHabit(em, name.trim(), c);
  return Response.json({ habit }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  if (!isStorageConfigured())
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  const em = await email();
  if (!em) return Response.json({ error: "not_connected" }, { status: 401 });

  const body = (await req.json()) as { ids?: string[]; habits?: { id: string; name: string; color: string; order: number; createdAt: number }[] };

  if (body.ids) {
    await reorderHabits(em, body.ids);
    return Response.json({ ok: true });
  }
  if (body.habits) {
    await saveHabits(em, body.habits);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "invalid_body" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  if (!isStorageConfigured())
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  const em = await email();
  if (!em) return Response.json({ error: "not_connected" }, { status: 401 });

  const { id } = (await req.json()) as { id?: string };
  if (!id) return Response.json({ error: "id_required" }, { status: 400 });

  const ok = await deleteHabit(em, id);
  return Response.json({ ok });
}
