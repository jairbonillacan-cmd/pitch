import type { PlatformGame, SocialPost } from "./types";

export const CONSENSUS_MIN_PICKS = 10;
/** Por debajo de esta diferencia, socios y modelo «coinciden». */
export const CONSENSUS_AGREE_PTS = 3;
/** Desde esta diferencia, la ficha va destacada. */
export const CONSENSUS_STRONG_PTS = 10;

export interface ConsensusOutcome {
  pickId: string;
  label: string;
  picks: number;
  /** % de los picks publicados del partido (0–100, entero). */
  fansPct: number;
  /** Probabilidad del modelo (0–100, entero). */
  modelPct: number;
  /** fansPct − modelPct, en puntos enteros con signo. */
  diffPts: number;
}

export interface ConsensusGame {
  game: PlatformGame;
  totalPicks: number;
  outcomes: ConsensusOutcome[];
  /** Resultado más elegido por los socios. */
  top: ConsensusOutcome;
}

/**
 * Consenso por partido próximo: % de socios = picks publicados de un resultado
 * entre los picks publicados del partido; % del modelo = `p` del dataset para
 * ese mismo pick. Solo partidos con al menos `minPicks` picks publicados.
 * Orden: diferencia absoluta del resultado más elegido, de mayor a menor.
 */
export function computeConsensus(
  posts: ReadonlyArray<Pick<SocialPost, "pick">>,
  games: ReadonlyArray<PlatformGame>,
  { minPicks = CONSENSUS_MIN_PICKS }: { minPicks?: number } = {},
): ConsensusGame[] {
  const byGame = new Map<string, Map<string, number>>();
  for (const post of posts) {
    const pick = post.pick;
    if (!pick || pick.status !== "open") continue;
    const counts = byGame.get(pick.gameId) ?? new Map<string, number>();
    counts.set(pick.pickId, (counts.get(pick.pickId) ?? 0) + 1);
    byGame.set(pick.gameId, counts);
  }

  const out: ConsensusGame[] = [];
  for (const [gameId, counts] of byGame) {
    const game = games.find((g) => g.id === gameId);
    if (!game || game.status === "FT") continue;
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    if (total < minPicks) continue;
    const outcomes: ConsensusOutcome[] = [];
    for (const [pickId, n] of counts) {
      const pick = game.picks.find((p) => p.id === pickId);
      if (!pick) continue;
      const fansPct = Math.round((n / total) * 100);
      const modelPct = Math.round(pick.p * 100);
      outcomes.push({ pickId, label: pick.label, picks: n, fansPct, modelPct, diffPts: fansPct - modelPct });
    }
    if (outcomes.length === 0) continue;
    outcomes.sort((a, b) => b.picks - a.picks || a.label.localeCompare(b.label));
    out.push({ game, totalPicks: total, outcomes, top: outcomes[0]! });
  }

  return out.sort(
    (a, b) =>
      Math.abs(b.top.diffPts) - Math.abs(a.top.diffPts) ||
      b.totalPicks - a.totalPicks ||
      a.game.kickoffUtc.localeCompare(b.game.kickoffUtc),
  );
}

/** «+17 pts» / «−4 pts» / «0 pts». */
export function formatDiffPts(diff: number): string {
  if (diff === 0) return "0 pts";
  return `${diff > 0 ? "+" : "−"}${Math.abs(diff)} pts`;
}

/** Lectura en una línea de la diferencia del resultado más elegido. */
export function consensusReading(outcome: ConsensusOutcome): string {
  const abs = Math.abs(outcome.diffPts);
  if (abs < CONSENSUS_AGREE_PTS) return `Socios y modelo coinciden en «${outcome.label}».`;
  return `Los socios ven «${outcome.label}» ${abs} pts ${outcome.diffPts > 0 ? "más" : "menos"} probable que el modelo.`;
}
