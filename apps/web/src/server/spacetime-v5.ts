import type { LiveInPlayWinProb } from "@pitchlab/contracts";
import { probabilityToFairOdds } from "@pitchlab/spacetime";
import {
  buildMatchEpistemicSummaryV5,
  buildSoccerMicroMatchOutlookV5,
  buildUnifiedMultiSportMatchIntelligenceV5,
  buildVerifiedMatchFactSheet,
  compileDeterministicVerifiedSummaryEs,
  evaluatePointsSportEarlyPayout,
  evaluateSoccerEarlyPayoutAndInPlay,
  evaluateStudentTSameGameParlayV5,
  projectNflDiscreteKeyTotalPmfV5,
  projectNflOvertimeProbabilityV5,
  solveDiagonalInflatedScoreMatrix4Param,
  solveNflKeyNumberMarginPmfExact,
  summarizeSoccerMarketsFromMatrixV4,
  validateMatchMathematicalInvariants,
  validateNarrativeAgainstFactSheet,
  type EpistemicConformalArtifactV51,
  type EpistemicProbabilityBandV5,
  type InPlayEarlyPayoutArtifactV5,
  type MicroFeatureVectorInputV4,
  type MultiSportV40StateArtifact,
  type NflModelArtifactV5,
  type SgpCopulaArtifactV5,
  type SgpLegInput,
  type SoccerMicroMetricKey,
  type SoccerMicroModelArtifactV5,
} from "@pitchlab/spacetime/v5";
import epistemicArtifactJson from "@pitchlab/spacetime/data/model_epistemic_conformal_v5_1_candidate.json";
import inplayArtifactJson from "@pitchlab/spacetime/data/model_inplay_early_payout_v5_0_candidate.json";
import microArtifactJson from "@pitchlab/spacetime/data/model_soccer_micro_v5_0_candidate.json";
import multisportStateJson from "@pitchlab/spacetime/data/multisport_v4_0_state_candidate.json";
import nflArtifactJson from "@pitchlab/spacetime/data/model_nfl_v5_0_candidate.json";
import officialPriorsJson from "@pitchlab/spacetime/data/official_priors_v5_1.json";
import sgpArtifactJson from "@pitchlab/spacetime/data/sgp_copula_v5_0_candidate.json";
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
import { teamScore } from "./spacetime";

const epistemicArtifact = epistemicArtifactJson as unknown as EpistemicConformalArtifactV51;
const inplayArtifact = inplayArtifactJson as unknown as InPlayEarlyPayoutArtifactV5;
const microArtifact = microArtifactJson as unknown as SoccerMicroModelArtifactV5;
const multisportState = multisportStateJson as unknown as MultiSportV40StateArtifact;
const nflArtifact = nflArtifactJson as unknown as NflModelArtifactV5;
const sgpArtifact = sgpArtifactJson as unknown as SgpCopulaArtifactV5;

interface OfficialPriorV51Entry {
  readonly last_div: string;
  readonly games_yellow: number;
  readonly games_red: number;
  readonly yellow_mult: number;
  readonly red_mult: number;
  readonly fouls_mult: number;
  readonly cpf_mult: number;
}

const officialPriors = (
  officialPriorsJson as unknown as {
    readonly officials: Readonly<Record<string, OfficialPriorV51Entry>>;
  }
).officials;

/** Liga de la app → código de división en Spacetime v5.1 (23 divisiones entrenadas). */
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

function normalizePersonKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

/**
 * Resuelve el árbitro del partido contra los 839 perfiles Empirical Bayes de `official_priors_v5_1.json`.
 * Soporta nombres completos («Michael Oliver» → «m oliver») y compuestos («Bruno José Costa»).
 */
export function resolveRefereePriorV5(
  refereeName: string | null | undefined,
  div?: string | null,
): ResolvedRefereePriorV5 | null {
  if (!refereeName || !refereeName.trim()) return null;
  const memoKey = `${refereeName.trim().toLowerCase()}|${div ?? ""}`;
  if (refereePriorMemo.has(memoKey)) return refereePriorMemo.get(memoKey) ?? null;

  const clean = normalizePersonKey(refereeName);
  if (!clean) {
    refereePriorMemo.set(memoKey, null);
    return null;
  }
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length === 0) return null;

  const candidates: string[] = [clean];
  if (parts.length >= 2) {
    const initial = parts[0]![0]!;
    candidates.push(`${initial} ${parts.slice(1).join(" ")}`);
    candidates.push(`${initial} ${parts[parts.length - 1]!}`);
    if (parts.length >= 3) {
      candidates.push(`${initial} ${parts[1]!}`);
    }
  }

  let bestMatch: { key: string; entry: OfficialPriorV51Entry; score: number } | null = null;
  for (let idx = 0; idx < candidates.length; idx += 1) {
    const key = candidates[idx]!;
    const entry = officialPriors[key];
    if (!entry) continue;
    const divBonus = div && entry.last_div === div ? 10 : 0;
    const score = 100 - idx * 10 + divBonus;
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { key, entry, score };
    }
  }
  const resolved: ResolvedRefereePriorV5 | null = bestMatch
    ? {
        key: bestMatch.key,
        name: refereeName.trim(),
        games: Math.max(bestMatch.entry.games_yellow, bestMatch.entry.games_red),
        cardsMultiplier: round4(bestMatch.entry.yellow_mult),
        foulsMultiplier: round4(bestMatch.entry.fouls_mult),
        redsMultiplier: round4(bestMatch.entry.red_mult),
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

const multisportTeamsBySport = (() => {
  const bySport = new Map<string, Array<{ team_key: string; team_name: string }>>();
  for (const entry of Object.values(multisportState.teams)) {
    const list = bySport.get(entry.sport) ?? [];
    list.push({ team_key: entry.team_key, team_name: entry.team_name });
    bySport.set(entry.sport, list);
  }
  return bySport;
})();

function findMultiSportTeamKey(
  sport: "mlb" | "nhl" | "nba" | "ncaaf",
  teamName: string,
  teamCode: string,
): string | null {
  const upperCode = teamCode.trim().toUpperCase();
  if (multisportState.teams[`${sport}::${upperCode}`]) return upperCode;

  let bestKey: string | null = null;
  let bestScore = 0;
  for (const entry of multisportTeamsBySport.get(sport) ?? []) {
    const score = teamScore(entry.team_name, teamName);
    if (score > bestScore) {
      bestScore = score;
      bestKey = entry.team_key;
    }
  }
  return bestScore >= 0.45 ? bestKey : null;
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

/**
 * Ejecuta Spacetime Suite v5.1 en servidor (`< 0.4 ms` en frío, `< 0.01 ms` en caché, `0` red,
 * `100%` determinista) para enriquecer la ficha del partido con bandas epistémicas 90 %, pago
 * anticipado, micro-mercados con rigor arbitral real, mitades 1T/2T, mercados multideporte y
 * síntesis verificada.
 *
 * Respeta la superficie congelada `v3.2`: nunca sobrescribe filas ya emitidas por `v3.2`.
 */
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
  const existingSig = existing.map((r) => `${r.market}:${r.selection}:${r.line ?? ""}`).join(",");
  const cacheKey = [
    game.id,
    game.league,
    game.x12.join(","),
    game.projection ? `${game.projection.home},${game.projection.away},${game.projection.total}` : "",
    game.referee ?? game.preGame?.matchContext?.referee ?? "",
    game.preGame?.absences?.length ?? 0,
    options.hasV32Outlook ? "1" : "0",
    existingSig,
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

  // ── 1. FÚTBOL (23 divisiones + copas + selecciones) ────────────────────────────────────
  if (game.sport === "football") {
    const [rawH, rawD, rawA] = game.x12;
    const sum = rawH + rawD + rawA;
    if (!Number.isFinite(sum) || sum <= 0) return null;
    const pHome = clampProb(rawH / sum);
    const pDraw = clampProb(rawD / sum);
    const pAway = clampProb(rawA / sum);

    const div = LEAGUE_TO_V5_DIV[game.league] ?? "E0";
    const totalGoals = Math.max(1.2, Math.min(4.8, game.projection?.total ?? 2.65));
    const refereeName = game.referee ?? game.preGame?.matchContext?.referee ?? null;
    const refPrior = resolveRefereePriorV5(refereeName, div);

    // Resolvemos directamente los submódulos rápidos v5.1 (evita correr la integración QMC
    // Student-t de 2,048 nodos en cada ficha cuando el SGP se evalúa bajo demanda en /api/parlays/sgp).
    const sol4 = solveDiagonalInflatedScoreMatrix4Param({
      pHome,
      pDraw,
      pAway,
      totalGoalsTarget: totalGoals,
      rhoPrior: 0.0,
      dispersionR: 45.0,
      rhoDrawBlendWeight: 0.0,
    });
    const socMarkets = summarizeSoccerMarketsFromMatrixV4(sol4.matrix);
    const lh = sol4.muHome;
    const la = sol4.muAway;
    const supH = lh - la;
    const supA = -supH;
    const siegeH = Math.pow(Math.max(0, supH), 1.4) - 0.5 * Math.pow(Math.max(0, -supH), 1.2);
    const siegeA = Math.pow(Math.max(0, supA), 1.4) - 0.5 * Math.pow(Math.max(0, -supA), 1.2);
    const tempoExc = lh + la - 2.65;
    const tightness = Math.exp(-Math.abs(supH)) - 0.55;
    const dp = microArtifact.div_priors[div];
    const metricKeys: readonly SoccerMicroMetricKey[] = [
      "corners",
      "yellow_cards",
      "fouls",
      "shots_on_target",
      "shots",
    ];
    const featuresByMetric = {} as Record<SoccerMicroMetricKey, MicroFeatureVectorInputV4>;
    for (const q of metricKeys) {
      const sp = microArtifact.metrics[q];
      const bh = dp?.metrics[q]?.home_mean ?? sp.default_home_rate;
      const ba = dp?.metrics[q]?.away_mean ?? sp.default_away_rate;
      const logRef =
        refPrior && q === "yellow_cards"
          ? Math.log(Math.max(0.5, refPrior.cardsMultiplier))
          : refPrior && q === "fouls"
            ? Math.log(Math.max(0.5, refPrior.foulsMultiplier))
            : 0.0;
      featuresByMetric[q] = {
        homeFeatures8: [Math.log(Math.max(bh, 0.12)), supH, siegeH, tempoExc, tightness, 0, 0, logRef],
        awayFeatures8: [Math.log(Math.max(ba, 0.12)), supA, siegeA, tempoExc, tightness, 0, 0, logRef],
      };
    }

    const micro = buildSoccerMicroMatchOutlookV5({
      matchId: game.id,
      div,
      homeTeam: game.home.name,
      awayTeam: game.away.name,
      lamHome: lh,
      lamAway: la,
      featuresByMetric,
      modelArtifact: microArtifact,
    });

    const epAndInPlay = evaluateSoccerEarlyPayoutAndInPlay({
      pregameMuHome: lh,
      pregameMuAway: la,
      currentMinute: 0,
      currentHomeGoals: 0,
      currentAwayGoals: 0,
      redCardsHome: 0,
      redCardsAway: 0,
      corePHome: socMarkets.pHome,
      corePDraw: socMarkets.pDraw,
      corePAway: socMarkets.pAway,
      artifact: inplayArtifact,
    });

    const absencesCount = game.preGame?.absences?.filter((a) => a.status === "Baja").length ?? 0;
    const epistemic = buildMatchEpistemicSummaryV5({
      pHome: socMarkets.pHome,
      pDraw: socMarkets.pDraw,
      pAway: socMarkets.pAway,
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
      pHome: socMarkets.pHome,
      pDraw: socMarkets.pDraw,
      pAway: socMarkets.pAway,
      expectedTotal: sol4.expectedTotalImplied,
      canonicalTotalLine: 2.5,
      pOverCanonical: socMarkets.pOver25,
    });
    const verifiedSummaryEs = compileDeterministicVerifiedSummaryEs(facts);
    const guardrailPassed =
      validateNarrativeAgainstFactSheet(verifiedSummaryEs, facts).passed &&
      validateMatchMathematicalInvariants({
        pHome: socMarkets.pHome,
        pDraw: socMarkets.pDraw,
        pAway: socMarkets.pAway,
        pHomeEarlyPayoutWin: epAndInPlay.earlyPayout2Goals.pHomeEarlyPayoutWin,
        pAwayEarlyPayoutWin: epAndInPlay.earlyPayout2Goals.pAwayEarlyPayoutWin,
        epistemicBands: [
          { label: "home", ...epistemic.homeBand90 },
          { label: "away", ...epistemic.awayBand90 },
        ],
      }).passed;

    const intel = {
      coreProbabilities: {
        fairOddsHome: probabilityToFairOdds(clampProb(socMarkets.pHome)),
        fairOddsDraw: probabilityToFairOdds(clampProb(socMarkets.pDraw)),
        fairOddsAway: probabilityToFairOdds(clampProb(socMarkets.pAway)),
      },
      epistemicUncertainty90: epistemic,
      soccerMarkets: socMarkets,
      soccerEarlyPayoutAndInPlay: epAndInPlay,
      verifiedSummaryEs,
      guardrailAudit: { passed: guardrailPassed },
    };

    const extraMarkets: PlatformMarketRow[] = [];
    if (micro) {
      // Micro-mercados de conteos causales (córners, amarillas, faltas, remates, a puerta, rojas, booking points)
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

      // Tarjeta roja (Sí / No)
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

      // Puntos por tarjeta (Booking Points — línea principal 45.5 o central)
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

      // Mitades (1.er tiempo y 2.º tiempo): solo agrega si aún no existen mercados de 1T/2T
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
    }

    const ep = intel.soccerEarlyPayoutAndInPlay?.earlyPayout2Goals;
    const earlyPayout: EarlyPayoutSummaryView | null = ep
      ? {
          triggerLabel: "Ventaja de +2 goles",
          homeWinProb: round4(ep.pHomeEarlyPayoutWin),
          awayWinProb: round4(ep.pAwayEarlyPayoutWin),
          homeLiftPts: round1(ep.homeEarlyPayoutLift * 100),
          awayLiftPts: round1(ep.awayEarlyPayoutLift * 100),
          fairHomeDecimal: round2(ep.fairOddsHomeEarlyPayout.decimal),
          fairAwayDecimal: round2(ep.fairOddsAwayEarlyPayout.decimal),
          bothTriggerProb: round4(ep.pBothSidesTriggerEarlyPayout),
          validatedOos: true,
        }
      : null;

    const microCounts: MicroCountsV5View | null = micro
      ? {
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
        }
      : null;

    // Fallback de MatchOutlookSummary para las 23+ ligas de expansión que no están en v3.2
    let fallbackOutlook: MatchOutlookSummary | null = null;
    if (!options.hasV32Outlook && intel.soccerMarkets) {
      const m = intel.soccerMarkets;
      const topSide =
        m.pHome >= m.pDraw && m.pHome >= m.pAway
          ? {
              label: `Gana ${game.home.name}`,
              p: round4(m.pHome),
              fairDecimal: round2(intel.coreProbabilities.fairOddsHome.decimal),
            }
          : m.pAway >= m.pDraw
            ? {
                label: `Gana ${game.away.name}`,
                p: round4(m.pAway),
                fairDecimal: round2(intel.coreProbabilities.fairOddsAway.decimal),
              }
            : {
                label: "Empate",
                p: round4(m.pDraw),
                fairDecimal: round2(intel.coreProbabilities.fairOddsDraw?.decimal ?? 1 / Math.max(m.pDraw, 0.01)),
              };

      fallbackOutlook = {
        generatedAtUtc: game.kickoffUtc,
        mostLikely: topSide,
        scorelines: m.topScorelines.slice(0, 3).map((s) => ({
          home: s.homeGoals,
          away: s.awayGoals,
          p: round4(s.probability),
          fairDecimal: round2(1 / Math.max(s.probability, 0.001)),
        })),
        quality: {
          flag: LEAGUE_TO_V5_DIV[game.league] ? "ok" : "low_coverage",
          coveragePct: LEAGUE_TO_V5_DIV[game.league] ? 92 : 70,
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
          home: toBandView(intel.epistemicUncertainty90.homeBand90),
          draw: intel.epistemicUncertainty90.drawBand90
            ? toBandView(intel.epistemicUncertainty90.drawBand90)
            : null,
          away: toBandView(intel.epistemicUncertainty90.awayBand90),
        },
        earlyPayout,
        microCounts,
        verifiedSummaryEs: intel.verifiedSummaryEs,
        guardrailPassed: intel.guardrailAudit.passed,
      },
      extraMarkets,
      fallbackOutlook,
    };
  }

  // ── 2. NFL (Minkowski v5: números clave ±3, Overtime y Pago Anticipado +17 pts) ────────
  if (game.sport === "american-football") {
    const [rawH, , rawA] = game.x12;
    const twoWay = Math.max(rawH + rawA, 1e-6);
    const pHome = clampProb(rawH / twoWay);
    const pAway = clampProb(rawA / twoWay);
    const pTie = 0.004;
    const sol = solveNflKeyNumberMarginPmfExact({
      pHome: pHome * (1 - pTie),
      pTie,
      pAway: pAway * (1 - pTie),
      artifact: {
        schema_version: nflArtifact.schema_version,
        codename: nflArtifact.codename,
        version: nflArtifact.version,
        status: nflArtifact.status,
        production_activated: nflArtifact.production_activated,
        created_at: nflArtifact.created_at,
        holdout_cut_utc: nflArtifact.holdout_cut_utc,
        holdout_sealed_untouched: nflArtifact.holdout_sealed_untouched,
        max_abs_margin: nflArtifact.max_abs_margin,
        positive_margin_kernel_1_to_45: nflArtifact.positive_margin_kernel_1_to_45,
        margin_quad_concentration: nflArtifact.margin_quad_concentration,
        totals_calibration: {
          sigma_game_physical: 13.4,
          market_posterior_w_model: nflArtifact.discrete_totals_v5.market_posterior_w_model,
          sigma_market_posterior: 13.4,
        },
      },
    });
    const center = sol.maxAbsMargin;
    const totOut = projectNflDiscreteKeyTotalPmfV5({
      modelExpectedTotal: game.projection?.total ?? 44.5,
      artifact: nflArtifact,
      marketTotalLine: null,
    });
    const otOut = projectNflOvertimeProbabilityV5({
      expectedMargin: sol.expectedMargin,
      expectedTotal: totOut.modelExpectedTotal,
      isIndoor: false,
      isTurf: false,
      artifact: nflArtifact,
    });
    const nflEp17 = evaluatePointsSportEarlyPayout({
      sport: "nfl",
      pHomeWin: pHome,
      artifact: inplayArtifact,
    });
    const epistemic = buildMatchEpistemicSummaryV5({
      pHome,
      pDraw: null,
      pAway,
      effectiveSampleGames: 16,
      sport: "nfl",
      calibrationArtifact: epistemicArtifact,
    });
    const pOver445 =
      totOut.objectiveProjections.find((t) => Math.abs(t.totalLine - 44.5) < 1e-6)?.pOverNoPush ?? 0.5;
    const facts = buildVerifiedMatchFactSheet({
      matchId: game.id,
      sport: "nfl",
      homeTeam: game.home.name,
      awayTeam: game.away.name,
      pHome,
      pDraw: null,
      pAway,
      expectedTotal: totOut.modelExpectedTotal,
      canonicalTotalLine: 44.5,
      pOverCanonical: pOver445,
    });
    const verifiedSummaryEs = compileDeterministicVerifiedSummaryEs(facts);
    const guardrailPassed =
      validateNarrativeAgainstFactSheet(verifiedSummaryEs, facts).passed &&
      validateMatchMathematicalInvariants({
        pHome,
        pDraw: null,
        pAway,
        pHomeEarlyPayoutWin: nflEp17.pHomeEarlyPayoutWin,
        pAwayEarlyPayoutWin: nflEp17.pAwayEarlyPayoutWin,
        epistemicBands: [
          { label: "home", ...epistemic.homeBand90 },
          { label: "away", ...epistemic.awayBand90 },
        ],
      }).passed;

    const intel = {
      epistemicUncertainty90: epistemic,
      pointsSportEarlyPayout: nflEp17,
      nflMarketsV5: {
        expectedMargin: sol.expectedMargin,
        pExactPlus3: sol.pmf[center + 3]!,
        pExactMinus3: sol.pmf[center - 3]!,
        pOvertime: otOut.pOvertime,
        fairOddsOvertimeYes: otOut.fairOddsOvertimeYes,
      },
      verifiedSummaryEs,
      guardrailAudit: { passed: guardrailPassed },
    };

    const extraMarkets: PlatformMarketRow[] = [];
    const nflM = intel.nflMarketsV5;
    if (nflM) {
      const pNoOt = clampProb(1 - nflM.pOvertime);
      pushUnique(
        extraMarkets,
        makeV5Row({
          group: "Tiempo extra (Overtime)",
          market: "nfl_ot",
          selection: "yes",
          label: "Habrá tiempo extra — Sí",
          p: nflM.pOvertime,
          fairDecimal: nflM.fairOddsOvertimeYes.decimal,
          fairAmerican: nflM.fairOddsOvertimeYes.american,
          cardCategory: "resultado",
          cardTitle: "Tiempo extra (Overtime)",
          isMostLikely: nflM.pOvertime >= pNoOt,
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
          fairAmerican: pNoOt >= 0.5 ? -Math.round((pNoOt / (1 - pNoOt)) * 100) : Math.round(((1 - pNoOt) / pNoOt) * 100),
          cardCategory: "resultado",
          cardTitle: "Tiempo extra (Overtime)",
          isMostLikely: pNoOt > nflM.pOvertime,
        }),
      );
    }

    const ep = intel.pointsSportEarlyPayout;
    const earlyPayout: EarlyPayoutSummaryView | null = ep
      ? {
          triggerLabel: `Ventaja de +${ep.triggerLead} pts`,
          homeWinProb: round4(ep.pHomeEarlyPayoutWin),
          awayWinProb: round4(ep.pAwayEarlyPayoutWin),
          homeLiftPts: round1(ep.homeEarlyPayoutLift * 100),
          awayLiftPts: round1(ep.awayEarlyPayoutLift * 100),
          fairHomeDecimal: round2(ep.fairOddsHomeEarlyPayout.decimal),
          fairAwayDecimal: round2(ep.fairOddsAwayEarlyPayout.decimal),
          validatedOos: true,
        }
      : null;

    return {
      v5: {
        epistemic: {
          home: toBandView(intel.epistemicUncertainty90.homeBand90),
          draw: null,
          away: toBandView(intel.epistemicUncertainty90.awayBand90),
        },
        earlyPayout,
        nflSpecials: nflM
          ? {
              expectedMargin: round1(nflM.expectedMargin),
              pExactPlus3: round4(nflM.pExactPlus3),
              pExactMinus3: round4(nflM.pExactMinus3),
              pOvertime: round4(nflM.pOvertime),
              fairOvertimeDecimal: round2(nflM.fairOddsOvertimeYes.decimal),
            }
          : null,
        verifiedSummaryEs: intel.verifiedSummaryEs,
        guardrailPassed: intel.guardrailAudit.passed,
      },
      extraMarkets,
      fallbackOutlook: null,
    };
  }

  // ── 3. MULTIDEPORTE US (MLB Kepler F5, NHL Curvature Empty-Net, NBA Tensor) ────────────
  const msSport: "mlb" | "nhl" | "nba" | null =
    game.sport === "baseball"
      ? "mlb"
      : game.sport === "ice-hockey"
        ? "nhl"
        : game.sport === "basketball"
          ? "nba"
          : null;
  if (!msSport) return null;

  const homeKey = findMultiSportTeamKey(msSport, game.home.name, game.home.code);
  const awayKey = findMultiSportTeamKey(msSport, game.away.name, game.away.code);

  if (homeKey && awayKey) {
    const intel = buildUnifiedMultiSportMatchIntelligenceV5({
      matchId: game.id,
      sport: msSport,
      homeKey,
      awayKey,
      homeTeam: game.home.name,
      awayTeam: game.away.name,
      stateArtifact: multisportState,
      inplayArtifactV5: inplayArtifact,
      neutralSite: game.neutralSite,
    });

    const extraMarkets: PlatformMarketRow[] = [];
    const highlights: Array<{ label: string; value: string; sub?: string }> = [];
    const msOut = intel.multiSportOutlook;

    if (msOut?.sport === "mlb") {
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
    } else if (msOut?.sport === "nhl") {
      highlights.push(
        {
          label: "Probabilidad de Prórroga / SO",
          value: `${(msOut.p_ot_reg * 100).toFixed(1)} %`,
          sub: `Goles proyectados ${(msOut.expected_goals_home_full + msOut.expected_goals_away_full).toFixed(2)}`,
        },
        {
          label: `Puck Line ${game.home.shortName} (-1.5)`,
          value: `${(msOut.p_puckline_home_minus_1_5 * 100).toFixed(1)} %`,
          sub: `Incluye ajuste por portería vacía`,
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
    } else if (msOut?.sport === "nba") {
      highlights.push(
        {
          label: "Margen proyectado",
          value: `${msOut.expected_margin >= 0 ? "+" : ""}${msOut.expected_margin.toFixed(1)} pts`,
          sub: `Total proyectado ${msOut.expected_total.toFixed(1)} pts`,
        },
        {
          label: "Probabilidad de Prórroga",
          value: `${(msOut.p_overtime * 100).toFixed(1)} %`,
          sub: `Banda epistémica calibrada al 90 %`,
        },
      );
    }

    const ep = intel.pointsSportEarlyPayout;
    const earlyPayout: EarlyPayoutSummaryView | null = ep
      ? {
          triggerLabel: msSport === "mlb" ? `Ventaja de +${ep.triggerLead} carreras` : `Ventaja de +${ep.triggerLead} pts`,
          homeWinProb: round4(ep.pHomeEarlyPayoutWin),
          awayWinProb: round4(ep.pAwayEarlyPayoutWin),
          homeLiftPts: round1(ep.homeEarlyPayoutLift * 100),
          awayLiftPts: round1(ep.awayEarlyPayoutLift * 100),
          fairHomeDecimal: round2(ep.fairOddsHomeEarlyPayout.decimal),
          fairAwayDecimal: round2(ep.fairOddsAwayEarlyPayout.decimal),
          validatedOos: false,
        }
      : null;

    const pH = intel.coreProbabilities.pHome;
    const pA = intel.coreProbabilities.pAway;
    const fallbackOutlook: MatchOutlookSummary | null = !options.hasV32Outlook
      ? {
          generatedAtUtc: game.kickoffUtc,
          mostLikely:
            pH >= pA
              ? {
                  label: `Gana ${game.home.name}`,
                  p: round4(pH),
                  fairDecimal: round2(intel.coreProbabilities.fairOddsHome.decimal),
                }
              : {
                  label: `Gana ${game.away.name}`,
                  p: round4(pA),
                  fairDecimal: round2(intel.coreProbabilities.fairOddsAway.decimal),
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
          home: toBandView(intel.epistemicUncertainty90.homeBand90),
          draw: null,
          away: toBandView(intel.epistemicUncertainty90.awayBand90),
        },
        earlyPayout,
        multisportSpecials: highlights.length > 0 ? { sport: msSport, highlights } : null,
        verifiedSummaryEs: intel.verifiedSummaryEs,
        guardrailPassed: intel.guardrailAudit.passed,
      },
      extraMarkets,
      fallbackOutlook,
    };
  }

  // Fallback ligero solo con bandas epistémicas + resumen verificado si el equipo no está en stateArtifact
  const [rawH, , rawA] = game.x12;
  const twoWay = Math.max(rawH + rawA, 1e-6);
  const pH = clampProb(rawH / twoWay);
  const pA = clampProb(rawA / twoWay);
  const epistemic = buildMatchEpistemicSummaryV5({
    pHome: pH,
    pDraw: null,
    pAway: pA,
    effectiveSampleGames: msSport === "mlb" ? 50 : 32,
    sport: "multisport",
    calibrationArtifact: epistemicArtifact,
  });
  const facts = buildVerifiedMatchFactSheet({
    matchId: game.id,
    sport: msSport,
    homeTeam: game.home.name,
    awayTeam: game.away.name,
    pHome: pH,
    pDraw: null,
    pAway: pA,
    expectedTotal: game.projection?.total ?? (msSport === "nba" ? 224 : msSport === "nhl" ? 6.0 : 8.5),
    canonicalTotalLine: game.goalLine?.line ?? (msSport === "nba" ? 224.5 : msSport === "nhl" ? 6.0 : 8.5),
    pOverCanonical: game.goalLine?.pOver ?? 0.5,
  });
  const verifiedSummaryEs = compileDeterministicVerifiedSummaryEs(facts);
  return {
    v5: {
      epistemic: {
        home: toBandView(epistemic.homeBand90),
        draw: null,
        away: toBandView(epistemic.awayBand90),
      },
      verifiedSummaryEs,
      guardrailPassed: validateNarrativeAgainstFactSheet(verifiedSummaryEs, facts).passed,
    },
    extraMarkets: [],
    fallbackOutlook: null,
  };
}

/**
 * Evalúa probabilidades dinámicas en vivo para un partido de fútbol en curso (`< 0.15 ms`, DP exacto).
 */
export function evaluateLiveInPlaySoccerV5(params: {
  readonly pregameMuHome: number;
  readonly pregameMuAway: number;
  readonly currentMinute: number;
  readonly currentHomeGoals: number;
  readonly currentAwayGoals: number;
  readonly redCardsHome?: number;
  readonly redCardsAway?: number;
}): LiveInPlayWinProb {
  const res = evaluateSoccerEarlyPayoutAndInPlay({
    pregameMuHome: Math.max(0.25, Math.min(5.0, params.pregameMuHome)),
    pregameMuAway: Math.max(0.25, Math.min(5.0, params.pregameMuAway)),
    currentMinute: Math.max(0, Math.min(90, Math.round(params.currentMinute))),
    currentHomeGoals: Math.max(0, Math.min(10, Math.round(params.currentHomeGoals))),
    currentAwayGoals: Math.max(0, Math.min(10, Math.round(params.currentAwayGoals))),
    redCardsHome: Math.max(0, Math.min(4, Math.round(params.redCardsHome ?? 0))),
    redCardsAway: Math.max(0, Math.min(4, Math.round(params.redCardsAway ?? 0))),
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

/**
 * Evalúa un Same-Game Parlay (2..8 selecciones del mismo partido) con Cópula Student-t QMC
 * determinista + auditoría de margen oculto cuando el usuario ingresa el momio de su casa.
 */
export function evaluateSgpCopulaV5(params: {
  readonly sport: "soccer" | "nfl";
  readonly legs: readonly SgpLegInput[];
  readonly offeredCombinedDecimalOdds?: number | null;
}): SgpCopulaAuditView {
  const evaluated = evaluateStudentTSameGameParlayV5({
    sport: params.sport,
    legs: params.legs,
    artifact: sgpArtifact,
    offeredCombinedDecimalOdds: params.offeredCombinedDecimalOdds ?? null,
  });

  return {
    sport: evaluated.sport,
    nLegs: evaluated.nLegs,
    independentProbability: round4(evaluated.independentProbability),
    jointProbability: round4(evaluated.jointProbability),
    correlationMultiplier: round4(evaluated.correlationMultiplier),
    correlationDirection: evaluated.correlationDirection,
    fairCombinedDecimal: round2(evaluated.fairCombinedOdds.decimal),
    fairCombinedAmerican: Math.round(evaluated.fairCombinedOdds.american),
    bookQuoteAudit: evaluated.bookQuoteAudit
      ? {
          offeredDecimal: round2(evaluated.bookQuoteAudit.offeredCombinedDecimalOdds),
          impliedBookProbability: round4(evaluated.bookQuoteAudit.impliedBookProbability),
          fairCombinedDecimal: round2(evaluated.bookQuoteAudit.fairCombinedDecimalOdds),
          effectiveHoldPct: round1(evaluated.bookQuoteAudit.effectiveHoldPct),
          taxFlag: evaluated.bookQuoteAudit.taxFlag,
        }
      : null,
  };
}

/**
 * Guardrail anti-alucinación de Spacetime v5.1 para auditar cualquier resumen narrativo de Cortex IA.
 */
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

/**
 * Síntesis determinista verificada en español (US$0, 0 ms, 0 alucinaciones) como respaldo
 * cuando Cortex IA vía OpenRouter no está disponible o un partido aún no tiene caché.
 */
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
