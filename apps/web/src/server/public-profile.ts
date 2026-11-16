import type { PublicMemberProfile } from "@pitchlab/contracts";
import {
  and,
  checkHandleFormat,
  eq,
  followCounts,
  publicProfileByHandle,
  users,
  type Db,
} from "@pitchlab/db";
import type { BadgeView } from "@pitchlab/ui/badges";
import { normalizeClubHandle } from "../profile-path";
import { loadProfileBadges } from "./badges";
import { loadPublicRecord, type PublicRecordPayload } from "./public-record";
import { serverDb } from "./session-user";

export interface PublicShareProfileData {
  profile: PublicMemberProfile;
  publicRecord: PublicRecordPayload | null;
  badges: { public: BadgeView[]; featured: BadgeView[] } | null;
}

/**
 * Carga el perfil público verificable de un socio para `/u/[handle]` (sin sesión).
 * Exige `publicProfile === true` y aplica estrictamente `publicRecordVisible` +
 * `recordPrivacy`. Nunca expone cuentas privadas, pendientes ni perfiles demo.
 */
export async function loadPublicShareProfile(
  rawHandle: string,
  customDb?: Db,
): Promise<PublicShareProfileData | null> {
  const cleanHandle = normalizeClubHandle(rawHandle);
  const format = checkHandleFormat(cleanHandle);
  if (!format.ok) return null;

  const db = customDb ?? serverDb();
  if (!db) return null;

  const row = await publicProfileByHandle(db, format.handle);
  if (!row?.handle) return null;

  const [targetRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.handle, row.handle), eq(users.publicProfile, true)))
    .limit(1);
  if (!targetRow) return null;

  const [counts, publicRecord, badges] = await Promise.all([
    followCounts(db, targetRow.id),
    loadPublicRecord(row.handle, db),
    loadProfileBadges(row.handle, db),
  ]);

  const profile: PublicMemberProfile = {
    displayName: row.displayName || row.handle,
    handle: row.handle,
    bio: row.bio,
    avatarUrl: row.avatarUrl ?? null,
    xUsername: row.xUsername,
    joinedAt: row.joinedAt.toISOString(),
    isTipster: row.isTipster,
    followers: counts.followers,
    following: counts.following,
  };

  return {
    profile,
    publicRecord,
    badges,
  };
}
