import { z } from "zod";
import { authorize, failure, json, readBody } from "@/lib/housing/http";
import { userKey } from "@/lib/housing/store";
export async function POST(req: Request) {
  try {
    const a = await authorize(req);
    if (a.error) return a.error;
    const { id, selected } = z
      .object({
        id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
        selected: z.boolean(),
      })
      .parse(await readBody(req, 1000));
    if (selected) await a.db.sadd(`${userKey(a.email)}:favorites`, id);
    else await a.db.srem(`${userKey(a.email)}:favorites`, id);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
