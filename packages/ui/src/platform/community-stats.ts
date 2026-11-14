import type { PlatformGame, SocialPost } from "./types";

export const CONSENSUS_MIN_PICKS = 10;
/** Votos mínimos de «¿Quién gana?» para mostrar el consenso de un partido. */
export const CONSENSUS_MIN_VOTES = 5;
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

/** Conteo de «¿Quién gana?» de un partido (lo manda `/api/social/consensus`). */
export interface WinnerVoteTally {
  gameId: string;
  home: number;
  draw: number;
  away: number;
}

export interface ConsensusGame {
  game: PlatformGame;
  totalPicks: number;
  /** Picks publicados por resultado; vacío si el partido solo tiene votos. */
  outcomes: ConsensusOutcome[];
  /** Votos de «¿Quién gana?» contra la probabilidad del modelo. */
  votes: { total: number; outcomes: ConsensusOutcome[]; top: ConsensusOutcome } | null;
  /** Lo más elegido: el pick más publicado o, si no hay picks suficientes, el más votado. */
  top: ConsensusOutcome;
}

/** Votos de «¿Quién gana?» de un partido contra el 1X2 del modelo. */
export function voteConsensus(
  tally: WinnerVoteTally,
  game: PlatformGame,
): { total: number; outcomes: ConsensusOutcome[]; top: ConsensusOutcome } | null {
  const isNfl = game.sport === "american-football";
  const rows = [
    { key: "home", label: game.home.shortName || game.home.name, n: tally.home, model: game.x12[0] },
    ...(isNfl ? [] : [{ key: "draw", label: "Empate", n: tally.draw, model: game.x12[1] }]),
    { key: "away", label: game.away.shortName || game.away.name, n: tally.away, model: game.x12[2] },
  ];
  const total = rows.reduce((s, r) => s + r.n, 0);
  if (total === 0) return null;
  const outcomes = rows.map((r) => {
    const fansPct = Math.round((r.n / total) * 100);
    const modelPct = Math.round(r.model * 100);
    return { pickId: `voto-${r.key}`, label: r.label, picks: r.n, fansPct, modelPct, diffPts: fansPct - modelPct };
  });
  const top = [...outcomes].sort((a, b) => b.picks - a.picks || b.modelPct - a.modelPct)[0]!;
  return { total, outcomes, top };
}

/**
 * Consenso por partido próximo, con dos fuentes:
 * - Picks publicados: % de socios = picks de un resultado entre los picks del partido;
 *   % del modelo = `p` de ese pick. Cuenta con al menos `minPicks` picks.
 * - Votos de «¿Quién gana?»: % de votos contra el 1X2 del modelo. Cuenta con `minVotes`.
 * Entra el partido que cumpla cualquiera de las dos. Orden: diferencia absoluta de lo más
 * elegido, de mayor a menor.
 */
export function computeConsensus(
  posts: ReadonlyArray<Pick<SocialPost, "pick">>,
  games: ReadonlyArray<PlatformGame>,
  {
    minPicks = CONSENSUS_MIN_PICKS,
    voteTallies = [],
    minVotes = CONSENSUS_MIN_VOTES,
  }: { minPicks?: number; voteTallies?: ReadonlyArray<WinnerVoteTally>; minVotes?: number } = {},
): ConsensusGame[] {
  const byGame = new Map<string, Map<string, number>>();
  for (const post of posts) {
    const pick = post.pick;
    if (!pick || pick.status !== "open") continue;
    const counts = byGame.get(pick.gameId) ?? new Map<string, number>();
    counts.set(pick.pickId, (counts.get(pick.pickId) ?? 0) + 1);
    byGame.set(pick.gameId, counts);
  }

  const votesByGame = new Map(voteTallies.map((t) => [t.gameId, t]));
  const out: ConsensusGame[] = [];
  const gameIds = new Set([...byGame.keys(), ...votesByGame.keys()]);
  for (const gameId of gameIds) {
    const game = games.find((g) => g.id === gameId);
    if (!game || game.status === "FT") continue;
    const tally = votesByGame.get(gameId);
    const votes = tally ? voteConsensus(tally, game) : null;
    const counts = byGame.get(gameId) ?? new Map<string, number>();
    const rawTotal = [...counts.values()].reduce((s, n) => s + n, 0);
    const enoughPicks = rawTotal >= minPicks;
    const enoughVotes = votes !== null && votes.total >= minVotes;
    if (!enoughPicks && !enoughVotes) continue;
    const total = enoughPicks ? rawTotal : 0;
    const outcomes: ConsensusOutcome[] = [];
    for (const [pickId, n] of enoughPicks ? counts : []) {
      const pick = game.picks.find((p) => p.id === pickId);
      if (!pick) continue;
      const fansPct = Math.round((n / total) * 100);
      const modelPct = Math.round(pick.p * 100);
      outcomes.push({ pickId, label: pick.label, picks: n, fansPct, modelPct, diffPts: fansPct - modelPct });
    }
    outcomes.sort((a, b) => b.picks - a.picks || a.label.localeCompare(b.label));
    const shownVotes = enoughVotes ? votes : null;
    const top = outcomes[0] ?? shownVotes?.top;
    if (!top) continue;
    out.push({ game, totalPicks: total, outcomes, votes: shownVotes, top });
  }

  return out.sort(
    (a, b) =>
      Math.abs(b.top.diffPts) - Math.abs(a.top.diffPts) ||
      b.totalPicks + (b.votes?.total ?? 0) - (a.totalPicks + (a.votes?.total ?? 0)) ||
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
