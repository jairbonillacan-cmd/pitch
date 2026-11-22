import {
  isTier1League,
  parseStrictFiniteNumber,
  type LeagueId,
} from "@pitchlab/contracts";
import { decimalToAmericanInt, isPickUnlocked, pickReferenceDecimal } from "./access-guard";
import type {
  MatchPick,
  ParlayLeg,
  ParlaySummary,
  PickConflictGroup,
  PlatformGame,
  RiskBand,
  ViewerRole,
} from "./types";

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
  code?:
    | "redacted"
    | "finished"
    | "live"
    | "invalid_odds"
    | "duplicate"
    | "same_game_disabled"
    | "sgp_limit"
    | "exact_score_sgp"
    | "same_axis"
    | "logical_contradiction";
  reason?: string;
}

type PickMarketAxis = "outcome" | "totals" | "btts" | "exact_score" | "other";

function isExactScorePick(pick: MatchPick): boolean {
  const m = (pick.market ?? "").toLowerCase();
  const l = pick.label.toLowerCase();
  return m === "correct_score" || l.includes("marcador exacto");
}

function getPickAxis(pick: MatchPick): PickMarketAxis {
  if (isExactScorePick(pick)) return "exact_score";
  const m = (pick.market ?? "").toLowerCase();
  const l = pick.label.toLowerCase();
  const g = pick.conflictGroup;

  if (m.includes("btts") || g === "btts_yes" || g === "btts_no" || l.includes("ambos anotan")) {
    return "btts";
  }
  if (
    m.includes("total") ||
    m === "ou" ||
    g === "over_total" ||
    g === "under_total" ||
    l.includes("más de") ||
    l.includes("menos de")
  ) {
    return "totals";
  }
  if (
    m === "h2h" ||
    m === "1x2" ||
    m === "moneyline" ||
    m === "ml" ||
    m === "double_chance" ||
    m === "draw_no_bet" ||
    m === "dnb" ||
    m === "spreads" ||
    m.includes("handicap") ||
    g === "home_side" ||
    g === "away_side" ||
    g === "draw_side"
  ) {
    return "outcome";
  }
  return "other";
}

function parseTotalDirectionAndLine(pick: MatchPick): {
  dir: "over" | "under";
  line: number;
  teamSide: "home" | "away" | null;
} | null {
  if (getPickAxis(pick) !== "totals") return null;
  const s = pick.selectionKey.toLowerCase();
  const l = pick.label.toLowerCase();
  const dir: "over" | "under" =
    pick.conflictGroup === "under_total" || s.includes("under") || l.includes("menos de")
      ? "under"
      : "over";

  let line: number | undefined =
    typeof pick.line === "number" && Number.isFinite(pick.line) ? pick.line : undefined;
  if (line === undefined) {
    const mSel = s.match(/(\d+(?:\.\d+)?)/);
    const mLbl = l.match(/(?:más|menos) de\s+(\d+(?:\.\d+)?)/i);
    const parsed = mLbl?.[1]
      ? parseStrictFiniteNumber(mLbl[1])
      : mSel?.[1]
        ? parseStrictFiniteNumber(mSel[1])
        : null;
    if (parsed !== null) line = parsed;
  }
  if (line === undefined) return null;

  const isTeamTotal = (pick.market ?? "").toLowerCase() === "team_totals";
  const teamSide: "home" | "away" | null = isTeamTotal
    ? s.startsWith("home")
      ? "home"
      : s.startsWith("away")
        ? "away"
        : null
    : null;

  return { dir, line, teamSide };
}

function crossAxisContradictionReason(a: MatchPick, b: MatchPick): string | null {
  const pair: [MatchPick, MatchPick] = [a, b];

  // 1) Ambos anotan: Sí + Menos de X goles (con X < 2, ej. Menos de 0.5 o 1.5) o Total de equipo Menos de 0.5
  const bttsYes = pair.find((p) => p.conflictGroup === "btts_yes");
  const bttsNo = pair.find((p) => p.conflictGroup === "btts_no");
  const totalPick = pair.find((p) => getPickAxis(p) === "totals");
  const totalInfo = totalPick ? parseTotalDirectionAndLine(totalPick) : null;

  if (bttsYes && totalPick && totalInfo && totalInfo.dir === "under") {
    if (totalInfo.teamSide !== null && totalInfo.line < 1) {
      return `Contradicción lógica: «${bttsYes.label}» exige que ambos equipos anoten y choca con «${totalPick.label}».`;
    }
    if (totalInfo.teamSide === null && totalInfo.line < 2) {
      return `Contradicción lógica: «${bttsYes.label}» exige mínimo 2 goles en el partido y choca con «${totalPick.label}».`;
    }
  }

  // 2) Ambos anotan: No + línea alta de goles totales (>= 4.5)
  if (bttsNo && totalPick && totalInfo && totalInfo.dir === "over" && totalInfo.teamSide === null && totalInfo.line >= 4.5) {
    return `Selecciones incompatibles: «${bttsNo.label}» choca con una línea alta de goles («${totalPick.label}»).`;
  }

  // 3) Resultado / Ganador vs Totales imposibles (ej. Ganador + Menos de 0.5 goles, o Empate + BTTS No + Más de 0.5)
  const outcomePick = pair.find((p) => getPickAxis(p) === "outcome");
  if (outcomePick && totalPick && totalInfo) {
    const sel = outcomePick.selectionKey.toLowerCase();
    const isDoubleChanceWithDraw =
      (outcomePick.market ?? "").toLowerCase() === "double_chance" && (sel === "1x" || sel === "x2");
    const requiresWinner =
      (outcomePick.conflictGroup === "home_side" || outcomePick.conflictGroup === "away_side") &&
      !isDoubleChanceWithDraw;

    if (requiresWinner && totalInfo.dir === "under" && totalInfo.teamSide === null && totalInfo.line < 1) {
      return `Contradicción lógica: «${outcomePick.label}» exige al menos 1 gol y choca con «${totalPick.label}» (0-0).`;
    }
    if (
      requiresWinner &&
      totalInfo.dir === "under" &&
      totalInfo.line < 1 &&
      ((outcomePick.conflictGroup === "home_side" && totalInfo.teamSide === "home") ||
        (outcomePick.conflictGroup === "away_side" && totalInfo.teamSide === "away"))
    ) {
      return `Contradicción lógica: un equipo no puede ganar («${outcomePick.label}») haciendo menos de 0.5 goles («${totalPick.label}»).`;
    }
  }

  return null;
}

/**
 * Reglas explícitas de lo que NO puede entrar o combinarse en un parlay.
 * Se muestra en el armador para que el usuario tenga total claridad.
 */
export const PARLAY_NON_COMBINABLE_RULES: ReadonlyArray<{
  readonly title: string;
  readonly detail: string;
}> = [
  {
    title: "Partidos en vivo o terminados",
    detail: "Solo entran encuentros antes del arranque (pre-partido); los partidos en curso o finalizados quedan cerrados.",
  },
  {
    title: "Más de 1 pick del mismo partido (sin SGP)",
    detail: "En parlay clásico va 1 selección por partido. Si activas «Mismo partido (SGP)», puedes unir hasta 2 de distinto eje.",
  },
  {
    title: "Mercados del mismo eje o redundantes",
    detail: "No se combinan dos resultados/hándicaps del mismo partido (ej. Ganador + Spread o Doble oportunidad) ni dos líneas de totales.",
  },
  {
    title: "Marcador exacto y contradicciones lógicas",
    detail: "El marcador exacto no es combinable en SGP, ni selecciones que se anulan entre sí (como «Ambos anotan: Sí» con «Menos de 1.5 goles»).",
  },
];

/**
 * Reglas del Boleto Combinado / Parlay Inteligente:
 * - Sin tope artificial de selecciones (mínimo 2 para sellar el boleto; puedes agregar todas las que quieras).
 * - No se permiten picks bloqueados, con cuota cerrada (<= 1.01), de partidos en vivo (LIVE) ni finalizados (FT).
 * - Si allowSgp === false (por defecto): máximo 1 pick por partido.
 * - Si allowSgp === true: hasta 2 picks de distinto eje del mismo partido, bloqueando mercados redundantes,
 *   marcador exacto en SGP y contradicciones lógicas cruzadas.
 */
export function checkParlayCompatibility(
  existingLegs: readonly ParlayLeg[],
  candidate: MatchPick,
  allowSgp: boolean,
): ParlayCompatibilityResult {
  if (candidate.isRedacted) {
    return {
      allowed: false,
      code: "redacted",
      reason: "Desbloquea Pase PitchLab Ultra para agregar este pick al boleto combinado.",
    };
  }
  if (candidate.gameStatus === "FT") {
    return {
      allowed: false,
      code: "finished",
      reason: "Este partido ya finalizó; el armador solo combina encuentros por jugarse.",
    };
  }
  if (candidate.gameStatus === "LIVE") {
    return {
      allowed: false,
      code: "live",
      reason: "Este partido ya está en vivo; el parlay pre-partido solo admite encuentros antes del arranque.",
    };
  }
  if (!Number.isFinite(candidate.p) || candidate.p <= 0.01 || candidate.p >= 0.99 || candidate.fairDecimal <= 1.01) {
    return {
      allowed: false,
      code: "invalid_odds",
      reason: "Esta selección tiene una probabilidad extrema o línea cerrada y no es elegible para parlay.",
    };
  }
  if (existingLegs.some((leg) => leg.pick.id === candidate.id)) {
    return {
      allowed: false,
      code: "duplicate",
      reason: "Esta selección ya está en tu boleto combinado.",
    };
  }

  const sameGameLegs = existingLegs.filter((leg) => leg.pick.gameId === candidate.gameId);
  if (!allowSgp && sameGameLegs.length >= 1) {
    return {
      allowed: false,
      code: "same_game_disabled",
      reason:
        "Ya tienes 1 pick de este partido. Activa «Mismo Partido (SGP)» para combinar hasta 2 selecciones compatibles.",
    };
  }
  if (allowSgp && sameGameLegs.length >= 2) {
    return {
      allowed: false,
      code: "sgp_limit",
      reason: "Máximo 2 selecciones del mismo partido (SGP) por boleto.",
    };
  }

  const candidateAxis = getPickAxis(candidate);
  for (const sameLeg of sameGameLegs) {
    const existing = sameLeg.pick;
    const existingAxis = getPickAxis(existing);

    if (candidateAxis === "exact_score" || existingAxis === "exact_score") {
      return {
        allowed: false,
        code: "exact_score_sgp",
        reason: "El marcador exacto ya fija ganador, goles y ambos anotan; no se puede combinar con otra selección del mismo partido.",
      };
    }

    const gA = existing.conflictGroup;
    const gB = candidate.conflictGroup;
    if (
      (gA !== "independent" && gA === gB) ||
      OPPOSING_GROUPS[gA].includes(gB) ||
      OPPOSING_GROUPS[gB].includes(gA)
    ) {
      return {
        allowed: false,
        code: "same_axis",
        reason: `Selecciones incompatibles en el mismo partido («${existing.label}» choca con «${candidate.label}»).`,
      };
    }

    if (candidateAxis !== "other" && candidateAxis === existingAxis) {
      const axisName =
        candidateAxis === "outcome"
          ? "resultado o hándicap"
          : candidateAxis === "totals"
            ? "líneas de totales"
            : "ambos anotan";
      return {
        allowed: false,
        code: "same_axis",
        reason: `No se pueden combinar dos selecciones de ${axisName} del mismo partido («${existing.label}» y «${candidate.label}» son redundantes o opuestas).`,
      };
    }

    const crossReason = crossAxisContradictionReason(existing, candidate);
    if (crossReason) {
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: crossReason,
      };
    }
  }

  return { allowed: true };
}

export type ParlayRiskLevel = "bajo" | "medio" | "alto" | "muy_alto" | "extremo";

export interface ParlayRiskAssessment {
  level: ParlayRiskLevel;
  label: string;
  shortLabel: string;
  tone: "success" | "info" | "warning" | "danger";
  /** Porcentaje 8–100 para barra visual de riesgo. */
  meterPct: number;
  /** Frecuencia esperada («1 de cada N veces»). */
  oneIn: number;
  /** Resumen en una línea de la dificultad real del boleto. */
  headline: string;
  /** Consejo práctico (eslabón más exigente y stake recomendado). */
  guidance: string;
  /** Unidades máximas sugeridas según la varianza. */
  suggestedMaxUnits: number;
  /** Selección con menor probabilidad individual del boleto (`null` si está vacío). */
  weakestLeg: { label: string; matchLabel: string; p: number } | null;
  /** Advertencias activas por cantidad de selecciones, probabilidad baja o correlación SGP. */
  warnings: string[];
}

/**
 * Evalúa en tiempo real el riesgo de cualquier boleto combinado según su probabilidad conjunta,
 * número de selecciones, pata más débil y correlación de mismo partido (SGP).
 */
export function assessParlayRisk(summary: Pick<ParlaySummary, "legs" | "combinedProbability" | "hasSgpCorrelation" | "sgpPairsCount">): ParlayRiskAssessment {
  const n = summary.legs.length;
  const p = summary.combinedProbability;

  if (n === 0 || p <= 0) {
    return {
      level: "bajo",
      label: "Sin selecciones",
      shortLabel: "Vacío",
      tone: "info",
      meterPct: 0,
      oneIn: 1,
      headline: "Agrega 2 o más selecciones (sin límite) para medir el riesgo en vivo.",
      guidance: "El medidor calcula qué tan probable es acertar todas tus selecciones a la vez.",
      suggestedMaxUnits: 1.0,
      weakestLeg: null,
      warnings: [],
    };
  }

  let weakest: { label: string; matchLabel: string; p: number } | null = null;
  for (const { pick } of summary.legs) {
    if (!weakest || pick.p < weakest.p) {
      weakest = { label: pick.label, matchLabel: pick.matchLabel, p: pick.p };
    }
  }

  const probRank =
    p >= 0.42
      ? 0
      : p >= 0.22
        ? 1
        : p >= 0.1
          ? 2
          : p >= 0.03
            ? 3
            : 4;
  const legRank =
    n <= 2
      ? 0
      : n <= 4
        ? 1
        : n === 5
          ? 2
          : n <= 7
            ? 3
            : 4;
  const rank = n === 1 ? probRank : Math.max(probRank, legRank);

  const specs: ReadonlyArray<{
    level: ParlayRiskLevel;
    label: string;
    shortLabel: string;
    tone: "success" | "info" | "warning" | "danger";
    suggestedMaxUnits: number;
  }> = [
    {
      level: "bajo",
      label: "Riesgo bajo · Conservador",
      shortLabel: "Riesgo bajo",
      tone: "success",
      suggestedMaxUnits: 2.0,
    },
    {
      level: "medio",
      label: "Riesgo medio · Equilibrado",
      shortLabel: "Riesgo medio",
      tone: "info",
      suggestedMaxUnits: 1.25,
    },
    {
      level: "alto",
      label: "Riesgo alto · Exigente",
      shortLabel: "Riesgo alto",
      tone: "warning",
      suggestedMaxUnits: 0.75,
    },
    {
      level: "muy_alto",
      label: "Riesgo muy alto · Alta varianza",
      shortLabel: "Riesgo muy alto",
      tone: "danger",
      suggestedMaxUnits: 0.5,
    },
    {
      level: "extremo",
      label: "Riesgo extremo · Lotería",
      shortLabel: "Riesgo extremo",
      tone: "danger",
      suggestedMaxUnits: 0.25,
    },
  ];

  const chosen = specs[rank] ?? specs[4]!;
  const oneIn = Math.max(1, Math.round(1 / Math.max(p, 0.0001)));
  const meterPct = Math.min(100, Math.max(10, Math.round((1 - Math.pow(Math.max(p, 0.0005), 0.38)) * 100)));
  const pctText = p * 100 < 0.1 ? "< 0.1" : (p * 100).toFixed(1);

  const warnings: string[] = [];
  if (n === 1) {
    warnings.push("Un parlay requiere al menos 2 selecciones para poder sellarse.");
  }
  if (n >= 6) {
    warnings.push(`Con ${n} selecciones basta 1 fallo para perder todo el boleto (${pctText} % de probabilidad conjunta).`);
  }
  if (weakest && weakest.p < 0.5) {
    warnings.push(`Incluye una selección debajo del 50 % («${weakest.label}», ${(weakest.p * 100).toFixed(1)} %).`);
  }
  if (summary.hasSgpCorrelation) {
    warnings.push("Contiene selecciones del mismo partido (SGP): probabilidad ajustada por dependencia.");
  }

  const headline =
    n === 1
      ? `1 selección activa (${pctText} %) · agrega otra para formar parlay`
      : `Se acierta ~1 de cada ${oneIn} veces (${pctText} % con ${n} selecciones)`;
  const guidance =
    weakest && n >= 2
      ? `Selección más exigente: ${weakest.label} (${(weakest.p * 100).toFixed(1)} %) · Stake prudente ≤ ${chosen.suggestedMaxUnits}u`
      : `Stake prudente recomendado ≤ ${chosen.suggestedMaxUnits}u`;

  return {
    level: chosen.level,
    label: chosen.label,
    shortLabel: chosen.shortLabel,
    tone: chosen.tone,
    meterPct,
    oneIn,
    headline,
    guidance,
    suggestedMaxUnits: chosen.suggestedMaxUnits,
    weakestLeg: weakest,
    warnings,
  };
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
      fairDecimal: 0,
      fairAmerican: 0,
      bookDecimal: 0,
      bookAmerican: 0,
      edgePts: 0,
      stakeUnits: cleanStake,
      projectedReturnUnits: 0,
      projectedProfitUnits: 0,
    };
  }

  const byGameLegs = new Map<string, MatchPick[]>();
  let rawProb = 1;
  let bookDecimal = 1;

  for (const { pick } of legs) {
    rawProb *= pick.p;
    bookDecimal *= pickReferenceDecimal(pick);
    const list = byGameLegs.get(pick.gameId) ?? [];
    list.push(pick);
    byGameLegs.set(pick.gameId, list);
  }

  let sgpPairsCount = 0;
  let sgpFactor = 1;
  for (const gamePicks of byGameLegs.values()) {
    if (gamePicks.length < 2) continue;
    sgpPairsCount += 1;
    // Estimación direccional inmediata (refinada al vuelo por la Cópula Student-t v5.1 en /api/parlays/sgp):
    // Over + BTTS Sí o Local + Over se refuerzan ligeramente; Under + BTTS Sí o Local + Under se penalizan.
    const hasOver = gamePicks.some(
      (p) => p.conflictGroup === "over_total" || p.conflictGroup === "btts_yes",
    );
    const hasUnder = gamePicks.some(
      (p) => p.conflictGroup === "under_total" || p.conflictGroup === "btts_no",
    );
    const hasBttsYes = gamePicks.some((p) => p.conflictGroup === "btts_yes");
    const hasOverTotal = gamePicks.some((p) => p.conflictGroup === "over_total");
    const hasHomeSide = gamePicks.some((p) => p.conflictGroup === "home_side");
    if (hasOverTotal && hasBttsYes) {
      sgpFactor *= 1.09;
    } else if (hasHomeSide && hasOver) {
      sgpFactor *= 1.04;
    } else if (hasHomeSide && hasUnder) {
      sgpFactor *= 0.93;
    } else {
      sgpFactor *= 0.96;
    }
  }

  const sgpCorrelationDirection: ParlaySummary["sgpCorrelationDirection"] =
    sgpPairsCount === 0
      ? undefined
      : sgpFactor > 1.03
        ? "positively_correlated"
        : sgpFactor < 0.97
          ? "negatively_correlated"
          : "near_independent";
  const combinedProbability = Math.min(0.92, Math.max(0.0001, rawProb * sgpFactor));
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
    ...(sgpCorrelationDirection ? { sgpCorrelationDirection } : {}),
    ...(sgpPairsCount > 0 ? { sgpCorrelationMultiplier: Math.round(sgpFactor * 100) / 100 } : {}),
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

const MAX_PARLAY_EV_PCT = 18;
const MAX_PARLAY_EDGE_PTS = 12;
const PARLAY_EDGE_CLAMP_MIN = -6;
const PARLAY_EDGE_CLAMP_MAX = 10;

export function clampParlayEdgePts(edgePts: number | null | undefined): number {
  if (typeof edgePts !== "number" || !Number.isFinite(edgePts)) return 0;
  return Math.min(PARLAY_EDGE_CLAMP_MAX, Math.max(PARLAY_EDGE_CLAMP_MIN, edgePts));
}

export function isParlayPickOutlier(pick: MatchPick): boolean {
  if (
    typeof pick.edgePts === "number" &&
    Number.isFinite(pick.edgePts) &&
    pick.edgePts > MAX_PARLAY_EDGE_PTS
  ) {
    return true;
  }
  if (
    pick.marketDecimal !== null &&
    Number.isFinite(pick.marketDecimal) &&
    pick.marketDecimal >= 1.01
  ) {
    const evPct = (pick.p * pick.marketDecimal - 1) * 100;
    if (evPct > MAX_PARLAY_EV_PCT) return true;
    const impliedEdgePts = (pick.p - 1 / pick.marketDecimal) * 100;
    if (impliedEdgePts > MAX_PARLAY_EDGE_PTS) return true;
  }
  return false;
}

export function parlayMarketDiversityKey(pick: MatchPick): string {
  const rawMarket = (pick.market ?? "").toLowerCase();
  const normMarket =
    rawMarket === "h2h" || rawMarket === "1x2" || rawMarket === "moneyline" || rawMarket === "ml"
      ? "moneyline"
      : rawMarket.startsWith("totals_") ||
          rawMarket === "over_under" ||
          rawMarket.endsWith("_totals")
        ? "totals"
        : rawMarket === "spreads" || rawMarket === "handicap" || rawMarket === "asian_handicap"
          ? "spread"
          : rawMarket || getPickAxis(pick);
  const totalInfo = parseTotalDirectionAndLine(pick);
  if (totalInfo) {
    return `${normMarket}|${totalInfo.line}|${totalInfo.dir}`;
  }
  const lineToken =
    typeof pick.line === "number" && Number.isFinite(pick.line) ? String(pick.line) : "";
  const s = pick.selectionKey.toLowerCase();
  const direction =
    s.includes("over") || pick.conflictGroup === "over_total"
      ? "over"
      : s.includes("under") || pick.conflictGroup === "under_total"
        ? "under"
        : s === "draw" || s === "x" || pick.conflictGroup === "draw_side"
          ? "draw"
          : s === "yes" || pick.conflictGroup === "btts_yes"
            ? "yes"
            : s === "no" || pick.conflictGroup === "btts_no"
              ? "no"
              : s.startsWith("home") || s === "1" || s === "1x" || pick.conflictGroup === "home_side"
                ? "home"
                : s.startsWith("away") ||
                    s === "2" ||
                    s === "x2" ||
                    pick.conflictGroup === "away_side"
                  ? "away"
                  : s;
  return `${normMarket}|${lineToken}|${direction}`;
}

export function maxSameMarketLegsFor(targetLegs: number): number {
  return targetLegs <= 3 ? 1 : 2;
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
  const targetLegs = Math.max(2, Math.round(options.legCount));
  const leagueSet = new Set(options.leagues);
  const candidateEntries: Array<{ readonly game: PlatformGame; readonly pick: MatchPick }> = [];

  for (const game of games) {
    if (game.status === "FT" || game.status === "LIVE") continue;
    if (leagueSet.size > 0 && !leagueSet.has(game.league)) continue;
    for (const pick of game.picks) {
      if (!isPickUnlocked(pick, game.status, options.viewerRole)) continue;
      if (isParlayPickOutlier(pick)) continue;
      candidateEntries.push({ game, pick });
    }
  }

  const scoreCandidate = (entry: { readonly game: PlatformGame; readonly pick: MatchPick }): number => {
    const { game, pick } = entry;
    const boundedEdge = clampParlayEdgePts(pick.edgePts);
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
        ? pick.p * 40 + boundedEdge * 0.5
        : options.risk === "medio"
          ? pick.p * 22 + boundedEdge * 3.2
          : (1 - Math.abs(0.46 - pick.p)) * 20 + boundedEdge * 4.2;
    const primaryBonus = pick.category === "principal" ? 6 : pick.category === "conservador" ? 3 : 0;
    const tier1Bonus = isTier1League(game.league) ? 4 : 0;
    const calibratedBonus = game.spacetime?.outlookDriven ? 3 : 0;
    return (
      riskMatchBonus +
      probWeight +
      primaryBonus +
      tier1Bonus +
      calibratedBonus +
      (pick.confidenceScore ?? 0) * 0.15
    );
  };

  const sorted = candidateEntries
    .slice()
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a) || a.pick.id.localeCompare(b.pick.id));

  const selected: ParlayLeg[] = [];
  const diversityCap = maxSameMarketLegsFor(targetLegs);
  const diversityCounts = new Map<string, number>();

  for (const { pick } of sorted) {
    if (selected.length >= targetLegs) break;
    const key = parlayMarketDiversityKey(pick);
    if ((diversityCounts.get(key) ?? 0) >= diversityCap) continue;
    const compat = checkParlayCompatibility(selected, pick, options.allowSgp);
    if (compat.allowed) {
      selected.push({ pick });
      diversityCounts.set(key, (diversityCounts.get(key) ?? 0) + 1);
    }
  }

  if (selected.length < targetLegs) {
    for (const { pick } of sorted) {
      if (selected.length >= targetLegs) break;
      const compat = checkParlayCompatibility(selected, pick, options.allowSgp);
      if (compat.allowed) {
        selected.push({ pick });
      }
    }
  }

  return selected;
}
