import { asMarketKey, type LeagueId } from "@pitchlab/contracts";
import {
  decimalToAmericanInt,
  isPickUnlocked,
  pickReferenceDecimal,
} from "./access-guard";
import { sportOf, UPCOMING, type SportId } from "./club/home/home-model";
import {
  checkParlayCompatibility,
  computeParlaySummary,
} from "./parlay-engine";
import type {
  MatchPick,
  ParlayLeg,
  PlatformGame,
  PlatformMarketRow,
  RiskBand,
  ViewerRole,
} from "./types";

export type DailyParlayMode = RiskBand | "objetivo";

export interface TargetOddsRange {
  min: number;
  target: number;
  max: number;
}

export type ParlayTargetPresetId = "libre" | "3x" | "5x" | "8x";

export interface ParlayTargetPresetSpec {
  id: ParlayTargetPresetId;
  label: string;
  range: TargetOddsRange | null;
  minLegDecimal: number;
}

export const PARLAY_TARGET_PRESETS: ReadonlyArray<ParlayTargetPresetSpec> = [
  { id: "libre", label: "Libre", range: null, minLegDecimal: 1.01 },
  {
    id: "3x",
    label: "~3.0×",
    range: { min: 2.2, target: 3.0, max: 4.0 },
    minLegDecimal: 1.25,
  },
  {
    id: "5x",
    label: "~5.0×",
    range: { min: 3.0, target: 5.0, max: 7.0 },
    minLegDecimal: 1.4,
  },
  {
    id: "8x",
    label: "~8.0×",
    range: { min: 5.5, target: 8.0, max: 11.0 },
    minLegDecimal: 1.5,
  },
];

export interface DailyParlayStyleSpec {
  risk: DailyParlayMode;
  label: string;
  minLegs: number;
  maxLegs: number;
  minProbability: number;
  minLegDecimal?: number;
  targetRange?: TargetOddsRange;
  ruleHint: string;
}

export const DAILY_PARLAY_STYLE_SPECS: Readonly<Record<RiskBand, DailyParlayStyleSpec>> = {
  conservador: {
    risk: "conservador",
    label: "Conservador",
    minLegs: 2,
    maxLegs: 3,
    minProbability: 0.7,
    ruleHint: "2–3 selecciones con 70 % o más de probabilidad.",
  },
  medio: {
    risk: "medio",
    label: "Medio",
    minLegs: 3,
    maxLegs: 4,
    minProbability: 0.55,
    ruleHint: "3–4 selecciones equilibradas con 55 % o más.",
  },
  arriesgado: {
    risk: "arriesgado",
    label: "Arriesgado",
    minLegs: 4,
    maxLegs: 6,
    minProbability: 0,
    ruleHint: "4–6 selecciones buscando mayor momio combinado.",
  },
};

export const DAILY_PARLAY_MODE_SPECS: Readonly<Record<DailyParlayMode, DailyParlayStyleSpec>> = {
  ...DAILY_PARLAY_STYLE_SPECS,
  objetivo: {
    risk: "objetivo",
    label: "Objetivo 5.0×",
    minLegs: 4,
    maxLegs: 4,
    minProbability: 0.52,
    minLegDecimal: 1.4,
    targetRange: { min: 3.0, target: 5.0, max: 7.0 },
    ruleHint:
      "4 selecciones, una por partido, ≥ 52 % cada una (cuota mín. 1.40); busca momio justo entre 3.0 y 7.0.",
  },
};

export const DAILY_PARLAY_STYLES: readonly RiskBand[] = [
  "conservador",
  "medio",
  "arriesgado",
];

export const DAILY_PARLAY_MODES: readonly DailyParlayMode[] = [
  "conservador",
  "medio",
  "arriesgado",
  "objetivo",
];

export interface DailyParlayResult {
  dayId: string;
  risk: DailyParlayMode;
  status: "ready" | "insufficient";
  minLegs: number;
  maxLegs: number;
  minProbability: number;
  legs: ParlayLeg[];
  combinedProbability: number;
  fairDecimal: number;
  fairAmerican: number;
  bookDecimal: number;
  hasCapturedBookOdds?: boolean;
  emptyReason?: string;
}

export type GradedParlayOutcome = "hit" | "miss" | "pending" | "insufficient";

export interface GradedDailyParlayEntry {
  dayId: string;
  risk: DailyParlayMode;
  parlay: DailyParlayResult;
  outcome: GradedParlayOutcome;
  hitLegs: number;
  missLegs: number;
  pendingLegs: number;
}

export interface GradedDailyParlayDay {
  dayId: string;
  finishedGamesCount: number;
  entries: GradedDailyParlayEntry[];
}

export type PersonalParlayScope =
  | { kind: "all" }
  | { kind: "sport"; sport: SportId }
  | { kind: "league"; league: LeagueId };

export interface PersonalQuickParlayResult {
  status: "ready" | "partial" | "insufficient";
  risk: RiskBand;
  targetPreset?: ParlayTargetPresetId;
  requestedCount: number;
  legs: ParlayLeg[];
  combinedProbability: number;
  fairDecimal: number;
  fairAmerican: number;
  bookDecimal: number;
  hasCapturedBookOdds?: boolean;
  message?: string;
}

export interface TargetOddsParlayOptions {
  games: readonly PlatformGame[];
  dayId?: string;
  legCount?: number;
  minLegProbability?: number;
  minLegDecimal?: number;
  targetRange?: TargetOddsRange;
  scope?: PersonalParlayScope;
  viewerRole?: ViewerRole;
}

export interface TargetOddsParlayResult {
  status: "ready" | "insufficient";
  legCount: number;
  minLegProbability: number;
  minLegDecimal: number;
  targetRange: TargetOddsRange;
  legs: ParlayLeg[];
  combinedProbability: number;
  fairDecimal: number;
  fairAmerican: number;
  bookDecimal: number;
  hasCapturedBookOdds: boolean;
  eligibleGamesCount: number;
  emptyReason?: string;
}

function roundDecimal(val: number): number {
  return Math.max(1.01, Math.round(val * 100) / 100);
}

/**
 * Probabilidad combinada (producto independiente) y momio justo exacto `1 / p`.
 * Respeta `computeParlaySummary` cuando se habilita SGP en el armador manual.
 */
function summarizeIndependentLegs(legs: readonly ParlayLeg[]): {
  combinedProbability: number;
  fairDecimal: number;
  fairAmerican: number;
  bookDecimal: number;
  hasCapturedBookOdds: boolean;
} {
  if (legs.length === 0) {
    return {
      combinedProbability: 0,
      fairDecimal: 1,
      fairAmerican: 100,
      bookDecimal: 1,
      hasCapturedBookOdds: false,
    };
  }
  let combinedProbability = 1;
  let bookDecimal = 1;
  let hasCapturedBookOdds = false;
  for (const { pick } of legs) {
    combinedProbability *= pick.p;
    bookDecimal *= pickReferenceDecimal(pick);
    if (pick.marketDecimal !== null && Number.isFinite(pick.marketDecimal) && pick.marketDecimal > 1) {
      hasCapturedBookOdds = true;
    }
  }
  const fairDecimal = combinedProbability > 0 ? roundDecimal(1 / combinedProbability) : 1;
  return {
    combinedProbability,
    fairDecimal,
    fairAmerican: decimalToAmericanInt(fairDecimal),
    bookDecimal: roundDecimal(bookDecimal),
    hasCapturedBookOdds,
  };
}

interface CandidateItem {
  game: PlatformGame;
  pick: MatchPick;
  score: number;
}

function scoreDailyPick(game: PlatformGame, pick: MatchPick, risk: RiskBand): number {
  if (risk === "conservador") {
    return (
      pick.p * 100 +
      (pick.category === "conservador" || pick.category === "principal" ? 3 : 0) +
      (pick.edgePts ?? 0) * 0.4 +
      (pick.confidenceScore ?? 0) * 0.02
    );
  }
  if (risk === "medio") {
    const bandBonus =
      pick.risk === "medio" ? 18 : pick.risk === "conservador" ? 9 : 0;
    return (
      bandBonus +
      pick.p * 32 +
      (pick.edgePts ?? 0) * 2.5 +
      (pick.confidenceScore ?? 0) * 0.1
    );
  }
  const bandBonus =
    pick.risk === "arriesgado" ? 24 : pick.risk === "medio" ? 10 : 0;
  return (
    bandBonus +
    (1 - Math.abs(0.46 - pick.p)) * 24 +
    (pick.edgePts ?? 0) * 3.8 +
    (pick.confidenceScore ?? 0) * 0.12
  );
}

function compareCandidatesDeterministic(a: CandidateItem, b: CandidateItem, risk: RiskBand): number {
  if (b.score !== a.score) return b.score - a.score;
  if (risk === "arriesgado") {
    if (b.pick.fairDecimal !== a.pick.fairDecimal) {
      return b.pick.fairDecimal - a.pick.fairDecimal;
    }
  } else if (b.pick.p !== a.pick.p) {
    return b.pick.p - a.pick.p;
  }
  const koCmp = a.game.kickoffUtc.localeCompare(b.game.kickoffUtc);
  if (koCmp !== 0) return koCmp;
  const gCmp = a.game.id.localeCompare(b.game.id);
  if (gCmp !== 0) return gCmp;
  if (a.pick.slotIndex !== b.pick.slotIndex) return a.pick.slotIndex - b.pick.slotIndex;
  return a.pick.id.localeCompare(b.pick.id);
}

function canAddSinglePerGame(selected: readonly ParlayLeg[], candidate: MatchPick): boolean {
  if (candidate.isRedacted) return false;
  if (selected.length >= 6) return false;
  for (const leg of selected) {
    if (leg.pick.id === candidate.id || leg.pick.gameId === candidate.gameId) {
      return false;
    }
  }
  return true;
}

function matchesPersonalScope(game: PlatformGame, scope: PersonalParlayScope): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "sport") return sportOf(game) === scope.sport;
  return game.league === scope.league;
}

function conflictGroupFromRow(row: PlatformMarketRow): MatchPick["conflictGroup"] {
  const m = row.market.toLowerCase();
  const s = row.selection.toLowerCase();
  const l = row.label.toLowerCase();
  if (m.includes("btts") || l.includes("ambos anotan")) {
    return s.includes("no") || l.includes("no") ? "btts_no" : "btts_yes";
  }
  if (m.includes("total") || l.includes("más de") || l.includes("menos de")) {
    return s.includes("under") || l.includes("menos de") ? "under_total" : "over_total";
  }
  if (s === "draw" || l === "empate") return "draw_side";
  if (s.includes("home") || s === "1x") return "home_side";
  if (s.includes("away") || s === "x2") return "away_side";
  return "independent";
}

function fallbackPickFromMarketRow(game: PlatformGame, row: PlatformMarketRow, idx: number): MatchPick {
  const fairDecimal = Math.max(1.01, roundDecimal(row.fairDecimal || 1 / Math.max(0.01, row.p)));
  const marketDecimal =
    typeof row.currentDecimal === "number" && Number.isFinite(row.currentDecimal) && row.currentDecimal > 1
      ? roundDecimal(row.currentDecimal)
      : null;
  return {
    id: `${game.id}__mkt__${encodeURIComponent(row.group)}__${encodeURIComponent(row.selection)}`,
    gameId: game.id,
    league: game.league,
    leagueLabel: game.leagueLabel,
    matchLabel: `${game.home.shortName} vs ${game.away.shortName}`,
    kickoffLocal: game.kickoffLocal,
    gameStatus: game.status,
    slotIndex: 50 + idx,
    category: "tactico",
    categoryLabel: row.group,
    risk: "medio",
    engineKey: game.sport === "american-football" || game.sport === "basketball" ? "minkowski" : "tachyon",
    engineName: "PitchLab Spacetime Suite",
    marketGroup: row.group,
    selectionKey: row.selection,
    market: asMarketKey(row.market),
    ...(row.line !== undefined ? { line: row.line } : {}),
    conflictGroup: conflictGroupFromRow(row),
    label: row.label,
    rationale: `Línea del partido (${row.group}): ${Math.round(row.p * 100)} % de probabilidad.`,
    p: row.p,
    fairDecimal,
    fairAmerican: decimalToAmericanInt(fairDecimal),
    marketDecimal,
    marketAmerican: marketDecimal === null ? null : decimalToAmericanInt(marketDecimal),
    marketBookLabel: row.quoteBookLabel ?? null,
    marketCapturedAtUtc: row.quoteCapturedAtUtc ?? null,
    edgePts: row.edgePts ?? null,
    confidenceScore: game.confidenceScore ?? null,
    suggestedUnits: 1,
    result: null,
    isRedacted: false,
  };
}

function selectTopGameCandidates(
  game: PlatformGame,
  minLegProbability: number,
  minLegDecimal: number,
  idealLegDecimal: number,
  viewerRole: ViewerRole,
): MatchPick[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const pool: MatchPick[] = [];

  const pushIfEligible = (pick: MatchPick) => {
    if (pick.isRedacted || !isPickUnlocked(pick, game.status, viewerRole)) return;
    if (pick.market === "correct_score") return;
    if (!Number.isFinite(pick.p) || pick.p < minLegProbability || pick.p >= 0.99) return;
    const refDec = pickReferenceDecimal(pick);
    if (!Number.isFinite(refDec) || refDec < minLegDecimal) return;
    if (seenIds.has(pick.id)) return;
    const semanticKey = `${pick.market ?? ""}:${pick.selectionKey}:${pick.line ?? ""}`;
    if (seenKeys.has(semanticKey)) return;
    seenIds.add(pick.id);
    seenKeys.add(semanticKey);
    pool.push(pick);
  };

  for (const pick of game.picks) pushIfEligible(pick);
  for (const pick of game.parlayCandidates ?? []) pushIfEligible(pick);
  if (viewerRole !== "visitor" || game.status === "FT") {
    for (let i = 0; i < game.markets.length; i += 1) {
      const row = game.markets[i]!;
      if (
        row.market === "correct_score" ||
        row.market === "corners_total" ||
        row.market === "fouls_total" ||
        row.market === "yellow_total"
      ) {
        continue;
      }
      pushIfEligible(fallbackPickFromMarketRow(game, row, i));
    }
  }

  if (pool.length === 0) return [];

  const sortedByProb = [...pool].sort((a, b) => {
    if (Math.abs(b.p - a.p) > 1e-6) return b.p - a.p;
    const edgeDiff = (b.edgePts ?? 0) - (a.edgePts ?? 0);
    if (Math.abs(edgeDiff) > 1e-6) return edgeDiff;
    const distDiff =
      Math.abs(pickReferenceDecimal(a) - idealLegDecimal) -
      Math.abs(pickReferenceDecimal(b) - idealLegDecimal);
    if (Math.abs(distDiff) > 1e-6) return distDiff;
    return a.id.localeCompare(b.id);
  });

  const first = sortedByProb[0]!;
  if (sortedByProb.length === 1) return [first];

  const firstRef = pickReferenceDecimal(first);
  const diverseAlt = sortedByProb
    .slice(1)
    .sort((a, b) => {
      const aSpread = pickReferenceDecimal(a) >= firstRef + 0.12 ? 1 : 0;
      const bSpread = pickReferenceDecimal(b) >= firstRef + 0.12 ? 1 : 0;
      if (bSpread !== aSpread) return bSpread - aSpread;
      const distA = Math.abs(pickReferenceDecimal(a) - idealLegDecimal);
      const distB = Math.abs(pickReferenceDecimal(b) - idealLegDecimal);
      if (Math.abs(distA - distB) > 0.08) return distA - distB;
      if (Math.abs(b.p - a.p) > 1e-6) return b.p - a.p;
      return a.id.localeCompare(b.id);
    })[0];

  return diverseAlt && diverseAlt.id !== first.id ? [first, diverseAlt] : [first];
}

/**
 * Optimiza de forma determinista una combinada de `legCount` selecciones (1 por partido)
 * buscando máxima probabilidad combinada dentro de `[targetRange.min, targetRange.max]`
 * sin bajar nunca del piso `minLegProbability` (por defecto `0.52`).
 */
export function buildTargetOddsParlay(
  options: TargetOddsParlayOptions,
): TargetOddsParlayResult {
  const {
    games,
    dayId,
    legCount: rawLegCount = 4,
    minLegProbability = 0.52,
    minLegDecimal = 1.35,
    targetRange = { min: 3.0, target: 5.0, max: 7.0 },
    scope = { kind: "all" },
    viewerRole = "member",
  } = options;

  const legCount = Math.min(6, Math.max(2, Math.round(rawLegCount)));
  const minPct = Math.round(minLegProbability * 100);
  const idealLegDecimal = Math.pow(targetRange.target, 1 / legCount);

  const filteredGames = games
    .filter((g) => {
      if (dayId !== undefined) {
        if (g.dayId !== dayId) return false;
      } else if (g.status === "FT") {
        return false;
      }
      return matchesPersonalScope(g, scope);
    })
    .slice()
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.id.localeCompare(b.id));

  const perGameBuckets: Array<{ game: PlatformGame; candidates: MatchPick[]; topProb: number }> = [];
  for (const game of filteredGames) {
    const candidates = selectTopGameCandidates(
      game,
      minLegProbability,
      minLegDecimal,
      idealLegDecimal,
      viewerRole,
    );
    if (candidates.length > 0) {
      perGameBuckets.push({
        game,
        candidates,
        topProb: candidates[0]!.p,
      });
    }
  }

  const eligibleGamesCount = perGameBuckets.length;
  if (eligibleGamesCount < legCount) {
    return {
      status: "insufficient",
      legCount,
      minLegProbability,
      minLegDecimal,
      targetRange,
      legs: [],
      combinedProbability: 0,
      fairDecimal: 1,
      fairAmerican: 100,
      bookDecimal: 1,
      hasCapturedBookOdds: false,
      eligibleGamesCount,
      emptyReason: `Solo ${eligibleGamesCount} ${eligibleGamesCount === 1 ? "partido cumple" : "partidos cumplen"} ≥ ${minPct} % con momio ≥ ${minLegDecimal.toFixed(2)}; se necesitan ${legCount}.`,
    };
  }

  // Acotar el universo de partidos según legCount para mantener la búsqueda combinatoria < 1 ms.
  const maxPoolGames = legCount >= 6 ? 9 : legCount === 5 ? 11 : 14;
  const searchPool = perGameBuckets
    .slice()
    .sort((a, b) => {
      if (Math.abs(b.topProb - a.topProb) > 1e-6) return b.topProb - a.topProb;
      return a.game.kickoffUtc.localeCompare(b.game.kickoffUtc) || a.game.id.localeCompare(b.game.id);
    })
    .slice(0, maxPoolGames);

  interface TargetSearchBest {
    score: number;
    legs: ParlayLeg[];
    metrics: ReturnType<typeof summarizeIndependentLegs>;
    distToTarget: number;
    tieKey: string;
  }
  const bestHolder: { current: TargetSearchBest | null } = { current: null };
  let minObservedDecimal = Number.POSITIVE_INFINITY;
  let maxObservedDecimal = 0;

  const chosen: ParlayLeg[] = [];
  const search = (startGameIdx: number) => {
    if (chosen.length === legCount) {
      const metrics = summarizeIndependentLegs(chosen);
      const refDecimal = metrics.hasCapturedBookOdds ? metrics.bookDecimal : metrics.fairDecimal;
      if (refDecimal < minObservedDecimal) minObservedDecimal = refDecimal;
      if (refDecimal > maxObservedDecimal) maxObservedDecimal = refDecimal;
      if (refDecimal < targetRange.min || refDecimal > targetRange.max) {
        return;
      }
      const avgEdgePts =
        chosen.reduce((acc, l) => acc + (l.pick.edgePts ?? 0), 0) / chosen.length;
      const distToTarget = Math.abs(refDecimal - targetRange.target);
      const score =
        Math.log(Math.max(1e-6, metrics.combinedProbability)) * 100 -
        distToTarget * 2.5 +
        avgEdgePts * 0.4;
      const tieKey = chosen
        .map((l) => l.pick.id)
        .sort()
        .join("|");

      const prev = bestHolder.current;
      if (
        !prev ||
        score > prev.score + 1e-9 ||
        (Math.abs(score - prev.score) <= 1e-9 &&
          (metrics.combinedProbability > prev.metrics.combinedProbability + 1e-9 ||
            (Math.abs(metrics.combinedProbability - prev.metrics.combinedProbability) <= 1e-9 &&
              (distToTarget < prev.distToTarget - 1e-6 ||
                (Math.abs(distToTarget - prev.distToTarget) <= 1e-6 &&
                  tieKey.localeCompare(prev.tieKey) < 0)))))
      ) {
        bestHolder.current = {
          score,
          legs: chosen.map((l) => ({ ...l })),
          metrics,
          distToTarget,
          tieKey,
        };
      }
      return;
    }

    const remainingNeeded = legCount - chosen.length;
    for (let gi = startGameIdx; gi <= searchPool.length - remainingNeeded; gi += 1) {
      const bucket = searchPool[gi]!;
      for (const pick of bucket.candidates) {
        if (!checkParlayCompatibility(chosen, pick, false).allowed) continue;
        chosen.push({ pick });
        search(gi + 1);
        chosen.pop();
      }
    }
  };

  search(0);

  const chosenBest = bestHolder.current;
  if (!chosenBest) {
    const rangeNote =
      Number.isFinite(minObservedDecimal) && maxObservedDecimal > 0
        ? ` Las combinaciones con ≥ ${minPct} % quedan entre ${minObservedDecimal.toFixed(2)} y ${maxObservedDecimal.toFixed(2)} (objetivo ${targetRange.min.toFixed(1)}–${targetRange.max.toFixed(1)}).`
        : "";
    return {
      status: "insufficient",
      legCount,
      minLegProbability,
      minLegDecimal,
      targetRange,
      legs: [],
      combinedProbability: 0,
      fairDecimal: 1,
      fairAmerican: 100,
      bookDecimal: 1,
      hasCapturedBookOdds: false,
      eligibleGamesCount,
      emptyReason: `Ninguna combinación de ${legCount} partidos con ≥ ${minPct} % alcanza la cuota objetivo ${targetRange.min.toFixed(1)}–${targetRange.max.toFixed(1)}.${rangeNote}`,
    };
  }

  const orderedLegs = chosenBest.legs.slice().sort(
    (a, b) =>
      b.pick.p - a.pick.p ||
      a.pick.kickoffLocal.localeCompare(b.pick.kickoffLocal) ||
      a.pick.id.localeCompare(b.pick.id),
  );

  return {
    status: "ready",
    legCount,
    minLegProbability,
    minLegDecimal,
    targetRange,
    legs: orderedLegs,
    combinedProbability: chosenBest.metrics.combinedProbability,
    fairDecimal: chosenBest.metrics.fairDecimal,
    fairAmerican: chosenBest.metrics.fairAmerican,
    bookDecimal: chosenBest.metrics.bookDecimal,
    hasCapturedBookOdds: chosenBest.metrics.hasCapturedBookOdds,
    eligibleGamesCount,
  };
}

/**
 * Día del Parlay oficial en «Próximos 7 días»: el primer día con partidos por jugar en el que
 * el estilo elegido sí reúne sus selecciones. Si ninguno alcanza, el primer día con partidos.
 * Con un día elegido en la barra se respeta ese día.
 */
export function pickOfficialParlayDay(
  games: readonly PlatformGame[],
  selectedDay: string,
  today: string,
  risk: DailyParlayMode,
  viewerRole: ViewerRole = "member",
  scope: PersonalParlayScope = { kind: "all" },
): string {
  const fallback = resolveOfficialParlayDay(games, selectedDay, today);
  if (selectedDay !== UPCOMING) return fallback;
  const openDays = Array.from(
    new Set(
      games
        .filter((g) => g.status === "NS" && g.dayId >= today && matchesPersonalScope(g, scope))
        .map((g) => g.dayId),
    ),
  ).sort();
  return (
    openDays.find((dayId) => buildOfficialDailyParlay({ dayId, games, risk, scope, viewerRole }).status === "ready") ??
    fallback
  );
}

/**
 * Determina el `dayId` (`YYYY-MM-DD`) activo para mostrar el Parlay oficial del día en Inicio:
 * - Si el socio eligió un día específico en la barra, usa ese día.
 * - Si eligió «Próximos 7 días», prioriza `today` si tiene partidos abiertos; si no, el próximo día con partidos abiertos.
 */
export function resolveOfficialParlayDay(
  games: readonly PlatformGame[],
  selectedDay: string,
  today: string,
): string {
  if (selectedDay !== UPCOMING) {
    return selectedDay;
  }
  const hasOpenToday = games.some((g) => g.dayId === today && g.status !== "FT");
  if (hasOpenToday) return today;

  const openDaysFuture = Array.from(
    new Set(
      games
        .filter((g) => g.status !== "FT" && g.dayId >= today)
        .map((g) => g.dayId),
    ),
  ).sort();
  if (openDaysFuture.length > 0) return openDaysFuture[0]!;

  const anyOpenDays = Array.from(
    new Set(games.filter((g) => g.status !== "FT").map((g) => g.dayId)),
  ).sort();
  return anyOpenDays[0] ?? today;
}

/**
 * Parlay oficial del día (determinista): mismo `dayId`, mismos partidos y mismo estilo
 * siempre producen exactamente las mismas selecciones y momio justo.
 *
 * Se arma con todos los partidos del día, sin importar si ya empezaron o terminaron, y con
 * la regla de un pick por partido: así el parlay que se ve en la mañana es el mismo que se
 * ve en la tarde y el mismo que se califica en Resultados.
 */
export function buildOfficialDailyParlay(options: {
  dayId: string;
  games: readonly PlatformGame[];
  risk: DailyParlayMode;
  scope?: PersonalParlayScope;
  viewerRole?: ViewerRole;
}): DailyParlayResult {
  const {
    dayId,
    games,
    risk,
    scope = { kind: "all" },
    viewerRole = "member",
  } = options;
  const spec = DAILY_PARLAY_MODE_SPECS[risk];

  if (risk === "objetivo") {
    const targetRes = buildTargetOddsParlay({
      dayId,
      games,
      legCount: spec.minLegs,
      minLegProbability: spec.minProbability,
      minLegDecimal: spec.minLegDecimal ?? 1.4,
      targetRange: spec.targetRange ?? { min: 3.0, target: 5.0, max: 7.0 },
      scope,
      viewerRole,
    });
    return {
      dayId,
      risk,
      status: targetRes.status,
      minLegs: spec.minLegs,
      maxLegs: spec.maxLegs,
      minProbability: spec.minProbability,
      legs: targetRes.legs,
      combinedProbability: targetRes.combinedProbability,
      fairDecimal: targetRes.fairDecimal,
      fairAmerican: targetRes.fairAmerican,
      bookDecimal: targetRes.bookDecimal,
      hasCapturedBookOdds: targetRes.hasCapturedBookOdds,
      ...(targetRes.emptyReason ? { emptyReason: targetRes.emptyReason } : {}),
    };
  }

  const dayGames = games
    .filter((g) => g.dayId === dayId && matchesPersonalScope(g, scope))
    .slice()
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.id.localeCompare(b.id));

  const candidates: CandidateItem[] = [];
  for (const game of dayGames) {
    for (const pick of game.picks) {
      if (pick.isRedacted || !isPickUnlocked(pick, game.status, viewerRole)) {
        continue;
      }
      if (!Number.isFinite(pick.p) || pick.p <= 0 || pick.p < spec.minProbability) {
        continue;
      }
      candidates.push({
        game,
        pick,
        score: scoreDailyPick(game, pick, risk),
      });
    }
  }

  candidates.sort((a, b) => compareCandidatesDeterministic(a, b, risk));

  const legs: ParlayLeg[] = [];
  for (const item of candidates) {
    if (legs.length >= spec.maxLegs) break;
    if (canAddSinglePerGame(legs, item.pick)) {
      legs.push({ pick: item.pick });
    }
  }

  if (legs.length < spec.minLegs) {
    const minPct = Math.round(spec.minProbability * 100);
    const reason =
      spec.minProbability > 0
        ? `Este día solo reúne ${legs.length} ${legs.length === 1 ? "selección compatible" : "selecciones compatibles"} con ${minPct} % o más; se necesitan al menos ${spec.minLegs} partidos distintos.`
        : `Este día solo reúne ${legs.length} ${legs.length === 1 ? "partido disponible" : "partidos disponibles"}; el parlay arriesgado requiere al menos ${spec.minLegs}.`;
    return {
      dayId,
      risk,
      status: "insufficient",
      minLegs: spec.minLegs,
      maxLegs: spec.maxLegs,
      minProbability: spec.minProbability,
      legs: [],
      combinedProbability: 0,
      fairDecimal: 1,
      fairAmerican: 100,
      bookDecimal: 1,
      hasCapturedBookOdds: false,
      emptyReason: reason,
    };
  }

  const metrics = summarizeIndependentLegs(legs);
  return {
    dayId,
    risk,
    status: "ready",
    minLegs: spec.minLegs,
    maxLegs: spec.maxLegs,
    minProbability: spec.minProbability,
    legs,
    ...metrics,
  };
}

/**
 * Califica automáticamente los parlays oficiales de los días con partidos finalizados
 * (`status === "FT" && score`), reconstruyendo las mismas selecciones deterministas del día.
 */
export function gradeOfficialDailyParlays(
  games: readonly PlatformGame[],
  limitDays = 7,
): GradedDailyParlayDay[] {
  const byDay = new Map<string, PlatformGame[]>();
  const finishedCountByDay = new Map<string, number>();

  for (const game of games) {
    const dayKey = game.dayId || game.kickoffUtc.slice(0, 10);
    const list = byDay.get(dayKey) ?? [];
    list.push(game);
    byDay.set(dayKey, list);
    if (game.status === "FT" && game.score) {
      finishedCountByDay.set(dayKey, (finishedCountByDay.get(dayKey) ?? 0) + 1);
    }
  }

  const dayIds = Array.from(finishedCountByDay.entries())
    .filter(([, count]) => count > 0)
    .map(([dayId]) => dayId)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limitDays);

  return dayIds.map((dayId) => {
    const dayGames = byDay.get(dayId) ?? [];
    const entries: GradedDailyParlayEntry[] = DAILY_PARLAY_MODES.map((risk) => {
      const parlay = buildOfficialDailyParlay({
        dayId,
        games: dayGames,
        risk,
        viewerRole: "member",
      });

      if (parlay.status !== "ready" || parlay.legs.length === 0) {
        return {
          dayId,
          risk,
          parlay,
          outcome: "insufficient",
          hitLegs: 0,
          missLegs: 0,
          pendingLegs: 0,
        };
      }

      let hitLegs = 0;
      let missLegs = 0;
      let pendingLegs = 0;
      for (const { pick } of parlay.legs) {
        if (pick.result === "hit") hitLegs += 1;
        else if (pick.result === "miss") missLegs += 1;
        else pendingLegs += 1;
      }

      const outcome: GradedParlayOutcome =
        missLegs > 0
          ? "miss"
          : hitLegs === parlay.legs.length
            ? "hit"
            : "pending";

      return {
        dayId,
        risk,
        parlay,
        outcome,
        hitLegs,
        missLegs,
        pendingLegs,
      };
    });

    return {
      dayId,
      finishedGamesCount: finishedCountByDay.get(dayId) ?? 0,
      entries,
    };
  });
}

/**
 * Generador rápido personal: arma entre 2 y 6 selecciones compatibles filtradas por
 * liga, deporte o todo, según el estilo de riesgo y, opcionalmente, una cuota meta.
 */
export function buildPersonalQuickParlay(options: {
  games: readonly PlatformGame[];
  legCount: number;
  risk: RiskBand;
  targetPreset?: ParlayTargetPresetId;
  scope: PersonalParlayScope;
  viewerRole?: ViewerRole;
  allowSgp?: boolean;
}): PersonalQuickParlayResult {
  const {
    games,
    legCount,
    risk,
    targetPreset = "libre",
    scope,
    viewerRole = "member",
    allowSgp = false,
  } = options;
  const requestedCount = Math.min(6, Math.max(2, Math.round(legCount)));
  const preset =
    PARLAY_TARGET_PRESETS.find((p) => p.id === targetPreset) ?? PARLAY_TARGET_PRESETS[0]!;

  if (preset.range) {
    const minProb = risk === "conservador" ? 0.6 : 0.52;
    const targeted = buildTargetOddsParlay({
      games,
      legCount: requestedCount,
      minLegProbability: minProb,
      minLegDecimal: preset.minLegDecimal,
      targetRange: preset.range,
      scope,
      viewerRole,
    });
    return {
      status: targeted.status,
      risk,
      targetPreset,
      requestedCount,
      legs: targeted.legs,
      combinedProbability: targeted.combinedProbability,
      fairDecimal: targeted.fairDecimal,
      fairAmerican: targeted.fairAmerican,
      bookDecimal: targeted.bookDecimal,
      hasCapturedBookOdds: targeted.hasCapturedBookOdds,
      ...(targeted.emptyReason ? { message: targeted.emptyReason } : {}),
    };
  }

  const scopedGames = games
    .filter((g) => g.status !== "FT" && matchesPersonalScope(g, scope))
    .slice()
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.id.localeCompare(b.id));

  const candidates: CandidateItem[] = [];
  for (const game of scopedGames) {
    for (const pick of game.picks) {
      if (pick.isRedacted || !isPickUnlocked(pick, game.status, viewerRole)) {
        continue;
      }
      if (!Number.isFinite(pick.p) || pick.p <= 0) continue;
      candidates.push({
        game,
        pick,
        score: scoreDailyPick(game, pick, risk),
      });
    }
  }

  candidates.sort((a, b) => compareCandidatesDeterministic(a, b, risk));

  const legs: ParlayLeg[] = [];
  for (const item of candidates) {
    if (legs.length >= requestedCount) break;
    if (checkParlayCompatibility(legs, item.pick, allowSgp).allowed) {
      legs.push({ pick: item.pick });
    }
  }

  if (legs.length < 2) {
    return {
      status: "insufficient",
      risk,
      targetPreset,
      requestedCount,
      legs: [],
      combinedProbability: 0,
      fairDecimal: 1,
      fairAmerican: 100,
      bookDecimal: 1,
      hasCapturedBookOdds: false,
      message:
        "No hay suficientes partidos abiertos con ese filtro para armar un parlay de al menos 2 selecciones.",
    };
  }

  const metrics = allowSgp
    ? (() => {
        const s = computeParlaySummary(legs, 1);
        return {
          combinedProbability: s.combinedProbability,
          fairDecimal: s.fairDecimal,
          fairAmerican: s.fairAmerican,
          bookDecimal: s.bookDecimal,
          hasCapturedBookOdds: legs.some(
            (l) => l.pick.marketDecimal !== null && l.pick.marketDecimal > 1,
          ),
        };
      })()
    : summarizeIndependentLegs(legs);

  const partial = legs.length < requestedCount;
  return {
    status: partial ? "partial" : "ready",
    risk,
    targetPreset,
    requestedCount,
    legs,
    ...metrics,
    message: partial
      ? `Solo había ${legs.length} selecciones compatibles disponibles de las ${requestedCount} pedidas.`
      : undefined,
  };
}
