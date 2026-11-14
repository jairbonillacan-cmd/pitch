import {
  loadMatchResults,
  loadRankingParticipants,
  loadWinnerVotes,
  recordMatchResults,
  type Db,
} from "@pitchlab/db";
import {
  pollHitsByUser,
  rankingWindows,
  topTenHistory,
  type RankingRowPayload,
} from "@pitchlab/ui/ranking";
import type { PlatformGame } from "@pitchlab/ui";
import { buildServerRawPlatformDataset } from "./platform-data";

const DAY_MS = 86_400_000;
/** El ranking cambia poco entre minutos: se calcula como mucho cada 2 minutos. */
const RANKING_TTL_MS = 2 * 60_000;
/** Insignias de Top 10 y de votos: cambian por semana o al terminar partidos. */
const EXTRAS_TTL_MS = 15 * 60_000;

let rankingMemo: { at: number; value: RankingRowPayload[] } | null = null;
let extrasMemo: { at: number; value: CommunityBadgeExtras } | null = null;

export function resetRankingCacheForTests(): void {
  rankingMemo = null;
  extrasMemo = null;
}

/**
 * Filas del ranking: socios que aceptaron aparecer, con su récord de 7 y 30 días ya
 * calculado. No viaja ningún pick: solo cifras agregadas.
 */
export async function loadRankingRows(db: Db, now: Date = new Date()): Promise<RankingRowPayload[]> {
  if (rankingMemo && now.getTime() - rankingMemo.at < RANKING_TTL_MS) return rankingMemo.value;
  const people = await loadRankingParticipants(db, new Date(now.getTime() - 30 * DAY_MS));
  const value = people
    .map((p) => ({
      handle: p.handle,
      name: p.name,
      avatarUrl: p.avatarUrl,
      isTipster: p.isTipster,
      windows: rankingWindows(p.picks, now),
    }))
    .filter((r) => r.windows["30d"].settled > 0);
  rankingMemo = { at: now.getTime(), value };
  return value;
}

export interface CommunityBadgeExtras {
  topTen: Map<string, { weeks: number; monthly: boolean }>;
  pollHits: Map<string, number>;
}

/** Guarda los resultados de los partidos terminados que trae el snapshot. */
async function persistFinishedResults(db: Db, games: readonly PlatformGame[]): Promise<void> {
  const finished = games
    .filter((g) => g.status === "FT" && g.score)
    .map((g) => ({ gameId: g.id, home: g.score!.home, away: g.score!.away }));
  await recordMatchResults(db, finished);
}

/**
 * Datos de Comunidad para las insignias «Top 10» y «Lectura del partido», de todos los
 * socios a la vez (se reparte por id). Los resultados se guardan en `match_results` para
 * que la insignia no desaparezca cuando el partido sale del snapshot.
 */
export async function loadCommunityBadgeExtras(
  db: Db,
  now: Date = new Date(),
  games: readonly PlatformGame[] = buildServerRawPlatformDataset().games,
): Promise<CommunityBadgeExtras> {
  if (extrasMemo && now.getTime() - extrasMemo.at < EXTRAS_TTL_MS) return extrasMemo.value;
  await persistFinishedResults(db, games);
  const [people, results] = await Promise.all([loadRankingParticipants(db), loadMatchResults(db)]);
  const votes = await loadWinnerVotes(db, [...results.keys()]);
  const value: CommunityBadgeExtras = {
    topTen: topTenHistory(people.map((p) => ({ id: p.userId, entries: p.picks })), now),
    pollHits: pollHitsByUser(votes, results),
  };
  extrasMemo = { at: now.getTime(), value };
  return value;
}
