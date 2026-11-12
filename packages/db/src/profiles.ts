import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "./billing";
import { authAccount, tipstarProfiles, users } from "./schema";
import { checkHandleFormat, isHandleAvailable, isHandleConflict } from "./signup";

const publicFields = {
  displayName: users.displayName,
  handle: users.handle,
  bio: users.bio,
  xUsername: users.xUsername,
  joinedAt: users.createdAt,
};

const memberFields = { ...publicFields, xLinkedAt: users.xLinkedAt, publicProfile: users.publicProfile };

export async function publicProfileByHandle(db: Db, rawHandle: string) {
  const check = checkHandleFormat(rawHandle);
  if (!check.ok) return null;
  const [profile] = await db
    .select({ ...publicFields, isTipstar: sql<boolean>`${tipstarProfiles.userId} is not null` })
    .from(users)
    .leftJoin(tipstarProfiles, and(eq(tipstarProfiles.userId, users.id), eq(tipstarProfiles.isActive, true)))
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
