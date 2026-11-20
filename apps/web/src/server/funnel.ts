import { eq, recordFunnelEvent, users, type Db, type FunnelStageName } from "@pitchlab/db";

/** Registra un hito del embudo para el socio únicamente si otorgó `analyticsConsent`. */
export async function recordMemberFunnelIfConsented(
  db: Db,
  userId: string,
  eventName: FunnelStageName,
  sourcePath: string,
  meta?: Record<string, string | number | boolean> | null,
  now: Date = new Date(),
): Promise<boolean> {
  const [consentRow] = await db
    .select({ analyticsConsent: users.analyticsConsent })
    .from(users)
    .where(eq(users.id, userId))
    .catch(() => []);
  if (!consentRow?.analyticsConsent) return false;

  return recordFunnelEvent(db, {
    eventName,
    sessionKey: userId,
    userId,
    sourcePath,
    meta: meta ?? null,
    now,
  }).catch((error) => {
    console.error(`[embudo] ${eventName}:`, error);
    return false;
  });
}
