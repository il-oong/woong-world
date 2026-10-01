import { readSession } from "@/lib/session";
import { refreshSession } from "@/lib/google";
import { isAdminEmail } from "@/lib/admin";
import {
  getCommutes,
  getNotices,
  getProfile,
  housingStore,
  userKey,
} from "./store";
import type { Commute, Notice, Profile } from "./model";
import feed from "@/data/housing-feed.json";
export type HousingData = {
  notices: Notice[];
  profile: Profile | null;
  favorites: string[];
  commutes: Record<string, Commute | null>;
  connected: boolean;
  admin: boolean;
  error: string | null;
  feedUpdatedAt: string | null;
};
export async function loadHousing(): Promise<HousingData> {
  const session = await readSession();
  // Server Components cannot update cookies. Check an expired Google session
  // without writing here; a Route Handler will persist a refreshed token.
  const validSession = session && session.expiresAt - 60_000 <= Date.now()
    ? await refreshSession(session)
    : session;
  const email = validSession?.email;
  const base: HousingData = {
    notices: [],
    profile: null,
    favorites: [],
    commutes: {},
    connected: !!email,
    admin: false,
    error: null,
    feedUpdatedAt: feed.updatedAt,
  };
  try {
    base.admin = await isAdminEmail(email);
    const db = housingStore();
    if (!db)
      return {
        ...base,
        notices: await getNotices(),
        error:
          "공개 공고는 열람할 수 있습니다. 내 정보·관심 청약 저장은 데이터 저장소 연결 후 이용할 수 있습니다.",
      };
    const [notices, profile, favorites] = await Promise.all([
      getNotices(),
      email ? getProfile(email) : null,
      email ? db.smembers<string[]>(`${userKey(email)}:favorites`) : [],
    ]);
    return {
      ...base,
      notices,
      profile,
      favorites,
      commutes: email ? await getCommutes(email, notices, profile) : {},
    };
  } catch {
    return {
      ...base,
      error: "청약 정보를 불러오지 못했습니다. 잠시 후 새로고침해주세요.",
    };
  }
}
