import { and, checkHandleFormat, createDb, eq, getUserPreferences, isNotNull, sealedPicks, users, type Db } from "@pitchlab/db";
import {
  computeRecordStats,
  normalizeRecordPrivacy,
  publicRecordView,
  type PublicRecordPayload,
  type RecordEntry,
} from "@pitchlab/ui/record-stats";

let recordDb: Db | undefined;

export type { PublicRecordPayload };

/**
 * Récord público de un socio: se calcula con sus picks sellados y se filtra con su privacidad
 * de Mi récord. Sin perfil público (o con «Récord público» apagado) no se entrega nada.
 * Los pesos nunca salen: el ROI usa la banca en unidades y solo si el socio lo activó.
 */
export async function loadPublicRecord(
  rawHandle: string,
  customDb?: Db,
): Promise<PublicRecordPayload | null> {
  const check = checkHandleFormat(rawHandle);
  if (!check.ok) return null;
  let db = customDb;
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) return null;
    recordDb ??= createDb(url) as unknown as Db;
    db = recordDb;
  }
  const [user] = await db
    .select({ id: users.id, publicProfile: users.publicProfile })
    .from(users)
    .where(and(eq(users.handle, check.handle), isNotNull(users.authUserId), eq(users.isAdult, true)));
  if (!user) return null;
  if (!user.publicProfile) return { hidden: true };
  const prefs = await getUserPreferences(db, user.id);
  if (!prefs.publicRecordVisible) return { hidden: true };

  const rows = await db
    .select()
    .from(sealedPicks)
    .where(eq(sealedPicks.userId, user.id))
    .orderBy(sealedPicks.sealedAt);
  const entries: RecordEntry[] = rows
    .filter((r) => r.status === "won" || r.status === "lost" || r.status === "pending")
    .map((r) => ({
      status: r.status as RecordEntry["status"],
      units: Number(r.units),
      userDecimal: Number(r.userDecimal),
      fairDecimal: Number(r.fairDecimal),
      clvPct: r.clvPct === null ? 0 : Number(r.clvPct),
      leagueLabel: r.leagueLabel,
      pickLabel: r.pickLabel,
      origin: r.origin,
      sealedAtIso: r.sealedAt.toISOString(),
      settledAtIso: r.settledAt ? r.settledAt.toISOString() : null,
    }));
  const startingUnits =
    prefs.bankrollStartMxnCentavos && prefs.unitMxnCentavos > 0
      ? prefs.bankrollStartMxnCentavos / prefs.unitMxnCentavos
      : null;
  const stats = computeRecordStats(entries, startingUnits);
  // El historial público va del más reciente al más viejo.
  const newestFirst = [...entries].reverse();
  return {
    hidden: false,
    settled: stats.settled,
    view: publicRecordView(stats, newestFirst, normalizeRecordPrivacy(prefs.recordPrivacy)),
  };
}
