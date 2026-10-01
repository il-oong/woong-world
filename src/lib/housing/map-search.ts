import type { Notice } from "./model";

// Public notices often describe the whole development area before naming the
// actual housing block. Map search works better with the project and block.
export function mapSearchQuery(address: string, title: string) {
  const normalized = address.replace(/\s+/g, " ").trim();
  const areaEnd = normalized.lastIndexOf("일원");
  const site = areaEnd < 0 ? normalized : normalized.slice(areaEnd + "일원".length).trim();
  const match = site.match(
    /(.+?(?:공공주택지구|도시개발사업지구|택지개발지구|도시개발구역|신도시))\s*(?:내\s*)?([A-Z]{0,2}\s*-?\s*\d+(?:-\d+)?\s*(?:블록|BL))/i,
  );
  if (match) return `${match[1].trim()} ${match[2].replace(/\s+/g, "")}`;
  return normalized.length <= 80 ? normalized || title : title;
}

// Kakao indexes the two Gyeyang apartment places by this shorter name.
// The full project-and-block label is retained on the detail page.
export function mapProviderQuery(address: string, title: string) {
  const summary = mapSearchQuery(address, title);
  const gyeyangBlock = summary.match(/^인천계양 테크노밸리 공공주택지구 (A\d+)블록$/i);
  return gyeyangBlock ? `인천계양 ${gyeyangBlock[1]}` : summary;
}

export function mapSearchUrl(notice: Pick<Notice, "address" | "title" | "locationUrl">) {
  if (notice.locationUrl) return notice.locationUrl;
  const query = mapProviderQuery(notice.address, notice.title);
  return `https://map.kakao.com/link/search/${encodeURIComponent(query)}`;
}
