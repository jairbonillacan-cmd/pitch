import type { LeagueId } from "@pitchlab/contracts";
import { decimalToAmericanInt, isPickUnlocked, pickReferenceDecimal } from "./access-guard.js";
import type {
  MatchPick,
  ParlayLeg,
  ParlaySummary,
  PickConflictGroup,
  PlatformGame,
  RiskBand,
  ViewerRole,
} from "./types.js";

const OPPOSING_GROUPS: Readonly<Record<PickConflictGroup, readonly PickConflictGroup[]>> = {
  home_side: ["away_side", "draw_side"],
  away_side: ["home_side", "draw_side"],
  draw_side: ["home_side", "away_side"],
  over_total: ["under_total"],
  under_total: ["over_total"],
  btts_yes: ["btts_no"],
  btts_no: ["btts_yes"],
  independent: [],
};

export interface ParlayCompatibilityResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Reglas del Boleto Combinado / Parlay Inteligente (Q3 y Q10):
 * - Máximo 6 selecciones.
 * - No se permiten picks de partidos ya finalizados (FT) ni bloqueados.
 * - Si allowSgp === false (por defecto): máximo 1 pick por partido.
 * - Si allowSgp === true: hasta 2 picks compatibles del mismo partido, bloqueando contradicciones.
 */
export function checkParlayCompatibility(
  existingLegs: readonly ParlayLeg[],
  candidate: MatchPick,
  allowSgp: boolean,
): ParlayCompatibilityResult {
  if (candidate.isRedacted) {
    return {
      allowed: false,
      reason: "Desbloquea Pase Total para agregar este pick al boleto combinado.",
    };
  }
  if (candidate.gameStatus === "FT") {
    return {
      allowed: false,
      reason: "Este partido ya finalizó; el armador solo combina encuentros por jugarse.",
    };
  }
  if (existingLegs.some((leg) => leg.pick.id === candidate.id)) {
    return {
      allowed: false,
      reason: "Esta selección ya está en tu boleto combinado.",
    };
  }
  if (existingLegs.length >= 6) {
    return {
      allowed: false,
      reason: "Máximo 6 selecciones por parlay para proteger tu varianza.",
    };
  }

  const sameGameLegs = existingLegs.filter((leg) => leg.pick.gameId === candidate.gameId);
  if (!allowSgp && sameGameLegs.length >= 1) {
    return {
      allowed: false,
      reason:
        "Ya tienes 1 pick de este partido. Activa «Mismo Partido (SGP)» para combinar hasta 2 selecciones compatibles.",
    };
  }
  if (allowSgp && sameGameLegs.length >= 2) {
    return {
      allowed: false,
      reason: "Máximo 2 selecciones del mismo partido (SGP) por boleto.",
    };
  }

  for (const sameLeg of sameGameLegs) {
    const gA = sameLeg.pick.conflictGroup;
    const gB = candidate.conflictGroup;
    if (
      (gA !== "independent" && gA === gB) ||
      OPPOSING_GROUPS[gA].includes(gB) ||
      OPPOSING_GROUPS[gB].includes(gA)
    ) {
      return {
        allowed: false,
        reason: `Selecciones incompatibles en el mismo partido («${sameLeg.pick.label}» choca con «${candidate.label}»).`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Calcula probabilidad conjunta, ajuste SGP de correlación (Geodesic v2.0),
 * momio justo sin vig, momio combinado de casa y ventaja esperada.
 */
export function computeParlaySummary(
  legs: readonly ParlayLeg[],
  stakeUnits: number = 1.0,
): ParlaySummary {
  const cleanStake = Math.max(0.25, Math.min(10, stakeUnits));
  if (legs.length === 0) {
    return {
      legs: [],
      hasSgpCorrelation: false,
      sgpPairsCount: 0,
      combinedProbability: 0,
      fairDecimal: 1,
      fairAmerican: 100,
      bookDecimal: 1,
      bookAmerican: 100,
      edgePts: 0,
      stakeUnits: cleanStake,
      projectedReturnUnits: 0,
      projectedProfitUnits: 0,
    };
  }

  const byGameCount = new Map<string, number>();
  let rawProb = 1;
  let bookDecimal = 1;

  for (const { pick } of legs) {
    rawProb *= pick.p;
    bookDecimal *= pickReferenceDecimal(pick);
    byGameCount.set(pick.gameId, (byGameCount.get(pick.gameId) ?? 0) + 1);
  }

  let sgpPairsCount = 0;
  for (const count of byGameCount.values()) {
    if (count >= 2) sgpPairsCount += 1;
  }

  // Ajuste conservador de correlación SGP en Geodesic v2.0 (evita sobreestimar bordes correlacionados)
  const sgpFactor = sgpPairsCount > 0 ? Math.pow(0.95, sgpPairsCount) : 1;
  const combinedProbability = Math.min(0.92, Math.max(0.01, rawProb * sgpFactor));
  const fairDecimal = Math.max(1.05, Math.round((1 / combinedProbability) * 100) / 100);
  const roundedBook = Math.max(1.08, Math.round(bookDecimal * (sgpPairsCount > 0 ? 0.94 : 1) * 100) / 100);
  const impliedBook = 1 / roundedBook;
  const edgePts = Math.round((combinedProbability - impliedBook) * 1000) / 10;
  const projectedReturnUnits = Math.round(cleanStake * roundedBook * 100) / 100;
  const projectedProfitUnits = Math.round((projectedReturnUnits - cleanStake) * 100) / 100;

  return {
    legs: [...legs],
    hasSgpCorrelation: sgpPairsCount > 0,
    sgpPairsCount,
    combinedProbability,
    fairDecimal,
    fairAmerican: decimalToAmericanInt(fairDecimal),
    bookDecimal: roundedBook,
    bookAmerican: decimalToAmericanInt(roundedBook),
    edgePts,
    stakeUnits: cleanStake,
    projectedReturnUnits,
    projectedProfitUnits,
  };
}

export interface AutoParlayOptions {
  leagues: readonly LeagueId[];
  risk: RiskBand;
  legCount: number;
  allowSgp: boolean;
  viewerRole: ViewerRole;
}

/**
 * Auto-Armador Inteligente: elige los mejores picks desbloqueados filtrando por ligas,
 * nivel de riesgo (Conservador / Medio / Arriesgado) y reglas de compatibilidad.
 */
export function buildSmartAutoParlay(
  games: readonly PlatformGame[],
  options: AutoParlayOptions,
): ParlayLeg[] {
  const targetLegs = Math.min(6, Math.max(2, Math.round(options.legCount)));
  const leagueSet = new Set(options.leagues);
  const candidatePicks: MatchPick[] = [];

  for (const game of games) {
    if (game.status === "FT") continue;
    if (leagueSet.size > 0 && !leagueSet.has(game.league)) continue;
    for (const pick of game.picks) {
      if (!isPickUnlocked(pick, game.status, options.viewerRole)) continue;
      candidatePicks.push(pick);
    }
  }

  const scoreCandidate = (pick: MatchPick): number => {
    const riskMatchBonus =
      pick.risk === options.risk
        ? 25
        : options.risk === "conservador" && pick.risk === "medio"
          ? 8
          : options.risk === "medio" && pick.risk === "conservador"
            ? 10
            : options.risk === "arriesgado" && pick.risk === "medio"
              ? 10
              : 0;
    const probWeight =
      options.risk === "conservador"
        ? pick.p * 40
        : options.risk === "medio"
          ? pick.p * 22 + (pick.edgePts ?? 0) * 3.2
          : (1 - Math.abs(0.46 - pick.p)) * 20 + (pick.edgePts ?? 0) * 4.2;
    return riskMatchBonus + probWeight + pick.confidenceScore * 0.15;
  };

  const sorted = candidatePicks.slice().sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
  const selected: ParlayLeg[] = [];

  for (const pick of sorted) {
    if (selected.length >= targetLegs) break;
    const compat = checkParlayCompatibility(selected, pick, options.allowSgp);
    if (compat.allowed) {
      selected.push({ pick });
    }
  }

  return selected;
}
