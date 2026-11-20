/**
 * Motor puro de valoración financiera (de-vig proporcional/Shin, EV+, edge, fairOdds),
 * evidencia real multi-ventana (L5 / L10 / L20 / Local-Visita / H2H), señal de xG,
 * ajuste bayesiano de rigor arbitral y liquidación exacta en partidos `FT`.
 *
 * Principios:
 * - Cero números inventados: cada ventana de evidencia sale estrictamente de datos reales
 *   presentes en el partido o en los registros pasados al contexto.
 * - Cero hit-rate ingenuo: la frecuencia observada nunca sustituye a `p` calibrada de
 *   Spacetime v5.1 ni genera `fairOdds = 1.00`.
 * - Cero borrado en `FT`: todo pick en partido finalizado conserva su liquidación auditable
 *   (`hit | miss | push | pending`).
 */
import { sportScoringUnit } from "@pitchlab/contracts";
import { decimalToAmericanInt } from "../access-guard";
import {
  REFEREE_EB_PRIOR_WEIGHT,
  classifyRefereeRigor,
  shrinkRefereeYellowRate,
} from "../referee-stats";
import type {
  MatchIntelligenceV5View,
  PlatformGame,
} from "../types";
import type {
  CatalogEvidenceBullet,
  CatalogPickEvidence,
  DeVigMethod,
  EvidenceTone,
  EvidenceWindowStat,
  MarketFamilyId,
  MatchFinalCountStats,
  PickDirection,
  PickPricingMetrics,
  PickSettlementStatus,
  PlayerPropStatKey,
  RefereeEvidenceSignal,
  TeamMatchEvidenceRecord,
  XgEvidenceSignal,
} from "./catalog-types";

const MIN_CALIBRATED_PROB = 0.01;
const MAX_CALIBRATED_PROB = 0.99;
const DEFAULT_LEAGUE_YELLOW_PRIOR = 4.15;
const DEFAULT_LEAGUE_FOULS_PRIOR = 23.8;
const MIN_DE_VIG_IMPLIED_SUM = 0.92;
const MAX_DE_VIG_IMPLIED_SUM = 1.32;
const AUTO_SHIN_OVERROUND_THRESHOLD_PCT = 3.5;

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function toneForObservedRate(ratePct: number): EvidenceTone {
  if (ratePct >= 70) return "high";
  if (ratePct >= 48) return "mid";
  return "low";
}

export interface DeVigComputationResult {
  readonly probs: readonly number[];
  readonly method: Exclude<DeVigMethod, "none">;
  readonly overroundPct: number;
  readonly shinZ?: number;
}

/**
 * Remoción proporcional (multiplicativa) del margen de casa sobre cuotas decimales (2 o 3 vías).
 */
export function computeProportionalDeVig(
  decimals: readonly number[],
): DeVigComputationResult | null {
  if (decimals.length < 2) return null;
  const implied: number[] = [];
  let sum = 0;
  for (const d of decimals) {
    if (!Number.isFinite(d) || d <= 1.001) return null;
    const q = 1 / d;
    implied.push(q);
    sum += q;
  }
  if (sum < MIN_DE_VIG_IMPLIED_SUM || sum > MAX_DE_VIG_IMPLIED_SUM) return null;
  return {
    probs: implied.map((q) => round4(q / sum)),
    method: "proportional",
    overroundPct: round2((sum - 1) * 100),
  };
}

/**
 * Solucionador determinista de Shin (1993) por bisección para mercados de 2 o 3 vías.
 * Corrige el sesgo favorito-underdog propio de casas recreativas con overround elevado.
 */
export function computeShinDeVig(
  decimals: readonly number[],
  tolerance = 1e-10,
): DeVigComputationResult | null {
  if (decimals.length < 2) return null;
  const q: number[] = [];
  let sumQ = 0;
  for (const d of decimals) {
    if (!Number.isFinite(d) || d <= 1.001) return null;
    const qi = 1 / d;
    q.push(qi);
    sumQ += qi;
  }
  if (sumQ < MIN_DE_VIG_IMPLIED_SUM || sumQ > MAX_DE_VIG_IMPLIED_SUM) return null;

  const overroundPct = round2((sumQ - 1) * 100);
  if (sumQ <= 1.0001) {
    return {
      probs: q.map((qi) => round4(qi / sumQ)),
      method: "shin",
      overroundPct,
      shinZ: 0,
    };
  }

  const evalProbs = (z: number): number[] => {
    const denom = 2 * (1 - z);
    return q.map((qi) => {
      const disc = z * z + (4 * (1 - z) * qi * qi) / sumQ;
      return (Math.sqrt(Math.max(0, disc)) - z) / denom;
    });
  };

  let lo = 0;
  let hi = 0.999999;
  for (let iter = 0; iter < 64; iter += 1) {
    const mid = (lo + hi) * 0.5;
    const probs = evalProbs(mid);
    const total = probs.reduce((acc, v) => acc + v, 0);
    if (Math.abs(total - 1) <= tolerance) {
      lo = mid;
      hi = mid;
      break;
    }
    if (total > 1) lo = mid;
    else hi = mid;
  }

  const z = (lo + hi) * 0.5;
  const rawProbs = evalProbs(z);
  const normSum = rawProbs.reduce((acc, v) => acc + v, 0);
  if (!Number.isFinite(normSum) || normSum <= 0) return null;

  return {
    probs: rawProbs.map((p) => round4(p / normSum)),
    method: "shin",
    overroundPct,
    shinZ: round4(z),
  };
}

/**
 * Selecciona el método de de-vig óptimo:
 * - `"auto"`: Shin cuando el overround es >= 3.5 % (casas recreativas) y proporcional en
 *   mercados sharp (< 3.5 %).
 */
export function computeAdaptiveDeVig(
  decimals: readonly number[],
  preference: "auto" | "proportional" | "shin" = "auto",
): DeVigComputationResult | null {
  if (decimals.length < 2) return null;
  if (preference === "proportional") return computeProportionalDeVig(decimals);
  if (preference === "shin") return computeShinDeVig(decimals) ?? computeProportionalDeVig(decimals);

  const prop = computeProportionalDeVig(decimals);
  if (!prop) return null;
  if (prop.overroundPct >= AUTO_SHIN_OVERROUND_THRESHOLD_PCT) {
    return computeShinDeVig(decimals) ?? prop;
  }
  return prop;
}

export interface ComputePickPricingInput {
  readonly calibratedProb: number;
  readonly marketDecimal?: number | null;
  readonly companionMarketDecimals?: readonly number[] | null;
  readonly companionIndex?: number;
  readonly marketBookLabel?: string | null;
  readonly marketCapturedAtUtc?: string | null;
  readonly deVigPreference?: "auto" | "proportional" | "shin";
}

/**
 * Calcula el bloque completo de valoración de un pick:
 * `p` calibrada, `fairOdds = 1 / p`, de-vig proporcional/Shin, `evPct`, `edgePts` y
 * etiqueta limpia `"Valor +X.X %"` únicamente cuando existe valor esperado positivo real.
 */
export function computePickPricing(input: ComputePickPricingInput): PickPricingMetrics {
  const safeP = round4(
    clamp(
      Number.isFinite(input.calibratedProb) ? input.calibratedProb : 0.5,
      MIN_CALIBRATED_PROB,
      MAX_CALIBRATED_PROB,
    ),
  );
  const fairOdds = Math.max(1.01, round2(1 / safeP));
  const fairAmerican = decimalToAmericanInt(fairOdds);

  const validMarket =
    typeof input.marketDecimal === "number" &&
    Number.isFinite(input.marketDecimal) &&
    input.marketDecimal > 1.001
      ? round2(input.marketDecimal)
      : null;

  let deVigMarketProb: number | null = null;
  let deVigMethod: DeVigMethod = "none";
  let overroundPct: number | null = null;

  if (
    validMarket !== null &&
    input.companionMarketDecimals &&
    input.companionMarketDecimals.length >= 2
  ) {
    const idx = input.companionIndex ?? 0;
    const devig = computeAdaptiveDeVig(
      input.companionMarketDecimals,
      input.deVigPreference ?? "auto",
    );
    if (devig && idx >= 0 && idx < devig.probs.length) {
      deVigMarketProb = devig.probs[idx] ?? null;
      deVigMethod = devig.method;
      overroundPct = devig.overroundPct;
    }
  }

  const evPct = validMarket !== null ? round1((safeP * validMarket - 1) * 100) : null;
  const edgePts = validMarket !== null ? round1((safeP - 1 / validMarket) * 100) : null;
  const noVigEdgePts =
    deVigMarketProb !== null ? round1((safeP - deVigMarketProb) * 100) : null;
  const hasPositiveValue = evPct !== null && evPct > 0;
  const valueLabel = hasPositiveValue ? `Valor +${evPct.toFixed(1)} %` : null;

  return {
    p: safeP,
    fairOdds,
    fairAmerican,
    marketDecimal: validMarket,
    marketAmerican: validMarket !== null ? decimalToAmericanInt(validMarket) : null,
    marketBookLabel: validMarket !== null ? (input.marketBookLabel ?? null) : null,
    marketCapturedAtUtc: validMarket !== null ? (input.marketCapturedAtUtc ?? null) : null,
    deVigMarketProb,
    deVigMethod,
    overroundPct,
    evPct,
    edgePts,
    noVigEdgePts,
    valueLabel,
    hasPositiveValue,
  };
}

/**
 * Extrae la señal real de xG / producción ofensiva proyectada presente en el partido.
 * Devuelve `null` si el partido no contiene proyección real.
 */
export function resolveXgEvidenceSignal(
  game: PlatformGame,
  v5?: MatchIntelligenceV5View | null,
): XgEvidenceSignal | null {
  let homeXg: number | null = null;
  let awayXg: number | null = null;
  let source: XgEvidenceSignal["source"] = "projection";

  if (
    game.projection &&
    Number.isFinite(game.projection.home) &&
    Number.isFinite(game.projection.away) &&
    game.projection.home > 0 &&
    game.projection.away > 0
  ) {
    homeXg = round2(game.projection.home);
    awayXg = round2(game.projection.away);
    source = v5 ? "spacetime_v5" : "projection";
  } else if (
    game.spacetime &&
    typeof game.spacetime.expectedTotal === "number" &&
    typeof game.spacetime.expectedMargin === "number" &&
    Number.isFinite(game.spacetime.expectedTotal) &&
    Number.isFinite(game.spacetime.expectedMargin)
  ) {
    const h = (game.spacetime.expectedTotal + game.spacetime.expectedMargin) / 2;
    const a = (game.spacetime.expectedTotal - game.spacetime.expectedMargin) / 2;
    if (h > 0 && a > 0) {
      homeXg = round2(h);
      awayXg = round2(a);
      source = "spacetime_v5";
    }
  }

  if (homeXg === null || awayXg === null) return null;

  const totalXg = round2(homeXg + awayXg);
  const marginXg = round2(homeXg - awayXg);
  const unit = sportScoringUnit(game.sport);
  const metricPrefix = game.sport === "football" ? "xG proyectado" : "Proyección";
  const summary = `${metricPrefix} ${homeXg.toFixed(unit.decimals)} – ${awayXg.toFixed(unit.decimals)} (total ${totalXg.toFixed(unit.decimals)} ${unit.plural})`;

  return {
    homeXg,
    awayXg,
    totalXg,
    marginXg,
    source,
    summary,
  };
}

/**
 * Resuelve el perfil arbitral del partido con contracción Empirical Bayes (κ = 15).
 * Prioriza el perfil verificado de Spacetime v5.1 (`official_priors_v5_1`) y recurre a
 * `matchContext.refereeStats` cuando existe muestra real del colegiado.
 */
export function resolveRefereeEvidenceSignal(
  game: PlatformGame,
  v5?: MatchIntelligenceV5View | null,
  leagueMeanYellow: number = DEFAULT_LEAGUE_YELLOW_PRIOR,
): RefereeEvidenceSignal | null {
  const v5Ref = v5?.microCounts?.refereeProfile;
  if (v5Ref && v5Ref.name.trim()) {
    const cardsMult = round4(clamp(v5Ref.cardsMultiplier, 0.72, 1.38));
    const foulsMult = round4(clamp(v5Ref.foulsMultiplier, 0.8, 1.25));
    const shrunk = round2(leagueMeanYellow * cardsMult);
    const pct = cardsMult >= 1.07 ? 80 : cardsMult <= 0.93 ? 20 : 50;
    const { tier } = classifyRefereeRigor(shrunk, leagueMeanYellow, pct);
    const tierWord =
      tier === "estricto" ? "estricto" : tier === "permisivo" ? "permisivo" : "promedio";
    return {
      name: v5Ref.name.trim(),
      matches: v5Ref.games,
      rawAvgYellow: game.preGame?.matchContext?.refereeStats?.avgYellow ?? null,
      shrunkYellowPerGame: shrunk,
      cardsMultiplier: cardsMult,
      foulsMultiplier: foulsMult,
      rigorTier: tier,
      summary: `Árbitro ${v5Ref.name.trim()} (${tierWord}) · ×${cardsMult.toFixed(2)} tarjetas (${v5Ref.games} PJ)`,
    };
  }

  const refName = (game.referee ?? game.preGame?.matchContext?.referee ?? "").trim();
  const stats = game.preGame?.matchContext?.refereeStats;
  if (!refName) return null;

  const matches = stats?.matches ?? 0;
  const rawYellow =
    typeof stats?.avgYellow === "number" && Number.isFinite(stats.avgYellow) && stats.avgYellow > 0
      ? stats.avgYellow
      : null;
  const rawFouls =
    typeof stats?.avgFouls === "number" && Number.isFinite(stats.avgFouls) && stats.avgFouls > 0
      ? stats.avgFouls
      : null;

  const shrunkYellow =
    rawYellow !== null
      ? shrinkRefereeYellowRate(rawYellow, matches, leagueMeanYellow, REFEREE_EB_PRIOR_WEIGHT)
      : null;
  const cardsMultiplier =
    shrunkYellow !== null
      ? round4(clamp(shrunkYellow / leagueMeanYellow, 0.72, 1.38))
      : 1.0;

  const shrunkFouls =
    rawFouls !== null
      ? (matches * rawFouls + REFEREE_EB_PRIOR_WEIGHT * DEFAULT_LEAGUE_FOULS_PRIOR) /
        (matches + REFEREE_EB_PRIOR_WEIGHT)
      : null;
  const foulsMultiplier =
    shrunkFouls !== null
      ? round4(clamp(shrunkFouls / DEFAULT_LEAGUE_FOULS_PRIOR, 0.8, 1.25))
      : 1.0;

  const pct = cardsMultiplier >= 1.07 ? 80 : cardsMultiplier <= 0.93 ? 20 : 50;
  const { tier } = classifyRefereeRigor(shrunkYellow, leagueMeanYellow, pct);
  const tierWord =
    tier === "estricto" ? "estricto" : tier === "permisivo" ? "permisivo" : "promedio";

  const summary =
    shrunkYellow !== null
      ? `Árbitro ${refName} (${tierWord}) · ${shrunkYellow.toFixed(2)} amar./p EB · ×${cardsMultiplier.toFixed(2)} (${matches} PJ)`
      : `Árbitro asignado: ${refName}`;

  return {
    name: refName,
    matches,
    rawAvgYellow: rawYellow,
    shrunkYellowPerGame: shrunkYellow,
    cardsMultiplier,
    foulsMultiplier,
    rigorTier: tier,
    summary,
  };
}

function parseFormLetters(raw: string | undefined): Array<"G" | "E" | "P"> {
  if (!raw) return [];
  const head = raw.split("·")[0] ?? raw;
  return head
    .toUpperCase()
    .replace(/[^GEPWLD]/g, "")
    .split("")
    .slice(0, 5)
    .map((ch) => (ch === "W" || ch === "G" ? "G" : ch === "D" || ch === "E" ? "E" : "P"));
}

/**
 * Evalúa si un marcador `(teamGoals, oppGoals)` cumple una selección de mercado.
 * Devuelve `"hit"`, `"miss"`, `"push"` o `null` si el registro no aplica al mercado.
 */
function gradeScoreOutcome(params: {
  readonly family: MarketFamilyId;
  readonly selectionKey: string;
  readonly line: number | null;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly htScore?: { readonly home: number; readonly away: number } | null;
  readonly f5Score?: { readonly home: number; readonly away: number } | null;
  readonly finalStats?: MatchFinalCountStats | null;
  readonly playerKey?: string | null;
  readonly playerStatKey?: PlayerPropStatKey | null;
}): "hit" | "miss" | "push" | null {
  const { family, line, homeScore: h, awayScore: a } = params;
  const sel = params.selectionKey.toLowerCase();
  const total = h + a;

  switch (family) {
    case "1x2":
    case "nba_moneyline":
    case "mlb_moneyline":
    case "nhl_moneyline":
    case "nfl_moneyline": {
      if (sel === "home" || sel === "1") return h > a ? "hit" : "miss";
      if (sel === "away" || sel === "2") return a > h ? "hit" : "miss";
      if (sel === "draw" || sel === "x") return h === a ? "hit" : "miss";
      return null;
    }

    case "double_chance": {
      if (sel === "1x" || sel === "home_or_draw") return h >= a ? "hit" : "miss";
      if (sel === "x2" || sel === "away_or_draw") return a >= h ? "hit" : "miss";
      if (sel === "12" || sel === "home_or_away") return h !== a ? "hit" : "miss";
      return null;
    }

    case "dnb": {
      if (h === a) return "push";
      if (sel === "home" || sel === "dnb_home") return h > a ? "hit" : "miss";
      if (sel === "away" || sel === "dnb_away") return a > h ? "hit" : "miss";
      return null;
    }

    case "btts": {
      const both = h > 0 && a > 0;
      if (sel === "yes" || sel === "btts_yes") return both ? "hit" : "miss";
      if (sel === "no" || sel === "btts_no") return !both ? "hit" : "miss";
      return null;
    }

    case "totals":
    case "nba_totals":
    case "mlb_totals":
    case "nhl_totals":
    case "nfl_totals": {
      if (line === null || !Number.isFinite(line)) return null;
      if (total === line) return "push";
      if (sel.includes("over")) return total > line ? "hit" : "miss";
      if (sel.includes("under")) return total < line ? "hit" : "miss";
      return null;
    }

    case "team_totals": {
      if (line === null || !Number.isFinite(line)) return null;
      const isHome = sel.startsWith("home");
      const isAway = sel.startsWith("away");
      if (!isHome && !isAway) return null;
      const val = isHome ? h : a;
      if (val === line) return "push";
      if (sel.includes("over")) return val > line ? "hit" : "miss";
      if (sel.includes("under")) return val < line ? "hit" : "miss";
      return null;
    }

    case "half_time_result": {
      const ht = params.htScore;
      if (!ht) return null;
      if (sel.includes("home")) return ht.home > ht.away ? "hit" : "miss";
      if (sel.includes("away")) return ht.away > ht.home ? "hit" : "miss";
      if (sel.includes("draw")) return ht.home === ht.away ? "hit" : "miss";
      return null;
    }

    case "second_half_result": {
      const ht = params.htScore;
      if (!ht) return null;
      const h2 = h - ht.home;
      const a2 = a - ht.away;
      if (h2 < 0 || a2 < 0) return null;
      if (sel.includes("home")) return h2 > a2 ? "hit" : "miss";
      if (sel.includes("away")) return a2 > h2 ? "hit" : "miss";
      if (sel.includes("draw")) return h2 === a2 ? "hit" : "miss";
      return null;
    }

    case "combo_1x2_over": {
      if (line === null || !Number.isFinite(line)) return null;
      const resultHolds = sel.startsWith("home")
        ? h > a
        : sel.startsWith("away")
          ? a > h
          : sel.startsWith("draw")
            ? h === a
            : sel.startsWith("1x")
              ? h >= a
              : sel.startsWith("x2")
                ? a >= h
                : null;
      if (resultHolds === null) return null;
      if (sel.includes("over")) return resultHolds && total > line ? "hit" : "miss";
      if (sel.includes("under")) return resultHolds && total < line ? "hit" : "miss";
      return null;
    }

    case "combo_1x2_btts": {
      const both = h > 0 && a > 0;
      const resultHolds = sel.startsWith("home")
        ? h > a
        : sel.startsWith("away")
          ? a > h
          : sel.startsWith("draw")
            ? h === a
            : null;
      if (resultHolds === null) return null;
      if (sel.includes("btts_yes") || sel.endsWith("_yes")) {
        return resultHolds && both ? "hit" : "miss";
      }
      if (sel.includes("btts_no") || sel.endsWith("_no")) {
        return resultHolds && !both ? "hit" : "miss";
      }
      return null;
    }

    case "asian_handicap":
    case "nba_spread":
    case "mlb_run_line":
    case "nhl_puck_line":
    case "nfl_spread": {
      if (line === null || !Number.isFinite(line)) return null;
      const isHome = sel.startsWith("home");
      const isAway = sel.startsWith("away");
      if (!isHome && !isAway) return null;
      const diff = isHome ? h + line - a : a + line - h;
      if (Math.abs(diff) < 1e-9) return "push";
      return diff > 0 ? "hit" : "miss";
    }

    case "clean_sheet": {
      if (sel === "home_yes") return a === 0 ? "hit" : "miss";
      if (sel === "home_no") return a > 0 ? "hit" : "miss";
      if (sel === "away_yes") return h === 0 ? "hit" : "miss";
      if (sel === "away_no") return h > 0 ? "hit" : "miss";
      return null;
    }

    case "win_to_nil": {
      if (sel === "home" || sel === "home_yes") return h > 0 && a === 0 ? "hit" : "miss";
      if (sel === "away" || sel === "away_yes") return a > 0 && h === 0 ? "hit" : "miss";
      return null;
    }

    case "mlb_f5": {
      const f5 = params.f5Score;
      if (!f5) return null;
      if (sel === "f5_home" || sel === "home") return f5.home > f5.away ? "hit" : "miss";
      if (sel === "f5_away" || sel === "away") return f5.away > f5.home ? "hit" : "miss";
      if (sel === "f5_tie" || sel === "tie" || sel === "draw") {
        return f5.home === f5.away ? "hit" : "miss";
      }
      if (line !== null && Number.isFinite(line)) {
        const f5Tot = f5.home + f5.away;
        if (f5Tot === line) return "push";
        if (sel.includes("over")) return f5Tot > line ? "hit" : "miss";
        if (sel.includes("under")) return f5Tot < line ? "hit" : "miss";
      }
      return null;
    }

    case "corners_total":
    case "corners_team":
    case "shots_total":
    case "shots_on_target":
    case "fouls_total":
    case "cards_total": {
      const st = params.finalStats;
      if (!st || line === null || !Number.isFinite(line)) return null;
      let observed: number | null = null;
      if (family === "corners_total" && st.cornersHome !== undefined && st.cornersAway !== undefined) {
        observed = st.cornersHome + st.cornersAway;
      } else if (family === "corners_team") {
        if (sel.startsWith("home") && st.cornersHome !== undefined) observed = st.cornersHome;
        else if (sel.startsWith("away") && st.cornersAway !== undefined) observed = st.cornersAway;
      } else if (family === "shots_total" && st.shotsHome !== undefined && st.shotsAway !== undefined) {
        observed = st.shotsHome + st.shotsAway;
      } else if (
        family === "shots_on_target" &&
        st.shotsOnTargetHome !== undefined &&
        st.shotsOnTargetAway !== undefined
      ) {
        observed = st.shotsOnTargetHome + st.shotsOnTargetAway;
      } else if (family === "fouls_total" && st.foulsHome !== undefined && st.foulsAway !== undefined) {
        observed = st.foulsHome + st.foulsAway;
      } else if (
        family === "cards_total" &&
        st.yellowCardsHome !== undefined &&
        st.yellowCardsAway !== undefined
      ) {
        observed = st.yellowCardsHome + st.yellowCardsAway;
      }
      if (observed === null) return null;
      if (observed === line) return "push";
      if (sel.includes("over")) return observed > line ? "hit" : "miss";
      if (sel.includes("under")) return observed < line ? "hit" : "miss";
      return null;
    }

    case "player_props_football":
    case "nba_player_props": {
      if (!params.finalStats?.playerStats || !params.playerKey || !params.playerStatKey || line === null) {
        return null;
      }
      const pStats = params.finalStats.playerStats[params.playerKey];
      const val = pStats?.[params.playerStatKey];
      if (typeof val !== "number" || !Number.isFinite(val)) return null;
      if (val === line) return "push";
      if (sel.includes("over")) return val > line ? "hit" : "miss";
      if (sel.includes("under")) return val < line ? "hit" : "miss";
      return null;
    }
  }
}

/**
 * Liquida un pick en partidos `FT` devolviendo `"hit" | "miss" | "push" | "pending"`.
 * Preserva todos los picks en partidos terminados sin ocultar ni inventar resultados.
 */
export function gradeCatalogPick(params: {
  readonly game: PlatformGame;
  readonly family: MarketFamilyId;
  readonly selectionKey: string;
  readonly line: number | null;
  readonly f5Score?: { readonly home: number; readonly away: number } | null;
  readonly finalStats?: MatchFinalCountStats | null;
  readonly playerKey?: string | null;
  readonly playerStatKey?: PlayerPropStatKey | null;
}): PickSettlementStatus {
  const { game } = params;
  if (game.status !== "FT" || !game.score) return "pending";

  const graded = gradeScoreOutcome({
    family: params.family,
    selectionKey: params.selectionKey,
    line: params.line,
    homeScore: game.score.home,
    awayScore: game.score.away,
    htScore: game.preGame?.matchContext?.halfTimeScore ?? null,
    f5Score: params.f5Score ?? null,
    finalStats: params.finalStats ?? null,
    playerKey: params.playerKey ?? null,
    playerStatKey: params.playerStatKey ?? null,
  });
  return graded ?? "pending";
}

function evaluateRecordListWindow(params: {
  readonly window: EvidenceWindowStat["window"];
  readonly label: string;
  readonly records: readonly TeamMatchEvidenceRecord[];
  readonly perspective: "home" | "away";
  readonly family: MarketFamilyId;
  readonly selectionKey: string;
  readonly line: number | null;
}): EvidenceWindowStat | null {
  if (params.records.length < 3) return null;

  let hits = 0;
  let pushes = 0;
  let evaluated = 0;
  let valueSum = 0;
  let valueCount = 0;

  for (const rec of params.records) {
    const asHome = params.perspective === "home";
    const hGoals = asHome ? rec.goalsFor : rec.goalsAgainst;
    const aGoals = asHome ? rec.goalsAgainst : rec.goalsFor;
    const htScore =
      rec.halfTimeGoalsFor != null && rec.halfTimeGoalsAgainst != null
        ? {
            home: asHome ? rec.halfTimeGoalsFor : rec.halfTimeGoalsAgainst,
            away: asHome ? rec.halfTimeGoalsAgainst : rec.halfTimeGoalsFor,
          }
        : null;
    const stats: MatchFinalCountStats = {
      ...(rec.cornersFor != null && rec.cornersAgainst != null
        ? {
            cornersHome: asHome ? rec.cornersFor : rec.cornersAgainst,
            cornersAway: asHome ? rec.cornersAgainst : rec.cornersFor,
          }
        : {}),
      ...(rec.shotsFor != null && rec.shotsAgainst != null
        ? {
            shotsHome: asHome ? rec.shotsFor : rec.shotsAgainst,
            shotsAway: asHome ? rec.shotsAgainst : rec.shotsFor,
          }
        : {}),
      ...(rec.shotsOnTargetFor != null && rec.shotsOnTargetAgainst != null
        ? {
            shotsOnTargetHome: asHome ? rec.shotsOnTargetFor : rec.shotsOnTargetAgainst,
            shotsOnTargetAway: asHome ? rec.shotsOnTargetAgainst : rec.shotsOnTargetFor,
          }
        : {}),
      ...(rec.foulsFor != null && rec.foulsAgainst != null
        ? {
            foulsHome: asHome ? rec.foulsFor : rec.foulsAgainst,
            foulsAway: asHome ? rec.foulsAgainst : rec.foulsFor,
          }
        : {}),
      ...(rec.yellowCardsFor != null && rec.yellowCardsAgainst != null
        ? {
            yellowCardsHome: asHome ? rec.yellowCardsFor : rec.yellowCardsAgainst,
            yellowCardsAway: asHome ? rec.yellowCardsAgainst : rec.yellowCardsFor,
          }
        : {}),
    };

    const res = gradeScoreOutcome({
      family: params.family,
      selectionKey: params.selectionKey,
      line: params.line,
      homeScore: hGoals,
      awayScore: aGoals,
      htScore,
      finalStats: stats,
    });
    if (res === null) continue;
    evaluated += 1;
    if (res === "hit") hits += 1;
    else if (res === "push") pushes += 1;

    if (params.family === "totals" || params.family.endsWith("_totals")) {
      valueSum += rec.goalsFor + rec.goalsAgainst;
      valueCount += 1;
    } else if (params.family === "team_totals") {
      valueSum += rec.goalsFor;
      valueCount += 1;
    } else if (params.family === "corners_total" && rec.cornersFor != null && rec.cornersAgainst != null) {
      valueSum += rec.cornersFor + rec.cornersAgainst;
      valueCount += 1;
    } else if (params.family === "corners_team" && rec.cornersFor != null) {
      valueSum += rec.cornersFor;
      valueCount += 1;
    } else if (params.family === "cards_total" && rec.yellowCardsFor != null && rec.yellowCardsAgainst != null) {
      valueSum += rec.yellowCardsFor + rec.yellowCardsAgainst;
      valueCount += 1;
    }
  }

  const effective = evaluated - pushes;
  if (effective < 3) return null;
  const ratePct = Math.round((hits / effective) * 100);
  return {
    window: params.window,
    label: params.label,
    hits,
    sample: evaluated,
    pushes,
    ratePct,
    meanValue: valueCount > 0 ? round2(valueSum / valueCount) : null,
    tone: toneForObservedRate(ratePct),
  };
}

function evaluateH2hWindow(
  game: PlatformGame,
  family: MarketFamilyId,
  selectionKey: string,
  line: number | null,
): EvidenceWindowStat | null {
  const h2h = game.headToHead ?? [];
  if (h2h.length < 2) return null;

  const homeNorm = normalizeText(game.home.shortName || game.home.name);
  let hits = 0;
  let pushes = 0;
  let evaluated = 0;
  let totalSum = 0;

  for (const row of h2h.slice(0, 10)) {
    const rowHomeNorm = normalizeText(row.home);
    const sameOrientation =
      rowHomeNorm.includes(homeNorm) || homeNorm.includes(rowHomeNorm);
    const orientedHome = sameOrientation ? row.homeGoals : row.awayGoals;
    const orientedAway = sameOrientation ? row.awayGoals : row.homeGoals;

    const res = gradeScoreOutcome({
      family,
      selectionKey,
      line,
      homeScore: orientedHome,
      awayScore: orientedAway,
    });
    if (res === null) continue;
    evaluated += 1;
    totalSum += orientedHome + orientedAway;
    if (res === "hit") hits += 1;
    else if (res === "push") pushes += 1;
  }

  const effective = evaluated - pushes;
  if (effective < 2) return null;
  const ratePct = Math.round((hits / effective) * 100);
  return {
    window: "h2h",
    label: `H2H (${hits}/${effective})`,
    hits,
    sample: evaluated,
    pushes,
    ratePct,
    meanValue: evaluated > 0 ? round2(totalSum / evaluated) : null,
    tone: toneForObservedRate(ratePct),
  };
}

function evaluateFactorFormL5Window(
  game: PlatformGame,
  family: MarketFamilyId,
  selectionKey: string,
): EvidenceWindowStat | null {
  const outcomeFamilies = new Set<MarketFamilyId>([
    "1x2",
    "double_chance",
    "dnb",
    "nba_moneyline",
    "mlb_moneyline",
    "nhl_moneyline",
    "nfl_moneyline",
  ]);
  if (!outcomeFamilies.has(family)) return null;

  const sel = selectionKey.toLowerCase();
  const isHomeSide = sel === "home" || sel === "1" || sel === "1x" || sel === "dnb_home";
  const isAwaySide = sel === "away" || sel === "2" || sel === "x2" || sel === "dnb_away";
  const isDoubleChance = family === "double_chance" && (sel === "1x" || sel === "x2");
  const isDnb = family === "dnb";

  if (!isHomeSide && !isAwaySide) return null;

  const factor = game.factors.find((f) =>
    isHomeSide ? /local/i.test(f.label) : /visit/i.test(f.label),
  );
  const letters = parseFormLetters(factor?.value);
  if (letters.length < 3) return null;

  let hits = 0;
  let pushes = 0;
  for (const r of letters) {
    if (isDoubleChance) {
      if (r === "G" || r === "E") hits += 1;
    } else if (isDnb) {
      if (r === "G") hits += 1;
      else if (r === "E") pushes += 1;
    } else if (r === "G") {
      hits += 1;
    }
  }
  const effective = letters.length - pushes;
  if (effective < 2) return null;
  const ratePct = Math.round((hits / effective) * 100);
  const teamLabel = isHomeSide ? game.home.shortName : game.away.shortName;
  return {
    window: "L5",
    label: `L5 ${teamLabel} (${hits}/${effective})`,
    hits,
    sample: letters.length,
    pushes,
    ratePct,
    meanValue: null,
    tone: toneForObservedRate(ratePct),
  };
}

/**
 * Evalúa ventanas reales de evidencia sobre una serie numérica de valores observados
 * (por ejemplo, apariciones de jugador filtradas por `minMinutes >= 45` o `last10` de NBA).
 */
export function buildNumericSeriesEvidenceWindows(params: {
  readonly values: readonly number[];
  readonly homeAwayValues?: readonly number[];
  readonly venueLabel?: string;
  readonly line: number;
  readonly direction: "over" | "under";
  readonly subjectLabel: string;
}): readonly EvidenceWindowStat[] {
  const evalSlice = (
    window: EvidenceWindowStat["window"],
    label: string,
    slice: readonly number[],
  ): EvidenceWindowStat | null => {
    if (slice.length < 3) return null;
    let hits = 0;
    let pushes = 0;
    let sum = 0;
    for (const v of slice) {
      if (!Number.isFinite(v)) continue;
      sum += v;
      if (v === params.line) pushes += 1;
      else if (params.direction === "over" ? v > params.line : v < params.line) hits += 1;
    }
    const effective = slice.length - pushes;
    if (effective < 2) return null;
    const ratePct = Math.round((hits / effective) * 100);
    return {
      window,
      label: `${label} (${hits}/${effective})`,
      hits,
      sample: slice.length,
      pushes,
      ratePct,
      meanValue: round2(sum / slice.length),
      tone: toneForObservedRate(ratePct),
    };
  };

  const out: EvidenceWindowStat[] = [];
  const l5 = evalSlice("L5", `L5 ${params.subjectLabel}`, params.values.slice(0, 5));
  if (l5) out.push(l5);
  if (params.values.length >= 8) {
    const l10 = evalSlice("L10", `L10 ${params.subjectLabel}`, params.values.slice(0, 10));
    if (l10) out.push(l10);
  }
  if (params.values.length >= 15) {
    const l20 = evalSlice("L20", `L20 ${params.subjectLabel}`, params.values.slice(0, 20));
    if (l20) out.push(l20);
  }
  if (params.homeAwayValues && params.homeAwayValues.length >= 3) {
    const split = evalSlice(
      "home_away",
      `${params.venueLabel ?? "Sede"} ${params.subjectLabel}`,
      params.homeAwayValues.slice(0, 10),
    );
    if (split) out.push(split);
  }
  return out;
}

export interface BuildCatalogEvidenceInput {
  readonly game: PlatformGame;
  readonly family: MarketFamilyId;
  readonly selectionKey: string;
  readonly line: number | null;
  readonly direction: PickDirection;
  readonly v5?: MatchIntelligenceV5View | null;
  readonly xgSignal: XgEvidenceSignal | null;
  readonly refereeSignal: RefereeEvidenceSignal | null;
  readonly homeHistory?: readonly TeamMatchEvidenceRecord[];
  readonly awayHistory?: readonly TeamMatchEvidenceRecord[];
  readonly precomputedWindows?: readonly EvidenceWindowStat[];
  readonly contextBullets?: readonly string[];
}

/**
 * Ensambla la evidencia verificable multi-ventana (`L5 / L10 / L20 / Local-Visita / H2H`),
 * señal de xG real y perfil arbitral Empirical Bayes para un pick concreto.
 */
export function buildCatalogPickEvidence(
  input: BuildCatalogEvidenceInput,
): CatalogPickEvidence {
  const { game, family, selectionKey, line, xgSignal, refereeSignal } = input;
  const windows: EvidenceWindowStat[] = [];

  if (input.precomputedWindows && input.precomputedWindows.length > 0) {
    windows.push(...input.precomputedWindows);
  } else {
    const sel = selectionKey.toLowerCase();
    const prefersAway =
      sel.startsWith("away") || sel === "2" || sel === "x2" || sel === "dnb_away";
    const teamPerspective: "home" | "away" = prefersAway ? "away" : "home";
    const teamRecords = prefersAway ? input.awayHistory : input.homeHistory;
    const teamName = prefersAway ? game.away.shortName : game.home.shortName;

    if (teamRecords && teamRecords.length >= 3) {
      const l5 = evaluateRecordListWindow({
        window: "L5",
        label: `L5 ${teamName}`,
        records: teamRecords.slice(0, 5),
        perspective: teamPerspective,
        family,
        selectionKey,
        line,
      });
      if (l5) windows.push(l5);

      if (teamRecords.length >= 8) {
        const l10 = evaluateRecordListWindow({
          window: "L10",
          label: `L10 ${teamName}`,
          records: teamRecords.slice(0, 10),
          perspective: teamPerspective,
          family,
          selectionKey,
          line,
        });
        if (l10) windows.push(l10);
      }

      if (teamRecords.length >= 15) {
        const l20 = evaluateRecordListWindow({
          window: "L20",
          label: `L20 ${teamName}`,
          records: teamRecords.slice(0, 20),
          perspective: teamPerspective,
          family,
          selectionKey,
          line,
        });
        if (l20) windows.push(l20);
      }

      const venueRecords = teamRecords.filter((r) =>
        teamPerspective === "home" ? r.isHome : !r.isHome,
      );
      const split = evaluateRecordListWindow({
        window: "home_away",
        label: `${teamPerspective === "home" ? "Local" : "Visita"} ${teamName}`,
        records: venueRecords.slice(0, 10),
        perspective: teamPerspective,
        family,
        selectionKey,
        line,
      });
      if (split) windows.push(split);
    } else {
      const formL5 = evaluateFactorFormL5Window(game, family, selectionKey);
      if (formL5) windows.push(formL5);
    }

    const h2h = evaluateH2hWindow(game, family, selectionKey, line);
    if (h2h) windows.push(h2h);
  }

  const bullets: CatalogEvidenceBullet[] = [];
  for (const w of windows.slice(0, 2)) {
    bullets.push({
      label: w.label.includes("(")
        ? w.label
        : `${w.hits}/${w.sample - w.pushes} · ${w.label}`,
      ratePct: w.ratePct,
      tone: w.tone,
    });
  }

  const refRelevant =
    family === "cards_total" ||
    family === "fouls_total" ||
    (family === "player_props_football" &&
      (selectionKey.includes("cards") || selectionKey.includes("fouls")));

  if (refRelevant && refereeSignal) {
    bullets.push({
      label: refereeSignal.summary,
      ratePct: null,
      tone: refereeSignal.rigorTier === "estricto" ? "high" : "neutral",
    });
  }

  if (input.contextBullets) {
    for (const text of input.contextBullets) {
      if (bullets.length >= 4) break;
      if (text.trim()) {
        bullets.push({ label: text.trim(), ratePct: null, tone: "neutral" });
      }
    }
  }

  if (bullets.length < 3 && xgSignal && !refRelevant) {
    bullets.push({
      label: xgSignal.summary,
      ratePct: null,
      tone: "neutral",
    });
  }

  const avgObservedRatePct =
    windows.length > 0
      ? Math.round(windows.reduce((acc, w) => acc + w.ratePct, 0) / windows.length)
      : null;

  return {
    windows,
    xgSignal,
    refereeSignal: refRelevant ? refereeSignal : null,
    bullets: bullets.slice(0, 4),
    avgObservedRatePct,
  };
}
