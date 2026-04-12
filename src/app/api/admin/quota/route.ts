import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import {
  setUserTokenLimit,
  getUserTokenLimitConfig,
  resetUserTokenLimit,
  getAllTokenLimitConfigs,
  getUserQuota,
} from "@/lib/token-tracker";
import { sanitizeError, isSameOrigin } from "@/lib/api-guard";

/**
 * GET /api/admin/quota
 * List all token limit configurations (admin only)
 */
export async function GET(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const idToken = req.headers.get("authorization")?.split(" ")[1];
  if (!idToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const decoded = await verifyIdToken(idToken);
  if (!decoded || !isAdminEmail(decoded.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const configs = getAllTokenLimitConfigs();
    return NextResponse.json({ configs });
  } catch (err: unknown) {
    console.error("quota GET error", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}

/**
 * POST /api/admin/quota
 * Set or update a user's token limit
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const idToken = req.headers.get("authorization")?.split(" ")[1];
  if (!idToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const decoded = await verifyIdToken(idToken);
  if (!decoded || !isAdminEmail(decoded.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    const { userId, monthlyTokenLimit } = (body ?? {}) as {
      userId?: unknown;
      monthlyTokenLimit?: unknown;
    };

    if (typeof userId !== "string" || !userId.trim()) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    if (typeof monthlyTokenLimit !== "number" || monthlyTokenLimit <= 0) {
      return NextResponse.json(
        { error: "monthlyTokenLimit must be a positive number" },
        { status: 400 }
      );
    }

    setUserTokenLimit(userId, monthlyTokenLimit, decoded.email || "unknown");

    const config = getUserTokenLimitConfig(userId);
    const quota = getUserQuota(userId);

    return NextResponse.json({
      success: true,
      config,
      currentQuota: quota,
    });
  } catch (err: unknown) {
    console.error("quota POST error", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/quota
 * Reset a user's token limit to default
 */
export async function DELETE(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const idToken = req.headers.get("authorization")?.split(" ")[1];
  if (!idToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const decoded = await verifyIdToken(idToken);
  if (!decoded || !isAdminEmail(decoded.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    const { userId } = (body ?? {}) as { userId?: unknown };

    if (typeof userId !== "string" || !userId.trim()) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    resetUserTokenLimit(userId, decoded.email || "unknown");

    return NextResponse.json({ success: true, userId });
  } catch (err: unknown) {
    console.error("quota DELETE error", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
