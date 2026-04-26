import { fetchRepoDocs } from "@/lib/github";

export const revalidate = 600;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  if (!slug || slug.length < 2) {
    return Response.json({ error: "invalid repo" }, { status: 400 });
  }
  const repo = slug.slice(0, 2).join("/");
  const docs = await fetchRepoDocs(repo);
  if (!docs) {
    return Response.json(
      { error: "not found, unauthorized, or no default branch" },
      { status: 404 },
    );
  }
  return Response.json({ repo, count: docs.length, docs });
}
