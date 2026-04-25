import seed from "@/data/services.json";
import { fetchRepo } from "@/lib/github";
import type { Service, ServiceSeed } from "@/lib/types";

export const revalidate = 600;

export async function GET() {
  const seeds = seed as ServiceSeed[];
  const services: Service[] = await Promise.all(
    seeds.map(async (s) => {
      const repo = await fetchRepo(s.repo);
      const fallbackUrl = `https://github.com/${s.repo}`;
      return {
        ...s,
        resolvedTitle: s.title ?? repo?.name ?? s.repo.split("/").pop() ?? s.repo,
        resolvedDescription: s.description ?? repo?.description ?? "",
        resolvedUrl: s.url ?? repo?.homepage ?? fallbackUrl,
        language: repo?.language ?? null,
        topics: repo?.topics ?? [],
        stars: repo?.stargazers_count,
        pushedAt: repo?.pushed_at ?? null,
        isPrivate: repo?.private,
        exists: repo !== null,
        curated: true,
      };
    }),
  );

  return Response.json({ services });
}
