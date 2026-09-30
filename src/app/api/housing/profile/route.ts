import { authorize, failure, json, readBody } from "@/lib/housing/http";
import { profileSchema } from "@/lib/housing/model";
import { getProfile, userKey } from "@/lib/housing/store";
export async function GET(req: Request) {
  try {
    const a = await authorize(req);
    if (a.error) return a.error;
    return json({ profile: await getProfile(a.email) });
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(req: Request) {
  try {
    const a = await authorize(req);
    if (a.error) return a.error;
    const profile = profileSchema.parse(await readBody(req, 12000));
    await a.db.set(`${userKey(a.email)}:profile`, profile);
    return json({ profile });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    const a = await authorize(req);
    if (a.error) return a.error;
    await a.db.del(
      `${userKey(a.email)}:profile`,
      `${userKey(a.email)}:favorites`,
      `${userKey(a.email)}:commutes`,
    );
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
