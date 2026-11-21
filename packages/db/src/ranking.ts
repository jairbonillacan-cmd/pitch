import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "./billing";
import { matchResults, matchVotes, sealedPicks, tipsterProfiles, userPreferences, users } from "./schema";

const MAX_RANKING_PARTICIPANTS = 40;
const MAX_PICKS_PER_PARTICIPANT = 200;

function parseDecimalField(raw: string | number | null | undefined): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw !== "string") return 0;
  const parsed = Number.parseFloat(raw.trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampRankingLimit(raw: number | undefined, fallback: number, max: number): number {
  const candidate = typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : fallback;
  return Math.min(Math.max(candidate, 1), max);
}

export interface RankingParticipant {
  userId: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  isTipster: boolean;
  picks: Array<{
    status: "pending" | "won" | "lost" | "void";
    units: number;
    userDecimal: number;
    clvPct: number;
    sealedAtIso: string;
  }>;
}

export async function loadRankingParticipants(
  db: Db,
  since?: Date,
  limit: number = MAX_RANKING_PARTICIPANTS,
): Promise<RankingParticipant[]> {
  const safeLimit = clampRankingLimit(limit, MAX_RANKING_PARTICIPANTS, MAX_RANKING_PARTICIPANTS);
  const pickJoinCondition = since
    ? and(eq(sealedPicks.userId, users.id), gte(sealedPicks.sealedAt, since))
    : eq(sealedPicks.userId, users.id);
  const settledCountExpr = sql<number>`coalesce(sum(case when ${sealedPicks.status} in ('won', 'lost') then 1 else 0 end), 0)::int`;
  const hasSettledExpr = sql<number>`case when coalesce(sum(case when ${sealedPicks.status} in ('won', 'lost') then 1 else 0 end), 0) > 0 then 1 else 0 end`;
  const netUnitsExpr = sql<number>`coalesce(sum(case when ${sealedPicks.status} = 'won' then (${sealedPicks.units} * (${sealedPicks.userDecimal} - 1)) when ${sealedPicks.status} = 'lost' then -${sealedPicks.units} else 0 end), 0)`;

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
    .leftJoin(sealedPicks, pickJoinCondition)
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
    )
    .groupBy(users.id, users.handle, users.displayName, users.avatarUrl, tipsterProfiles.userId)
    .orderBy(desc(hasSettledExpr), desc(netUnitsExpr), desc(settledCountExpr), asc(users.handle))
    .limit(safeLimit);
  if (people.length === 0) return [];

  const ids = people.map((p) => p.id);
  const rankedPicks = db
    .select({
      userId: sealedPicks.userId,
      status: sealedPicks.status,
      units: sealedPicks.units,
      userDecimal: sealedPicks.userDecimal,
      clvPct: sealedPicks.clvPct,
      sealedAt: sealedPicks.sealedAt,
      id: sealedPicks.id,
      rn: sql<number>`row_number() over (partition by ${sealedPicks.userId} order by ${sealedPicks.sealedAt} desc, ${sealedPicks.id} desc)::int`.as(
        "rn",
      ),
    })
    .from(sealedPicks)
    .where(and(inArray(sealedPicks.userId, ids), since ? gte(sealedPicks.sealedAt, since) : undefined))
    .as("ranked_participant_picks");

  const rows = await db
    .select({
      userId: rankedPicks.userId,
      status: rankedPicks.status,
      units: rankedPicks.units,
      userDecimal: rankedPicks.userDecimal,
      clvPct: rankedPicks.clvPct,
      sealedAt: rankedPicks.sealedAt,
    })
    .from(rankedPicks)
    .where(sql`${rankedPicks.rn} <= ${MAX_PICKS_PER_PARTICIPANT}`)
    .orderBy(desc(rankedPicks.sealedAt), desc(rankedPicks.id))
    .limit(ids.length * MAX_PICKS_PER_PARTICIPANT);

  const byUser = new Map<string, RankingParticipant["picks"]>();
  for (const r of rows) {
    if (r.status !== "won" && r.status !== "lost" && r.status !== "pending" && r.status !== "void") continue;
    const list = byUser.get(r.userId) ?? [];
    list.push({
      status: r.status,
      units: parseDecimalField(r.units),
      userDecimal: parseDecimalField(r.userDecimal),
      clvPct: r.clvPct === null ? 0 : parseDecimalField(r.clvPct),
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

export async function loadMatchResults(db: Db, gameIds?: readonly string[]): Promise<Map<string, MatchOutcomeKey>> {
  if (gameIds && gameIds.length === 0) return new Map();
  const rows = await db
    .select({ gameId: matchResults.gameId, outcome: matchResults.outcome })
    .from(matchResults)
    .where(gameIds ? inArray(matchResults.gameId, [...gameIds]) : undefined);
  return new Map(rows.map((r) => [r.gameId, r.outcome as MatchOutcomeKey]));
}

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
    if (r.choice === "home" || r.choice === "draw" || r.choice === "away") t[r.choice] = parseDecimalField(r.n);
    out.set(r.gameId, t);
  }
  return [...out.values()];
}
