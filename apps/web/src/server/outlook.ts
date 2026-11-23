import {
  asMarketKey,
  isPermittedMarketQuoteBook,
  parseStrictFiniteNumber,
  type AnalysisMarketGroup,
  type AnalysisMarketRow,
  type MatchAnalysis,
} from "@pitchlab/contracts";
import {
  probabilityToFairOdds,
  type MarketOutlook,
  type MatchOutlook,
} from "@pitchlab/spacetime";
import liveSnapshotJson from "@pitchlab/spacetime/data/live_matchday_v3_snapshot.json";
import type { MatchOutlookSummary, PlatformMarketRow, SpacetimeSignal } from "@pitchlab/ui/types";
import {
  bookLabelWithDate,
  formatBookLabel,
  isMarketFresh,
  LEAGUE_TO_V3,
  teamScore,
} from "./spacetime";
import {
  annotatePublishedRows,
  buildDerivedOutlookExtras,
} from "./outlook-derived-rows";
import {
  calibratePlayableOddsV6,
  isSoccer57LeagueV6,
  recalibrateSoccer57MatchServerV6,
  type Soccer57PrekickoffRecalibratedOutlookV60,
  type VennAbersPlayableEvaluationV60,
} from "./spacetime-v6";

interface OutlookSnapshot {
  generated_at?: string;
  outlooks_meta?: { generated_at_utc?: string };
  outlooks?: MatchOutlook[];
}

function parseOutlookSnapshot(raw: unknown): OutlookSnapshot {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as {
    generated_at?: unknown;
    outlooks_meta?: unknown;
    outlooks?: unknown;
  };
  const meta =
    obj.outlooks_meta && typeof obj.outlooks_meta === "object"
      ? (obj.outlooks_meta as { generated_at_utc?: unknown })
      : null;
  return {
    ...(typeof obj.generated_at === "string" ? { generated_at: obj.generated_at } : {}),
    ...(meta && typeof meta.generated_at_utc === "string"
      ? { outlooks_meta: { generated_at_utc: meta.generated_at_utc } }
      : {}),
    ...(Array.isArray(obj.outlooks) ? { outlooks: obj.outlooks as MatchOutlook[] } : {}),
  };
}

const snapshot = parseOutlookSnapshot(liveSnapshotJson);

export const OUTLOOK_SNAPSHOT_GENERATED_AT: string | null =
  snapshot.generated_at ?? snapshot.outlooks_meta?.generated_at_utc ?? null;

const STALE_OUTLOOK_DELTA_MS = 24 * 3_600_000;
const MAX_OUTLOOK_TOTAL_INFLATION = 0.35;
const MAX_OUTLOOK_OVER35_INFLATION = 0.06;

const ES_SHORT_MONTH_INDEX: Readonly<Record<string, number>> = {
  ene: 0,
  feb: 1,
  mar: 2,
  abr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dic: 11,
};

const MARKET_GROUPS: Readonly<Record<string, { group: string; market: string }>> = {
  "1x2": { group: "Resultado 1X2", market: "1x2" },
  moneyline: { group: "Ganador", market: "moneyline" },
  double_chance: { group: "Doble oportunidad", market: "double_chance" },
  totals_1_5: { group: "Total de goles", market: "totals" },
  totals_2_5: { group: "Total de goles", market: "totals" },
  totals_3_5: { group: "Total de goles", market: "totals" },
  btts: { group: "Ambos anotan", market: "btts" },
  dnb: { group: "Empate no acción", market: "dnb" },
  "ah_-1_0": { group: "Hándicap asiático", market: "handicap" },
  "ah_-0_5": { group: "Hándicap asiático", market: "handicap" },
  ah_0_5: { group: "Hándicap asiático", market: "handicap" },
  ah_1_0: { group: "Hándicap asiático", market: "handicap" },
  spread: { group: "Hándicap", market: "spread" },
  totals: { group: "Total de puntos", market: "totals" },
};

interface TeamNames {
  league: string;
  home: { name: string };
  away: { name: string };
}

interface TotalRowLike {
  readonly market: string;
  readonly selection: string;
  readonly line?: number | null;
  readonly p: number;
}

export interface OutlookGameInput extends TeamNames {
  projection?: { total: number } | null;
  markets?: readonly TotalRowLike[];
  marketGroups?: readonly AnalysisMarketGroup[];
  generatedAt?: string | null;
  inputsAsOf?: string | null;
  updatedAt?: string | null;
  updatedAtLabel?: string | null;
}

let byLeague: Map<string, MatchOutlook[]> | null = null;

function outlooksByLeague(): Map<string, MatchOutlook[]> {
  if (byLeague) return byLeague;
  byLeague = new Map();
  for (const o of snapshot.outlooks ?? []) {
    const list = byLeague.get(o.league) ?? [];
    list.push(o);
    byLeague.set(o.league, list);
  }
  return byLeague;
}

export function findOutlook(game: TeamNames): MatchOutlook | null {
  if (game.league === "nba" || game.league === "nhl" || game.league === "mlb") return null;
  const league = LEAGUE_TO_V3[game.league] ?? game.league;
  let top: MatchOutlook | null = null;
  let topScore = 0;
  for (const o of outlooksByLeague().get(league) ?? []) {
    const home = teamScore(o.homeTeam, game.home.name);
    const away = teamScore(o.awayTeam, game.away.name);
    const score = home > 0 && away > 0 ? home + away : 0;
    if (score > topScore) {
      top = o;
      topScore = score;
    }
  }
  return top;
}

function parseTimestampMs(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const direct = Date.parse(trimmed);
  if (Number.isFinite(direct)) return direct;
  const esMatch =
    /^(\d{1,2})\s+([a-záéíóúñ]+)\.?\s+(?:de\s+)?(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/i.exec(trimmed);
  if (!esMatch) return null;
  const day = Number.parseInt(esMatch[1] ?? "", 10);
  const monthKey = (esMatch[2] ?? "").toLowerCase();
  const month = ES_SHORT_MONTH_INDEX[monthKey];
  const year = Number.parseInt(esMatch[3] ?? "", 10);
  const hour = esMatch[4] ? Number.parseInt(esMatch[4], 10) : 0;
  const minute = esMatch[5] ? Number.parseInt(esMatch[5], 10) : 0;
  if (
    month === undefined ||
    !Number.isFinite(day) ||
    !Number.isFinite(year) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }
  return Date.UTC(year, month, day, hour + 6, minute);
}

function resolveOutlookGeneratedAtMs(o: MatchOutlook): number | null {
  const candidates = [
    o.tsDecision,
    snapshot.generated_at,
    snapshot.outlooks_meta?.generated_at_utc,
  ];
  for (const iso of candidates) {
    const parsed = parseTimestampMs(iso);
    if (parsed !== null) return parsed;
  }
  return null;
}

function resolveGameGeneratedAtMs(
  game: OutlookGameInput,
  snapshotGeneratedAt?: string | null,
): number | null {
  const candidates = [
    snapshotGeneratedAt,
    game.generatedAt,
    game.inputsAsOf,
    game.updatedAt,
    game.updatedAtLabel,
  ];
  for (const candidate of candidates) {
    const parsed = parseTimestampMs(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function isOver35Row(row: TotalRowLike): boolean {
  const market = row.market.toLowerCase();
  const selection = row.selection.toLowerCase();
  if (market === "totals_3_5") {
    return selection === "over" || selection === "over_3.5" || selection === "over_3_5";
  }
  if (market !== "totals") return false;
  if (selection === "over_3.5" || selection === "over_3_5") return true;
  return (selection === "over" || selection.startsWith("over_")) && row.line === 3.5;
}

function extractLocalOver35Prob(rows: readonly TotalRowLike[] | undefined): number | null {
  if (!rows || rows.length === 0) return null;
  for (const r of rows) {
    if (isOver35Row(r) && typeof r.p === "number" && Number.isFinite(r.p)) {
      return r.p;
    }
  }
  return null;
}

function extractMatchOver35Prob(
  groups: readonly AnalysisMarketGroup[] | undefined,
): number | null {
  if (!groups || groups.length === 0) return null;
  for (const grp of groups) {
    const found = extractLocalOver35Prob(grp.rows);
    if (found !== null) return found;
  }
  return null;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function poissonOver35(totalGoals: number): number {
  if (!Number.isFinite(totalGoals) || totalGoals <= 0) return 0;
  const expNeg = Math.exp(-totalGoals);
  const pLe3 =
    expNeg *
    (1 + totalGoals + (totalGoals * totalGoals) / 2 + (totalGoals * totalGoals * totalGoals) / 6);
  return clamp01(1 - pLe3);
}

function outlookOver35Prob(outlook: MatchOutlook): number | null {
  const fromKey = sel(outlook, "totals_3_5", "over")?.p;
  if (typeof fromKey === "number" && Number.isFinite(fromKey)) return fromKey;
  const fromMarkets = outlook.markets
    .find((m) => m.marketKey === "totals_3_5")
    ?.selections.find((s) => s.selection === "over")?.p;
  return typeof fromMarkets === "number" && Number.isFinite(fromMarkets) ? fromMarkets : null;
}

export function isStaleInflatedFootballOutlook(
  outlook: MatchOutlook,
  matchTotalGoals: number | null | undefined,
  matchGeneratedAtMs: number | null | undefined,
  outlookGeneratedAtMs: number | null | undefined,
  localOver35Prob?: number | null,
): boolean {
  if (outlook.sport !== "football" || !outlook.dixonColesParams) return false;
  if (
    typeof matchGeneratedAtMs !== "number" ||
    !Number.isFinite(matchGeneratedAtMs) ||
    typeof outlookGeneratedAtMs !== "number" ||
    !Number.isFinite(outlookGeneratedAtMs)
  ) {
    return false;
  }
  if (matchGeneratedAtMs - outlookGeneratedAtMs <= STALE_OUTLOOK_DELTA_MS) {
    return false;
  }
  if (
    typeof matchTotalGoals !== "number" ||
    !Number.isFinite(matchTotalGoals) ||
    matchTotalGoals <= 0.5
  ) {
    return false;
  }
  const outlookTotal = outlook.dixonColesParams.lamHome + outlook.dixonColesParams.lamAway;
  if (!Number.isFinite(outlookTotal)) return false;
  if (outlookTotal - matchTotalGoals > MAX_OUTLOOK_TOTAL_INFLATION) {
    return true;
  }
  const over35Outlook = outlookOver35Prob(outlook);
  if (over35Outlook === null) return false;
  const baselineOver35 =
    typeof localOver35Prob === "number" &&
    Number.isFinite(localOver35Prob) &&
    localOver35Prob >= 0 &&
    localOver35Prob <= 1
      ? localOver35Prob
      : poissonOver35(matchTotalGoals);
  return over35Outlook - baselineOver35 > MAX_OUTLOOK_OVER35_INFLATION;
}

function relabel(label: string, o: MatchOutlook, game: TeamNames): string {
  return label.split(o.homeTeam).join(game.home.name).split(o.awayTeam).join(game.away.name);
}

function isPermittedFreshMarketBlock(
  market: MarketOutlook["market"],
  nowMs: number,
): market is NonNullable<MarketOutlook["market"]> {
  if (!market || !isMarketFresh(market.tsCaptured, nowMs)) return false;
  return isPermittedMarketQuoteBook(market.book, formatBookLabel(market.book));
}

function rowsOf(
  m: MarketOutlook,
  o: MatchOutlook,
  game: TeamNames,
  nowMs: number = Date.now(),
): PlatformMarketRow[] {
  const meta = MARKET_GROUPS[m.marketKey];
  if (!meta) return [];
  const freshQuote = isPermittedFreshMarketBlock(m.market, nowMs) ? m.market : null;
  const quoteBookLabel = freshQuote ? formatBookLabel(freshQuote.book) : null;
  const baseLine = typeof m.line === "number" && Number.isFinite(m.line) ? m.line : undefined;
  return m.selections.map((s) => {
    const rawPrice = freshQuote?.oddsBySelection?.[s.selection];
    const currentDecimal =
      typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 1 ? rawPrice : null;
    const rowLine =
      baseLine === undefined
        ? undefined
        : (meta.market === "handicap" || meta.market === "spread") &&
            s.selection.toLowerCase() === "away"
          ? baseLine === 0
            ? 0
            : -baseLine
          : baseLine;
    return {
      group: meta.group,
      market: meta.market,
      selection: s.selection,
      label: relabel(s.label, o, game),
      ...(rowLine !== undefined ? { line: rowLine } : {}),
      p: s.p,
      fairDecimal: s.fairOdds.decimal,
      fairAmerican: s.fairOdds.american,
      openDecimal: null,
      currentDecimal,
      quoteBookLabel: currentDecimal !== null ? quoteBookLabel : null,
      quoteCapturedAtUtc: currentDecimal !== null && freshQuote ? freshQuote.tsCaptured : null,
      edgePts: null,
    };
  });
}

export interface OutlookDetail {
  markets: PlatformMarketRow[];
  outlook: MatchOutlookSummary;
}

export function outlookDetailFromMatchOutlook(
  o: MatchOutlook,
  game: TeamNames,
  options: { generatedAtUtc?: string; nowMs?: number } = {},
): OutlookDetail | null {
  const nowMs = options.nowMs ?? Date.now();
  const publishedMarkets = o.markets.flatMap((m) =>
    annotatePublishedRows(
      m.marketKey,
      m.line,
      m.headline.selection,
      rowsOf(m, o, game, nowMs),
    ),
  );
  if (publishedMarkets.length === 0) return null;
  const derivedExtras = buildDerivedOutlookExtras(o, game);
  const markets = [...publishedMarkets, ...derivedExtras.rows];

  const result = o.marketsByKey["1x2"] ?? o.marketsByKey.moneyline ?? null;
  const freshBlocks = o.markets.filter((m) => isPermittedFreshMarketBlock(m.market, nowMs));
  const preferredFresh =
    result?.market && isPermittedFreshMarketBlock(result.market, nowMs)
      ? result.market
      : freshBlocks[0]?.market ?? null;

  return {
    markets,
    outlook: {
      generatedAtUtc: options.generatedAtUtc ?? snapshot.outlooks_meta?.generated_at_utc ?? o.tsDecision,
      mostLikely: result
        ? {
            label:
              result.headline.selection === "home"
                ? `Gana ${game.home.name}`
                : result.headline.selection === "away"
                  ? `Gana ${game.away.name}`
                  : "Empate",
            p: result.headline.p,
            fairDecimal: result.headline.fairOdds.decimal,
          }
        : null,
      scorelines: derivedExtras.scorelines,
      quality: {
        flag: o.dataQuality.flag,
        coveragePct: Math.round(o.dataQuality.coverageRatio * 100),
      },
      hasRecentQuote: freshBlocks.length > 0,
      latestQuote: preferredFresh
        ? {
            bookLabel: formatBookLabel(preferredFresh.book),
            capturedAtUtc: preferredFresh.tsCaptured,
          }
        : null,
    },
  };
}

export function outlookDetailFor(
  game: OutlookGameInput,
  nowMs: number = Date.now(),
  snapshotGeneratedAt?: string | null,
): OutlookDetail | null {
  const o = findOutlook(game);
  if (!o) return null;
  const matchGeneratedAtMs = resolveGameGeneratedAtMs(game, snapshotGeneratedAt);
  const outlookGeneratedAtMs = resolveOutlookGeneratedAtMs(o);
  const localOver35 =
    extractLocalOver35Prob(game.markets) ?? extractMatchOver35Prob(game.marketGroups);
  if (
    isStaleInflatedFootballOutlook(
      o,
      game.projection?.total,
      matchGeneratedAtMs,
      outlookGeneratedAtMs,
      localOver35,
    )
  ) {
    return null;
  }
  return outlookDetailFromMatchOutlook(o, game, { nowMs });
}

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

function fairOddsOf(p: number): { decimal: number; american: number } {
  const safeP = Number.isFinite(p) ? Math.max(0.01, Math.min(0.99, p)) : 0.5;
  const { decimal, american } = probabilityToFairOdds(safeP);
  return { decimal, american };
}

function row(
  market: string,
  selection: string,
  label: string,
  p: number,
  fairOdds: number,
  line?: number,
): AnalysisMarketRow {
  return {
    market: asMarketKey(market),
    selection,
    label,
    ...(line !== undefined ? { line } : {}),
    p,
    fairOdds,
  };
}

function sel(o: MatchOutlook, key: string, selection: string) {
  return o.marketsByKey[key as keyof MatchOutlook["marketsByKey"]]?.selections.find(
    (s) => s.selection === selection,
  );
}

const COUNT_MARKETS = new Set(["corners_total", "fouls_total", "yellow_total"]);
const CORE_V6_SOCCER_MARKETS = new Set([
  "h2h",
  "1x2",
  "double_chance",
  "totals",
  "btts",
  "dnb",
  "correct_score",
]);

function preserveCountGroups(groups: readonly AnalysisMarketGroup[] | undefined): AnalysisMarketGroup[] {
  if (!groups || groups.length === 0) return [];
  return groups.filter((group) => group.rows.some((r) => COUNT_MARKETS.has(r.market)));
}

function preserveNonCoreSoccerGroups(
  groups: readonly AnalysisMarketGroup[] | undefined,
): AnalysisMarketGroup[] {
  if (!groups || groups.length === 0) return [];
  return groups.filter((group) => group.rows.some((r) => !CORE_V6_SOCCER_MARKETS.has(r.market)));
}

export interface SoccerV6OutlookEnrichment {
  readonly league: string;
  readonly recalibrated: Soccer57PrekickoffRecalibratedOutlookV60;
  readonly playableVennAbers: Soccer57PrekickoffRecalibratedOutlookV60["playableVennAbers"];
}

export function calibrateOutlookPlayableProbV6(
  pRaw: number,
  league: string,
): VennAbersPlayableEvaluationV60 {
  return calibratePlayableOddsV6({ pRaw, league });
}

export function recalibrateSoccerOutlookV6(
  match: Pick<MatchAnalysis, "sport" | "league" | "x12" | "projection">,
): SoccerV6OutlookEnrichment | null {
  if (match.sport !== "football") return null;
  const league = String(match.league);
  if (!isSoccer57LeagueV6(league)) return null;
  if (!match.x12 || !match.projection) return null;
  const [rawH, rawD, rawA] = match.x12;
  const sum = rawH + rawD + rawA;
  if (
    !Number.isFinite(sum) ||
    sum <= 0 ||
    !Number.isFinite(match.projection.home) ||
    !Number.isFinite(match.projection.away) ||
    match.projection.home <= 0 ||
    match.projection.away <= 0
  ) {
    return null;
  }
  const recalibrated = recalibrateSoccer57MatchServerV6({
    league,
    rawProjHome: match.projection.home,
    rawProjAway: match.projection.away,
    rawX12: [rawH, rawD, rawA],
  });
  if (!recalibrated) return null;
  return {
    league: recalibrated.league,
    recalibrated,
    playableVennAbers: recalibrated.playableVennAbers,
  };
}

function resolveV6PlayableBinaryTotals25(rec: Soccer57PrekickoffRecalibratedOutlookV60): {
  readonly over: number;
  readonly under: number;
} {
  const vaOver = rec.playableVennAbers.over25;
  const vaUnder = rec.playableVennAbers.under25;
  const minOver = Math.min(0.995, rec.markets.totals_3_5.over + 0.002);
  const maxOver = Math.max(minOver, rec.markets.totals_1_5.over - 0.002);
  let pOver = rec.markets.totals_2_5.over;
  if (vaOver.inPlayableZone) {
    pOver = Math.max(minOver, Math.min(maxOver, vaOver.pCalibrated));
  } else if (vaUnder.inPlayableZone) {
    pOver = Math.max(minOver, Math.min(maxOver, 1 - vaUnder.pCalibrated));
  }
  const pOverClamped = Math.max(0.002, Math.min(0.998, pOver));
  return { over: round4(pOverClamped), under: round4(1 - pOverClamped) };
}

function resolveV6PlayableBtts(rec: Soccer57PrekickoffRecalibratedOutlookV60): {
  readonly yes: number;
  readonly no: number;
} {
  const vaYes = rec.playableVennAbers.bttsYes;
  const pYes = vaYes.inPlayableZone ? vaYes.pCalibrated : rec.markets.btts.yes;
  const pYesClamped = Math.max(0.002, Math.min(0.998, pYes));
  return { yes: round4(pYesClamped), no: round4(1 - pYesClamped) };
}

function footballGroupsFromV6(
  rec: Soccer57PrekickoffRecalibratedOutlookV60,
  match: MatchAnalysis,
): AnalysisMarketGroup[] {
  const m = rec.markets;
  const tot25 = resolveV6PlayableBinaryTotals25(rec);
  const btts = resolveV6PlayableBtts(rec);
  const groups: AnalysisMarketGroup[] = [
    {
      group: "Resultado",
      rows: [
        row("h2h", "home", `${match.home.name} gana`, round4(m["1x2"].home), fairOddsOf(m["1x2"].home).decimal),
        row("h2h", "draw", "Empate", round4(m["1x2"].draw), fairOddsOf(m["1x2"].draw).decimal),
        row("h2h", "away", `${match.away.name} gana`, round4(m["1x2"].away), fairOddsOf(m["1x2"].away).decimal),
      ],
    },
    {
      group: "Doble oportunidad",
      rows: [
        row(
          "double_chance",
          "1x",
          `${match.home.name} o empate`,
          round4(m.double_chance["1X"]),
          fairOddsOf(m.double_chance["1X"]).decimal,
        ),
        row(
          "double_chance",
          "x2",
          `${match.away.name} o empate`,
          round4(m.double_chance.X2),
          fairOddsOf(m.double_chance.X2).decimal,
        ),
        row(
          "double_chance",
          "12",
          "Sin empate",
          round4(m.double_chance["12"]),
          fairOddsOf(m.double_chance["12"]).decimal,
        ),
      ],
    },
    {
      group: "Goles totales",
      rows: [
        row("totals", "over_1.5", "Más de 1.5 goles", round4(m.totals_1_5.over), fairOddsOf(m.totals_1_5.over).decimal, 1.5),
        row("totals", "under_1.5", "Menos de 1.5 goles", round4(m.totals_1_5.under), fairOddsOf(m.totals_1_5.under).decimal, 1.5),
        row("totals", "over_2.5", "Más de 2.5 goles", tot25.over, fairOddsOf(tot25.over).decimal, 2.5),
        row("totals", "under_2.5", "Menos de 2.5 goles", tot25.under, fairOddsOf(tot25.under).decimal, 2.5),
        row("totals", "over_3.5", "Más de 3.5 goles", round4(m.totals_3_5.over), fairOddsOf(m.totals_3_5.over).decimal, 3.5),
        row("totals", "under_3.5", "Menos de 3.5 goles", round4(m.totals_3_5.under), fairOddsOf(m.totals_3_5.under).decimal, 3.5),
      ],
    },
    {
      group: "Ambos anotan",
      rows: [
        row("btts", "yes", "Sí", btts.yes, fairOddsOf(btts.yes).decimal),
        row("btts", "no", "No", btts.no, fairOddsOf(btts.no).decimal),
      ],
    },
    {
      group: "Empate no acción",
      rows: [
        row("dnb", "home", match.home.name, round4(m.dnb.home), fairOddsOf(m.dnb.home).decimal),
        row("dnb", "away", match.away.name, round4(m.dnb.away), fairOddsOf(m.dnb.away).decimal),
      ],
    },
    {
      group: "Marcador exacto (más probables)",
      rows: m.topScorelines.map((s) =>
        row(
          "correct_score",
          `${s.homeGoals}-${s.awayGoals}`,
          `${s.homeGoals}–${s.awayGoals}`,
          round4(s.probability),
          s.fairOdds.decimal,
        ),
      ),
    },
  ];
  return groups;
}

export function buildV6SoccerOutlookDetail(
  game: OutlookGameInput & {
    readonly x12?: readonly [number, number, number] | null;
    readonly projection?: { readonly home: number; readonly away: number; readonly total: number } | null;
    readonly kickoffUtc?: string | null;
  },
): OutlookDetail | null {
  if (!isSoccer57LeagueV6(game.league)) return null;
  if (!game.x12 || !game.projection) return null;
  const [rawH, rawD, rawA] = game.x12;
  const sum = rawH + rawD + rawA;
  if (
    !Number.isFinite(sum) ||
    sum <= 0 ||
    !Number.isFinite(game.projection.home) ||
    !Number.isFinite(game.projection.away) ||
    game.projection.home <= 0 ||
    game.projection.away <= 0
  ) {
    return null;
  }
  const rec = recalibrateSoccer57MatchServerV6({
    league: game.league,
    rawProjHome: game.projection.home,
    rawProjAway: game.projection.away,
    rawX12: [rawH, rawD, rawA],
  });
  if (!rec) return null;
  const m = rec.markets;
  const tot25 = resolveV6PlayableBinaryTotals25(rec);
  const btts = resolveV6PlayableBtts(rec);
  const makeRow = (
    group: string,
    market: string,
    selection: string,
    label: string,
    p: number,
    cardCategory: NonNullable<PlatformMarketRow["cardCategory"]>,
    cardTitle: string,
    isMostLikely: boolean,
    line?: number,
  ): PlatformMarketRow => {
    const fair = fairOddsOf(p);
    return {
      group,
      market,
      selection,
      label,
      ...(line !== undefined ? { line } : {}),
      p: round4(p),
      fairDecimal: fair.decimal,
      fairAmerican: fair.american,
      openDecimal: null,
      currentDecimal: null,
      quoteBookLabel: null,
      quoteCapturedAtUtc: null,
      edgePts: null,
      isDerived: false,
      cardCategory,
      cardTitle,
      isMostLikely,
    };
  };

  const pH = m["1x2"].home;
  const pD = m["1x2"].draw;
  const pA = m["1x2"].away;
  const top1x2 = pH >= pD && pH >= pA ? "home" : pA >= pD ? "away" : "draw";

  const markets: PlatformMarketRow[] = [
    makeRow("Resultado 1X2", "1x2", "home", `Gana ${game.home.name}`, pH, "resultado", "Resultado 1X2", top1x2 === "home"),
    makeRow("Resultado 1X2", "1x2", "draw", "Empate", pD, "resultado", "Resultado 1X2", top1x2 === "draw"),
    makeRow("Resultado 1X2", "1x2", "away", `Gana ${game.away.name}`, pA, "resultado", "Resultado 1X2", top1x2 === "away"),
    makeRow("Doble oportunidad", "double_chance", "1X", `${game.home.name} o empate`, m.double_chance["1X"], "resultado", "Doble oportunidad", m.double_chance["1X"] >= m.double_chance.X2 && m.double_chance["1X"] >= m.double_chance["12"]),
    makeRow("Doble oportunidad", "double_chance", "12", "Sin empate", m.double_chance["12"], "resultado", "Doble oportunidad", m.double_chance["12"] > m.double_chance["1X"] && m.double_chance["12"] >= m.double_chance.X2),
    makeRow("Doble oportunidad", "double_chance", "X2", `${game.away.name} o empate`, m.double_chance.X2, "resultado", "Doble oportunidad", m.double_chance.X2 > m.double_chance["1X"] && m.double_chance.X2 > m.double_chance["12"]),
    makeRow("Total de goles", "totals", "over", "Más de 1.5 goles", m.totals_1_5.over, "goles", "Total de goles (1.5)", m.totals_1_5.over >= m.totals_1_5.under, 1.5),
    makeRow("Total de goles", "totals", "under", "Menos de 1.5 goles", m.totals_1_5.under, "goles", "Total de goles (1.5)", m.totals_1_5.under > m.totals_1_5.over, 1.5),
    makeRow("Total de goles", "totals", "over", "Más de 2.5 goles", tot25.over, "goles", "Total de goles (2.5)", tot25.over >= tot25.under, 2.5),
    makeRow("Total de goles", "totals", "under", "Menos de 2.5 goles", tot25.under, "goles", "Total de goles (2.5)", tot25.under > tot25.over, 2.5),
    makeRow("Total de goles", "totals", "over", "Más de 3.5 goles", m.totals_3_5.over, "goles", "Total de goles (3.5)", m.totals_3_5.over >= m.totals_3_5.under, 3.5),
    makeRow("Total de goles", "totals", "under", "Menos de 3.5 goles", m.totals_3_5.under, "goles", "Total de goles (3.5)", m.totals_3_5.under > m.totals_3_5.over, 3.5),
    makeRow("Ambos anotan", "btts", "yes", "Sí", btts.yes, "goles", "Ambos anotan", btts.yes >= btts.no),
    makeRow("Ambos anotan", "btts", "no", "No", btts.no, "goles", "Ambos anotan", btts.no > btts.yes),
    makeRow("Empate no acción", "dnb", "home", game.home.name, m.dnb.home, "resultado", "Empate no acción", m.dnb.home >= m.dnb.away),
    makeRow("Empate no acción", "dnb", "away", game.away.name, m.dnb.away, "resultado", "Empate no acción", m.dnb.away > m.dnb.home),
  ];

  const mostLikely =
    top1x2 === "home"
      ? { label: `Gana ${game.home.name}`, p: round4(pH), fairDecimal: m["1x2"].fairOddsHome.decimal }
      : top1x2 === "away"
        ? { label: `Gana ${game.away.name}`, p: round4(pA), fairDecimal: m["1x2"].fairOddsAway.decimal }
        : { label: "Empate", p: round4(pD), fairDecimal: m["1x2"].fairOddsDraw.decimal };

  const isActive = rec.competitionStatus === "causal_walk_forward_2026_active";
  return {
    markets,
    outlook: {
      generatedAtUtc: game.generatedAt ?? game.kickoffUtc ?? new Date().toISOString(),
      mostLikely,
      scorelines: m.topScorelines.map((s) => ({
        home: s.homeGoals,
        away: s.awayGoals,
        p: round4(s.probability),
        fairDecimal: s.fairOdds.decimal,
      })),
      quality: {
        flag: isActive ? "ok" : "fallback_base_rate",
        coveragePct: isActive ? 92 : 75,
      },
      hasRecentQuote: false,
      latestQuote: null,
    },
  };
}

function footballGroups(o: MatchOutlook, match: MatchAnalysis): AnalysisMarketGroup[] {
  const groups: AnalysisMarketGroup[] = [];
  const home = sel(o, "1x2", "home");
  const draw = sel(o, "1x2", "draw");
  const away = sel(o, "1x2", "away");
  if (home && draw && away) {
    groups.push({
      group: "Resultado",
      rows: [
        row("h2h", "home", `${match.home.name} gana`, home.p, home.fairOdds.decimal),
        row("h2h", "draw", "Empate", draw.p, draw.fairOdds.decimal),
        row("h2h", "away", `${match.away.name} gana`, away.p, away.fairOdds.decimal),
      ],
    });
  }
  const dc = [
    ["1X", "1x", `${match.home.name} o empate`],
    ["X2", "x2", `${match.away.name} o empate`],
    ["12", "12", "Sin empate"],
  ] as const;
  const dcRows = dc.flatMap(([key, selection, label]) => {
    const s = sel(o, "double_chance", key);
    return s ? [row("double_chance", selection, label, s.p, s.fairOdds.decimal)] : [];
  });
  if (dcRows.length > 0) groups.push({ group: "Doble oportunidad", rows: dcRows });

  const totals = (
    [
      ["1_5", 1.5],
      ["2_5", 2.5],
      ["3_5", 3.5],
    ] as const
  ).flatMap(([k, line]) => {
    const over = sel(o, `totals_${k}`, "over");
    const under = sel(o, `totals_${k}`, "under");
    return [
      ...(over
        ? [row("totals", `over_${line}`, `Más de ${line} goles`, over.p, over.fairOdds.decimal, line)]
        : []),
      ...(under
        ? [
            row(
              "totals",
              `under_${line}`,
              `Menos de ${line} goles`,
              under.p,
              under.fairOdds.decimal,
              line,
            ),
          ]
        : []),
    ];
  });
  if (totals.length > 0) groups.push({ group: "Goles totales", rows: totals });

  const yes = sel(o, "btts", "yes");
  const no = sel(o, "btts", "no");
  if (yes && no) {
    groups.push({
      group: "Ambos anotan",
      rows: [
        row("btts", "yes", "Sí", yes.p, yes.fairOdds.decimal),
        row("btts", "no", "No", no.p, no.fairOdds.decimal),
      ],
    });
  }

  if (o.topScorelines.length > 0) {
    groups.push({
      group: "Marcador exacto (más probables)",
      rows: o.topScorelines.map((s) =>
        row(
          "correct_score",
          `${s.homeGoals}-${s.awayGoals}`,
          `${s.homeGoals}–${s.awayGoals}`,
          s.p,
          s.fairOdds.decimal,
        ),
      ),
    });
  }
  return groups;
}

const CONF_ALTA = 62;
const CONF_MEDIA = 45;
const gamesPlayed = (record: string): number | null => {
  const raw = /(\d+)\s*PJ/i.exec(record)?.[1];
  return raw ? parseStrictFiniteNumber(raw) : null;
};

export function outlookConfidence(
  o: MatchOutlook,
  match: MatchAnalysis,
  favorite: number,
): NonNullable<MatchAnalysis["confidence"]> {
  const isNfl = o.sport === "nfl";
  const floor = isNfl ? 0.5 : 0.34;
  const ceil = isNfl ? 0.85 : 0.75;
  const fav = clamp01((favorite - floor) / (ceil - floor));
  const coverage = clamp01(o.dataQuality.coverageRatio);
  const homeGames = gamesPlayed(match.home.record);
  const awayGames = gamesPlayed(match.away.record);
  const minGames =
    homeGames !== null && awayGames !== null ? Math.min(homeGames, awayGames) : null;
  const sample = minGames !== null ? clamp01(minGames / 10) : 0.5;
  const score = Math.round(100 * (0.5 * fav + 0.3 * coverage + 0.2 * sample));
  const level = score >= CONF_ALTA ? "alta" : score >= CONF_MEDIA ? "media" : "baja";
  const pct = (v: number) => `${Math.round(v * 100)} %`;

  const reasons: string[] = [];
  if (fav >= 0.6) reasons.push("Favorito claro");
  else if (fav <= 0.2) reasons.push("Partido parejo");
  if (o.dataQuality.flag === "fallback_base_rate") reasons.push("Base histórica de la liga");
  else if (coverage < 0.5) reasons.push(`Cobertura en progreso (${pct(coverage)} del modelo)`);
  else reasons.push("Cobertura calibrada");
  if (sample < 0.5) reasons.push("Poca muestra esta temporada");

  return {
    score,
    level,
    reasons: reasons.slice(0, 3),
    factors: [
      {
        key: "favorite",
        label: "Favorito",
        value: fav,
        weight: 0.5,
        detail: `El resultado más probable tiene ${pct(favorite)}. Entre más se separa del resto, más claro es el partido.`,
      },
      {
        key: "coverage",
        label: "Datos disponibles",
        value: coverage,
        weight: 0.3,
        detail: `El modelo tiene ${pct(coverage)} de los datos que usa (alineaciones, bajas, forma, mercado).`,
      },
      {
        key: "sample",
        label: "Partidos jugados",
        value: sample,
        weight: 0.2,
        detail:
          minGames !== null
            ? `El equipo con menos juegos lleva ${minGames} esta temporada; con 10 o más la muestra es suficiente.`
            : "No hay registro de partidos jugados esta temporada.",
      },
    ],
  };
}

export interface OutlookApplied {
  match: MatchAnalysis;
  signal: SpacetimeSignal | null;
}

function freshSignalMarket(
  o: MatchOutlook,
  isNfl: boolean,
  nowMs: number,
): NonNullable<SpacetimeSignal["market"]> | null {
  const mkt = isNfl ? o.marketsByKey.moneyline?.market : o.marketsByKey["1x2"]?.market;
  if (!mkt || !isPermittedFreshMarketBlock(mkt, nowMs) || !mkt.oddsBySelection) {
    return null;
  }
  const homeOdds = mkt.oddsBySelection.home;
  const awayOdds = mkt.oddsBySelection.away;
  const drawOdds = isNfl ? null : (mkt.oddsBySelection.draw ?? null);
  if (
    typeof homeOdds !== "number" ||
    !Number.isFinite(homeOdds) ||
    homeOdds <= 1 ||
    typeof awayOdds !== "number" ||
    !Number.isFinite(awayOdds) ||
    awayOdds <= 1 ||
    (!isNfl && (typeof drawOdds !== "number" || !Number.isFinite(drawOdds) || drawOdds <= 1))
  ) {
    return null;
  }

  const invHome = 1 / homeOdds;
  const invDraw = drawOdds ? 1 / drawOdds : 0;
  const invAway = 1 / awayOdds;
  const overroundRaw = invHome + invDraw + invAway;
  if (!Number.isFinite(overroundRaw) || overroundRaw <= 0) return null;

  const bookName = formatBookLabel(mkt.book);
  return {
    bookLabel: bookLabelWithDate(bookName, mkt.tsCaptured),
    asOfUtc: mkt.tsCaptured,
    overround: mkt.overround > 0 ? mkt.overround : round4(overroundRaw),
    noVig: {
      home: round4(invHome / overroundRaw),
      draw: drawOdds ? round4(invDraw / overroundRaw) : 0,
      away: round4(invAway / overroundRaw),
    },
    odds: {
      home: Math.round(homeOdds * 100) / 100,
      draw: drawOdds ? Math.round(drawOdds * 100) / 100 : null,
      away: Math.round(awayOdds * 100) / 100,
    },
  };
}

function alignSignalToLocalMatch(
  match: MatchAnalysis,
  signal: SpacetimeSignal | null,
  nowMs: number,
): SpacetimeSignal | null {
  if (!signal) return null;
  const freshMarket =
    signal.market && isMarketFresh(signal.market.asOfUtc, nowMs) ? signal.market : null;
  return {
    ...signal,
    outlookDriven: true,
    probs: match.x12
      ? { home: match.x12[0], draw: match.x12[1], away: match.x12[2] }
      : signal.probs,
    market: freshMarket,
    value: [],
    expectedTotal: match.projection?.total ?? signal.expectedTotal,
    expectedMargin:
      match.projection?.margin ??
      (match.projection
        ? match.projection.home - match.projection.away
        : signal.expectedMargin),
  };
}

export function applyOutlookWithMatchOutlook(
  match: MatchAnalysis,
  signal: SpacetimeSignal | null,
  o: MatchOutlook,
  nowMs: number = Date.now(),
): OutlookApplied {
  const isNfl = match.sport === "american-football" || match.league === "nfl";
  const market = freshSignalMarket(o, isNfl, nowMs);

  if (isNfl) {
    const hasSharpMarket = Boolean(
      o.marketsByKey.moneyline?.selections.some((s) => s.dataQuality?.sharpMarketAvailable),
    );
    const isFallbackLowCoverage =
      o.dataQuality.flag === "low_coverage" || o.dataQuality.flag === "fallback_base_rate";
    const snapshotHasSignal = Boolean(
      match.x12 &&
        Number.isFinite(match.x12[0]) &&
        Number.isFinite(match.x12[2]) &&
        match.x12[0] > 0 &&
        match.x12[2] > 0,
    );
    if (isFallbackLowCoverage && !market && !hasSharpMarket && snapshotHasSignal && match.x12) {
      return {
        match,
        signal: signal
          ? {
              ...signal,
              outlookDriven: true,
              probs: { home: match.x12[0], draw: 0, away: match.x12[2] },
              value: signal.market ? signal.value : [],
              expectedTotal: match.projection?.total ?? signal.expectedTotal,
              expectedMargin:
                match.projection?.margin ??
                (match.projection
                  ? match.projection.home - match.projection.away
                  : signal.expectedMargin),
            }
          : null,
      };
    }

    const home = sel(o, "moneyline", "home");
    const away = sel(o, "moneyline", "away");
    if (!home || !away) return { match, signal };
    const total = home.p + away.p;
    const pHome = home.p / total;
    const pAway = away.p / total;
    const marketGroups = (match.marketGroups ?? []).map((g) =>
      g.rows.some((r) => r.market === "h2h")
        ? {
            ...g,
            rows: g.rows.map((r) =>
              r.market !== "h2h"
                ? r
                : r.selection === "home"
                  ? { ...r, p: pHome, fairOdds: 1 / pHome }
                  : r.selection === "away"
                    ? { ...r, p: pAway, fairOdds: 1 / pAway }
                    : r,
            ),
          }
        : g,
    );
    return {
      match: {
        ...match,
        x12: [round4(pHome), 0, round4(pAway)],
        marketGroups,
        picks: [],
        confidence: outlookConfidence(o, match, Math.max(pHome, pAway)),
        outcomes: match.outcomes.map((oc) =>
          oc.key === "home" ? { ...oc, probability: pHome } : oc.key === "away" ? { ...oc, probability: pAway } : oc,
        ),
      },
      signal: signal
        ? { ...signal, probs: { home: pHome, draw: 0, away: pAway }, market, value: [] }
        : null,
    };
  }

  const home = sel(o, "1x2", "home");
  const draw = sel(o, "1x2", "draw");
  const away = sel(o, "1x2", "away");
  if (!home || !draw || !away) return { match, signal };

  const dc = o.dixonColesParams;
  const projection = dc
    ? { home: dc.lamHome, away: dc.lamAway, total: dc.lamHome + dc.lamAway, margin: dc.lamHome - dc.lamAway }
    : match.projection;
  const top = o.topScorelines[0];
  const probs = { home: home.p, draw: draw.p, away: away.p };
  const outcomeP: Record<string, number> = probs;

  return {
    match: {
      ...match,
      x12: [round4(home.p), round4(draw.p), round4(away.p)],
      marketGroups: [...footballGroups(o, match), ...preserveCountGroups(match.marketGroups)],
      mostLikelyScore: top ? { home: top.homeGoals, away: top.awayGoals, p: top.p } : match.mostLikelyScore,
      projection,
      picks: [],
      confidence: outlookConfidence(o, match, Math.max(home.p, draw.p, away.p)),
      outcomes: match.outcomes.map((oc) =>
        outcomeP[oc.key] !== undefined
          ? {
              ...oc,
              probability: outcomeP[oc.key]!,
              fairOdds: fairOddsOf(outcomeP[oc.key]!),
            }
          : oc,
      ),
    },
    signal: signal
      ? {
          ...signal,
          outlookDriven: true,
          probs,
          market,
          value: [],
          expectedTotal: projection?.total ?? signal.expectedTotal,
          expectedMargin: projection ? projection.home - projection.away : signal.expectedMargin,
        }
      : null,
  };
}

export function applyOutlook(
  match: MatchAnalysis & { generatedAt?: string | null; inputsAsOf?: string | null },
  signal: SpacetimeSignal | null,
  nowMs: number = Date.now(),
  snapshotGeneratedAt?: string | null,
): OutlookApplied {
  if (match.status === "FT") return { match, signal };
  const o = findOutlook(match);
  if (!o) {
    const v6 = recalibrateSoccerOutlookV6(match);
    if (!v6) return { match, signal };
    const rec = v6.recalibrated;
    const x12Probs = rec.markets["1x2"];
    const pHome = round4(x12Probs.home);
    const pDraw = round4(x12Probs.draw);
    const pAway = round4(x12Probs.away);
    const top = rec.markets.topScorelines[0];
    const projection = {
      home: round4(rec.muHome),
      away: round4(rec.muAway),
      total: round4(rec.expectedTotalImplied),
      margin: round4(rec.muHome - rec.muAway),
    };
    const outcomeP: Record<string, number> = {
      home: x12Probs.home,
      draw: x12Probs.draw,
      away: x12Probs.away,
    };
    const updatedMatch: MatchAnalysis = {
      ...match,
      x12: [pHome, pDraw, pAway],
      projection,
      picks: [],
      mostLikelyScore: top
        ? { home: top.homeGoals, away: top.awayGoals, p: round4(top.probability) }
        : match.mostLikelyScore,
      marketGroups: [
        ...footballGroupsFromV6(rec, match),
        ...preserveNonCoreSoccerGroups(match.marketGroups),
      ],
      outcomes: match.outcomes.map((oc) =>
        outcomeP[oc.key] !== undefined
          ? {
              ...oc,
              probability: round4(outcomeP[oc.key]!),
              fairOdds: fairOddsOf(outcomeP[oc.key]!),
            }
          : oc,
      ),
    };
    return {
      match: updatedMatch,
      signal: alignSignalToLocalMatch(updatedMatch, signal, nowMs),
    };
  }
  const matchGeneratedAtMs = resolveGameGeneratedAtMs(match, snapshotGeneratedAt);
  const outlookGeneratedAtMs = resolveOutlookGeneratedAtMs(o);
  const localOver35 = extractMatchOver35Prob(match.marketGroups);
  if (
    isStaleInflatedFootballOutlook(
      o,
      match.projection?.total,
      matchGeneratedAtMs,
      outlookGeneratedAtMs,
      localOver35,
    )
  ) {
    return {
      match,
      signal: alignSignalToLocalMatch(match, signal, nowMs),
    };
  }
  return applyOutlookWithMatchOutlook(match, signal, o, nowMs);
}
