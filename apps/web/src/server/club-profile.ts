import { cache } from "react";
import { getExampleAnalystSpec, OWN_PROFILE_ALIASES } from "@pitchlab/ui";
import { normalizeClubHandle } from "../profile-path";
import { loadPublicMemberProfile } from "./profile";

export const loadClubProfile = cache(async (handle: string, viaBeta: boolean) => {
  if (getExampleAnalystSpec(handle)) return { profile: null };
  const profile = await loadPublicMemberProfile(handle);
  if (profile) return { profile };
  if (viaBeta && (OWN_PROFILE_ALIASES as readonly string[]).includes(handle)) return { profile: null };
  return null;
});

export function clubHandleFromHeader(raw: string): string | null {
  try {
    return normalizeClubHandle(decodeURIComponent(raw));
  } catch {
    return null;
  }
}
