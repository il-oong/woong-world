import { loadHousing } from "@/lib/housing/load";
import { ProfileForm } from "@/components/Housing/ProfileForm";
export const dynamic = "force-dynamic";
export default async function Page() {
  const d = await loadHousing();
  return (
    <ProfileForm initial={d.profile} connected={d.connected} error={d.error} />
  );
}
