import { getValidSession } from "@/lib/google";
import { isAdminEmail } from "@/lib/admin";
import { housingStore } from "./store";
import { ZodError } from "zod";
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function authorize(req: Request, admin = false) {
  // Next can normalize req.url to localhost behind its server. Validate the
  // browser origin against the actual Host header, never a forwarded host.
  const origin = req.headers.get("origin");
  let sameOrigin = false;
  try {
    const parsed = new URL(origin ?? "");
    sameOrigin =
      ["https:", "http:"].includes(parsed.protocol) &&
      parsed.host === (req.headers.get("host") ?? new URL(req.url).host);
  } catch {
    /* Missing or malformed origin must fail closed. */
  }
  if (req.method !== "GET" && !sameOrigin)
    return { error: json({ error: "요청 출처를 확인할 수 없습니다" }, 403) };
  const session = await getValidSession();
  if (!session?.email)
    return { error: json({ error: "구글 로그인이 필요합니다" }, 401) };
  if (admin && !(await isAdminEmail(session.email)))
    return {
      error: json({ error: "관리자만 공고를 등록할 수 있습니다" }, 403),
    };
  const db = housingStore();
  if (!db)
    return {
      error: json({ error: "청약 저장소가 아직 연결되지 않았습니다" }, 503),
    };
  return { email: session.email, db };
}
export async function readBody(req: Request, limit = 100_000) {
  if (Number(req.headers.get("content-length")) > limit)
    throw Error("입력 내용이 너무 큽니다");
  const body = await req.text();
  if (body.length > limit) throw Error("입력 내용이 너무 큽니다");
  return JSON.parse(body);
}
export function failure(e: unknown) {
  if (e instanceof ZodError)
    return json(
      {
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" / ")
          .slice(0, 2000),
      },
      400,
    );
  if (e instanceof SyntaxError)
    return json({ error: "입력 형식을 확인해주세요" }, 400);
  return json(
    {
      error:
        "처리에 실패했습니다. 연결 상태와 입력을 확인한 뒤 다시 시도해주세요.",
    },
    503,
  );
}
