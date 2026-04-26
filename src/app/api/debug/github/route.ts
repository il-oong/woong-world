export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.GITHUB_TOKEN;
  const hasToken = typeof token === "string" && token.length > 0;
  const tokenPreview = hasToken
    ? `${token.slice(0, 4)}…${token.slice(-4)} (len ${token.length})`
    : null;

  if (!hasToken) {
    return Response.json({
      ok: false,
      hasToken: false,
      hint: "GITHUB_TOKEN env var is not visible to runtime. Vercel → Project Settings → Environment Variables. Make sure 'Production' is checked, then redeploy.",
    });
  }

  // Probe 1: who is the token?
  let me: { login?: string; error?: string; status?: number } = {};
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { login?: string };
      me = { login: data.login };
    } else {
      me = { status: res.status, error: await res.text() };
    }
  } catch (e) {
    me = { error: e instanceof Error ? e.message : "unknown" };
  }

  // Probe 2: try fetching one of the configured repos
  let repoCheck: { repo: string; status: number; ok: boolean } | null = null;
  try {
    const res = await fetch("https://api.github.com/repos/il-oong/woong-world", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
    repoCheck = { repo: "il-oong/woong-world", status: res.status, ok: res.ok };
  } catch (e) {
    repoCheck = {
      repo: "il-oong/woong-world",
      status: 0,
      ok: false,
      ...(e instanceof Error ? { error: e.message } : {}),
    } as typeof repoCheck;
  }

  return Response.json({
    ok: !!me.login,
    hasToken: true,
    tokenPreview,
    me,
    repoCheck,
    hint:
      me.status === 401
        ? "Token is invalid or revoked. Generate a new PAT."
        : me.status === 403
          ? "Rate-limited or scope missing."
          : !me.login
            ? "Token didn't authenticate."
            : "OK — token works.",
  });
}
