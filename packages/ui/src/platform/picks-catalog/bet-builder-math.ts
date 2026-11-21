/**
 * Motor matemático de Bet Builder / Same-Game Parlay (SGP) de PitchLab.
 *
 * Responsabilidades:
 * 1. Matriz de compatibilidad explícita: bloquea piernas contradictorias, ejes redundantes,
 *    marcador exacto en SGP, partidos `FT`/`LIVE`, selecciones redactadas y contradicciones
 *    cruzadas multi-pierna (ej. Local +0.5 goles + Visita +0.5 goles + Ambos anotan No).
 * 2. Matriz de correlación empírica por eje y dirección (`ρ ∈ [-0.65, +0.65]`) para fútbol
 *    y deportes US (NBA, MLB, NHL, NFL).
 * 3. Cálculo determinista de probabilidad conjunta ajustada por Cópula Gaussiana exacta
 *    (cuadratura de Gauss-Legendre de 12 puntos en `< 0.01 ms`, acotada por Fréchet-Hoeffding)
 *    + auditoría de margen oculto SGP y detección de advertencias.
 */
import type { PlatformSport } from "@pitchlab/contracts";
import { decimalToAmericanInt } from "../access-guard";
import { normalCdf } from "../spacetime-markets";
import type { MatchPick } from "../types";
import type {
  CatalogPickItem,
  LineupConfirmationStatus,
  MarketFamilyId,
  PickAxisKey,
  PickDirection,
  PlayerPropStatKey,
} from "./catalog-types";

export type BetBuilderBlockCode =
  | "redacted"
  | "finished"
  | "live"
  | "invalid_prob"
  | "duplicate"
  | "sgp_limit"
  | "exact_score_lock"
  | "same_axis_redundant"
  | "logical_contradiction"
  | "multi_leg_contradiction";

export interface BetBuilderLegInput {
  readonly id: string;
  readonly gameId: string;
  readonly sport: PlatformSport;
  readonly gameStatus: "NS" | "FT" | "LIVE";
  readonly family: MarketFamilyId | "correct_score" | "other";
  readonly axis: PickAxisKey;
  readonly selectionKey: string;
  readonly label: string;
  readonly line: number | null;
  readonly direction: PickDirection;
  readonly p: number;
  readonly marketDecimal?: number | null;
  readonly isRedacted?: boolean;
  readonly playerKey?: string | null;
  readonly playerTeamSide?: "home" | "away" | null;
  readonly playerStatKey?: PlayerPropStatKey | null;
  readonly lineupStatus?: LineupConfirmationStatus | null;
}

export interface BetBuilderCompatibilityResult {
  readonly allowed: boolean;
  readonly code?: BetBuilderBlockCode;
  readonly reason?: string;
  readonly conflictingLegId?: string;
}

export interface BetBuilderCompatibilityOptions {
  /** Máximo de piernas por partido en Bet Builder (por defecto `6`). */
  readonly maxLegsPerGame?: number;
  /** Permite o bloquea múltiples piernas del mismo partido (`true` por defecto en Bet Builder). */
  readonly allowSameGame?: boolean;
  /** Permite incluir partidos `LIVE` (`false` por defecto: solo pre-partido). */
  readonly allowLive?: boolean;
}

export interface BetBuilderPairCorrelation {
  readonly legAId: string;
  readonly legBId: string;
  readonly gameId: string;
  readonly rho: number;
  readonly direction: "positively_correlated" | "negatively_correlated" | "near_independent";
  readonly explanation: string;
}

export type BetBuilderWarningCode =
  | "high_positive_correlation"
  | "negative_correlation"
  | "unconfirmed_lineup"
  | "longshot_leg"
  | "high_leg_count"
  | "extreme_difficulty"
  | "excessive_sgp_hold";

export interface BetBuilderWarning {
  readonly code: BetBuilderWarningCode;
  readonly severity: "info" | "warning" | "high";
  readonly message: string;
}

export interface BetBuilderEvaluation {
  readonly legsCount: number;
  readonly gamesCount: number;
  readonly hasSgp: boolean;
  readonly sgpGamesCount: number;
  readonly independentProbability: number;
  readonly jointProbability: number;
  readonly correlationMultiplier: number;
  readonly correlationDirection:
    | "positively_correlated"
    | "negatively_correlated"
    | "near_independent";
  readonly fairCombinedDecimal: number;
  readonly fairCombinedAmerican: number;
  readonly offeredBookDecimal: number | null;
  readonly evPct: number | null;
  readonly effectiveHoldPct: number | null;
  readonly valueLabel: string | null;
  readonly pairAudits: readonly BetBuilderPairCorrelation[];
  readonly warnings: readonly BetBuilderWarning[];
}

// 12 nodos/pesos de cuadratura de Gauss-Legendre en [-1, 1] (precisión < 1e-10 para Φ₂).
const GL12_HALF_NODES = [
  0.1252334085114689,
  0.3678314989981802,
  0.5873179542866175,
  0.7699026741943047,
  0.9041172563704749,
  0.9815606342467192,
] as const;

const GL12_HALF_WEIGHTS = [
  0.2491470458134028,
  0.2334925365383548,
  0.2031674267230659,
  0.1600783285433462,
  0.1069393259953184,
  0.0471753363865118,
] as const;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

/** Inversa exacta de Φ por bisección en [-6, 6] (convergencia < 1e-12 en 54 pasos). */
function normalInvCdf(p: number): number {
  const safe = clamp(Number.isFinite(p) ? p : 0.5, 1e-6, 1 - 1e-6);
  let lo = -6;
  let hi = 6;
  for (let i = 0; i < 54; i += 1) {
    const mid = (lo + hi) * 0.5;
    if (normalCdf(mid) < safe) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

/**
 * Probabilidad conjunta normal bivariada `Φ₂(a, b; ρ)` vía cuadratura de Gauss-Legendre
 * de 12 puntos sobre la identidad de Plackett:
 * `Φ₂(a, b; ρ) = Φ(a)Φ(b) + (1 / 2π) ∫₀^ρ (1 / √(1-r²)) exp(-(a² - 2abr + b²) / (2(1-r²))) dr`.
 */
export function bivariateNormalJointProb(pA: number, pB: number, rho: number): number {
  const a = clamp(Number.isFinite(pA) ? pA : 0.5, 0.001, 0.999);
  const b = clamp(Number.isFinite(pB) ? pB : 0.5, 0.001, 0.999);
  const rClamped = clamp(Number.isFinite(rho) ? rho : 0, -0.92, 0.92);
  if (Math.abs(rClamped) < 1e-6) return a * b;

  const zA = normalInvCdf(a);
  const zB = normalInvCdf(b);
  const halfRho = rClamped * 0.5;
  let integral = 0;

  for (let i = 0; i < GL12_HALF_NODES.length; i += 1) {
    const node = GL12_HALF_NODES[i]!;
    const weight = GL12_HALF_WEIGHTS[i]!;
    for (const sign of [-1, 1] as const) {
      const r = halfRho * (sign * node + 1);
      const oneMinusR2 = Math.max(1e-9, 1 - r * r);
      const exponent = -(zA * zA - 2 * zA * zB * r + zB * zB) / (2 * oneMinusR2);
      integral += weight * (Math.exp(exponent) / Math.sqrt(oneMinusR2));
    }
  }

  const joint = a * b + (halfRho * integral) / (2 * Math.PI);
  const frechetLo = Math.max(0.0001, a + b - 1);
  const frechetHi = Math.min(a, b);
  return clamp(Number.isFinite(joint) ? joint : a * b, frechetLo, frechetHi);
}

/** Convierte un `CatalogPickItem` en entrada directa para el motor de Bet Builder. */
export function catalogPickToBetBuilderLeg(item: CatalogPickItem): BetBuilderLegInput {
  return {
    id: item.id,
    gameId: item.gameId,
    sport: item.sport,
    gameStatus: item.gameStatus,
    family: item.family,
    axis: item.axis,
    selectionKey: item.selectionKey,
    label: item.label,
    line: item.line,
    direction: item.direction,
    p: item.pricing.p,
    marketDecimal: item.pricing.marketDecimal,
    isRedacted: item.isRedacted,
    playerKey: item.playerMeta ? (item.playerMeta.playerSlug ?? item.playerMeta.playerName) : null,
    playerTeamSide: item.playerMeta?.teamSide ?? null,
    playerStatKey: item.playerMeta?.statKey ?? null,
    lineupStatus: item.playerMeta?.lineupStatus ?? null,
  };
}

/** Adapta un `MatchPick` clásico de PitchLab para interoperar con el motor de Bet Builder. */
export function matchPickToBetBuilderLeg(
  pick: MatchPick,
  sport: PlatformSport = "football",
): BetBuilderLegInput {
  const m = (pick.market ?? "").toLowerCase();
  const s = pick.selectionKey.toLowerCase();
  const l = pick.label.toLowerCase();

  let axis: PickAxisKey = "result_ft";
  let family: BetBuilderLegInput["family"] = "other";
  let direction: PickDirection = "combo";

  if (m === "correct_score" || l.includes("marcador exacto")) {
    axis = "exact_score";
    family = "correct_score";
  } else if (m.includes("btts") || l.includes("ambos anotan")) {
    axis = "btts";
    family = "btts";
    direction = s.includes("no") || l.includes("no") ? "no" : "yes";
  } else if (m.includes("corner")) {
    axis = s.startsWith("home") ? "corners_home" : s.startsWith("away") ? "corners_away" : "corners_total";
    family = axis === "corners_total" ? "corners_total" : "corners_team";
    direction = s.includes("under") || l.includes("menos") ? "under" : "over";
  } else if (m.includes("yellow") || m.includes("card") || l.includes("tarjeta")) {
    axis = "cards_total";
    family = "cards_total";
    direction = s.includes("under") || l.includes("menos") ? "under" : "over";
  } else if (m.includes("foul") || l.includes("falta")) {
    axis = "fouls_total";
    family = "fouls_total";
    direction = s.includes("under") || l.includes("menos") ? "under" : "over";
  } else if (m.includes("sot") || l.includes("a puerta")) {
    axis = "sot_total";
    family = "shots_on_target";
    direction = s.includes("under") || l.includes("menos") ? "under" : "over";
  } else if (m.includes("shot") || l.includes("remate")) {
    axis = "shots_total";
    family = "shots_total";
    direction = s.includes("under") || l.includes("menos") ? "under" : "over";
  } else if (m === "team_totals" || m.startsWith("team_goals")) {
    axis = s.startsWith("away") ? "team_goals_away" : "team_goals_home";
    family = "team_totals";
    direction = s.includes("under") || l.includes("menos") ? "under" : "over";
  } else if (m.includes("total") || l.includes("más de") || l.includes("menos de")) {
    axis =
      sport === "basketball" || sport === "american-football"
        ? "points_total"
        : sport === "baseball"
          ? "runs_total"
          : "goals_total";
    family =
      sport === "basketball"
        ? "nba_totals"
        : sport === "baseball"
          ? "mlb_totals"
          : sport === "ice-hockey"
            ? "nhl_totals"
            : sport === "american-football"
              ? "nfl_totals"
              : "totals";
    direction = s.includes("under") || l.includes("menos") ? "under" : "over";
  } else if (m.includes("spread") || m.includes("handicap") || m.includes("puck") || m.includes("run_line")) {
    axis = "handicap";
    family =
      sport === "basketball"
        ? "nba_spread"
        : sport === "baseball"
          ? "mlb_run_line"
          : sport === "ice-hockey"
            ? "nhl_puck_line"
            : sport === "american-football"
              ? "nfl_spread"
              : "asian_handicap";
    direction = s.startsWith("away") ? "away" : "home";
  } else {
    axis = "result_ft";
    family =
      m === "double_chance"
        ? "double_chance"
        : m === "dnb" || m === "draw_no_bet"
          ? "dnb"
          : sport === "football"
            ? "1x2"
            : sport === "basketball"
              ? "nba_moneyline"
              : sport === "baseball"
                ? "mlb_moneyline"
                : sport === "ice-hockey"
                  ? "nhl_moneyline"
                  : "nfl_moneyline";
    direction =
      s === "draw" || s === "x"
        ? "draw"
        : s.includes("away") || s === "2" || s === "x2"
          ? "away"
          : "home";
  }

  return {
    id: pick.id,
    gameId: pick.gameId,
    sport,
    gameStatus: pick.gameStatus,
    family,
    axis,
    selectionKey: pick.selectionKey,
    label: pick.label,
    line: typeof pick.line === "number" && Number.isFinite(pick.line) ? pick.line : null,
    direction,
    p: pick.p,
    marketDecimal: pick.marketDecimal,
    isRedacted: pick.isRedacted,
  };
}

function isResultOrHandicapAxis(axis: PickAxisKey): boolean {
  return axis === "result_ft" || axis === "handicap";
}

function isTotalScoreAxis(axis: PickAxisKey): boolean {
  return axis === "goals_total" || axis === "points_total" || axis === "runs_total";
}

function legRequiresHomeWin(leg: BetBuilderLegInput): boolean {
  const s = leg.selectionKey.toLowerCase();
  if (leg.family === "double_chance" && (s === "1x" || s === "12")) return false;
  if (
    leg.family === "1x2" ||
    leg.family === "dnb" ||
    leg.family === "win_to_nil" ||
    leg.family === "nba_moneyline" ||
    leg.family === "mlb_moneyline" ||
    leg.family === "nhl_moneyline" ||
    leg.family === "nfl_moneyline"
  ) {
    return s === "home" || s === "1" || s === "dnb_home" || s === "home_yes";
  }
  if (leg.family === "combo_1x2_over" || leg.family === "combo_1x2_btts") {
    return s.startsWith("home");
  }
  if (
    (leg.family === "asian_handicap" ||
      leg.family === "nba_spread" ||
      leg.family === "nfl_spread" ||
      leg.family === "mlb_run_line" ||
      leg.family === "nhl_puck_line") &&
    s.startsWith("home") &&
    leg.line !== null &&
    Number.isFinite(leg.line) &&
    leg.line < 0
  ) {
    return true;
  }
  return false;
}

function legRequiresAwayWin(leg: BetBuilderLegInput): boolean {
  const s = leg.selectionKey.toLowerCase();
  if (leg.family === "double_chance" && (s === "x2" || s === "12")) return false;
  if (
    leg.family === "1x2" ||
    leg.family === "dnb" ||
    leg.family === "win_to_nil" ||
    leg.family === "nba_moneyline" ||
    leg.family === "mlb_moneyline" ||
    leg.family === "nhl_moneyline" ||
    leg.family === "nfl_moneyline"
  ) {
    return s === "away" || s === "2" || s === "dnb_away" || s === "away_yes";
  }
  if (leg.family === "combo_1x2_over" || leg.family === "combo_1x2_btts") {
    return s.startsWith("away");
  }
  if (
    (leg.family === "asian_handicap" ||
      leg.family === "nba_spread" ||
      leg.family === "nfl_spread" ||
      leg.family === "mlb_run_line" ||
      leg.family === "nhl_puck_line") &&
    s.startsWith("away") &&
    leg.line !== null &&
    Number.isFinite(leg.line) &&
    leg.line < 0
  ) {
    return true;
  }
  return false;
}

function legIsStrictDraw(leg: BetBuilderLegInput): boolean {
  const s = leg.selectionKey.toLowerCase();
  return (
    (leg.family === "1x2" && (s === "draw" || s === "x")) ||
    ((leg.family === "combo_1x2_over" || leg.family === "combo_1x2_btts") && s.startsWith("draw"))
  );
}

const FOOTBALL_FEASIBILITY_MAX_GOALS = 15;

function minIntForOver(line: number): number {
  return Math.floor(line) + 1;
}

function maxIntForUnder(line: number): number {
  return Number.isInteger(line) ? line - 1 : Math.floor(line);
}

/**
 * Construye el predicado exacto de marcador final `(h, a)` en fútbol para una pierna SGP,
 * o `null` si la pierna no restringe el marcador de goles (p. ej. córners, tarjetas, tiros).
 */
function buildFootballScoreConstraint(
  leg: BetBuilderLegInput,
): ((h: number, a: number) => boolean) | null {
  if (leg.sport !== "football") return null;
  const s = leg.selectionKey.toLowerCase();
  const validLine =
    typeof leg.line === "number" && Number.isFinite(leg.line) ? leg.line : null;

  if (leg.family === "double_chance") {
    if (s === "1x" || s === "home_or_draw") return (h, a) => h >= a;
    if (s === "x2" || s === "away_or_draw") return (h, a) => a >= h;
    if (s === "12" || s === "home_or_away") return (h, a) => h !== a;
    return null;
  }

  if (leg.family === "dnb") {
    if (s === "home" || s === "dnb_home") return (h, a) => h > a;
    if (s === "away" || s === "dnb_away") return (h, a) => a > h;
    if (leg.direction === "home") return (h, a) => h > a;
    if (leg.direction === "away") return (h, a) => a > h;
    return null;
  }

  if (leg.family === "win_to_nil" || leg.axis === "win_to_nil") {
    if (s === "home" || s === "home_yes") return (h, a) => h > 0 && a === 0;
    if (s === "away" || s === "away_yes") return (h, a) => a > 0 && h === 0;
    if (leg.direction === "home") return (h, a) => h > 0 && a === 0;
    if (leg.direction === "away") return (h, a) => a > 0 && h === 0;
    return null;
  }

  if (leg.family === "combo_1x2_over" || leg.axis === "combo_result_goals") {
    if (validLine === null || validLine > FOOTBALL_FEASIBILITY_MAX_GOALS * 2) return null;
    const resPred: ((h: number, a: number) => boolean) | null = s.startsWith("home")
      ? (h, a) => h > a
      : s.startsWith("away")
        ? (h, a) => a > h
        : s.startsWith("draw")
          ? (h, a) => h === a
          : s.startsWith("1x")
            ? (h, a) => h >= a
            : s.startsWith("x2")
              ? (h, a) => a >= h
              : null;
    if (!resPred) return null;
    if (s.includes("over")) return (h, a) => resPred(h, a) && h + a > validLine;
    if (s.includes("under")) return (h, a) => resPred(h, a) && h + a < validLine;
    return null;
  }

  if (leg.family === "combo_1x2_btts" || leg.axis === "combo_result_btts") {
    const resPred: ((h: number, a: number) => boolean) | null = s.startsWith("home")
      ? (h, a) => h > a
      : s.startsWith("away")
        ? (h, a) => a > h
        : s.startsWith("draw")
          ? (h, a) => h === a
          : null;
    if (!resPred) return null;
    if (s.includes("btts_yes") || s.endsWith("_yes")) {
      return (h, a) => resPred(h, a) && h > 0 && a > 0;
    }
    if (s.includes("btts_no") || s.endsWith("_no")) {
      return (h, a) => resPred(h, a) && (h === 0 || a === 0);
    }
    return null;
  }

  if (leg.family === "btts" || leg.axis === "btts") {
    if (s === "yes" || s === "btts_yes") return (h, a) => h > 0 && a > 0;
    if (s === "no" || s === "btts_no") return (h, a) => h === 0 || a === 0;
    if (leg.direction === "yes") return (h, a) => h > 0 && a > 0;
    if (leg.direction === "no") return (h, a) => h === 0 || a === 0;
    return null;
  }

  if (leg.family === "totals" || leg.axis === "goals_total") {
    if (validLine === null || validLine > FOOTBALL_FEASIBILITY_MAX_GOALS * 2) return null;
    if (s.includes("over")) return (h, a) => h + a > validLine;
    if (s.includes("under")) return (h, a) => h + a < validLine;
    if (leg.direction === "over") return (h, a) => h + a > validLine;
    if (leg.direction === "under") return (h, a) => h + a < validLine;
    return null;
  }

  if (
    leg.axis === "team_goals_home" ||
    (leg.family === "team_totals" && s.startsWith("home"))
  ) {
    if (validLine === null || validLine > FOOTBALL_FEASIBILITY_MAX_GOALS) return null;
    if (s.includes("over")) return (h) => h > validLine;
    if (s.includes("under")) return (h) => h < validLine;
    if (leg.direction === "over") return (h) => h > validLine;
    if (leg.direction === "under") return (h) => h < validLine;
    return null;
  }

  if (
    leg.axis === "team_goals_away" ||
    (leg.family === "team_totals" && s.startsWith("away"))
  ) {
    if (validLine === null || validLine > FOOTBALL_FEASIBILITY_MAX_GOALS) return null;
    if (s.includes("over")) return (_h, a) => a > validLine;
    if (s.includes("under")) return (_h, a) => a < validLine;
    if (leg.direction === "over") return (_h, a) => a > validLine;
    if (leg.direction === "under") return (_h, a) => a < validLine;
    return null;
  }

  if (
    leg.axis === "clean_sheet_home" ||
    (leg.family === "clean_sheet" && s.startsWith("home"))
  ) {
    if (s === "home_yes" || s === "yes") return (_h, a) => a === 0;
    if (s === "home_no" || s === "no") return (_h, a) => a > 0;
    if (leg.direction === "yes") return (_h, a) => a === 0;
    if (leg.direction === "no") return (_h, a) => a > 0;
    return null;
  }

  if (
    leg.axis === "clean_sheet_away" ||
    (leg.family === "clean_sheet" && s.startsWith("away"))
  ) {
    if (s === "away_yes" || s === "yes") return (h) => h === 0;
    if (s === "away_no" || s === "no") return (h) => h > 0;
    if (leg.direction === "yes") return (h) => h === 0;
    if (leg.direction === "no") return (h) => h > 0;
    return null;
  }

  if (
    leg.family === "asian_handicap" ||
    (leg.axis === "handicap" && leg.family === "other")
  ) {
    if (validLine === null || Math.abs(validLine) > FOOTBALL_FEASIBILITY_MAX_GOALS) return null;
    if (s.startsWith("home")) return (h, a) => h + validLine > a;
    if (s.startsWith("away")) return (h, a) => a + validLine > h;
    if (leg.direction === "home") return (h, a) => h + validLine > a;
    if (leg.direction === "away") return (h, a) => a + validLine > h;
    return null;
  }

  if (leg.family === "1x2" || (leg.axis === "result_ft" && leg.family === "other")) {
    if (s === "home" || s === "1") return (h, a) => h > a;
    if (s === "away" || s === "2") return (h, a) => a > h;
    if (s === "draw" || s === "x") return (h, a) => h === a;
    if (leg.direction === "home") return (h, a) => h > a;
    if (leg.direction === "away") return (h, a) => a > h;
    if (leg.direction === "draw") return (h, a) => h === a;
    return null;
  }

  if (leg.axis === "result_ht" || leg.axis === "result_2h") {
    if (s.includes("draw")) return null;
    if (s.includes("home")) return (h) => h >= 1;
    if (s.includes("away")) return (_h, a) => a >= 1;
    if (leg.direction === "home") return (h) => h >= 1;
    if (leg.direction === "away") return (_h, a) => a >= 1;
    return null;
  }

  if (
    leg.axis === "player_prop" &&
    leg.playerStatKey === "goal_or_assist" &&
    leg.direction === "over"
  ) {
    const minGoals = validLine !== null ? Math.max(1, minIntForOver(validLine)) : 1;
    if (minGoals > FOOTBALL_FEASIBILITY_MAX_GOALS) return null;
    if (leg.playerTeamSide === "home") return (h) => h >= minGoals;
    if (leg.playerTeamSide === "away") return (_h, a) => a >= minGoals;
    return (h, a) => h + a >= minGoals;
  }

  return null;
}

/**
 * Verifica exhaustivamente si existe al menos un marcador entero `(h, a)` en `[0..15]×[0..15]`
 * que satisfaga simultáneamente todas las restricciones de goles de la cesta de fútbol.
 */
function hasFeasibleFootballScore(legs: readonly BetBuilderLegInput[]): boolean {
  const constraints: Array<(h: number, a: number) => boolean> = [];
  for (const leg of legs) {
    const pred = buildFootballScoreConstraint(leg);
    if (pred) constraints.push(pred);
  }
  if (constraints.length < 2) return true;

  for (let h = 0; h <= FOOTBALL_FEASIBILITY_MAX_GOALS; h += 1) {
    for (let a = 0; a <= FOOTBALL_FEASIBILITY_MAX_GOALS; a += 1) {
      let ok = true;
      for (let i = 0; i < constraints.length; i += 1) {
        if (!constraints[i]!(h, a)) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
  }
  return false;
}

/**
 * Comprueba la compatibilidad explícita entre dos piernas del MISMO partido.
 */
export function checkBetBuilderPairCompatibility(
  a: BetBuilderLegInput,
  b: BetBuilderLegInput,
): BetBuilderCompatibilityResult {
  if (a.gameId !== b.gameId) return { allowed: true };

  if (
    a.id === b.id ||
    (a.family === b.family &&
      a.selectionKey.toLowerCase() === b.selectionKey.toLowerCase() &&
      a.line === b.line)
  ) {
    return {
      allowed: false,
      code: "duplicate",
      reason: `Selección duplicada en el boleto («${b.label}»).`,
      conflictingLegId: a.id,
    };
  }

  if (a.axis === "exact_score" || b.axis === "exact_score") {
    return {
      allowed: false,
      code: "exact_score_lock",
      reason:
        "El marcador exacto fija ganador, totales y ambos anotan; no puede combinarse en SGP.",
      conflictingLegId: a.id,
    };
  }

  // 1) Mismo eje redundante u opuesto (excepto props de jugadores distintos o métricas distintas)
  if (a.axis === b.axis) {
    if (a.axis === "player_prop") {
      const samePlayer =
        Boolean(a.playerKey && b.playerKey) &&
        a.playerKey!.toLowerCase() === b.playerKey!.toLowerCase();
      if (samePlayer && a.playerStatKey === b.playerStatKey) {
        return {
          allowed: false,
          code: "same_axis_redundant",
          reason: `No se pueden combinar dos líneas de la misma estadística para el mismo jugador («${a.label}» y «${b.label}»).`,
          conflictingLegId: a.id,
        };
      }
    } else {
      return {
        allowed: false,
        code: "same_axis_redundant",
        reason: `Selecciones del mismo eje en el mismo partido («${a.label}» y «${b.label}» son redundantes o mutuamente excluyentes).`,
        conflictingLegId: a.id,
      };
    }
  }

  // 2) Resultado 1X2 / Ganador + Hándicap / Spread / Run Line / Puck Line en mismo partido
  if (isResultOrHandicapAxis(a.axis) && isResultOrHandicapAxis(b.axis)) {
    return {
      allowed: false,
      code: "same_axis_redundant",
      reason: `No se combinan ganador y hándicap/spread del mismo partido («${a.label}» y «${b.label}» comparten el eje de resultado).`,
      conflictingLegId: a.id,
    };
  }

  // 3) Combinadas y Win-to-Nil subsumen sus mercados base
  const pair: [BetBuilderLegInput, BetBuilderLegInput] = [a, b];
  const comboOver = pair.find((x) => x.axis === "combo_result_goals");
  const comboBtts = pair.find((x) => x.axis === "combo_result_btts");
  const winToNil = pair.find((x) => x.axis === "win_to_nil");

  if (comboOver) {
    const other = comboOver === a ? b : a;
    if (
      isResultOrHandicapAxis(other.axis) ||
      isTotalScoreAxis(other.axis) ||
      other.axis === "combo_result_btts" ||
      other.axis === "win_to_nil"
    ) {
      return {
        allowed: false,
        code: "same_axis_redundant",
        reason: `«${comboOver.label}» ya integra resultado y total de goles; choca o duplica «${other.label}».`,
        conflictingLegId: a.id,
      };
    }
  }

  if (comboBtts) {
    const other = comboBtts === a ? b : a;
    if (
      isResultOrHandicapAxis(other.axis) ||
      other.axis === "btts" ||
      other.axis === "clean_sheet_home" ||
      other.axis === "clean_sheet_away" ||
      other.axis === "win_to_nil"
    ) {
      return {
        allowed: false,
        code: "same_axis_redundant",
        reason: `«${comboBtts.label}» ya fija resultado y ambos anotan; es incompatible con «${other.label}».`,
        conflictingLegId: a.id,
      };
    }
  }

  if (winToNil) {
    const other = winToNil === a ? b : a;
    if (
      isResultOrHandicapAxis(other.axis) ||
      other.axis === "btts" ||
      other.axis === "clean_sheet_home" ||
      other.axis === "clean_sheet_away"
    ) {
      return {
        allowed: false,
        code: "same_axis_redundant",
        reason: `«${winToNil.label}» ya engloba victoria y portería a cero; no es combinable con «${other.label}».`,
        conflictingLegId: a.id,
      };
    }
  }

  // 4) Contradicciones lógicas cruzadas
  const bttsLeg = pair.find((x) => x.axis === "btts");
  const totalLeg = pair.find((x) => isTotalScoreAxis(x.axis));
  const homeTeamGoals = pair.find((x) => x.axis === "team_goals_home");
  const awayTeamGoals = pair.find((x) => x.axis === "team_goals_away");
  const cleanHome = pair.find((x) => x.axis === "clean_sheet_home");
  const cleanAway = pair.find((x) => x.axis === "clean_sheet_away");

  // 4a. BTTS Sí vs Menos de 0.5 / 1.5 goles totales o Menos de 0.5 goles de algún equipo
  if (bttsLeg && bttsLeg.direction === "yes") {
    if (totalLeg && totalLeg.direction === "under" && totalLeg.line !== null && totalLeg.line < 2) {
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: `Contradicción lógica: «${bttsLeg.label}» exige al menos 2 goles y choca con «${totalLeg.label}».`,
        conflictingLegId: a.id,
      };
    }
    if (
      (homeTeamGoals &&
        homeTeamGoals.direction === "under" &&
        homeTeamGoals.line !== null &&
        homeTeamGoals.line < 1) ||
      (awayTeamGoals &&
        awayTeamGoals.direction === "under" &&
        awayTeamGoals.line !== null &&
        awayTeamGoals.line < 1)
    ) {
      const culprit = homeTeamGoals ?? awayTeamGoals!;
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: `Contradicción lógica: «${bttsLeg.label}» exige que ambos anoten y choca con «${culprit.label}».`,
        conflictingLegId: a.id,
      };
    }
    if ((cleanHome && cleanHome.direction === "yes") || (cleanAway && cleanAway.direction === "yes")) {
      const cs = cleanHome?.direction === "yes" ? cleanHome : cleanAway!;
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: `Contradicción lógica: «${bttsLeg.label}» no puede cumplirse junto con «${cs.label}».`,
        conflictingLegId: a.id,
      };
    }
  }

  // 4b. Portería a cero vs Goles del rival / Ganador
  if (cleanHome) {
    if (
      cleanHome.direction === "yes" &&
      awayTeamGoals &&
      awayTeamGoals.direction === "over" &&
      awayTeamGoals.line !== null &&
      awayTeamGoals.line >= 0.5
    ) {
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: `Contradicción lógica: «${cleanHome.label}» exige 0 goles visitantes y choca con «${awayTeamGoals.label}».`,
        conflictingLegId: a.id,
      };
    }
    if (
      cleanHome.direction === "no" &&
      awayTeamGoals &&
      awayTeamGoals.direction === "under" &&
      awayTeamGoals.line !== null &&
      awayTeamGoals.line < 1
    ) {
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: `Contradicción lógica: «${cleanHome.label}» exige gol visitante y choca con «${awayTeamGoals.label}».`,
        conflictingLegId: a.id,
      };
    }
    const other = cleanHome === a ? b : a;
    if (cleanHome.direction === "yes" && legRequiresAwayWin(other)) {
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: `Contradicción lógica: el visitante no puede ganar («${other.label}») si el local deja su portería a cero («${cleanHome.label}»).`,
        conflictingLegId: a.id,
      };
    }
  }

  if (cleanAway) {
    if (
      cleanAway.direction === "yes" &&
      homeTeamGoals &&
      homeTeamGoals.direction === "over" &&
      homeTeamGoals.line !== null &&
      homeTeamGoals.line >= 0.5
    ) {
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: `Contradicción lógica: «${cleanAway.label}» exige 0 goles locales y choca con «${homeTeamGoals.label}».`,
        conflictingLegId: a.id,
      };
    }
    if (
      cleanAway.direction === "no" &&
      homeTeamGoals &&
      homeTeamGoals.direction === "under" &&
      homeTeamGoals.line !== null &&
      homeTeamGoals.line < 1
    ) {
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: `Contradicción lógica: «${cleanAway.label}» exige gol local y choca con «${homeTeamGoals.label}».`,
        conflictingLegId: a.id,
      };
    }
    const other = cleanAway === a ? b : a;
    if (cleanAway.direction === "yes" && legRequiresHomeWin(other)) {
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: `Contradicción lógica: el local no puede ganar («${other.label}») si el visitante deja su portería a cero («${cleanAway.label}»).`,
        conflictingLegId: a.id,
      };
    }
  }

  // 4c. Ganador obligatorio vs Under 0.5 goles totales o Under 0.5 de su propio equipo
  for (const [winnerLeg, otherLeg] of [
    [a, b],
    [b, a],
  ] as const) {
    const reqHome = legRequiresHomeWin(winnerLeg);
    const reqAway = legRequiresAwayWin(winnerLeg);
    if (!reqHome && !reqAway) continue;

    if (
      isTotalScoreAxis(otherLeg.axis) &&
      otherLeg.direction === "under" &&
      otherLeg.line !== null
    ) {
      if (otherLeg.line < 1) {
        return {
          allowed: false,
          code: "logical_contradiction",
          reason: `Contradicción lógica: «${winnerLeg.label}» exige al menos 1 gol y choca con «${otherLeg.label}» (0-0).`,
          conflictingLegId: a.id,
        };
      }
      if (
        (winnerLeg.family === "mlb_run_line" ||
          winnerLeg.family === "nhl_puck_line" ||
          winnerLeg.family === "asian_handicap" ||
          winnerLeg.family === "nba_spread" ||
          winnerLeg.family === "nfl_spread") &&
        winnerLeg.line !== null &&
        Number.isFinite(winnerLeg.line) &&
        winnerLeg.line < 0 &&
        otherLeg.line <= Math.abs(winnerLeg.line)
      ) {
        return {
          allowed: false,
          code: "logical_contradiction",
          reason: `Contradicción lógica: cubrir «${winnerLeg.label}» exige margen superior al total permitido por «${otherLeg.label}».`,
          conflictingLegId: a.id,
        };
      }
    }

    if (
      reqHome &&
      otherLeg.axis === "team_goals_home" &&
      otherLeg.direction === "under" &&
      otherLeg.line !== null &&
      otherLeg.line < 1
    ) {
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: `Contradicción lógica: el local no puede ganar («${winnerLeg.label}») anotando 0 goles («${otherLeg.label}»).`,
        conflictingLegId: a.id,
      };
    }
    if (
      reqAway &&
      otherLeg.axis === "team_goals_away" &&
      otherLeg.direction === "under" &&
      otherLeg.line !== null &&
      otherLeg.line < 1
    ) {
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: `Contradicción lógica: el visitante no puede ganar («${winnerLeg.label}») anotando 0 goles («${otherLeg.label}»).`,
        conflictingLegId: a.id,
      };
    }
  }

  // 4d. Remates a puerta Over X vs Remates totales Under Y (X >= Y es físicamente imposible)
  const sotLeg = pair.find((x) => x.axis === "sot_total");
  const shotsLeg = pair.find((x) => x.axis === "shots_total");
  if (
    sotLeg &&
    shotsLeg &&
    sotLeg.direction === "over" &&
    shotsLeg.direction === "under" &&
    sotLeg.line !== null &&
    shotsLeg.line !== null &&
    sotLeg.line >= shotsLeg.line
  ) {
    return {
      allowed: false,
      code: "logical_contradiction",
      reason: `Contradicción lógica: no puede haber más remates a puerta («${sotLeg.label}») que remates totales («${shotsLeg.label}»).`,
      conflictingLegId: a.id,
    };
  }

  // 4e. Player prop Gol/Asistencia vs 0-0 / Portería a cero del rival
  for (const [propLeg, otherLeg] of [
    [a, b],
    [b, a],
  ] as const) {
    if (propLeg.axis !== "player_prop" || propLeg.playerStatKey !== "goal_or_assist") continue;
    if (propLeg.direction !== "over") continue;
    if (
      otherLeg.axis === "goals_total" &&
      otherLeg.direction === "under" &&
      otherLeg.line !== null &&
      otherLeg.line < 1
    ) {
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: `Contradicción lógica: «${propLeg.label}» requiere un gol y choca con «${otherLeg.label}».`,
        conflictingLegId: a.id,
      };
    }
    if (
      propLeg.playerTeamSide === "home" &&
      ((otherLeg.axis === "clean_sheet_away" && otherLeg.direction === "yes") ||
        (otherLeg.axis === "team_goals_home" &&
          otherLeg.direction === "under" &&
          otherLeg.line !== null &&
          otherLeg.line < 1))
    ) {
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: `Contradicción lógica: «${propLeg.label}» requiere gol local y choca con «${otherLeg.label}».`,
        conflictingLegId: a.id,
      };
    }
    if (
      propLeg.playerTeamSide === "away" &&
      ((otherLeg.axis === "clean_sheet_home" && otherLeg.direction === "yes") ||
        (otherLeg.axis === "team_goals_away" &&
          otherLeg.direction === "under" &&
          otherLeg.line !== null &&
          otherLeg.line < 1))
    ) {
      return {
        allowed: false,
        code: "logical_contradiction",
        reason: `Contradicción lógica: «${propLeg.label}» requiere gol visitante y choca con «${otherLeg.label}».`,
        conflictingLegId: a.id,
      };
    }
  }

  // 4f. Córners por equipo Over X vs Córners totales Under Y (X >= Y es físicamente imposible)
  const teamCornersLeg = pair.find(
    (x) => x.axis === "corners_home" || x.axis === "corners_away",
  );
  const totalCornersLeg = pair.find((x) => x.axis === "corners_total");
  if (
    teamCornersLeg &&
    totalCornersLeg &&
    teamCornersLeg.direction === "over" &&
    totalCornersLeg.direction === "under" &&
    teamCornersLeg.line !== null &&
    totalCornersLeg.line !== null &&
    Number.isFinite(teamCornersLeg.line) &&
    Number.isFinite(totalCornersLeg.line) &&
    (teamCornersLeg.line >= totalCornersLeg.line ||
      minIntForOver(teamCornersLeg.line) > maxIntForUnder(totalCornersLeg.line))
  ) {
    return {
      allowed: false,
      code: "logical_contradiction",
      reason: `Contradicción lógica: los córners de un equipo («${teamCornersLeg.label}») no pueden superar el total de córners («${totalCornersLeg.label}»).`,
      conflictingLegId: a.id,
    };
  }

  // 4g. Validador exacto de factibilidad entera `(h, a)` en `[0..15]×[0..15]` para fútbol
  if (a.sport === "football" && b.sport === "football" && !hasFeasibleFootballScore([a, b])) {
    return {
      allowed: false,
      code: "logical_contradiction",
      reason: `Contradicción lógica: ningún marcador final satisface simultáneamente «${a.label}» y «${b.label}».`,
      conflictingLegId: a.id,
    };
  }

  return { allowed: true };
}

/**
 * Comprueba contradicciones multi-pierna dentro de un mismo partido (3+ selecciones):
 * - Empate + Ambos anotan No + Más de 0.5 goles (el único empate sin ambos anotan es 0-0).
 * - Local Más de 0.5 goles + Visita Más de 0.5 goles + Ambos anotan No.
 * - Cualquier cesta de fútbol sin marcador entero `(h, a)` factible en `[0..15]×[0..15]`.
 * - Córners Local Over X + Córners Visita Over Y + Córners Totales Under Z imposibles.
 */
function checkSameGameBasketContradiction(
  legs: readonly BetBuilderLegInput[],
): string | null {
  if (legs.length < 3) return null;
  const hasBttsNo = legs.some((l) => l.axis === "btts" && l.direction === "no");
  const hasDraw = legs.some((l) => legIsStrictDraw(l));
  const hasOverAnyGoal = legs.some(
    (l) => l.axis === "goals_total" && l.direction === "over" && l.line !== null && l.line >= 0.5,
  );
  if (hasDraw && hasBttsNo && hasOverAnyGoal) {
    return "Contradicción lógica multi-pierna: un empate con «Ambos anotan: No» solo puede acabar 0-0 y choca con «Más de goles».";
  }

  const homeScores = legs.some(
    (l) =>
      l.axis === "team_goals_home" && l.direction === "over" && l.line !== null && l.line >= 0.5,
  );
  const awayScores = legs.some(
    (l) =>
      l.axis === "team_goals_away" && l.direction === "over" && l.line !== null && l.line >= 0.5,
  );
  if (hasBttsNo && homeScores && awayScores) {
    return "Contradicción lógica multi-pierna: si ambos equipos anotan al menos 1 gol, «Ambos anotan: No» es imposible.";
  }

  const cornersHomeOver = legs.find(
    (l) =>
      l.axis === "corners_home" &&
      l.direction === "over" &&
      l.line !== null &&
      Number.isFinite(l.line),
  );
  const cornersAwayOver = legs.find(
    (l) =>
      l.axis === "corners_away" &&
      l.direction === "over" &&
      l.line !== null &&
      Number.isFinite(l.line),
  );
  const cornersTotalUnder = legs.find(
    (l) =>
      l.axis === "corners_total" &&
      l.direction === "under" &&
      l.line !== null &&
      Number.isFinite(l.line),
  );
  if (
    cornersHomeOver &&
    cornersAwayOver &&
    cornersTotalUnder &&
    minIntForOver(cornersHomeOver.line!) + minIntForOver(cornersAwayOver.line!) >
      maxIntForUnder(cornersTotalUnder.line!)
  ) {
    return "Contradicción lógica multi-pierna: la suma mínima de córners por equipo supera el máximo permitido en córners totales.";
  }

  if (legs.every((l) => l.sport === "football") && !hasFeasibleFootballScore(legs)) {
    return "Contradicción lógica multi-pierna: ningún marcador final satisface simultáneamente todas las selecciones combinadas del partido.";
  }

  return null;
}

/**
 * Valida si una pierna candidata puede añadirse a la cesta activa del Bet Builder / Parlay.
 */
export function checkBetBuilderCompatibility(
  existingLegs: readonly BetBuilderLegInput[],
  candidate: BetBuilderLegInput,
  options: BetBuilderCompatibilityOptions = {},
): BetBuilderCompatibilityResult {
  const allowSameGame = options.allowSameGame ?? true;
  const maxLegsPerGame = Math.max(1, options.maxLegsPerGame ?? 6);
  const allowLive = options.allowLive ?? false;

  if (candidate.isRedacted) {
    return {
      allowed: false,
      code: "redacted",
      reason: "Activa Pase PitchLab Ultra para combinar selecciones reservadas.",
    };
  }
  if (candidate.gameStatus === "FT") {
    return {
      allowed: false,
      code: "finished",
      reason: "Este partido ya finalizó; el Bet Builder solo combina partidos abiertos.",
    };
  }
  if (!allowLive && candidate.gameStatus === "LIVE") {
    return {
      allowed: false,
      code: "live",
      reason: "Este partido está en vivo; el armador pre-partido solo admite encuentros antes del inicio.",
    };
  }
  if (!Number.isFinite(candidate.p) || candidate.p <= 0.01 || candidate.p >= 0.99) {
    return {
      allowed: false,
      code: "invalid_prob",
      reason: "Esta selección tiene una probabilidad extrema o línea cerrada y no es combinable.",
    };
  }
  if (existingLegs.some((leg) => leg.id === candidate.id)) {
    return {
      allowed: false,
      code: "duplicate",
      reason: "Esta selección ya está en tu boleto.",
    };
  }

  const sameGame = existingLegs.filter((leg) => leg.gameId === candidate.gameId);
  if (!allowSameGame && sameGame.length >= 1) {
    return {
      allowed: false,
      code: "sgp_limit",
      reason: "Solo se permite 1 selección por partido cuando SGP está desactivado.",
      conflictingLegId: sameGame[0]?.id,
    };
  }
  if (allowSameGame && sameGame.length >= maxLegsPerGame) {
    return {
      allowed: false,
      code: "sgp_limit",
      reason: `Límite alcanzado: máximo ${maxLegsPerGame} selecciones compatibles del mismo partido.`,
    };
  }

  for (const leg of sameGame) {
    const pairCheck = checkBetBuilderPairCompatibility(leg, candidate);
    if (!pairCheck.allowed) return pairCheck;
  }

  const basketError = checkSameGameBasketContradiction([...sameGame, candidate]);
  if (basketError) {
    return {
      allowed: false,
      code: "multi_leg_contradiction",
      reason: basketError,
    };
  }

  return { allowed: true };
}

function directionSign(leg: BetBuilderLegInput): number {
  if (leg.direction === "under" || leg.direction === "no") return -1;
  return 1;
}

/**
 * Matriz empírica de correlación `ρ ∈ [-0.65, +0.65]` entre dos piernas compatibles
 * del mismo partido. Devuelve `0` para partidos distintos o ejes prácticamente ortogonales.
 */
export function getPairwiseCorrelationRho(
  a: BetBuilderLegInput,
  b: BetBuilderLegInput,
): { readonly rho: number; readonly explanation: string } {
  if (a.gameId !== b.gameId) {
    return { rho: 0, explanation: "Partidos independientes." };
  }

  const [x, y] = a.axis <= b.axis ? [a, b] : [b, a];
  const pairKey = `${x.axis}|${y.axis}`;

  // 1) Goles totales ↔ Ambos anotan / Goles por equipo (fuerte acoplamiento)
  if (pairKey === "btts|goals_total") {
    const sign = directionSign(x) * directionSign(y);
    const rho = 0.52 * sign;
    return {
      rho,
      explanation:
        rho > 0
          ? "Más goles totales y ambos anotan se refuerzan directamente."
          : "Goles totales y ambos anotan tiran en direcciones opuestas.",
    };
  }
  if (
    pairKey === "goals_total|team_goals_home" ||
    pairKey === "goals_total|team_goals_away"
  ) {
    const rho = 0.54 * directionSign(x) * directionSign(y);
    return {
      rho,
      explanation:
        rho > 0
          ? "Los goles de un equipo forman parte directa del total del partido."
          : "Goles de un equipo y total del partido apuntan en direcciones opuestas.",
    };
  }
  if (pairKey === "btts|team_goals_home" || pairKey === "btts|team_goals_away") {
    const rho = 0.42 * directionSign(x) * directionSign(y);
    return {
      rho,
      explanation:
        rho > 0
          ? "La producción goleadora de un equipo refuerza que ambos equipos anoten."
          : "Goles de equipo y ambos anotan apuntan en sentidos opuestos.",
    };
  }

  // 2) Resultado / Hándicap ↔ Goles / Puntos / Carreras totales
  if (
    (isResultOrHandicapAxis(x.axis) && isTotalScoreAxis(y.axis)) ||
    (isTotalScoreAxis(x.axis) && isResultOrHandicapAxis(y.axis))
  ) {
    const resLeg = isResultOrHandicapAxis(x.axis) ? x : y;
    const totLeg = isTotalScoreAxis(x.axis) ? x : y;
    const totSign = directionSign(totLeg);
    if (legIsStrictDraw(resLeg)) {
      const rho = -0.26 * totSign;
      return {
        rho,
        explanation:
          rho > 0
            ? "Los empates se concentran en marcadores cerrados (0-0 / 1-1)."
            : "Un empate con línea alta de goles exige marcadores 2-2 o superiores.",
      };
    }
    const baseRho =
      resLeg.family === "nhl_puck_line"
        ? 0.26
        : resLeg.family === "mlb_run_line"
          ? 0.22
          : resLeg.family === "nfl_spread"
            ? 0.14
            : resLeg.family === "nba_spread"
              ? 0.06
              : 0.16;
    const rho = baseRho * totSign;
    return {
      rho,
      explanation:
        rho > 0
          ? "La victoria/cobertura de un equipo correlaciona positivamente con un marcador más abierto."
          : "Ganar con un total bajo limita el margen de anotación permitido.",
    };
  }

  // 3) Resultado ↔ Ambos anotan
  if (pairKey === "btts|result_ft") {
    const resLeg = x.axis === "result_ft" ? x : y;
    const bttsLeg = x.axis === "btts" ? x : y;
    const bSign = directionSign(bttsLeg);
    if (legIsStrictDraw(resLeg)) {
      return {
        rho: 0.14 * bSign,
        explanation: "Empates 1-1 concentran gran parte de la masa de ambos anotan.",
      };
    }
    return {
      rho: -0.08 * bSign,
      explanation: "Dependencia moderada entre ganador en tiempo reglamentario y ambos anotan.",
    };
  }

  // 4) Resultado ↔ Goles por equipo / Portería a cero
  if (
    (x.axis === "result_ft" && (y.axis === "team_goals_home" || y.axis === "team_goals_away")) ||
    ((x.axis === "team_goals_home" || x.axis === "team_goals_away") && y.axis === "result_ft")
  ) {
    const resLeg = x.axis === "result_ft" ? x : y;
    const teamLeg = resLeg === x ? y : x;
    const sameSide =
      (teamLeg.axis === "team_goals_home" && legRequiresHomeWin(resLeg)) ||
      (teamLeg.axis === "team_goals_away" && legRequiresAwayWin(resLeg));
    const oppSide =
      (teamLeg.axis === "team_goals_home" && legRequiresAwayWin(resLeg)) ||
      (teamLeg.axis === "team_goals_away" && legRequiresHomeWin(resLeg));
    const tSign = directionSign(teamLeg);
    if (sameSide) {
      return {
        rho: 0.56 * tSign,
        explanation: "Ganar el partido depende estrechamente de la producción goleadora propia.",
      };
    }
    if (oppSide) {
      return {
        rho: -0.4 * tSign,
        explanation: "Si el rival anota múltiples goles, disminuye la probabilidad de victoria.",
      };
    }
    return { rho: 0.08 * tSign, explanation: "Acoplamiento leve entre resultado y goles por equipo." };
  }

  if (
    (x.axis === "result_ft" && (y.axis === "clean_sheet_home" || y.axis === "clean_sheet_away")) ||
    ((x.axis === "clean_sheet_home" || x.axis === "clean_sheet_away") && y.axis === "result_ft")
  ) {
    const resLeg = x.axis === "result_ft" ? x : y;
    const csLeg = resLeg === x ? y : x;
    const sameSide =
      (csLeg.axis === "clean_sheet_home" && legRequiresHomeWin(resLeg)) ||
      (csLeg.axis === "clean_sheet_away" && legRequiresAwayWin(resLeg));
    const csSign = directionSign(csLeg);
    return {
      rho: (sameSide ? 0.44 : -0.32) * csSign,
      explanation: "Dejar la portería a cero está fuertemente ligado al resultado final.",
    };
  }

  // 5) Mitades (1T / 2T) ↔ Resultado final
  if (
    pairKey === "result_ft|result_ht" ||
    pairKey === "result_2h|result_ft"
  ) {
    const sameDir = x.direction === y.direction;
    const mag = pairKey === "result_ft|result_ht" ? 0.48 : 0.42;
    return {
      rho: sameDir ? mag : -mag * 0.65,
      explanation: "El desempeño en una mitad explica directamente el resultado de 90 minutos.",
    };
  }

  // 6) MLB F5 ↔ Moneyline completo
  if (pairKey === "result_f5|result_ft") {
    const sameDir = x.direction === y.direction;
    return {
      rho: sameDir ? 0.62 : -0.48,
      explanation: "Liderar tras las primeras 5 entradas (F5) correlaciona fuertemente con ganar el juego.",
    };
  }
  if (pairKey === "f5_totals|runs_total") {
    return {
      rho: 0.6 * directionSign(x) * directionSign(y),
      explanation: "Las carreras de las primeras 5 entradas forman parte directa del total del juego.",
    };
  }

  // 7) Tiros, tiros a puerta, córners y goles
  if (pairKey === "shots_total|sot_total") {
    return {
      rho: 0.58 * directionSign(x) * directionSign(y),
      explanation: "Los remates a puerta son un subconjunto directo de los remates totales.",
    };
  }
  if (pairKey === "goals_total|sot_total") {
    return {
      rho: 0.44 * directionSign(x) * directionSign(y),
      explanation: "Más remates a puerta elevan directamente los goles esperados del encuentro.",
    };
  }
  if (pairKey === "goals_total|shots_total") {
    return {
      rho: 0.34 * directionSign(x) * directionSign(y),
      explanation: "Mayor volumen de remates impulsa el total de goles.",
    };
  }
  if (pairKey === "corners_total|shots_total" || pairKey === "corners_total|sot_total") {
    return {
      rho: 0.36 * directionSign(x) * directionSign(y),
      explanation: "La presión ofensiva y remates bloqueados generan más tiros de esquina.",
    };
  }
  if (
    pairKey === "corners_home|corners_total" ||
    pairKey === "corners_away|corners_total"
  ) {
    return {
      rho: 0.56 * directionSign(x) * directionSign(y),
      explanation: "Los córners de un equipo son componente directo del total del partido.",
    };
  }
  if (pairKey === "corners_away|corners_home") {
    return {
      rho: -0.14 * directionSign(x) * directionSign(y),
      explanation: "El dominio territorial de un equipo suele reducir levemente los córners del rival.",
    };
  }

  // 8) Faltas ↔ Tarjetas (acoplamiento arbitral directo)
  if (pairKey === "cards_total|fouls_total") {
    return {
      rho: 0.46 * directionSign(x) * directionSign(y),
      explanation: "Mayor volumen de faltas y rigor arbitral elevan las tarjetas del encuentro.",
    };
  }

  // 9) Player Props ↔ Partido / Otros Props
  if (x.axis === "player_prop" || y.axis === "player_prop") {
    if (x.axis === "player_prop" && y.axis === "player_prop") {
      const samePlayer =
        Boolean(x.playerKey && y.playerKey) &&
        x.playerKey!.toLowerCase() === y.playerKey!.toLowerCase();
      if (samePlayer) {
        const sPair = [x.playerStatKey ?? "", y.playerStatKey ?? ""].sort().join("|");
        if (sPair === "shots|shots_on_target" || sPair === "3PM|PTS") {
          return {
            rho: 0.52 * directionSign(x) * directionSign(y),
            explanation: "Ambas métricas del mismo jugador dependen directamente entre sí.",
          };
        }
        if (sPair === "cards|fouls") {
          return {
            rho: 0.42 * directionSign(x) * directionSign(y),
            explanation: "Las faltas cometidas elevan directamente el riesgo de amonestación.",
          };
        }
        if (sPair === "goal_or_assist|shots" || sPair === "goal_or_assist|shots_on_target") {
          return {
            rho: 0.44 * directionSign(x) * directionSign(y),
            explanation: "El volumen de remates del jugador impulsa su probabilidad de gol/asistencia.",
          };
        }
        return {
          rho: 0.22 * directionSign(x) * directionSign(y),
          explanation: "Exposición compartida por minutos jugados del mismo futbolista/jugador.",
        };
      }
      const sameTeam = x.playerTeamSide !== null && x.playerTeamSide === y.playerTeamSide;
      return {
        rho: (sameTeam ? 0.1 : 0.04) * directionSign(x) * directionSign(y),
        explanation: sameTeam
          ? "Ritmo ofensivo compartido dentro del mismo equipo."
          : "Acoplamiento leve por ritmo general del encuentro.",
      };
    }

    const propLeg = x.axis === "player_prop" ? x : y;
    const matchLeg = propLeg === x ? y : x;
    const pSign = directionSign(propLeg);
    const mSign = directionSign(matchLeg);

    if (
      (propLeg.playerStatKey === "PTS" ||
        propLeg.playerStatKey === "AST" ||
        propLeg.playerStatKey === "3PM") &&
      matchLeg.axis === "points_total"
    ) {
      return {
        rho: 0.28 * pSign * mSign,
        explanation: "Un partido de mayor ritmo/puntos favorece la producción ofensiva del jugador.",
      };
    }
    if (
      (propLeg.playerStatKey === "shots" ||
        propLeg.playerStatKey === "shots_on_target" ||
        propLeg.playerStatKey === "goal_or_assist") &&
      (matchLeg.axis === "goals_total" ||
        matchLeg.axis === "shots_total" ||
        matchLeg.axis === "sot_total")
    ) {
      return {
        rho: 0.32 * pSign * mSign,
        explanation: "El volumen de ataque del partido acopla la producción individual del jugador.",
      };
    }
    if (
      (propLeg.playerStatKey === "fouls" || propLeg.playerStatKey === "cards") &&
      (matchLeg.axis === "fouls_total" || matchLeg.axis === "cards_total")
    ) {
      return {
        rho: 0.34 * pSign * mSign,
        explanation: "El rigor arbitral y la fricción del partido impulsan faltas y tarjetas individuales.",
      };
    }
    if (
      matchLeg.axis === "result_ft" &&
      propLeg.playerTeamSide !== null &&
      (propLeg.playerStatKey === "goal_or_assist" || propLeg.playerStatKey === "shots_on_target")
    ) {
      const aligned =
        (propLeg.playerTeamSide === "home" && legRequiresHomeWin(matchLeg)) ||
        (propLeg.playerTeamSide === "away" && legRequiresAwayWin(matchLeg));
      if (aligned) {
        return {
          rho: 0.36 * pSign,
          explanation: "La producción goleadora del jugador refuerza la victoria de su equipo.",
        };
      }
    }
  }

  return { rho: 0, explanation: "Selecciones prácticamente independientes dentro del partido." };
}

/**
 * Evalúa un boleto Bet Builder / Parlay completo (1..N selecciones, mismo partido o multi-partido):
 * calcula probabilidad independiente, probabilidad conjunta ajustada por correlación SGP
 * (Cópula Gaussiana acotada por Fréchet-Hoeffding), momio justo, auditoría de margen y advertencias.
 */
export function evaluateBetBuilder(
  legs: readonly BetBuilderLegInput[],
  options: { readonly offeredBookDecimal?: number | null } = {},
): BetBuilderEvaluation {
  if (legs.length === 0) {
    return {
      legsCount: 0,
      gamesCount: 0,
      hasSgp: false,
      sgpGamesCount: 0,
      independentProbability: 0,
      jointProbability: 0,
      correlationMultiplier: 1,
      correlationDirection: "near_independent",
      fairCombinedDecimal: 1,
      fairCombinedAmerican: 100,
      offeredBookDecimal: null,
      evPct: null,
      effectiveHoldPct: null,
      valueLabel: null,
      pairAudits: [],
      warnings: [],
    };
  }

  const byGame = new Map<string, BetBuilderLegInput[]>();
  const sanitizedLegs: BetBuilderLegInput[] = [];
  let independentProbability = 1;
  for (const leg of legs) {
    const p = clamp(Number.isFinite(leg.p) ? leg.p : 0.5, 0.01, 0.99);
    const sanitizedLeg: BetBuilderLegInput = { ...leg, p };
    sanitizedLegs.push(sanitizedLeg);
    independentProbability *= p;
    const list = byGame.get(leg.gameId) ?? [];
    list.push(sanitizedLeg);
    byGame.set(leg.gameId, list);
  }

  let sgpGamesCount = 0;
  let jointProbability = 1;
  const pairAudits: BetBuilderPairCorrelation[] = [];

  for (const [gameId, gameLegs] of byGame.entries()) {
    if (gameLegs.length === 1) {
      jointProbability *= gameLegs[0]!.p;
      continue;
    }

    sgpGamesCount += 1;
    const k = gameLegs.length;
    const gameIndep = gameLegs.reduce((acc, l) => acc * l.p, 1);

    if (k === 2) {
      const a = gameLegs[0]!;
      const b = gameLegs[1]!;
      const { rho, explanation } = getPairwiseCorrelationRho(a, b);
      const pairJoint = bivariateNormalJointProb(a.p, b.p, rho);
      jointProbability *= pairJoint;
      pairAudits.push({
        legAId: a.id,
        legBId: b.id,
        gameId,
        rho: round2(rho),
        direction:
          rho >= 0.08
            ? "positively_correlated"
            : rho <= -0.08
              ? "negatively_correlated"
              : "near_independent",
        explanation,
      });
    } else {
      // Para k >= 3 piernas en mismo partido: composición suavizada por pares acotada por Fréchet-Hoeffding.
      let logMultiplierSum = 0;
      const damping = 2 / k;
      for (let i = 0; i < k; i += 1) {
        for (let j = i + 1; j < k; j += 1) {
          const a = gameLegs[i]!;
          const b = gameLegs[j]!;
          const { rho, explanation } = getPairwiseCorrelationRho(a, b);
          const pairJoint = bivariateNormalJointProb(a.p, b.p, rho);
          const ratio = pairJoint / Math.max(1e-9, a.p * b.p);
          logMultiplierSum += Math.log(Math.max(0.05, ratio)) * damping;
          pairAudits.push({
            legAId: a.id,
            legBId: b.id,
            gameId,
            rho: round2(rho),
            direction:
              rho >= 0.08
                ? "positively_correlated"
                : rho <= -0.08
                  ? "negatively_correlated"
                  : "near_independent",
            explanation,
          });
        }
      }
      const sumP = gameLegs.reduce((acc, l) => acc + l.p, 0);
      const minP = gameLegs.reduce((acc, l) => Math.min(acc, l.p), 1);
      const frechetLo = Math.max(0.0001, sumP - (k - 1));
      const adjusted = clamp(gameIndep * Math.exp(logMultiplierSum), frechetLo, minP);
      jointProbability *= adjusted;
    }
  }

  independentProbability = clamp(
    Number.isFinite(independentProbability) ? independentProbability : 0.0001,
    0.0001,
    0.99,
  );
  jointProbability = clamp(
    Number.isFinite(jointProbability) ? jointProbability : independentProbability,
    0.0001,
    0.99,
  );
  const correlationMultiplier = round4(jointProbability / independentProbability);
  const correlationDirection: BetBuilderEvaluation["correlationDirection"] =
    sgpGamesCount === 0
      ? "near_independent"
      : correlationMultiplier >= 1.03
        ? "positively_correlated"
        : correlationMultiplier <= 0.97
          ? "negatively_correlated"
          : "near_independent";

  const fairCombinedDecimal = Math.max(1.01, round2(1 / jointProbability));
  const fairCombinedAmerican = decimalToAmericanInt(fairCombinedDecimal);

  const offeredBookDecimal =
    typeof options.offeredBookDecimal === "number" &&
    Number.isFinite(options.offeredBookDecimal) &&
    options.offeredBookDecimal >= 1.01
      ? round2(options.offeredBookDecimal)
      : null;
  const evPct =
    offeredBookDecimal !== null
      ? round1((jointProbability * offeredBookDecimal - 1) * 100)
      : null;
  const effectiveHoldPct =
    offeredBookDecimal !== null
      ? round1((1 / offeredBookDecimal - jointProbability) * 100)
      : null;
  const valueLabel = evPct !== null && evPct > 0 ? `Valor +${evPct.toFixed(1)} %` : null;

  const warnings: BetBuilderWarning[] = [];

  if (pairAudits.some((p) => p.rho >= 0.35)) {
    warnings.push({
      code: "high_positive_correlation",
      severity: "warning",
      message:
        "Alta correlación positiva en el mismo partido: las casas suelen descontar fuertemente la cuota SGP; compara siempre contra el momio justo ajustado.",
    });
  }
  if (pairAudits.some((p) => p.rho <= -0.2)) {
    warnings.push({
      code: "negative_correlation",
      severity: "warning",
      message:
        "Correlación negativa detectada: algunas selecciones del mismo partido se restan probabilidad entre sí.",
    });
  }
  const unconfirmedProp = sanitizedLegs.find(
    (l) => l.axis === "player_prop" && l.lineupStatus !== "confirmed",
  );
  if (unconfirmedProp) {
    warnings.push({
      code: "unconfirmed_lineup",
      severity: "info",
      message: `Alineación aún no confirmada oficialmente para «${unconfirmedProp.label}».`,
    });
  }
  const weakest = sanitizedLegs.reduce((min, l) => (l.p < min.p ? l : min), sanitizedLegs[0]!);
  if (weakest.p < 0.35) {
    warnings.push({
      code: "longshot_leg",
      severity: "warning",
      message: `Incluye selección exigente («${weakest.label}», ${(weakest.p * 100).toFixed(1)} %), lo que eleva la varianza del boleto.`,
    });
  }
  if (legs.length >= 5) {
    warnings.push({
      code: "high_leg_count",
      severity: "warning",
      message: `Con ${legs.length} selecciones basta 1 fallo para perder todo el boleto.`,
    });
  }
  if (jointProbability < 0.05 && legs.length >= 2) {
    warnings.push({
      code: "extreme_difficulty",
      severity: "high",
      message: `Probabilidad conjunta muy baja (${(jointProbability * 100).toFixed(2)} % · ~1 de cada ${Math.round(1 / jointProbability)} veces).`,
    });
  }
  if (effectiveHoldPct !== null && effectiveHoldPct > 15) {
    warnings.push({
      code: "excessive_sgp_hold",
      severity: "high",
      message: `Margen oculto SGP elevado (${effectiveHoldPct.toFixed(1)} pts contra el momio justo calibrado).`,
    });
  }

  return {
    legsCount: legs.length,
    gamesCount: byGame.size,
    hasSgp: sgpGamesCount > 0,
    sgpGamesCount,
    independentProbability: round4(independentProbability),
    jointProbability: round4(jointProbability),
    correlationMultiplier,
    correlationDirection,
    fairCombinedDecimal,
    fairCombinedAmerican,
    offeredBookDecimal,
    evPct,
    effectiveHoldPct,
    valueLabel,
    pairAudits,
    warnings,
  };
}
