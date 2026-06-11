import { isAdminSession } from "@/lib/admin";
import { isLocalRuntime } from "./config";

/**
 * Gate for VaultSync API routes. Returns a Response to short-circuit with
 * (403 if not admin, 503 if running on a deploy), or null if allowed.
 */
export async function guardVaultSync(): Promise<Response | null> {
  if (!(await isAdminSession())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isLocalRuntime()) {
    return Response.json(
      {
        error: "deploy_only",
        message:
          "VaultSync는 로컬 전용입니다. 내 PC에서 `npm run dev`로 실행하세요.",
      },
      { status: 503 },
    );
  }
  return null;
}
