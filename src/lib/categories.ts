// CategoryId는 string (커스텀 카테고리 지원)
export type CategoryId = string;

export type Category = {
  id: string;
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

// Google Calendar 11가지 프리셋 색상
export const COLOR_PRESETS: { colorId: string; color: string; name: string }[] = [
  { colorId: "1",  color: "#d50000", name: "Tomato" },
  { colorId: "2",  color: "#e67c73", name: "Flamingo" },
  { colorId: "3",  color: "#f09300", name: "Tangerine" },
  { colorId: "4",  color: "#f6bf26", name: "Banana" },
  { colorId: "5",  color: "#33b679", name: "Sage" },
  { colorId: "6",  color: "#0b8043", name: "Basil" },
  { colorId: "7",  color: "#039be5", name: "Peacock" },
  { colorId: "8",  color: "#3f51b5", name: "Blueberry" },
  { colorId: "9",  color: "#7986cb", name: "Lavender" },
  { colorId: "10", color: "#8d24aa", name: "Grape" },
  { colorId: "11", color: "#616161", name: "Graphite" },
];

export function colorFromPreset(colorId: string): { color: string; bg: string; border: string } {
  const preset = COLOR_PRESETS.find((p) => p.colorId === colorId);
  const hex = preset?.color ?? "#7986cb";
  return {
    color: hex,
    bg: `${hex}26`,
    border: `${hex}73`,
  };
}

export function buildCategory(raw: { id: string; label: string; colorId: string }): Category {
  const { color, bg, border } = colorFromPreset(raw.colorId);
  return { id: raw.id, label: raw.label, colorId: raw.colorId, color, bg, border };
}

// 기본 카테고리 — Redis에 사용자별 저장이 없을 때 fallback.
// 모든 사용자에 공통으로 적용되니 특정 사람을 가리키는 라벨은 금지.
// 사용자가 카테고리 관리에서 추가/수정/삭제로 자기 것으로 만든다.
export const DEFAULT_CATEGORIES: Category[] = [
  buildCategory({ id: "work",     label: "업무", colorId: "7" }),
  buildCategory({ id: "personal", label: "개인", colorId: "9" }),
];

// 런타임에 사용하는 카테고리 목록 (SSR용 fallback — 클라이언트는 API 사용)
export let CATEGORIES: Category[] = DEFAULT_CATEGORIES;

export function setRuntimeCategories(cats: Category[]) {
  CATEGORIES = cats.length > 0 ? cats : DEFAULT_CATEGORIES;
}

export function getCategory(id: CategoryId): Category {
  const c = CATEGORIES.find((cat) => cat.id === id);
  return c ?? buildCategory({ id, label: id, colorId: "9" });
}

export function categoryFromEvent(ev: {
  colorId?: string;
  extendedProperties?: { private?: { category?: string } };
}): Category | null {
  const explicit = ev.extendedProperties?.private?.category;
  if (explicit) {
    const found = CATEGORIES.find((c) => c.id === explicit);
    if (found) return found;
  }
  if (ev.colorId) {
    const byColor = CATEGORIES.find((c) => c.colorId === ev.colorId);
    if (byColor) return byColor;
  }
  return null;
}
