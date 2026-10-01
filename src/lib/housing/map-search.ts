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

// These are registered place markers for planned apartments, not surveyed
// building entrances. Keep them separate from Notice.point, which powers
// route calculations, and recheck the block label if an official notice changes.
const gyeyangPlaces = {
  "2026000414": {
    block: "A6",
    point: { lat: 37.5526540270373, lng: 126.75619766034752 },
    sourceUrl: "https://place.map.kakao.com/656918402",
  },
  "2026820010": {
    block: "A17",
    point: { lat: 37.5446256715147, lng: 126.755096766738 },
    sourceUrl: "https://place.map.kakao.com/1329340730",
  },
} as const;

export function mapPreview(notice: Pick<Notice, "id" | "address" | "title">) {
  const place = gyeyangPlaces[notice.id as keyof typeof gyeyangPlaces];
  if (!place) return null;
  return mapSearchQuery(notice.address, notice.title) ===
    `인천계양 테크노밸리 공공주택지구 ${place.block}블록`
    ? place
    : null;
}
