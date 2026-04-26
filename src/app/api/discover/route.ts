import seed from "@/data/services.json";
import { fetchRepo, fetchUserRepos } from "@/lib/github";
import {
  githubUrlFor,
  inferCategory,
  pickLiveUrl,
  type Service,
  type ServiceSeed,
} from "@/lib/types";

export const revalidate = 600;

function seedOwner(seeds: ServiceSeed[]): string {
  return seeds[0]?.repo.split("/")[0] ?? "il-oong";
}

export async function GET() {
  const seeds = seed as ServiceSeed[];
  const owner = process.env.GITHUB_USER ?? seedOwner(seeds);
  const seedBySlug = new Map(seeds.map((s) => [s.repo.toLowerCase(), s]));

  const repos = await fetchUserRepos(owner);

  const fromRepos: Service[] = await Promise.all(
    repos.map(async (repo) => {
      const slug = repo.full_name;
      const s = seedBySlug.get(slug.toLowerCase());
      const githubUrl = githubUrlFor(slug);
      const resolvedLiveUrl = pickLiveUrl(s?.liveUrl, s?.url, repo.homepage);
      return {
        repo: slug,
        category: s?.category ?? inferCategory(repo.topics),
        url: s?.url,
        liveUrl: s?.liveUrl,
        icon: s?.icon,
        title: s?.title,
        description: s?.description,
        pinned: s?.pinned,
        resolvedTitle: s?.title ?? repo.name,
        resolvedDescription: s?.description ?? repo.description ?? "",
        resolvedUrl: resolvedLiveUrl ?? githubUrl,
        resolvedLiveUrl,
        githubUrl,
        language: repo.language,
        topics: repo.topics ?? [],
        stars: repo.stargazers_count,
        pushedAt: repo.pushed_at,
        isPrivate: repo.private,
        exists: true,
        curated: Boolean(s),
      };
    }),
  );

  // Curated entries that point at repos outside this owner (or unfetched)
  const fetchedSlugs = new Set(fromRepos.map((s) => s.repo.toLowerCase()));
  const curatedExtras: Service[] = [];
  for (const s of seeds) {
    if (fetchedSlugs.has(s.repo.toLowerCase())) continue;
    const repo = await fetchRepo(s.repo);
    const githubUrl = githubUrlFor(s.repo);
    const resolvedLiveUrl = pickLiveUrl(s.liveUrl, s.url, repo?.homepage);
    curatedExtras.push({
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
    });
  }

  return Response.json({ services: [...curatedExtras, ...fromRepos], owner });
}
