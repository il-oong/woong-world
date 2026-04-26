import seed from "@/data/services.json";
import { fetchRepo } from "@/lib/github";
import {
  githubUrlFor,
  pickLiveUrl,
  type Service,
  type ServiceSeed,
} from "@/lib/types";

export const revalidate = 600;

export async function GET() {
  const seeds = seed as ServiceSeed[];
  const services: Service[] = await Promise.all(
    seeds.map(async (s) => {
      const repo = await fetchRepo(s.repo);
      const githubUrl = githubUrlFor(s.repo);
      const resolvedLiveUrl = pickLiveUrl(s.liveUrl, s.url, repo?.homepage);
      return {
        ...s,
        resolvedTitle: s.title ?? repo?.name ?? s.repo.split("/").pop() ?? s.repo,
        resolvedDescription: s.description ?? repo?.description ?? "",
        resolvedUrl: resolvedLiveUrl ?? githubUrl,
        resolvedLiveUrl,
        githubUrl,
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
