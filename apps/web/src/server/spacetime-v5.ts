import {
  COMPETITION_BY_ID,
  parseStrictFiniteNumber,
  type LiveInPlayWinProb,
} from "@pitchlab/contracts";
import { probabilityToFairOdds } from "@pitchlab/spacetime";
import {
  buildMatchEpistemicSummaryV5,
  buildVerifiedMatchFactSheet,
  compileDeterministicVerifiedSummaryEs,
  evaluateNflInPlayState,
  evaluateSoccerEarlyPayoutAndInPlay,
  projectSoccerPlayerPropOutlookV5,
  validateMatchMathematicalInvariants,
  validateNarrativeAgainstFactSheet,
  type EpistemicConformalArtifactV51,
  type EpistemicProbabilityBandV5,
  type HierarchicalPropsModelArtifactV5,
  type InPlayEarlyPayoutArtifactV5,
  type KnockoutLegTypeV5,
  type LineupStatusV36,
  type SgpLegInput,
  type SoccerMicroMetricKey,
  type SoccerPlayerPropInputV4,
  type SoccerPositionCluster,
  type SoccerPropFamilyV4,
  type UnitProbability as SpacetimeUnitProbability,
} from "@pitchlab/spacetime/v5";
import clubGoalsArtifactJson from "@pitchlab/spacetime/data/model_club_goals_v5_0_candidate.json";
import epistemicArtifactJson from "@pitchlab/spacetime/data/model_epistemic_conformal_v5_1_candidate.json";
import hierarchicalPropsArtifactJson from "@pitchlab/spacetime/data/model_hierarchical_props_v5_0_candidate.json";
import inplayArtifactJson from "@pitchlab/spacetime/data/model_inplay_early_payout_v5_0_candidate.json";
import intlGoalsArtifactJson from "@pitchlab/spacetime/data/model_intl_goals_v5_0_candidate.json";
import type {
  EarlyPayoutSummaryView,
  EpistemicBandView,
  MatchIntelligenceV5View,
  MatchOutlookSummary,
  MicroCountsV5View,
  PlatformGame,
  PlatformMarketRow,
  SgpCopulaAuditView,
} from "@pitchlab/ui/types";
import {
  evaluateNflMatchServerV6,
  evaluatePlayerLinkedSgpV6,
  evaluateSgpCopulaV6,
  evaluateSoccer57V6Match,
  evaluateUsMultisportV6Match,
  resolveOfficialPriorByDivV6,
} from "./spacetime-v6";

export type {
  KnockoutLegTypeV5,
  LineupStatusV36,
  SoccerPlayerPropInputV4,
  SoccerPositionCluster,
  SoccerPropFamilyV4,
  SpacetimeUnitProbability,
};

function toArtifactStatus(raw: string): "candidate" | "production" {
  return raw === "production" ? "production" : "candidate";
}

const epistemicArtifact: EpistemicConformalArtifactV51 = {
  schema_version: epistemicArtifactJson.schema_version,
  status: toArtifactStatus(epistemicArtifactJson.status),
  production_activated: epistemicArtifactJson.production_activated,
  holdout_cut_utc: epistemicArtifactJson.holdout_cut_utc,
  holdout_sealed_untouched: epistemicArtifactJson.holdout_sealed_untouched,
  sports: {
    soccer: epistemicArtifactJson.sports.soccer,
    nfl: epistemicArtifactJson.sports.nfl,
    multisport: epistemicArtifactJson.sports.multisport,
  },
};

const inplayWeights = inplayArtifactJson.soccer.minute_bucket_weights_6;
const inplayArtifact: InPlayEarlyPayoutArtifactV5 = {
  ...inplayArtifactJson,
  status: toArtifactStatus(inplayArtifactJson.status),
  soccer: {
    ...inplayArtifactJson.soccer,
    minute_bucket_weights_6: [
      inplayWeights[0] ?? 0.126799,
      inplayWeights[1] ?? 0.143104,
      inplayWeights[2] ?? 0.167323,
      inplayWeights[3] ?? 0.164121,
      inplayWeights[4] ?? 0.169973,
      inplayWeights[5] ?? 0.22868,
    ],
  },
  points_sports_early_payout: {
    nfl: { ...inplayArtifactJson.points_sports_early_payout.nfl, trigger_lead: 17 },
    nba: { ...inplayArtifactJson.points_sports_early_payout.nba, trigger_lead: 20 },
    mlb: { ...inplayArtifactJson.points_sports_early_payout.mlb, trigger_lead: 5 },
  },
};

const hierarchicalPropsArtifact: HierarchicalPropsModelArtifactV5 = {
  ...hierarchicalPropsArtifactJson,
  status: toArtifactStatus(hierarchicalPropsArtifactJson.status),
};

const INTERNATIONAL_LEAGUE_IDS = new Set<string>([
  "concacaf-nations",
  "uefa-nations",
  "amistosos",
  "copa-del-mundo",
  "eliminatorias",
  "copa-america",
  "eurocopa",
  "copa-oro",
  "copa-africana",
  "copa-asiatica",
]);

const NFL_INDOOR_TEAM_CODES = new Set<string>([
  "ARI",
  "ATL",
  "DAL",
  "DET",
  "HOU",
  "IND",
  "LA",
  "LAC",
  "LAR",
  "LV",
  "MIN",
  "NO",
]);

const NFL_TURF_TEAM_CODES = new Set<string>([
  "ATL",
  "BUF",
  "CAR",
  "CIN",
  "DAL",
  "DET",
  "HOU",
  "IND",
  "LA",
  "LAC",
  "LAR",
  "MIN",
  "NE",
  "NO",
  "NYG",
  "NYJ",
  "SEA",
  "TEN",
]);

const NFL_INDOOR_VENUE_RE =
  /\b(?:ford field|u\.?s\.?\s*bank|superdome|mercedes-benz stadium|lucas oil|at&t stadium|sofi stadium|allegiant|state farm stadium|nrg stadium|dome|indoor|techado|domo|retractable)\b/i;

const NFL_TURF_VENUE_RE =
  /\b(?:ford field|u\.?s\.?\s*bank|superdome|mercedes-benz stadium|lucas oil|at&t stadium|sofi stadium|nrg stadium|metlife|highmark|gillette|paycor|lumen field|bank of america|nissan stadium|turf|fieldturf|artificial|sint[eé]tic[oa]|matrix)\b/i;

const NFL_NATURAL_GRASS_RE =
  /\b(?:natural grass|grass|pasto natural|c[eé]sped natural|hierba natural)\b/i;

const SPREAD_MARKET_KEYS = new Set<string>(["spread", "spreads", "point_spread", "nfl_spread"]);
const TOTAL_MARKET_KEYS = new Set<string>(["totals", "total", "over_under", "nfl_totals"]);

export const LEAGUE_TO_V5_DIV: Readonly<Record<string, string>> = {
  "premier-league": "E0",
  championship: "E1",
  "fa-cup": "E0",
  "carabao-cup": "E0",
  laliga: "SP1",
  "la-liga": "SP1",
  "segunda-espana": "SP2",
  "copa-del-rey": "SP1",
  "liga-f": "SP1",
  bundesliga: "D1",
  "bundesliga-2": "D2",
  "dfb-pokal": "D1",
  "serie-a": "I1",
  "serie-b": "I2",
  "coppa-italia": "I1",
  "ligue-1": "F1",
  "ligue-2": "F2",
  "coupe-de-france": "F1",
  eredivisie: "N1",
  "liga-portugal": "P1",
  "pro-league-belgica": "B1",
  "super-lig": "T1",
  "liga-mx": "MEX",
  mls: "USA",
  "concacaf-champions": "MEX",
  "leagues-cup": "USA",
  brasileirao: "BRA",
  "brasileirao-b": "BRA",
  "copa-do-brasil": "BRA",
  "liga-argentina": "ARG",
  libertadores: "BRA",
  sudamericana: "ARG",
  "primera-a-colombia": "ARG",
  "copa-colombia": "ARG",
  "primera-chile": "ARG",
  "ligapro-ecuador": "ARG",
  "liga-1-peru": "ARG",
  "j1-league": "JPN",
  "saudi-pro-league": "T1",
  "champions-league": "E0",
  "europa-league": "E0",
  "conference-league": "N1",
  "uefa-super-cup": "E0",
  "caf-champions": "T1",
};

export interface SoccerGoalsCalibrationParamsV5 {
  readonly scope: "club" | "international";
  readonly rhoPrior: number;
  readonly dispersionR: number;
  readonly rhoDrawBlendWeight: number;
}

export function resolveSoccerGoalsParamsV5(league: string): SoccerGoalsCalibrationParamsV5 {
  const isInternational =
    INTERNATIONAL_LEAGUE_IDS.has(league) ||
    COMPETITION_BY_ID[league]?.region === "national-teams";
  if (isInternational) {
    return {
      scope: "international",
      rhoPrior: intlGoalsArtifactJson.default_rho,
      dispersionR: intlGoalsArtifactJson.dispersion_r,
      rhoDrawBlendWeight: intlGoalsArtifactJson.rho_draw_blend_weight,
    };
  }
  return {
    scope: "club",
    rhoPrior: clubGoalsArtifactJson.default_rho,
    dispersionR: clubGoalsArtifactJson.dispersion_r,
    rhoDrawBlendWeight: clubGoalsArtifactJson.rho_draw_blend_weight,
  };
}

export interface NflMarketContextV5 {
  readonly marketSpreadHome: number | null;
  readonly marketTotalLine: number | null;
  readonly isIndoor: boolean;
  readonly isTurf: boolean;
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function formatSignedLine(line: number): string {
  const clean = normalizeZero(round1(line));
  return clean > 0 ? `+${clean}` : `${clean}`;
}

function parseSpreadFromRow(row: PlatformMarketRow): number | null {
  if (!SPREAD_MARKET_KEYS.has(row.market.trim().toLowerCase())) {
    return null;
  }
  const sel = row.selection.trim().toLowerCase();
  const isHome = sel === "home" || sel.startsWith("home_") || sel.startsWith("home ");
  const isAway = sel === "away" || sel.startsWith("away_") || sel.startsWith("away ");
  if (!isHome && !isAway) return null;

  let rawLine = parseStrictFiniteNumber(row.line);
  if (rawLine === null) {
    const match = /^(?:home|away)[_\s]([+-]?\d+(?:\.\d+)?)$/.exec(sel);
    if (match?.[1]) {
      rawLine = parseStrictFiniteNumber(match[1]);
    }
  }
  if (rawLine === null || Math.abs(rawLine) > 35) return null;
  return normalizeZero(isHome ? rawLine : -rawLine);
}

function parseTotalFromRow(row: PlatformMarketRow): number | null {
  if (!TOTAL_MARKET_KEYS.has(row.market.trim().toLowerCase())) {
    return null;
  }
  const sel = row.selection.trim().toLowerCase();
  const isTotalSel =
    sel === "over" ||
    sel === "under" ||
    sel.startsWith("over_") ||
    sel.startsWith("under_") ||
    sel.startsWith("over ") ||
    sel.startsWith("under ");
  if (!isTotalSel) return null;

  let rawLine = parseStrictFiniteNumber(row.line);
  if (rawLine === null) {
    const match = /^(?:over|under)[_\s](\d+(?:\.\d+)?)$/.exec(sel);
    if (match?.[1]) {
      rawLine = parseStrictFiniteNumber(match[1]);
    }
  }
  if (rawLine === null || rawLine < 20 || rawLine > 85) return null;
  return rawLine;
}

function pickPrioritizedLine(
  rows: readonly PlatformMarketRow[],
  extractor: (row: PlatformMarketRow) => number | null,
): number | null {
  let fallbackLine: number | null = null;
  for (const row of rows) {
    if (row.isDerived === true) continue;
    const parsed = extractor(row);
    if (parsed === null) continue;
    if (
      typeof row.currentDecimal === "number" &&
      Number.isFinite(row.currentDecimal) &&
      row.currentDecimal > 1
    ) {
      return parsed;
    }
    if (fallbackLine === null) {
      fallbackLine = parsed;
    }
  }
  return fallbackLine;
}

export function extractNflMarketContextV5(
  game: PlatformGame,
  existingMarkets: readonly PlatformMarketRow[] = [],
): NflMarketContextV5 {
  const combinedRows: PlatformMarketRow[] = [...existingMarkets, ...(game.markets ?? [])];
  const marketSpreadHome = pickPrioritizedLine(combinedRows, parseSpreadFromRow);
  const marketTotalLine = pickPrioritizedLine(combinedRows, parseTotalFromRow);

  const venue = game.venue ?? "";
  const pitchCondition = game.preGame?.matchContext?.pitchCondition ?? "";
  const weatherDesc = game.preGame?.matchContext?.weather?.description ?? "";
  const envText = `${venue} ${pitchCondition} ${weatherDesc}`.trim();
  const homeCode = game.home.code.trim().toUpperCase();

  const isIndoor =
    NFL_INDOOR_VENUE_RE.test(envText) ||
    (!game.neutralSite && NFL_INDOOR_TEAM_CODES.has(homeCode));

  let isTurf = false;
  if (NFL_NATURAL_GRASS_RE.test(pitchCondition)) {
    isTurf = false;
  } else if (NFL_TURF_VENUE_RE.test(envText)) {
    isTurf = true;
  } else if (!game.neutralSite && NFL_TURF_TEAM_CODES.has(homeCode)) {
    isTurf = true;
  }

  return {
    marketSpreadHome,
    marketTotalLine,
    isIndoor,
    isTurf,
  };
}

function clampProb(p: number): number {
  return Math.max(0.001, Math.min(0.999, p));
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function toBandView(band: EpistemicProbabilityBandV5): EpistemicBandView {
  return {
    pPoint: round4(band.pPoint),
    pLower90: round4(band.pLower90),
    pUpper90: round4(band.pUpper90),
    halfWidth90: round4(band.halfWidth90),
    conservativeFairDecimal: round2(band.conservativeFairOddsFromLower90.decimal),
    grade:
      band.confidenceGrade === "high_sample_stability"
        ? "high"
        : band.confidenceGrade === "moderate_uncertainty"
          ? "moderate"
          : "elevated",
  };
}

export interface ResolvedRefereePriorV5 {
  readonly key: string;
  readonly name: string;
  readonly games: number;
  readonly cardsMultiplier: number;
  readonly foulsMultiplier: number;
  readonly redsMultiplier: number;
}

const refereePriorMemo = new Map<string, ResolvedRefereePriorV5 | null>();
const MAX_REFEREE_MEMO = 500;

export function resolveRefereePriorV5(
  refereeName: string | null | undefined,
  div?: string | null,
): ResolvedRefereePriorV5 | null {
  if (!refereeName || !refereeName.trim()) return null;
  const memoKey = `${refereeName.trim().toLowerCase()}|${div ?? ""}`;
  if (refereePriorMemo.has(memoKey)) return refereePriorMemo.get(memoKey) ?? null;

  const v6Prior = resolveOfficialPriorByDivV6(refereeName, div);
  const resolved: ResolvedRefereePriorV5 | null = v6Prior.matchedV51Key
    ? {
        key: v6Prior.matchedV51Key,
        name: refereeName.trim(),
        games: v6Prior.historicalGames,
        cardsMultiplier: round4(v6Prior.yellowMult),
        foulsMultiplier: round4(v6Prior.foulsMult),
        redsMultiplier: round4(v6Prior.redMult),
      }
    : null;

  if (refereePriorMemo.size >= MAX_REFEREE_MEMO) {
    const oldest = refereePriorMemo.keys().next().value;
    if (oldest !== undefined) refereePriorMemo.delete(oldest);
  }
  refereePriorMemo.set(memoKey, resolved);
  return resolved;
}

function makeV5Row(input: {
  readonly group: string;
  readonly market: string;
  readonly selection: string;
  readonly label: string;
  readonly line?: number | null;
  readonly p: number;
  readonly fairDecimal: number;
  readonly fairAmerican: number;
  readonly cardCategory: NonNullable<PlatformMarketRow["cardCategory"]>;
  readonly cardTitle: string;
  readonly isMostLikely: boolean;
}): PlatformMarketRow {
  return {
    group: input.group,
    market: input.market,
    selection: input.selection,
    label: input.label,
    ...(input.line !== undefined ? { line: input.line } : {}),
    p: round4(input.p),
    fairDecimal: round2(input.fairDecimal),
    fairAmerican: Math.round(input.fairAmerican),
    openDecimal: null,
    currentDecimal: null,
    quoteBookLabel: null,
    quoteCapturedAtUtc: null,
    edgePts: null,
    isDerived: true,
    cardCategory: input.cardCategory,
    cardTitle: input.cardTitle,
    isMostLikely: input.isMostLikely,
  };
}

const v5DetailCache = new Map<string, MatchDetailV5Result | null>();
const MAX_V5_DETAIL_CACHE = 400;

function setV5DetailCache(key: string, value: MatchDetailV5Result | null): MatchDetailV5Result | null {
  if (v5DetailCache.size >= MAX_V5_DETAIL_CACHE) {
    const oldest = v5DetailCache.keys().next().value;
    if (oldest !== undefined) v5DetailCache.delete(oldest);
  }
  v5DetailCache.set(key, value);
  return value;
}

export interface MatchDetailV5Result {
  readonly v5: MatchIntelligenceV5View;
  readonly extraMarkets: PlatformMarketRow[];
  readonly fallbackOutlook: MatchOutlookSummary | null;
}

export function buildMatchDetailV5(
  game: PlatformGame,
  options: {
    readonly hasV32Outlook?: boolean;
    readonly existingMarkets?: readonly PlatformMarketRow[];
  } = {},
): MatchDetailV5Result | null {
  if (game.status === "FT" || game.hasForecast === false || !game.x12) {
    return null;
  }

  const existing = options.existingMarkets ?? [];
  const existingSig = existing
    .map((r) => `${r.market}:${r.selection}:${r.line ?? ""}:${r.currentDecimal ?? ""}`)
    .join(",");
  const gameMarketsSig = (game.markets ?? [])
    .map((r) => `${r.market}:${r.selection}:${r.line ?? ""}:${r.currentDecimal ?? ""}`)
    .join(",");
  const cacheKey = [
    game.id,
    game.league,
    game.x12.join(","),
    game.projection ? `${game.projection.home},${game.projection.away},${game.projection.total}` : "",
    game.venue ?? "",
    game.neutralSite ? "1" : "0",
    game.referee ?? game.preGame?.matchContext?.referee ?? "",
    game.preGame?.matchContext?.pitchCondition ?? "",
    game.preGame?.matchContext?.weather?.description ?? "",
    game.preGame?.absences?.length ?? 0,
    options.hasV32Outlook ? "1" : "0",
    existingSig,
    gameMarketsSig,
  ].join("|");
  if (v5DetailCache.has(cacheKey)) {
    return v5DetailCache.get(cacheKey) ?? null;
  }

  return setV5DetailCache(cacheKey, buildMatchDetailV5Uncached(game, options));
}

function buildMatchDetailV5Uncached(
  game: PlatformGame,
  options: {
    readonly hasV32Outlook?: boolean;
    readonly existingMarkets?: readonly PlatformMarketRow[];
  },
): MatchDetailV5Result | null {
  if (game.status === "FT" || game.hasForecast === false || !game.x12) {
    return null;
  }

  const existing = options.existingMarkets ?? [];
  const existingKeys = new Set(existing.map((r) => `${r.market}:${r.selection}:${r.line ?? ""}`));
  const hasMarketPrefix = (prefix: string) => existing.some((r) => r.market.startsWith(prefix));
  const pushUnique = (target: PlatformMarketRow[], row: PlatformMarketRow) => {
    const k = `${row.market}:${row.selection}:${row.line ?? ""}`;
    if (!existingKeys.has(k)) {
      existingKeys.add(k);
      target.push(row);
    }
  };

  if (game.sport === "football") {
    const [rawH, rawD, rawA] = game.x12;
    const sum = rawH + rawD + rawA;
    if (!Number.isFinite(sum) || sum <= 0) return null;
    const pHome = clampProb(rawH / sum);
    const pDraw = clampProb(rawD / sum);
    const pAway = clampProb(rawA / sum);

    const totalGoals = Math.max(1.2, Math.min(4.8, game.projection?.total ?? 2.65));
    const refereeName = game.referee ?? game.preGame?.matchContext?.referee ?? null;
    const refPrior = resolveRefereePriorV5(refereeName, String(game.league));

    const socEval = evaluateSoccer57V6Match({
      matchId: game.id,
      league: String(game.league),
      homeTeam: game.home.name,
      awayTeam: game.away.name,
      pHome,
      pDraw,
      pAway,
      projectedHomeGoals: game.projection?.home ?? null,
      projectedAwayGoals: game.projection?.away ?? null,
      totalGoalsTarget: totalGoals,
      refereeName,
      mode: "matrix_4param",
    });

    const coreX12 = socEval.markets["1x2"];
    const micro = socEval.microMarkets;
    const ep = socEval.earlyPayout2Goals;

    const absencesCount = game.preGame?.absences?.filter((a) => a.status === "Baja").length ?? 0;
    const epistemic = buildMatchEpistemicSummaryV5({
      pHome: coreX12.home,
      pDraw: coreX12.draw,
      pAway: coreX12.away,
      effectiveSampleGames: Math.max(10, 26 - Math.min(10, absencesCount * 2)),
      seasonProgress: 0.55,
      sport: "soccer",
      calibrationArtifact: epistemicArtifact,
    });

    const facts = buildVerifiedMatchFactSheet({
      matchId: game.id,
      sport: "soccer",
      homeTeam: game.home.name,
      awayTeam: game.away.name,
      pHome: coreX12.home,
      pDraw: coreX12.draw,
      pAway: coreX12.away,
      expectedTotal: socEval.expectedTotalImplied,
      canonicalTotalLine: 2.5,
      pOverCanonical: socEval.markets.totals_2_5.over,
    });
    const verifiedSummaryEs = compileDeterministicVerifiedSummaryEs(facts);
    const guardrailPassed =
      validateNarrativeAgainstFactSheet(verifiedSummaryEs, facts).passed &&
      validateMatchMathematicalInvariants({
        pHome: coreX12.home,
        pDraw: coreX12.draw,
        pAway: coreX12.away,
        pHomeEarlyPayoutWin: ep.pHomeEarlyPayoutWin,
        pAwayEarlyPayoutWin: ep.pAwayEarlyPayoutWin,
        epistemicBands: [
          { label: "home", ...epistemic.homeBand90 },
          { label: "away", ...epistemic.awayBand90 },
        ],
      }).passed;

    const extraMarkets: PlatformMarketRow[] = [];
    const microPairs: ReadonlyArray<{
      readonly key: SoccerMicroMetricKey;
      readonly market: string;
      readonly title: string;
      readonly unit: string;
    }> = [
      { key: "corners", market: "corners_total", title: "Córners totales", unit: "córners" },
      { key: "yellow_cards", market: "yellow_total", title: "Tarjetas amarillas", unit: "amarillas" },
      { key: "fouls", market: "fouls_total", title: "Faltas totales", unit: "faltas" },
      { key: "shots_on_target", market: "sot_total", title: "Remates a puerta", unit: "remates a puerta" },
      { key: "shots", market: "shots_total", title: "Remates totales", unit: "remates" },
    ];

    for (const spec of microPairs) {
      const mOut = micro.metrics[spec.key];
      const canonical = mOut.totalLines[Math.floor(mOut.totalLines.length / 2)] ?? mOut.totalLines[0];
      if (!canonical) continue;
      const pOver = canonical.pOverConditionalNoPush;
      const pUnder = canonical.pUnderConditionalNoPush;
      const cardTitle = `${spec.title} (${canonical.line})`;
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: spec.title,
          market: spec.market,
          selection: "over",
          label: `Más de ${canonical.line} ${spec.unit}`,
          line: canonical.line,
          p: pOver,
          fairDecimal: canonical.fairOddsOver.decimal,
          fairAmerican: canonical.fairOddsOver.american,
          cardCategory: "conteos",
          cardTitle,
          isMostLikely: pOver >= pUnder,
        }),
      );
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: spec.title,
          market: spec.market,
          selection: "under",
          label: `Menos de ${canonical.line} ${spec.unit}`,
          line: canonical.line,
          p: pUnder,
          fairDecimal: canonical.fairOddsUnder.decimal,
          fairAmerican: canonical.fairOddsUnder.american,
          cardCategory: "conteos",
          cardTitle,
          isMostLikely: pUnder > pOver,
        }),
      );
    }

    pushUnique(
      extraMarkets,
      makeV5Row({
        group: "Tarjeta roja en el partido",
        market: "red_cards",
        selection: "yes",
        label: "Habrá tarjeta roja (Más de 0.5)",
        line: 0.5,
        p: micro.redCards.pRedCardMatch,
        fairDecimal: micro.redCards.fairOddsRedCardMatch.decimal,
        fairAmerican: micro.redCards.fairOddsRedCardMatch.american,
        cardCategory: "conteos",
        cardTitle: "Tarjeta roja en el partido",
        isMostLikely: micro.redCards.pRedCardMatch >= micro.redCards.pNoRedCardMatch,
      }),
    );
    pushUnique(
      extraMarkets,
      makeV5Row({
        group: "Tarjeta roja en el partido",
        market: "red_cards",
        selection: "no",
        label: "Sin tarjeta roja (Menos de 0.5)",
        line: 0.5,
        p: micro.redCards.pNoRedCardMatch,
        fairDecimal: micro.redCards.fairOddsNoRedCardMatch.decimal,
        fairAmerican: micro.redCards.fairOddsNoRedCardMatch.american,
        cardCategory: "conteos",
        cardTitle: "Tarjeta roja en el partido",
        isMostLikely: micro.redCards.pNoRedCardMatch > micro.redCards.pRedCardMatch,
      }),
    );

    const bpLine =
      micro.bookingPoints.lines.find((l) => Math.abs(l.line - 45.5) < 0.01) ??
      micro.bookingPoints.lines[0];
    if (bpLine) {
      const bpTitle = `Puntos por tarjeta (${bpLine.line})`;
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: "Puntos por tarjeta",
          market: "booking_points",
          selection: "over",
          label: `Más de ${bpLine.line} pts de tarjeta`,
          line: bpLine.line,
          p: bpLine.pOverConditionalNoPush,
          fairDecimal: bpLine.fairOddsOver.decimal,
          fairAmerican: bpLine.fairOddsOver.american,
          cardCategory: "conteos",
          cardTitle: bpTitle,
          isMostLikely: bpLine.pOverConditionalNoPush >= bpLine.pUnderConditionalNoPush,
        }),
      );
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: "Puntos por tarjeta",
          market: "booking_points",
          selection: "under",
          label: `Menos de ${bpLine.line} pts de tarjeta`,
          line: bpLine.line,
          p: bpLine.pUnderConditionalNoPush,
          fairDecimal: bpLine.fairOddsUnder.decimal,
          fairAmerican: bpLine.fairOddsUnder.american,
          cardCategory: "conteos",
          cardTitle: bpTitle,
          isMostLikely: bpLine.pUnderConditionalNoPush > bpLine.pOverConditionalNoPush,
        }),
      );
    }

    const addHalfRows = (
      half: typeof micro.firstHalf,
      prefix: "ht" | "2h",
      periodLabel: string,
    ) => {
      if (!hasMarketPrefix(`${prefix}_1x2`)) {
        const pH1 = half.probs1X2.pHome;
        const pD1 = half.probs1X2.pDraw;
        const pA1 = half.probs1X2.pAway;
        const top = pH1 >= pD1 && pH1 >= pA1 ? "home" : pA1 >= pD1 ? "away" : "draw";
        const title = `Resultado ${periodLabel}`;
        pushUnique(
          extraMarkets,
          makeV5Row({
            group: title,
            market: `${prefix}_1x2`,
            selection: "home",
            label: `${game.home.name} (${periodLabel})`,
            p: pH1,
            fairDecimal: half.probs1X2.fairOddsHome.decimal,
            fairAmerican: half.probs1X2.fairOddsHome.american,
            cardCategory: "primer_tiempo",
            cardTitle: title,
            isMostLikely: top === "home",
          }),
        );
        pushUnique(
          extraMarkets,
          makeV5Row({
            group: title,
            market: `${prefix}_1x2`,
            selection: "draw",
            label: `Empate (${periodLabel})`,
            p: pD1,
            fairDecimal: half.probs1X2.fairOddsDraw.decimal,
            fairAmerican: half.probs1X2.fairOddsDraw.american,
            cardCategory: "primer_tiempo",
            cardTitle: title,
            isMostLikely: top === "draw",
          }),
        );
        pushUnique(
          extraMarkets,
          makeV5Row({
            group: title,
            market: `${prefix}_1x2`,
            selection: "away",
            label: `${game.away.name} (${periodLabel})`,
            p: pA1,
            fairDecimal: half.probs1X2.fairOddsAway.decimal,
            fairAmerican: half.probs1X2.fairOddsAway.american,
            cardCategory: "primer_tiempo",
            cardTitle: title,
            isMostLikely: top === "away",
          }),
        );
      }

      const ou05 = half.overUnder05;
      const ouTitle = `Goles ${periodLabel} (0.5)`;
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: ouTitle,
          market: `${prefix}_totals`,
          selection: "over_0_5",
          label: `Más de 0.5 goles (${periodLabel})`,
          line: 0.5,
          p: ou05.pOverConditionalNoPush,
          fairDecimal: ou05.fairOddsOver.decimal,
          fairAmerican: ou05.fairOddsOver.american,
          cardCategory: "primer_tiempo",
          cardTitle: ouTitle,
          isMostLikely: ou05.pOverConditionalNoPush >= ou05.pUnderConditionalNoPush,
        }),
      );
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: ouTitle,
          market: `${prefix}_totals`,
          selection: "under_0_5",
          label: `Menos de 0.5 goles (${periodLabel})`,
          line: 0.5,
          p: ou05.pUnderConditionalNoPush,
          fairDecimal: ou05.fairOddsUnder.decimal,
          fairAmerican: ou05.fairOddsUnder.american,
          cardCategory: "primer_tiempo",
          cardTitle: ouTitle,
          isMostLikely: ou05.pUnderConditionalNoPush > ou05.pOverConditionalNoPush,
        }),
      );
    };

    addHalfRows(micro.firstHalf, "ht", "1er tiempo");
    addHalfRows(micro.secondHalf, "2h", "2do tiempo");

    const earlyPayout: EarlyPayoutSummaryView = {
      triggerLabel: "Ventaja de +2 goles",
      homeWinProb: round4(ep.pHomeEarlyPayoutWin),
      awayWinProb: round4(ep.pAwayEarlyPayoutWin),
      homeLiftPts: round1(ep.homeEarlyPayoutLift * 100),
      awayLiftPts: round1(ep.awayEarlyPayoutLift * 100),
      fairHomeDecimal: round2(ep.fairOddsHomeEarlyPayout.decimal),
      fairAwayDecimal: round2(ep.fairOddsAwayEarlyPayout.decimal),
      bothTriggerProb: round4(ep.pBothSidesTriggerEarlyPayout),
      validatedOos: true,
    };

    const microCounts: MicroCountsV5View = {
      corners: {
        home: round1(micro.metrics.corners.muHome),
        away: round1(micro.metrics.corners.muAway),
        total: round1(micro.metrics.corners.muTotal),
      },
      yellowCards: {
        home: round1(micro.metrics.yellow_cards.muHome),
        away: round1(micro.metrics.yellow_cards.muAway),
        total: round1(micro.metrics.yellow_cards.muTotal),
      },
      fouls: {
        home: round1(micro.metrics.fouls.muHome),
        away: round1(micro.metrics.fouls.muAway),
        total: round1(micro.metrics.fouls.muTotal),
      },
      shots: {
        home: round1(micro.metrics.shots.muHome),
        away: round1(micro.metrics.shots.muAway),
        total: round1(micro.metrics.shots.muTotal),
      },
      shotsOnTarget: {
        home: round1(micro.metrics.shots_on_target.muHome),
        away: round1(micro.metrics.shots_on_target.muAway),
        total: round1(micro.metrics.shots_on_target.muTotal),
      },
      redCardMatchProb: round4(micro.redCards.pRedCardMatch),
      bookingPointsMean: round1(micro.bookingPoints.expectedBookingPoints),
      refereeProfile: refPrior
        ? {
            name: refPrior.name,
            games: refPrior.games,
            cardsMultiplier: refPrior.cardsMultiplier,
            foulsMultiplier: refPrior.foulsMultiplier,
            redsMultiplier: refPrior.redsMultiplier,
          }
        : null,
    };

    let fallbackOutlook: MatchOutlookSummary | null = null;
    if (!options.hasV32Outlook) {
      const topSide =
        coreX12.home >= coreX12.draw && coreX12.home >= coreX12.away
          ? {
              label: `Gana ${game.home.name}`,
              p: round4(coreX12.home),
              fairDecimal: round2(coreX12.fairOddsHome.decimal),
            }
          : coreX12.away >= coreX12.draw
            ? {
                label: `Gana ${game.away.name}`,
                p: round4(coreX12.away),
                fairDecimal: round2(coreX12.fairOddsAway.decimal),
              }
            : {
                label: "Empate",
                p: round4(coreX12.draw),
                fairDecimal: round2(coreX12.fairOddsDraw.decimal),
              };

      fallbackOutlook = {
        generatedAtUtc: game.kickoffUtc,
        mostLikely: topSide,
        scorelines: socEval.markets.topScorelines.slice(0, 3).map((s) => ({
          home: s.homeGoals,
          away: s.awayGoals,
          p: round4(s.probability),
          fairDecimal: round2(s.fairOdds.decimal),
        })),
        quality: {
          flag: socEval.isRegisteredLeague ? "ok" : "low_coverage",
          coveragePct: socEval.isRegisteredLeague ? 92 : 70,
        },
        hasRecentQuote: Boolean(game.spacetime?.market),
        latestQuote: game.spacetime?.market?.asOfUtc
          ? {
              bookLabel: game.spacetime.market.bookLabel,
              capturedAtUtc: game.spacetime.market.asOfUtc,
            }
          : null,
      };
    }

    return {
      v5: {
        epistemic: {
          home: toBandView(epistemic.homeBand90),
          draw: epistemic.drawBand90 ? toBandView(epistemic.drawBand90) : null,
          away: toBandView(epistemic.awayBand90),
        },
        earlyPayout,
        microCounts,
        verifiedSummaryEs,
        guardrailPassed,
      },
      extraMarkets,
      fallbackOutlook,
    };
  }

  if (game.sport === "american-football") {
    const [rawH, , rawA] = game.x12;
    const twoWay = rawH + rawA;
    if (!Number.isFinite(twoWay) || twoWay <= 0) return null;
    const pHome = clampProb(rawH / twoWay);
    const pAway = 1 - pHome;
    const pTie = 0.004;
    const nflCtx = extractNflMarketContextV5(game, existing);

    const nflEval = evaluateNflMatchServerV6({
      pHome2Way: pHome,
      modelExpectedTotal: game.projection?.total ?? 44.5,
      marketSpreadHome: nflCtx.marketSpreadHome,
      marketTotalLine: nflCtx.marketTotalLine,
      isIndoor: nflCtx.isIndoor,
      isTurf: nflCtx.isTurf,
      pTie,
    });

    const epistemic = buildMatchEpistemicSummaryV5({
      pHome,
      pDraw: null,
      pAway,
      effectiveSampleGames: 16,
      sport: "nfl",
      calibrationArtifact: epistemicArtifact,
    });

    const facts = buildVerifiedMatchFactSheet({
      matchId: game.id,
      sport: "nfl",
      homeTeam: game.home.name,
      awayTeam: game.away.name,
      pHome,
      pDraw: null,
      pAway,
      expectedTotal: nflEval.expectedTotal,
      canonicalTotalLine: nflEval.canonicalTotalLine,
      pOverCanonical: nflEval.pOverCanonical,
    });
    const verifiedSummaryEs = compileDeterministicVerifiedSummaryEs(facts);
    const guardrailPassed =
      validateNarrativeAgainstFactSheet(verifiedSummaryEs, facts).passed &&
      validateMatchMathematicalInvariants({
        pHome,
        pDraw: null,
        pAway,
        pHomeEarlyPayoutWin: nflEval.earlyPayout.p_home_early_payout_win,
        pAwayEarlyPayoutWin: nflEval.earlyPayout.p_away_early_payout_win,
        epistemicBands: [
          { label: "home", ...epistemic.homeBand90 },
          { label: "away", ...epistemic.awayBand90 },
        ],
      }).passed;

    const extraMarkets: PlatformMarketRow[] = [];
    if (nflEval.spreadPosterior) {
      const sp = nflEval.spreadPosterior;
      const homeSpreadStr = formatSignedLine(sp.spread_home);
      const awaySpreadStr = formatSignedLine(-sp.spread_home);
      const spreadTitle = `Hándicap ajustado (${homeSpreadStr})`;
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: "Hándicap ajustado",
          market: "nfl_spread_posterior",
          selection: "home",
          label: `${game.home.name} (${homeSpreadStr})`,
          line: sp.spread_home,
          p: sp.p_home_cover_no_push,
          fairDecimal: sp.fair_odds_home_cover.decimal,
          fairAmerican: sp.fair_odds_home_cover.american,
          cardCategory: "handicap",
          cardTitle: spreadTitle,
          isMostLikely: sp.p_home_cover_no_push >= sp.p_away_cover_no_push,
        }),
      );
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: "Hándicap ajustado",
          market: "nfl_spread_posterior",
          selection: "away",
          label: `${game.away.name} (${awaySpreadStr})`,
          line: normalizeZero(-sp.spread_home),
          p: sp.p_away_cover_no_push,
          fairDecimal: sp.fair_odds_away_cover.decimal,
          fairAmerican: sp.fair_odds_away_cover.american,
          cardCategory: "handicap",
          cardTitle: spreadTitle,
          isMostLikely: sp.p_away_cover_no_push > sp.p_home_cover_no_push,
        }),
      );
    }

    if (nflEval.totalPosterior) {
      const tp = nflEval.totalPosterior;
      const totTitle = `Total ajustado (${tp.line})`;
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: "Total ajustado",
          market: "nfl_total_posterior",
          selection: "over",
          label: `Más de ${tp.line} pts`,
          line: tp.line,
          p: tp.p_over_no_push,
          fairDecimal: tp.fair_odds_over.decimal,
          fairAmerican: tp.fair_odds_over.american,
          cardCategory: "goles",
          cardTitle: totTitle,
          isMostLikely: tp.p_over_no_push >= tp.p_under_no_push,
        }),
      );
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: "Total ajustado",
          market: "nfl_total_posterior",
          selection: "under",
          label: `Menos de ${tp.line} pts`,
          line: tp.line,
          p: tp.p_under_no_push,
          fairDecimal: tp.fair_odds_under.decimal,
          fairAmerican: tp.fair_odds_under.american,
          cardCategory: "goles",
          cardTitle: totTitle,
          isMostLikely: tp.p_under_no_push > tp.p_over_no_push,
        }),
      );
    }

    const pNoOt = clampProb(1 - nflEval.pOvertime);
    pushUnique(
      extraMarkets,
      makeV5Row({
        group: "Tiempo extra (Overtime)",
        market: "nfl_ot",
        selection: "yes",
        label: "Habrá tiempo extra — Sí",
        p: nflEval.pOvertime,
        fairDecimal: nflEval.fairOddsOvertimeYes.decimal,
        fairAmerican: nflEval.fairOddsOvertimeYes.american,
        cardCategory: "resultado",
        cardTitle: "Tiempo extra (Overtime)",
        isMostLikely: nflEval.pOvertime >= pNoOt,
      }),
    );
    pushUnique(
      extraMarkets,
      makeV5Row({
        group: "Tiempo extra (Overtime)",
        market: "nfl_ot",
        selection: "no",
        label: "Sin tiempo extra — No",
        p: pNoOt,
        fairDecimal: 1 / pNoOt,
        fairAmerican:
          pNoOt >= 0.5
            ? -Math.round((pNoOt / (1 - pNoOt)) * 100)
            : Math.round(((1 - pNoOt) / pNoOt) * 100),
        cardCategory: "resultado",
        cardTitle: "Tiempo extra (Overtime)",
        isMostLikely: pNoOt > nflEval.pOvertime,
      }),
    );

    const ep = nflEval.earlyPayout;
    const earlyPayout: EarlyPayoutSummaryView = {
      triggerLabel: `Ventaja de +${ep.trigger_lead} pts`,
      homeWinProb: round4(ep.p_home_early_payout_win),
      awayWinProb: round4(ep.p_away_early_payout_win),
      homeLiftPts: round1(ep.home_early_payout_lift * 100),
      awayLiftPts: round1(ep.away_early_payout_lift * 100),
      fairHomeDecimal: round2(ep.fair_odds_home_early_payout.decimal),
      fairAwayDecimal: round2(ep.fair_odds_away_early_payout.decimal),
      validatedOos: nflEval.earlyPayoutValidatedOos,
    };

    return {
      v5: {
        epistemic: {
          home: toBandView(epistemic.homeBand90),
          draw: null,
          away: toBandView(epistemic.awayBand90),
        },
        earlyPayout,
        nflSpecials: {
          expectedMargin: round1(nflEval.expectedMargin),
          pExactPlus3: round4(nflEval.pExactPlus3),
          pExactMinus3: round4(nflEval.pExactMinus3),
          pOvertime: round4(nflEval.pOvertime),
          fairOvertimeDecimal: round2(nflEval.fairOddsOvertimeYes.decimal),
        },
        verifiedSummaryEs,
        guardrailPassed,
      },
      extraMarkets,
      fallbackOutlook: null,
    };
  }

  const msSport: "mlb" | "nhl" | "nba" | null =
    game.sport === "baseball"
      ? "mlb"
      : game.sport === "ice-hockey"
        ? "nhl"
        : game.sport === "basketball"
          ? "nba"
          : null;
  if (!msSport) return null;

  const [rawH, , rawA] = game.x12;
  const twoWay = rawH + rawA;
  if (!Number.isFinite(twoWay) || twoWay <= 0) return null;
  const livePHome = clampProb(rawH / twoWay);
  const livePAway = 1 - livePHome;
  const fairLiveHome = probabilityToFairOdds(livePHome);
  const fairLiveAway = probabilityToFairOdds(livePAway);

  const gameDate = game.dayId || game.kickoffUtc.slice(0, 10);
  const msEval = evaluateUsMultisportV6Match({
    sport: msSport,
    homeTeam: game.home.name,
    awayTeam: game.away.name,
    homeCode: game.home.code,
    awayCode: game.away.code,
    gameDate,
    neutralSite: game.neutralSite,
    totalLine: game.goalLine?.line ?? null,
    livePHomeAnchor: livePHome,
  });

  const epAnchored = msEval.earlyPayoutAnchored;
  const triggerUnit = msSport === "mlb" ? "carreras" : msSport === "nhl" ? "goles" : "pts";
  const earlyPayout: EarlyPayoutSummaryView = {
    triggerLabel: `Ventaja de +${epAnchored.trigger_lead} ${triggerUnit}`,
    homeWinProb: round4(epAnchored.p_home_early_payout_win),
    awayWinProb: round4(epAnchored.p_away_early_payout_win),
    homeLiftPts: round1(epAnchored.home_early_payout_lift * 100),
    awayLiftPts: round1(epAnchored.away_early_payout_lift * 100),
    fairHomeDecimal: round2(epAnchored.fair_odds_home_early_payout.decimal),
    fairAwayDecimal: round2(epAnchored.fair_odds_away_early_payout.decimal),
    ...(epAnchored.p_both_sides_trigger_early_payout !== null
      ? { bothTriggerProb: round4(epAnchored.p_both_sides_trigger_early_payout) }
      : {}),
    validatedOos: msEval.earlyPayoutValidatedOos,
  };

  if (msEval.resolvedFromState) {
    const extraMarkets: PlatformMarketRow[] = [];
    const highlights: Array<{ label: string; value: string; sub?: string }> = [];
    const msOut = msEval.outlook;
    let msExpectedTotal =
      game.projection?.total ?? (msSport === "nba" ? 224 : msSport === "nhl" ? 6.0 : 8.5);
    let msCanonicalLine =
      game.goalLine?.line ?? (msSport === "nba" ? 224.5 : msSport === "nhl" ? 6.0 : 8.5);
    let msPOverCanonical = game.goalLine?.pOver ?? 0.5;

    if (msOut.sport === "mlb") {
      msExpectedTotal = game.projection?.total ?? msOut.full_game.expected_total_runs;
      msCanonicalLine = game.goalLine?.line ?? msOut.full_game.total_line;
      msPOverCanonical = game.goalLine?.pOver ?? msOut.full_game.p_over_no_push;
      const f5TotalRuns = msOut.f5.mu_home + msOut.f5.mu_away;
      highlights.push(
        {
          label: "Primeras 5 entradas (F5)",
          value: `${Math.round(msOut.f5.p_home * 100)} % ${game.home.shortName}`,
          sub: `Empate F5 ${Math.round(msOut.f5.p_tie * 100)} % · Total F5 ${f5TotalRuns.toFixed(1)}`,
        },
        {
          label: "Probabilidad de Extra Innings",
          value: `${(msOut.full_game.p_extra_innings * 100).toFixed(1)} %`,
          sub: `Total proyectado ${msOut.full_game.expected_total_runs.toFixed(1)} carreras`,
        },
      );
      const f5Title = "Primeras 5 entradas (F5)";
      const pF5H = msOut.f5.p_home;
      const pF5T = msOut.f5.p_tie;
      const pF5A = msOut.f5.p_away;
      const topF5 = pF5H >= pF5A && pF5H >= pF5T ? "home" : pF5A >= pF5T ? "away" : "tie";
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: f5Title,
          market: "mlb_f5",
          selection: "home",
          label: `${game.home.name} (F5)`,
          p: pF5H,
          fairDecimal: msOut.f5.fair_odds_home.decimal,
          fairAmerican: msOut.f5.fair_odds_home.american,
          cardCategory: "primer_tiempo",
          cardTitle: f5Title,
          isMostLikely: topF5 === "home",
        }),
      );
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: f5Title,
          market: "mlb_f5",
          selection: "tie",
          label: "Empate tras 5 entradas",
          p: pF5T,
          fairDecimal: msOut.f5.fair_odds_tie.decimal,
          fairAmerican: msOut.f5.fair_odds_tie.american,
          cardCategory: "primer_tiempo",
          cardTitle: f5Title,
          isMostLikely: topF5 === "tie",
        }),
      );
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: f5Title,
          market: "mlb_f5",
          selection: "away",
          label: `${game.away.name} (F5)`,
          p: pF5A,
          fairDecimal: msOut.f5.fair_odds_away.decimal,
          fairAmerican: msOut.f5.fair_odds_away.american,
          cardCategory: "primer_tiempo",
          cardTitle: f5Title,
          isMostLikely: topF5 === "away",
        }),
      );
    } else if (msOut.sport === "nhl") {
      msExpectedTotal = game.projection?.total ?? msOut.expected_total_goals;
      msCanonicalLine = game.goalLine?.line ?? msOut.total_line;
      msPOverCanonical = game.goalLine?.pOver ?? msOut.p_over_no_push;
      highlights.push(
        {
          label: "Probabilidad de Prórroga / SO",
          value: `${(msOut.p_ot_reg * 100).toFixed(1)} %`,
          sub: `Goles proyectados ${msOut.expected_total_goals.toFixed(2)}`,
        },
        {
          label: `Puck Line ${game.home.shortName} (-1.5)`,
          value: `${(msOut.p_puckline_home_minus_1_5 * 100).toFixed(1)} %`,
          sub: "Incluye ajuste por portería vacía",
        },
      );
      const plTitle = "Puck Line (-1.5 / +1.5)";
      const pHomePl = clampProb(msOut.p_puckline_home_minus_1_5);
      const pAwayPl = clampProb(1 - pHomePl);
      const fairHomePlDec = round2(1 / pHomePl);
      const fairHomePlAm =
        pHomePl >= 0.5
          ? -Math.round((pHomePl / (1 - pHomePl)) * 100)
          : Math.round(((1 - pHomePl) / pHomePl) * 100);
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: plTitle,
          market: "nhl_puckline",
          selection: "home_-1.5",
          label: `${game.home.name} (-1.5)`,
          line: -1.5,
          p: pHomePl,
          fairDecimal: fairHomePlDec,
          fairAmerican: fairHomePlAm,
          cardCategory: "handicap",
          cardTitle: plTitle,
          isMostLikely: pHomePl >= pAwayPl,
        }),
      );
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: plTitle,
          market: "nhl_puckline",
          selection: "away_+1.5",
          label: `${game.away.name} (+1.5)`,
          line: 1.5,
          p: pAwayPl,
          fairDecimal: 1 / pAwayPl,
          fairAmerican:
            pAwayPl >= 0.5
              ? -Math.round((pAwayPl / (1 - pAwayPl)) * 100)
              : Math.round(((1 - pAwayPl) / pAwayPl) * 100),
          cardCategory: "handicap",
          cardTitle: plTitle,
          isMostLikely: pAwayPl > pHomePl,
        }),
      );
    } else if (msOut.sport === "nba") {
      msExpectedTotal = game.projection?.total ?? msOut.expected_total;
      msCanonicalLine = game.goalLine?.line ?? msOut.total_line;
      msPOverCanonical = game.goalLine?.pOver ?? msOut.p_over_no_push;
      highlights.push(
        {
          label: "Margen proyectado",
          value: `${msOut.expected_margin >= 0 ? "+" : ""}${msOut.expected_margin.toFixed(1)} pts`,
          sub: `Total proyectado ${msOut.expected_total.toFixed(1)} pts`,
        },
        {
          label: "Probabilidad de Prórroga",
          value: `${(msOut.p_overtime * 100).toFixed(1)} %`,
          sub: "Banda epistémica calibrada al 90 %",
        },
      );
    }

    const epistemic = buildMatchEpistemicSummaryV5({
      pHome: livePHome,
      pDraw: null,
      pAway: livePAway,
      effectiveSampleGames: msSport === "mlb" ? 60 : 40,
      sport: "multisport",
      calibrationArtifact: epistemicArtifact,
    });

    const facts = buildVerifiedMatchFactSheet({
      matchId: game.id,
      sport: msSport,
      homeTeam: game.home.name,
      awayTeam: game.away.name,
      pHome: livePHome,
      pDraw: null,
      pAway: livePAway,
      expectedTotal: msExpectedTotal,
      canonicalTotalLine: msCanonicalLine,
      pOverCanonical: msPOverCanonical,
    });
    const verifiedSummaryEs = compileDeterministicVerifiedSummaryEs(facts);
    const guardrailPassed =
      validateNarrativeAgainstFactSheet(verifiedSummaryEs, facts).passed &&
      validateMatchMathematicalInvariants({
        pHome: livePHome,
        pDraw: null,
        pAway: livePAway,
        pHomeEarlyPayoutWin: epAnchored.p_home_early_payout_win,
        pAwayEarlyPayoutWin: epAnchored.p_away_early_payout_win,
        epistemicBands: [
          { label: "home", ...epistemic.homeBand90 },
          { label: "away", ...epistemic.awayBand90 },
        ],
      }).passed;

    const fallbackOutlook: MatchOutlookSummary | null = !options.hasV32Outlook
      ? {
          generatedAtUtc: game.kickoffUtc,
          mostLikely:
            livePHome >= livePAway
              ? {
                  label: `Gana ${game.home.name}`,
                  p: round4(livePHome),
                  fairDecimal: round2(fairLiveHome.decimal),
                }
              : {
                  label: `Gana ${game.away.name}`,
                  p: round4(livePAway),
                  fairDecimal: round2(fairLiveAway.decimal),
                },
          scorelines: [],
          quality: { flag: "ok", coveragePct: 90 },
          hasRecentQuote: Boolean(game.spacetime?.market),
          latestQuote: game.spacetime?.market?.asOfUtc
            ? {
                bookLabel: game.spacetime.market.bookLabel,
                capturedAtUtc: game.spacetime.market.asOfUtc,
              }
            : null,
        }
      : null;

    return {
      v5: {
        epistemic: {
          home: toBandView(epistemic.homeBand90),
          draw: null,
          away: toBandView(epistemic.awayBand90),
        },
        earlyPayout,
        multisportSpecials: highlights.length > 0 ? { sport: msSport, highlights } : null,
        verifiedSummaryEs,
        guardrailPassed,
      },
      extraMarkets,
      fallbackOutlook,
    };
  }

  const epistemic = buildMatchEpistemicSummaryV5({
    pHome: livePHome,
    pDraw: null,
    pAway: livePAway,
    effectiveSampleGames: msSport === "mlb" ? 50 : 32,
    sport: "multisport",
    calibrationArtifact: epistemicArtifact,
  });
  const facts = buildVerifiedMatchFactSheet({
    matchId: game.id,
    sport: msSport,
    homeTeam: game.home.name,
    awayTeam: game.away.name,
    pHome: livePHome,
    pDraw: null,
    pAway: livePAway,
    expectedTotal:
      game.projection?.total ?? (msSport === "nba" ? 224 : msSport === "nhl" ? 6.0 : 8.5),
    canonicalTotalLine:
      game.goalLine?.line ?? (msSport === "nba" ? 224.5 : msSport === "nhl" ? 6.0 : 8.5),
    pOverCanonical: game.goalLine?.pOver ?? 0.5,
  });
  const verifiedSummaryEs = compileDeterministicVerifiedSummaryEs(facts);
  const guardrailPassed =
    validateNarrativeAgainstFactSheet(verifiedSummaryEs, facts).passed &&
    validateMatchMathematicalInvariants({
      pHome: livePHome,
      pDraw: null,
      pAway: livePAway,
      pHomeEarlyPayoutWin: epAnchored.p_home_early_payout_win,
      pAwayEarlyPayoutWin: epAnchored.p_away_early_payout_win,
      epistemicBands: [
        { label: "home", ...epistemic.homeBand90 },
        { label: "away", ...epistemic.awayBand90 },
      ],
    }).passed;

  return {
    v5: {
      epistemic: {
        home: toBandView(epistemic.homeBand90),
        draw: null,
        away: toBandView(epistemic.awayBand90),
      },
      earlyPayout,
      verifiedSummaryEs,
      guardrailPassed,
    },
    extraMarkets: [],
    fallbackOutlook: null,
  };
}

export function evaluateLiveInPlaySoccerV5(params: {
  readonly pregameMuHome: number;
  readonly pregameMuAway: number;
  readonly currentMinute: number;
  readonly currentHomeGoals: number;
  readonly currentAwayGoals: number;
  readonly redCardsHome?: number;
  readonly redCardsAway?: number;
  readonly corePHome?: number;
  readonly corePDraw?: number;
  readonly corePAway?: number;
}): LiveInPlayWinProb {
  const res = evaluateSoccerEarlyPayoutAndInPlay({
    pregameMuHome: Math.max(0.25, Math.min(5.0, params.pregameMuHome)),
    pregameMuAway: Math.max(0.25, Math.min(5.0, params.pregameMuAway)),
    currentMinute: Math.max(0, Math.min(90, Math.round(params.currentMinute))),
    currentHomeGoals: Math.max(0, Math.min(10, Math.round(params.currentHomeGoals))),
    currentAwayGoals: Math.max(0, Math.min(10, Math.round(params.currentAwayGoals))),
    redCardsHome: Math.max(0, Math.min(4, Math.round(params.redCardsHome ?? 0))),
    redCardsAway: Math.max(0, Math.min(4, Math.round(params.redCardsAway ?? 0))),
    ...(typeof params.corePHome === "number" && Number.isFinite(params.corePHome)
      ? { corePHome: params.corePHome }
      : {}),
    ...(typeof params.corePDraw === "number" && Number.isFinite(params.corePDraw)
      ? { corePDraw: params.corePDraw }
      : {}),
    ...(typeof params.corePAway === "number" && Number.isFinite(params.corePAway)
      ? { corePAway: params.corePAway }
      : {}),
    artifact: inplayArtifact,
  });

  return {
    minute: res.currentMinute,
    pHome: round4(res.regularFullTime.pHome),
    pDraw: round4(res.regularFullTime.pDraw),
    pAway: round4(res.regularFullTime.pAway),
    fairHomeDecimal: round2(res.regularFullTime.fairOddsHome.decimal),
    fairDrawDecimal: round2(res.regularFullTime.fairOddsDraw.decimal),
    fairAwayDecimal: round2(res.regularFullTime.fairOddsAway.decimal),
    pNextGoalHome: round4(res.liveTotalsAndNextGoal.pNextGoalHome),
    pNextGoalAway: round4(res.liveTotalsAndNextGoal.pNextGoalAway),
    pNoMoreGoals: round4(res.liveTotalsAndNextGoal.pNoMoreGoals),
    expectedFinalTotal: round2(res.liveTotalsAndNextGoal.expectedFinalTotalGoals),
    redCardsHome: params.redCardsHome ?? 0,
    redCardsAway: params.redCardsAway ?? 0,
  };
}

export interface LiveInPlayNflView extends LiveInPlayWinProb {
  readonly secondsRemaining: number;
  readonly currentScoreDiffHome: number;
  readonly liveExpectedFinalMargin: number;
  readonly liveExpectedFinalTotal: number;
  readonly earlyPayout17AlreadyTriggeredHome: boolean;
  readonly earlyPayout17AlreadyTriggeredAway: boolean;
}

export function evaluateLiveInPlayNflV5(params: {
  readonly secondsRemaining: number;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly pregameExpectedMargin: number;
  readonly pregameExpectedTotal: number;
  readonly possession?: "home" | "away" | "neutral";
}): LiveInPlayNflView {
  const safeSeconds = Math.max(0, Math.min(3600, params.secondsRemaining));
  const res = evaluateNflInPlayState({
    secondsRemaining: safeSeconds,
    homeScore: Math.max(0, Math.round(params.homeScore)),
    awayScore: Math.max(0, Math.round(params.awayScore)),
    pregameExpectedMargin: Math.max(-35, Math.min(35, params.pregameExpectedMargin)),
    pregameExpectedTotal: Math.max(20, Math.min(85, params.pregameExpectedTotal)),
    possession: params.possession ?? "neutral",
    artifact: inplayArtifact,
  });

  return {
    minute: Math.round((3600 - res.secondsRemaining) / 60),
    secondsRemaining: res.secondsRemaining,
    currentScoreDiffHome: res.currentScoreDiffHome,
    liveExpectedFinalMargin: round2(res.liveExpectedFinalMargin),
    liveExpectedFinalTotal: round2(res.liveExpectedFinalTotal),
    pHome: round4(res.pHomeWinLive),
    pDraw: null,
    pAway: round4(res.pAwayWinLive),
    fairHomeDecimal: round2(res.fairOddsHomeLive.decimal),
    fairDrawDecimal: null,
    fairAwayDecimal: round2(res.fairOddsAwayLive.decimal),
    expectedFinalTotal: round2(res.liveExpectedFinalTotal),
    earlyPayout17AlreadyTriggeredHome: res.earlyPayout17AlreadyTriggeredHome,
    earlyPayout17AlreadyTriggeredAway: res.earlyPayout17AlreadyTriggeredAway,
  };
}

export function evaluateSgpCopulaV5(params: {
  readonly sport: "soccer" | "nfl";
  readonly legs: readonly SgpLegInput[];
  readonly offeredCombinedDecimalOdds?: number | null;
}): SgpCopulaAuditView {
  return evaluateSgpCopulaV6(params);
}

export interface PlayerLinkedSgpAuditView {
  readonly pPlayerScores: number;
  readonly pTeamOutcomeMarginal: number;
  readonly pTotalOutcomeMarginal: number | null;
  readonly independentProbability: number;
  readonly jointProbability: number;
  readonly structuralLiftMultiplier: number;
  readonly dixonColesRhoUsed: number;
  readonly fairCombinedDecimal: number;
  readonly fairCombinedAmerican: number;
  readonly bookQuoteAudit: SgpCopulaAuditView["bookQuoteAudit"];
}

export function evaluatePlayerLinkedSgpCopulaV5(params: {
  readonly pPlayerAnytimeGoal: number;
  readonly teamExpectedGoals: number;
  readonly opponentExpectedGoals: number;
  readonly teamOutcome: "team_win" | "team_win_or_draw" | "any";
  readonly matchTotalOverLine?: number | null;
  readonly offeredCombinedDecimalOdds?: number | null;
  readonly dixonColesRho?: number;
}): PlayerLinkedSgpAuditView {
  const evaluated = evaluatePlayerLinkedSgpV6(params);
  return {
    pPlayerScores: evaluated.pPlayerScores,
    pTeamOutcomeMarginal: evaluated.pTeamOutcomeMarginal,
    pTotalOutcomeMarginal: evaluated.pTotalOutcomeMarginal,
    independentProbability: evaluated.independentProbability,
    jointProbability: evaluated.jointProbability,
    structuralLiftMultiplier: evaluated.structuralLiftMultiplier,
    dixonColesRhoUsed: evaluated.dixonColesRhoUsed,
    fairCombinedDecimal: evaluated.fairCombinedDecimal,
    fairCombinedAmerican: evaluated.fairCombinedAmerican,
    bookQuoteAudit: evaluated.bookQuoteAudit,
  };
}

export interface SoccerPlayerPropProjectionV5 {
  readonly propFamily: SoccerPropFamilyV4;
  readonly posCluster: SoccerPositionCluster;
  readonly lineupStatus: LineupStatusV36;
  readonly line: number;
  readonly lambdaEbPer90: number;
  readonly expectedMinutes: number;
  readonly pOverRaw: number;
  readonly pOverCalibrated: SpacetimeUnitProbability;
  readonly pUnderCalibrated: SpacetimeUnitProbability;
  readonly pOverSubCover: SpacetimeUnitProbability;
  readonly subCoverLift: number;
  readonly fairOverDecimal: number;
  readonly fairUnderDecimal: number;
  readonly fairOverAmerican: number;
  readonly fairUnderAmerican: number;
  readonly fairOverSubCoverDecimal: number;
}

export function projectSoccerPlayerPropV5(
  input: SoccerPlayerPropInputV4,
): SoccerPlayerPropProjectionV5 {
  const out = projectSoccerPlayerPropOutlookV5(input, hierarchicalPropsArtifact);
  return {
    propFamily: out.propFamily,
    posCluster: out.posCluster,
    lineupStatus: out.lineupStatus,
    line: out.line,
    lambdaEbPer90: out.lambdaEbPer90,
    expectedMinutes: out.expectedMinutes,
    pOverRaw: out.pOverRaw,
    pOverCalibrated: out.pOverCalibrated,
    pUnderCalibrated: out.pUnderCalibrated,
    pOverSubCover: out.pOverSubCover,
    subCoverLift: out.subCoverLift,
    fairOverDecimal: round2(out.fairOddsOver.decimal),
    fairUnderDecimal: round2(out.fairOddsUnder.decimal),
    fairOverAmerican: Math.round(out.fairOddsOver.american),
    fairUnderAmerican: Math.round(out.fairOddsUnder.american),
    fairOverSubCoverDecimal: round2(out.fairOddsOverSubCover.decimal),
  };
}

export function auditCortexNarrativeV5(
  game: PlatformGame,
  narrativeText: string,
): { readonly passed: boolean; readonly reasons: readonly string[] } {
  if (!game.x12) return { passed: true, reasons: [] };
  const [rawH, rawD, rawA] = game.x12;
  const hasDraw = game.sport === "football";
  const sum = hasDraw ? rawH + rawD + rawA : rawH + rawA;
  if (!Number.isFinite(sum) || sum <= 0) return { passed: true, reasons: [] };

  const facts = buildVerifiedMatchFactSheet({
    matchId: game.id,
    sport: game.sport,
    homeTeam: game.home.name,
    awayTeam: game.away.name,
    pHome: clampProb(rawH / sum),
    pDraw: hasDraw ? clampProb(rawD / sum) : null,
    pAway: clampProb(rawA / sum),
    expectedTotal: game.projection?.total ?? (hasDraw ? 2.6 : 44.5),
    canonicalTotalLine: game.goalLine?.line ?? (hasDraw ? 2.5 : 44.5),
    pOverCanonical: game.goalLine?.pOver ?? 0.5,
  });
  const audit = validateNarrativeAgainstFactSheet(narrativeText, facts);
  return {
    passed: audit.passed,
    reasons: audit.violations.map((v) => `${v.code}: ${v.detail}`),
  };
}

export function deterministicVerifiedSummaryV5(game: PlatformGame): string | null {
  if (!game.x12 || game.hasForecast === false) return null;
  const [rawH, rawD, rawA] = game.x12;
  const hasDraw = game.sport === "football";
  const sum = hasDraw ? rawH + rawD + rawA : rawH + rawA;
  if (!Number.isFinite(sum) || sum <= 0) return null;

  const facts = buildVerifiedMatchFactSheet({
    matchId: game.id,
    sport: game.sport,
    homeTeam: game.home.name,
    awayTeam: game.away.name,
    pHome: clampProb(rawH / sum),
    pDraw: hasDraw ? clampProb(rawD / sum) : null,
    pAway: clampProb(rawA / sum),
    expectedTotal: game.projection?.total ?? (hasDraw ? 2.6 : 44.5),
    canonicalTotalLine: game.goalLine?.line ?? (hasDraw ? 2.5 : 44.5),
    pOverCanonical: game.goalLine?.pOver ?? 0.5,
  });
  return compileDeterministicVerifiedSummaryEs(facts);
}
