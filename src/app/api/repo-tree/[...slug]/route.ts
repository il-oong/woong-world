import { fetchRepoContents } from "@/lib/github";

export const revalidate = 600;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const repo = slug.slice(0, 2).join("/");
  if (!repo || slug.length < 2) {
    return Response.json({ error: "invalid repo" }, { status: 400 });
  }
  const contents = await fetchRepoContents(repo);
  if (!contents) {
    return Response.json({ error: "not found or unauthorized" }, { status: 404 });
  }
  const sorted = contents
    .map((c) => ({
      name: c.name,
      path: c.path,
      type: c.type,
      size: c.size,
      html_url: c.html_url,
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  return Response.json({ repo, contents: sorted });
}
