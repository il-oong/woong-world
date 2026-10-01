import type { Notice } from "./model";

// Checked against the LH A6/A17 model-house type lists on 2026-10-01.
// The official names are kept here so a changed daily feed cannot attach
// an unrelated plan to a reused unit ID.
const sources = {
  "2026000414": {
    site: "https://gy-center6.co.kr",
    plans: [
      ["059.8400A", "59A"], ["059.8100B", "59B"], ["059.8300C", "59C"],
      ["059.7100D", "59D"], ["059.7200E", "59E"], ["059.9700G", "59G"],
      ["059.8200H", "59H"], ["069.8200P", "P69"], ["074.9300O", "74"],
      ["077.4100A", "P77A"], ["077.4100C", "P77C"], ["084.7800A", "84A"],
      ["084.9900B", "84B"],
    ],
    folder: "a6",
  },
  "2026820010": {
    site: "https://www.design-a17.co.kr",
    plans: [["055.9000A", "55A"], ["055.8800B", "55B"], ["055.7600C", "55C"]],
    folder: "a17",
  },
} as const;

export function withReviewedFloorplans(notice: Notice): Notice {
  const source = sources[notice.id as keyof typeof sources];
  if (!source) return notice;
  return {
    ...notice,
    units: notice.units.map((unit, index) => {
      const plan = source.plans[index];
      if (!plan || !unit.name.startsWith(`${plan[0]} `)) return unit;
      return {
        ...unit,
        floorPlanImageUrl: unit.floorPlanImageUrl ?? `/housing/gyeyang/${source.folder}/${plan[1]}.webp`,
        floorPlanUrl: unit.floorPlanUrl ?? `${source.site}/sub03_01.html?tab=${index + 1}`,
      };
    }),
  };
}
