/**
 * Ranking de Comunidad, votos por partido y resultados finales, en lote.
 *
 * Solo entran al ranking socios que lo eligieron: perfil público (que también hace público
 * su récord), «Aparecer en el ranking» encendido, sin pausa de Comunidad, mayores de edad y
 * con cuenta activa. Las reglas y cálculos viven en `@pitchlab/ui/ranking`; aquí solo se lee.
 */
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "./billing";
import { matchResults, matchVotes, sealedPicks, tipsterProfiles, userPreferences, users } from "./schema";

export interface RankingParticipant {
  userId: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  isTipster: boolean;
  picks: Array<{
    status: "pending" | "won" | "lost";
    units: number;
    userDecimal: number;
    clvPct: number;
    sealedAtIso: string;
  }>;
}

/** Socios que aceptaron aparecer en el ranking, con sus picks (desde `since`, si se da). */
export async function loadRankingParticipants(db: Db, since?: Date): Promise<RankingParticipant[]> {
  const people = await db
    .select({
      id: users.id,
      handle: users.handle,
      name: users.displayName,
      avatarUrl: users.avatarUrl,
      isTipster: sql<boolean>`${tipsterProfiles.userId} is not null`,
    })
    .from(users)
    .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
    .leftJoin(tipsterProfiles, and(eq(tipsterProfiles.userId, users.id), eq(tipsterProfiles.isActive, true)))
    .where(
      and(
        isNotNull(users.handle),
        isNotNull(users.authUserId),
        eq(users.isAdult, true),
        eq(users.publicProfile, true),
        eq(users.socialPauseEnabled, false),
        sql`coalesce(${userPreferences.showInRanking}, true) = true`,
        sql`coalesce(${userPreferences.pauseCommunity}, false) = false`,
      ),
    );
  if (people.length === 0) return [];

  const ids = people.map((p) => p.id);
  const rows = await db
    .select({
      userId: sealedPicks.userId,
      status: sealedPicks.status,
      units: sealedPicks.units,
      userDecimal: sealedPicks.userDecimal,
      clvPct: sealedPicks.clvPct,
      sealedAt: sealedPicks.sealedAt,
    })
    .from(sealedPicks)
    .where(and(inArray(sealedPicks.userId, ids), since ? gte(sealedPicks.sealedAt, since) : undefined));

  const byUser = new Map<string, RankingParticipant["picks"]>();
  for (const r of rows) {
    if (r.status !== "won" && r.status !== "lost" && r.status !== "pending") continue;
    const list = byUser.get(r.userId) ?? [];
    list.push({
      status: r.status,
      units: Number(r.units),
      userDecimal: Number(r.userDecimal),
      clvPct: r.clvPct === null ? 0 : Number(r.clvPct),
      sealedAtIso: r.sealedAt.toISOString(),
    });
    byUser.set(r.userId, list);
  }

  return people.map((p) => ({
    userId: p.id,
    handle: p.handle!,
    name: p.name ?? p.handle!,
    avatarUrl: p.avatarUrl ?? null,
    isTipster: Boolean(p.isTipster),
    picks: byUser.get(p.id) ?? [],
  }));
}

export type MatchOutcomeKey = "home" | "draw" | "away";

/** Guarda resultados finales nuevos; los ya guardados no se tocan. */
export async function recordMatchResults(
  db: Db,
  results: ReadonlyArray<{ gameId: string; home: number; away: number }>,
  now: Date = new Date(),
): Promise<void> {
  const clean = results.filter(
    (r) => /^[a-zA-Z0-9._-]{1,128}$/.test(r.gameId) && Number.isInteger(r.home) && Number.isInteger(r.away) && r.home >= 0 && r.away >= 0,
  );
  if (clean.length === 0) return;
  await db
    .insert(matchResults)
    .values(
      clean.map((r) => ({
        gameId: r.gameId,
        homeScore: r.home,
        awayScore: r.away,
        outcome: r.home > r.away ? "home" : r.home < r.away ? "away" : "draw",
        recordedAt: now,
      })),
    )
    .onConflictDoNothing({ target: matchResults.gameId });
}

/** Resultado de los partidos guardados (todos, o solo los pedidos). */
export async function loadMatchResults(db: Db, gameIds?: readonly string[]): Promise<Map<string, MatchOutcomeKey>> {
  if (gameIds && gameIds.length === 0) return new Map();
  const rows = await db
    .select({ gameId: matchResults.gameId, outcome: matchResults.outcome })
    .from(matchResults)
    .where(gameIds ? inArray(matchResults.gameId, [...gameIds]) : undefined);
  return new Map(rows.map((r) => [r.gameId, r.outcome as MatchOutcomeKey]));
}

/** Votos de «¿Quién gana?» de los partidos dados. */
export async function loadWinnerVotes(
  db: Db,
  gameIds: readonly string[],
): Promise<Array<{ userId: string; gameId: string; choice: string }>> {
  if (gameIds.length === 0) return [];
  return db
    .select({ userId: matchVotes.userId, gameId: matchVotes.gameId, choice: matchVotes.choice })
    .from(matchVotes)
    .where(and(eq(matchVotes.question, "ganador"), inArray(matchVotes.gameId, [...gameIds])));
}

/** Conteo de «¿Quién gana?» por partido. */
export async function winnerVoteTallies(
  db: Db,
  gameIds: readonly string[],
): Promise<Array<{ gameId: string; home: number; draw: number; away: number }>> {
  if (gameIds.length === 0) return [];
  const rows = await db
    .select({ gameId: matchVotes.gameId, choice: matchVotes.choice, n: sql<number>`count(*)::int` })
    .from(matchVotes)
    .where(and(eq(matchVotes.question, "ganador"), inArray(matchVotes.gameId, [...gameIds])))
    .groupBy(matchVotes.gameId, matchVotes.choice);
  const out = new Map<string, { gameId: string; home: number; draw: number; away: number }>();
  for (const r of rows) {
    const t = out.get(r.gameId) ?? { gameId: r.gameId, home: 0, draw: 0, away: 0 };
    if (r.choice === "home" || r.choice === "draw" || r.choice === "away") t[r.choice] = Number(r.n);
    out.set(r.gameId, t);
  }
  return [...out.values()];
}
