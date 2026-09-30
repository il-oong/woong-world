import { readSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import {
  getCommutes,
  getNotices,
  getProfile,
  housingStore,
  userKey,
} from "./store";
import type { Commute, Notice, Profile } from "./model";
export type HousingData = {
  notices: Notice[];
  profile: Profile | null;
  favorites: string[];
  commutes: Record<string, Commute | null>;
  connected: boolean;
  admin: boolean;
  error: string | null;
};
export async function loadHousing(): Promise<HousingData> {
  const session = await readSession();
  const email = session?.email;
  const base: HousingData = {
    notices: [],
    profile: null,
    favorites: [],
    commutes: {},
    connected: !!email,
    admin: false,
    error: null,
  };
  try {
    base.admin = await isAdminEmail(email);
    const db = housingStore();
    if (!db)
      return {
        ...base,
        error:
          "청약 데이터 저장소가 아직 연결되지 않았습니다. 관리자 설정 후 이용할 수 있습니다.",
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
