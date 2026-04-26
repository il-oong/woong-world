export type CategoryId =
  | "life"
  | "company"
  | "vfx"
  | "appdev"
  | "jazz";

export type Category = {
  id: CategoryId;
  label: string;
  /** Google Calendar event colorId (1-11) */
  colorId: string;
  /** Hex used for UI dots / chips / borders */
  color: string;
  /** Soft background variant for chips */
  bg: string;
  /** Border variant */
  border: string;
};

export const CATEGORIES: Category[] = [
  {
    id: "life",
    label: "인생",
    colorId: "9",
    color: "#5484ed",
    bg: "rgba(84,132,237,0.15)",
    border: "rgba(84,132,237,0.45)",
  },
  {
    id: "company",
    label: "회사",
    colorId: "8",
    color: "#9aa0a6",
    bg: "rgba(154,160,166,0.15)",
    border: "rgba(154,160,166,0.45)",
  },
  {
    id: "vfx",
    label: "VFX",
    colorId: "3",
    color: "#a36ee0",
    bg: "rgba(163,110,224,0.15)",
    border: "rgba(163,110,224,0.45)",
  },
  {
    id: "appdev",
    label: "앱개발",
    colorId: "7",
    color: "#46d6db",
    bg: "rgba(70,214,219,0.15)",
    border: "rgba(70,214,219,0.45)",
  },
  {
    id: "jazz",
    label: "재즈",
    colorId: "6",
    color: "#ffa726",
    bg: "rgba(255,167,38,0.15)",
    border: "rgba(255,167,38,0.45)",
  },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
const BY_COLOR_ID = new Map(CATEGORIES.map((c) => [c.colorId, c]));

export function getCategory(id: CategoryId): Category {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Unknown category: ${id}`);
  return c;
}

export function categoryFromEvent(ev: {
  colorId?: string;
  extendedProperties?: { private?: { category?: string } };
}): Category | null {
  const explicit = ev.extendedProperties?.private?.category;
  if (explicit && BY_ID.has(explicit as CategoryId)) {
    return BY_ID.get(explicit as CategoryId) ?? null;
  }
  if (ev.colorId && BY_COLOR_ID.has(ev.colorId)) {
    return BY_COLOR_ID.get(ev.colorId) ?? null;
  }
  return null;
}
