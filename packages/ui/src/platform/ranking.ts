/**
 * Ranking de Comunidad e historial del Top 10. Módulo puro: lo usa el servidor para armar
 * `/api/social/ranking` y las insignias «Top 10» y «Lectura del partido».
 *
 * - El ranking en pantalla usa ventanas móviles (últimos 7 y 30 días).
 * - Las insignias usan periodos cerrados: semanas de lunes a domingo (UTC) y meses de
 *   calendario ya terminados, para que una insignia ganada no dependa del día en que se mira.
 * - Solo entran socios que eligieron aparecer en el ranking (eso lo filtra el servidor).
 */
import {
  LEADERBOARD_MIN_SETTLED,
  LEADERBOARD_MIN_SETTLED_WEEK,
  entriesInWindow,
  profileRecord,
  type ProfileRecord,
} from "./profile-stats";
import type { JournalEntry } from "./types";

export { LEADERBOARD_MIN_SETTLED, LEADERBOARD_MIN_SETTLED_WEEK };

/** Lo mínimo de un pick sellado para el ranking (sin datos del partido). */
export interface RankingPick {
  status: "pending" | "won" | "lost";
  units: number;
  userDecimal: number;
  clvPct: number;
  sealedAtIso: string;
}

export interface RankingRowPayload {
  handle: string;
  name: string;
  avatarUrl: string | null;
  isTipster: boolean;
  windows: Record<"7d" | "30d", ProfileRecord>;
}

const asJournal = (entries: ReadonlyArray<RankingPick>) => entries as unknown as JournalEntry[];

/** Récord de las ventanas de 7 y 30 días. */
export function rankingWindows(entries: ReadonlyArray<RankingPick>, now: Date): Record<"7d" | "30d", ProfileRecord> {
  return {
    "7d": profileRecord(entriesInWindow(asJournal(entries), "7d", now)),
    "30d": profileRecord(entriesInWindow(asJournal(entries), "30d", now)),
  };
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
export const RANKING_TOP_N = 10;

/** Número de semana con inicio en lunes 00:00 UTC (1970-01-01 fue jueves). */
export function weekNumber(t: number): number {
  return Math.floor((t + 3 * DAY_MS) / WEEK_MS);
}

function monthKey(t: number): string {
  return new Date(t).toISOString().slice(0, 7);
}

interface Person {
  id: string;
  entries: ReadonlyArray<RankingPick>;
}

/** Ids del Top 10 de un periodo, por saldo; desempata por picks cerrados y por id. */
function periodTop(rows: Array<{ id: string; record: ProfileRecord }>, minSettled: number): string[] {
  return rows
    .filter((r) => r.record.settled >= minSettled)
    .sort((a, b) => b.record.netUnits - a.record.netUnits || b.record.settled - a.record.settled || a.id.localeCompare(b.id))
    .slice(0, RANKING_TOP_N)
    .map((r) => r.id);
}

/**
 * Cuántas semanas cerradas terminó cada socio en el Top 10 y si terminó algún mes cerrado
 * en el Top 10. Solo cuentan picks ya cerrados de cada periodo, como en el ranking.
 */
export function topTenHistory(
  people: ReadonlyArray<Person>,
  now: Date,
): Map<string, { weeks: number; monthly: boolean }> {
  const out = new Map<string, { weeks: number; monthly: boolean }>();
  for (const p of people) out.set(p.id, { weeks: 0, monthly: false });

  const byWeek = new Map<number, Map<string, RankingPick[]>>();
  const byMonth = new Map<string, Map<string, RankingPick[]>>();
  const currentWeek = weekNumber(now.getTime());
  const currentMonth = monthKey(now.getTime());
  for (const p of people) {
    for (const e of p.entries) {
      const t = Date.parse(e.sealedAtIso);
      if (!Number.isFinite(t) || t > now.getTime()) continue;
      const w = weekNumber(t);
      if (w < currentWeek) {
        const m = byWeek.get(w) ?? new Map<string, RankingPick[]>();
        m.set(p.id, [...(m.get(p.id) ?? []), e]);
        byWeek.set(w, m);
      }
      const mk = monthKey(t);
      if (mk < currentMonth) {
        const m = byMonth.get(mk) ?? new Map<string, RankingPick[]>();
        m.set(p.id, [...(m.get(p.id) ?? []), e]);
        byMonth.set(mk, m);
      }
    }
  }

  for (const perPerson of byWeek.values()) {
    const rows = [...perPerson].map(([id, entries]) => ({ id, record: profileRecord(entries) }));
    for (const id of periodTop(rows, LEADERBOARD_MIN_SETTLED_WEEK)) out.get(id)!.weeks += 1;
  }
  for (const perPerson of byMonth.values()) {
    const rows = [...perPerson].map(([id, entries]) => ({ id, record: profileRecord(entries) }));
    for (const id of periodTop(rows, LEADERBOARD_MIN_SETTLED)) out.get(id)!.monthly = true;
  }
  return out;
}

// ── «Lectura del partido» ──────────────────────────────────────────────────────────────

export type MatchOutcome = "home" | "draw" | "away";

export function outcomeFromScore(score: { home: number; away: number }): MatchOutcome {
  if (score.home > score.away) return "home";
  if (score.home < score.away) return "away";
  return "draw";
}

/** Votos mínimos de «¿Quién gana?» para que exista un «más votado». */
export const POLL_MIN_VOTES = 5;

/**
 * Partidos en que el socio votó lo mismo que la mayoría de la comunidad y acertó.
 * Sin una mayoría clara (empate en votos) o con menos de `minVotes` votos, no cuenta.
 */
export function pollHitsByUser(
  votes: ReadonlyArray<{ userId: string; gameId: string; choice: string }>,
  results: ReadonlyMap<string, MatchOutcome>,
  minVotes = POLL_MIN_VOTES,
): Map<string, number> {
  const byGame = new Map<string, Array<{ userId: string; choice: string }>>();
  for (const v of votes) {
    if (!results.has(v.gameId)) continue;
    byGame.set(v.gameId, [...(byGame.get(v.gameId) ?? []), v]);
  }
  const hits = new Map<string, number>();
  for (const [gameId, list] of byGame) {
    if (list.length < minVotes) continue;
    const counts = new Map<string, number>();
    for (const v of list) counts.set(v.choice, (counts.get(v.choice) ?? 0) + 1);
    const sorted = [...counts].sort((a, b) => b[1] - a[1]);
    const [first, second] = sorted;
    if (!first || (second && second[1] === first[1])) continue;
    if (first[0] !== results.get(gameId)) continue;
    for (const v of list) if (v.choice === first[0]) hits.set(v.userId, (hits.get(v.userId) ?? 0) + 1);
  }
  return hits;
}
