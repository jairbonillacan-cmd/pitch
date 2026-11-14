import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./billing";
import { matchVotes } from "./schema";

/**
 * Votos de la comunidad por partido. Cada socio tiene un voto por pregunta y puede cambiarlo
 * hasta que empiece el partido (eso lo valida la ruta, que conoce la hora de inicio).
 */
export const MATCH_VOTE_CHOICES = {
  ganador: ["home", "draw", "away"],
  pick: ["si", "no"],
} as const;

export type MatchVoteQuestion = keyof typeof MATCH_VOTE_CHOICES;

export interface MatchVoteTally {
  ganador: { home: number; draw: number; away: number };
  pick: { si: number; no: number };
  /** Lo que votó quien consulta (si tiene sesión). */
  mine: { ganador: string | null; pick: string | null };
}

const GAME_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;

export function isValidMatchVote(question: unknown, choice: unknown): question is MatchVoteQuestion {
  if (question !== "ganador" && question !== "pick") return false;
  return (MATCH_VOTE_CHOICES[question] as readonly string[]).includes(String(choice));
}

export async function castMatchVote(
  db: Db,
  userId: string,
  input: { gameId: string; question: MatchVoteQuestion; choice: string },
  now: Date,
): Promise<{ ok: true } | { ok: false; reason: "invalid" }> {
  if (!GAME_ID_RE.test(input.gameId) || !isValidMatchVote(input.question, input.choice)) {
    return { ok: false, reason: "invalid" };
  }
  await db
    .insert(matchVotes)
    .values({ userId, gameId: input.gameId, question: input.question, choice: input.choice, updatedAt: now })
    .onConflictDoUpdate({
      target: [matchVotes.userId, matchVotes.gameId, matchVotes.question],
      set: { choice: input.choice, updatedAt: now },
    });
  return { ok: true };
}

export async function matchVoteTally(db: Db, gameId: string, viewerUserId: string | null): Promise<MatchVoteTally> {
  const tally: MatchVoteTally = {
    ganador: { home: 0, draw: 0, away: 0 },
    pick: { si: 0, no: 0 },
    mine: { ganador: null, pick: null },
  };
  if (!GAME_ID_RE.test(gameId)) return tally;
  const rows = await db
    .select({ question: matchVotes.question, choice: matchVotes.choice, n: sql<number>`count(*)::int` })
    .from(matchVotes)
    .where(eq(matchVotes.gameId, gameId))
    .groupBy(matchVotes.question, matchVotes.choice);
  for (const r of rows) {
    if (r.question === "ganador" && r.choice in tally.ganador) {
      tally.ganador[r.choice as keyof MatchVoteTally["ganador"]] = Number(r.n);
    } else if (r.question === "pick" && r.choice in tally.pick) {
      tally.pick[r.choice as keyof MatchVoteTally["pick"]] = Number(r.n);
    }
  }
  if (viewerUserId) {
    const mine = await db
      .select({ question: matchVotes.question, choice: matchVotes.choice })
      .from(matchVotes)
      .where(and(eq(matchVotes.gameId, gameId), eq(matchVotes.userId, viewerUserId)));
    for (const m of mine) {
      if (m.question === "ganador") tally.mine.ganador = m.choice;
      if (m.question === "pick") tally.mine.pick = m.choice;
    }
  }
  return tally;
}
