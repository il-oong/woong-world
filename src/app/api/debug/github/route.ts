export const dynamic = "force-dynamic";

function scanEnvKeys() {
  const all = Object.keys(process.env);
  const candidatePattern = /(github|gh_|git|token|pat)/i;
  const candidates = all.filter((k) => candidatePattern.test(k)).sort();
  return {
    totalEnvCount: all.length,
    runsOn: process.env.VERCEL ? "vercel" : "local-or-other",
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelRegion: process.env.VERCEL_REGION ?? null,
    vercelGitCommitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    candidateKeys: candidates,
    candidateValueShape: Object.fromEntries(
      candidates.map((k) => {
        const v = process.env[k] ?? "";
        return [
          k,
          {
            present: v.length > 0,
            length: v.length,
          },
        ];
      }),
    ),
  };
}

export async function GET() {
  const token = process.env.GITHUB_TOKEN;
  const hasToken = typeof token === "string" && token.length > 0;
  const tokenPreview = hasToken
    ? `${token.slice(0, 4)}…${token.slice(-4)} (len ${token.length})`
    : null;
  const envScan = scanEnvKeys();

  if (!hasToken) {
    return Response.json({
      ok: false,
      hasToken: false,
      envScan,
      hint:
        envScan.candidateKeys.length === 0
          ? "런타임에 GitHub 관련 env가 하나도 없습니다. Vercel 프로젝트가 다른 곳에 저장됐거나, Production 환경에 체크가 안 됐거나, 최신 배포가 promote 안 된 상태일 가능성이 높습니다."
          : `런타임에 보이는 GitHub 관련 env 키: [${envScan.candidateKeys.join(", ")}]. 이 중 GITHUB_TOKEN이 없다면 변수명이 다른 이름으로 저장된 것입니다.`,
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
    envScan,
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
