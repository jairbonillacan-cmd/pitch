import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "./billing";
import { authAccount, tipsterProfiles, users } from "./schema";
import { checkHandleFormat, isHandleAvailable, isHandleConflict } from "./signup";

const publicFields = {
  displayName: users.displayName,
  handle: users.handle,
  bio: users.bio,
  avatarUrl: users.avatarUrl,
  xUsername: users.xUsername,
  joinedAt: users.createdAt,
};

const memberFields = { ...publicFields, xLinkedAt: users.xLinkedAt, publicProfile: users.publicProfile };

export async function publicProfileByHandle(db: Db, rawHandle: string) {
  const check = checkHandleFormat(rawHandle);
  if (!check.ok) return null;
  const [profile] = await db
    .select({ ...publicFields, isTipster: sql<boolean>`${tipsterProfiles.userId} is not null` })
    .from(users)
    .leftJoin(tipsterProfiles, and(eq(tipsterProfiles.userId, users.id), eq(tipsterProfiles.isActive, true)))
    .where(
      and(
        eq(users.handle, check.handle),
        isNotNull(users.authUserId),
        eq(users.isAdult, true),
        eq(users.publicProfile, true),
      ),
    );
  return profile ?? null;
}

export async function memberProfile(db: Db, userId: string) {
  const [profile] = await db.select(memberFields).from(users).where(eq(users.id, userId));
  return profile ?? null;
}

interface ProfileChanges {
  displayName?: string;
  handle?: string;
  bio?: string | null;
  publicProfile?: boolean;
}

export async function updateMemberProfile(db: Db, userId: string, changes: ProfileChanges) {
  if (changes.handle && !(await isHandleAvailable(db, changes.handle, userId))) {
    return { status: "taken" } as const;
  }
  try {
    const [profile] = await db.update(users).set(changes).where(eq(users.id, userId)).returning(memberFields);
    return profile ? { status: "saved", profile } as const : { status: "missing" } as const;
  } catch (error) {
    if (isHandleConflict(error)) return { status: "taken" } as const;
    throw error;
  }
}

export async function disconnectX(db: Db, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [profile] = await tx.update(users)
      .set({ xUsername: null, xLinkedAt: null })
      .where(eq(users.id, userId))
      .returning({ authUserId: users.authUserId });
    if (!profile?.authUserId) return;
    await tx.delete(authAccount).where(and(eq(authAccount.userId, profile.authUserId), eq(authAccount.providerId, "twitter")));
  });
}

/** Actualiza o quita la foto de perfil (`avatar_url`); devuelve la URL anterior para limpiar el blob. */
export async function setMemberAvatarUrl(
  db: Db,
  userId: string,
  avatarUrl: string | null,
): Promise<{ status: "saved"; previousAvatarUrl: string | null; avatarUrl: string | null } | { status: "missing" }> {
  return db.transaction(async (tx) => {
    const [prev] = await tx.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId));
    if (!prev) return { status: "missing" } as const;
    const [updated] = await tx
      .update(users)
      .set({ avatarUrl })
      .where(eq(users.id, userId))
      .returning({ avatarUrl: users.avatarUrl });
    if (!updated) return { status: "missing" } as const;
    return {
      status: "saved",
      previousAvatarUrl: prev.avatarUrl,
      avatarUrl: updated.avatarUrl,
    } as const;
  });
}
