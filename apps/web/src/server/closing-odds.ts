import { isPermittedMarketQuoteBook, parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  upsertClosingOdds,
  type ClosingOddsInput,
  type ClosingOddsRow,
  type Db,
} from "@pitchlab/db";
import {
  evaluateProspectiveQuotesPowerDevigV6,
  parseIsoUtcEpochMs,
  solvePowerDevigExactV6,
  type EnginePreKickoffEventProbsV6,
  type PowerDevigSolutionV6,
  type ProspectiveQuotesEvaluationReportV6,
  type QuoteTickInputV6,
  type SettledScoreRecordV6,
} from "@pitchlab/spacetime/v6";
import { isCredibleClvPct } from "@pitchlab/ui/record-stats";
import type { PlatformDataset, PlatformGame } from "@pitchlab/ui/types";
import { buildServerRawPlatformDataset } from "./platform-data";
import { findGameKickoff } from "./game-kickoff";

const SHARP_CLOSING_BOOK_PRIORITY: Readonly<Record<string, number>> = {
  pinnacle: 3,
  betcris: 2,
  betonline: 2,
  smarkets: 2,
  matchbook: 2,
};

function normalizeBookKey(raw: string): string {
  const primary = raw.split(/[·|]/)[0]?.trim() ?? raw.trim();
  const token = primary
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (token === "williamhill") return "william_hill";
  if (token === "betonlineag") return "betonline";
  return token;
}

function isPermittedClosingBook(bookId?: string | null, bookLabel?: string | null): boolean {
  const primaryFromLabel =
    typeof bookLabel === "string" && bookLabel.trim().length > 0
      ? (bookLabel.split(/[·|]/)[0]?.trim() ?? bookLabel.trim())
      : null;
  const candidateId =
    typeof bookId === "string" && bookId.trim().length > 0 ? bookId.trim() : primaryFromLabel;
  if (!candidateId) return false;
  return isPermittedMarketQuoteBook(candidateId, bookLabel ?? candidateId);
}

function canonicalNumberKey(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  return String(normalized);
}

const TEAM_US_MARKETS_V6: ReadonlySet<string> = new Set([
  "nba_moneyline",
  "mlb_moneyline",
  "nhl_moneyline",
  "nfl_moneyline",
  "nba_totals",
  "mlb_totals",
  "nhl_totals",
  "nfl_totals",
  "nba_spread",
  "nfl_spread",
  "mlb_run_line",
  "mlb_f5",
  "nhl_puck_line",
  "nhl_puckline",
]);

const KNOWN_PROP_STAT_SUFFIXES_V6: readonly string[] = [
  "player_goal_or_assist",
  "player_shots_on_target",
  "player_yellow_cards",
  "goalkeeper_saves",
  "shots_on_target",
  "innings_pitched",
  "receiving_yards",
  "goal_or_assist",
  "passing_yards",
  "rushing_yards",
  "shots_on_goal",
  "goals_assists",
  "player_goals",
  "player_saves",
  "player_shots",
  "player_cards",
  "yellow_cards",
  "earned_runs",
  "total_bases",
  "player_goal",
  "player_sot",
  "strikeouts",
  "touchdowns",
  "receptions",
  "home_runs",
  "completions",
  "gk_saves",
  "rebounds",
  "pass_yds",
  "rush_yds",
  "rec_yds",
  "attempts",
  "assists",
  "targets",
  "carries",
  "threes",
  "points",
  "assist",
  "saves",
  "shots",
  "goals",
  "cards",
  "yards",
  "walks",
  "hits",
  "goal",
  "tgts",
  "pts",
  "reb",
  "ast",
  "3pm",
  "pra",
  "stl",
  "blk",
  "sot",
  "sog",
  "rbi",
  "cmp",
  "att",
  "yds",
  "tds",
  "car",
  "rec",
  "so",
  "ip",
  "hr",
  "tb",
  "bb",
  "er",
  "td",
  "g",
  "a",
  "h",
  "k",
];

function normalizeSnakeToken(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizePropPlayerSlugV6(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizePropStatAliasV6(raw: string): string {
  const token = normalizeSnakeToken(raw);
  if (
    token === "sot" ||
    token === "shots_on_target" ||
    token === "player_sot" ||
    token === "player_shots_on_target" ||
    token === "tiros_a_puerta"
  ) {
    return "shots_on_target";
  }
  if (
    token === "shots" ||
    token === "player_shots" ||
    token === "tiros" ||
    token === "tiros_totales"
  ) {
    return "shots";
  }
  if (
    token === "saves" ||
    token === "gk_saves" ||
    token === "goalkeeper_saves" ||
    token === "player_saves" ||
    token === "atajadas"
  ) {
    return "saves";
  }
  if (
    token === "goals_assists" ||
    token === "goal_or_assist" ||
    token === "player_goal_or_assist" ||
    token === "player_goals_assists" ||
    token === "g_a"
  ) {
    return "goal_or_assist";
  }
  if (
    token === "goal" ||
    token === "goals" ||
    token === "player_goal" ||
    token === "player_goals" ||
    token === "g" ||
    token === "goles"
  ) {
    return "goals";
  }
  if (
    token === "assist" ||
    token === "assists" ||
    token === "player_assist" ||
    token === "player_assists" ||
    token === "ast" ||
    token === "a" ||
    token === "asistencias"
  ) {
    return "assists";
  }
  if (
    token === "yellow_cards" ||
    token === "cards" ||
    token === "player_cards" ||
    token === "player_yellow_cards" ||
    token === "tarjetas"
  ) {
    return "cards";
  }
  if (token === "pts" || token === "points" || token === "puntos") return "pts";
  if (token === "reb" || token === "rebounds" || token === "rebotes") return "reb";
  if (token === "3pm" || token === "threes" || token === "triples") return "3pm";
  if (token === "k" || token === "so" || token === "strikeouts" || token === "ponches") {
    return "strikeouts";
  }
  if (token === "tb" || token === "total_bases" || token === "bases_totales") return "total_bases";
  if (token === "sog" || token === "shots_on_goal") return "sog";
  if (token === "h" || token === "hits" || token === "imparables") return "hits";
  if (token === "hr" || token === "home_runs" || token === "jonrones") return "hr";
  if (token === "rbi" || token === "carreras_impulsadas") return "rbi";
  if (token === "bb" || token === "walks" || token === "bases_por_bola") return "bb";
  if (token === "er" || token === "earned_runs" || token === "carreras_limpias") return "er";
  if (token === "ip" || token === "innings_pitched" || token === "entradas") return "ip";
  if (token === "cmp" || token === "completions" || token === "pases_completos") return "cmp";
  if (token === "att" || token === "attempts" || token === "intentos") return "att";
  if (token === "yds" || token === "yards" || token === "yardas") return "yds";
  if (token === "td" || token === "tds" || token === "touchdowns") return "td";
  if (token === "car" || token === "carries" || token === "acarreos") return "car";
  if (token === "rec" || token === "receptions" || token === "recepciones") return "rec";
  if (token === "tgts" || token === "targets" || token === "objetivos") return "tgts";
  return token;
}

export interface ClassifiedPropMarketV6 {
  readonly canonicalMarket: "goalkeeper_saves" | "player_props";
  readonly defaultStatKey: string | null;
}

export function classifyPropMarketV6(rawMarket: string): ClassifiedPropMarketV6 | null {
  const m = rawMarket.trim().toLowerCase();
  if (!m || TEAM_US_MARKETS_V6.has(m)) return null;
  if (m === "player_saves" || m === "goalkeeper_saves" || m === "gk_saves") {
    return { canonicalMarket: "goalkeeper_saves", defaultStatKey: "saves" };
  }
  if (m === "player_shots") {
    return { canonicalMarket: "player_props", defaultStatKey: "shots" };
  }
  if (m === "player_sot" || m === "player_shots_on_target") {
    return { canonicalMarket: "player_props", defaultStatKey: "shots_on_target" };
  }
  if (m === "player_goal" || m === "player_goals") {
    return { canonicalMarket: "player_props", defaultStatKey: "goals" };
  }
  if (m === "player_assist" || m === "player_assists") {
    return { canonicalMarket: "player_props", defaultStatKey: "assists" };
  }
  if (m === "player_goal_or_assist" || m === "player_goals_assists") {
    return { canonicalMarket: "player_props", defaultStatKey: "goal_or_assist" };
  }
  if (m === "player_cards" || m === "player_yellow_cards") {
    return { canonicalMarket: "player_props", defaultStatKey: "cards" };
  }
  if (
    m === "player_prop" ||
    m === "player_props" ||
    m === "player_props_football" ||
    m === "nba_player_props" ||
    m === "mlb_player_props" ||
    m === "nhl_player_props" ||
    m === "nfl_player_props"
  ) {
    return { canonicalMarket: "player_props", defaultStatKey: null };
  }
  const usMatch = /^(nba|mlb|nhl|nfl)_([a-z0-9_]+)$/.exec(m);
  if (usMatch) {
    const metric = usMatch[2]!;
    const stat = normalizePropStatAliasV6(metric);
    if (stat === "saves") {
      return { canonicalMarket: "goalkeeper_saves", defaultStatKey: "saves" };
    }
    return { canonicalMarket: "player_props", defaultStatKey: stat };
  }
  return null;
}

export interface ParsedStructuredPropKeyV6 {
  readonly canonicalMarket: "goalkeeper_saves" | "player_props";
  readonly playerSlug: string;
  readonly statKey: string;
  readonly direction: "over" | "under";
  readonly line: number;
}

function parsePropDirectionAndLineToken(
  token: string,
  fallbackLine: number | null,
  allowBareNumeric: boolean,
): { direction: "over" | "under"; line: number } | null {
  const clean = token.trim().toLowerCase();
  const withDir = /^(over|under)[_\s:-]?([+-]?\d+(?:\.\d+)?)$/.exec(clean);
  if (withDir) {
    const parsedLine = parseStrictFiniteNumber(withDir[2]);
    if (parsedLine !== null) {
      return { direction: withDir[1] === "under" ? "under" : "over", line: parsedLine };
    }
  }
  if (fallbackLine !== null && Number.isFinite(fallbackLine)) {
    if (clean === "over") return { direction: "over", line: fallbackLine };
    if (clean === "under") return { direction: "under", line: fallbackLine };
  }
  if (allowBareNumeric) {
    const bare = /^([+-]?\d+(?:\.\d+)?)$/.exec(clean);
    if (bare) {
      const parsedLine = parseStrictFiniteNumber(bare[1]);
      if (parsedLine !== null) {
        return { direction: "over", line: parsedLine };
      }
    }
  }
  return null;
}

export function parseStructuredPropKeyV6(
  rawMarket: string,
  rawSelection: string,
  fallbackLine?: number | null,
  overrides?: { readonly playerKey?: string | null; readonly playerStatKey?: string | null },
): ParsedStructuredPropKeyV6 | null {
  const propInfo = classifyPropMarketV6(rawMarket);
  if (!propInfo) return null;

  const lineFallback =
    typeof fallbackLine === "number" && Number.isFinite(fallbackLine) ? fallbackLine : null;
  const selClean = rawSelection.trim().toLowerCase();
  let rawPlayer = overrides?.playerKey?.trim() ?? "";
  let rawStat = overrides?.playerStatKey?.trim() ?? "";
  let dirToken = "";

  if (selClean.includes(":")) {
    const parts = selClean
      .split(":")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length >= 5 && (parts[0] === "player" || parts[0] === "prop")) {
      rawPlayer = rawPlayer || parts[1]!;
      rawStat = rawStat || parts[2]!;
      dirToken = parts.slice(3).join(":");
    } else if (parts.length === 4) {
      if (parts[0] === "player" || parts[0] === "prop") {
        rawPlayer = rawPlayer || parts[1]!;
        rawStat = rawStat || parts[2]!;
        dirToken = parts[3]!;
      } else {
        const prefixMarket = classifyPropMarketV6(parts[0]!);
        if (prefixMarket) {
          rawPlayer = rawPlayer || parts[1]!;
          rawStat = rawStat || prefixMarket.defaultStatKey || propInfo.defaultStatKey || "";
          dirToken = `${parts[2]}:${parts[3]}`;
        } else {
          rawPlayer = rawPlayer || parts[0]!;
          rawStat = rawStat || parts[1]!;
          dirToken = `${parts[2]}:${parts[3]}`;
        }
      }
    } else if (parts.length === 3) {
      const prefixMarket = classifyPropMarketV6(parts[0]!);
      if (prefixMarket || parts[0] === rawMarket.trim().toLowerCase()) {
        rawPlayer = rawPlayer || parts[1]!;
        rawStat = rawStat || prefixMarket?.defaultStatKey || propInfo.defaultStatKey || "";
        dirToken = parts[2]!;
      } else if (propInfo.defaultStatKey && (parts[1] === "over" || parts[1] === "under")) {
        rawPlayer = rawPlayer || parts[0]!;
        rawStat = rawStat || propInfo.defaultStatKey;
        dirToken = `${parts[1]}:${parts[2]}`;
      } else {
        rawPlayer = rawPlayer || parts[0]!;
        rawStat = rawStat || parts[1]!;
        dirToken = parts[2]!;
      }
    } else if (parts.length === 2 && propInfo.defaultStatKey) {
      rawPlayer = rawPlayer || parts[0]!;
      rawStat = rawStat || propInfo.defaultStatKey;
      dirToken = parts[1]!;
    }

    const parsedDir = dirToken ? parsePropDirectionAndLineToken(dirToken, lineFallback, true) : null;
    const playerSlug = normalizePropPlayerSlugV6(rawPlayer);
    const statKey = normalizePropStatAliasV6(rawStat || propInfo.defaultStatKey || "");
    if (playerSlug && statKey && parsedDir) {
      return {
        canonicalMarket: statKey === "saves" ? "goalkeeper_saves" : propInfo.canonicalMarket,
        playerSlug,
        statKey,
        direction: parsedDir.direction,
        line: parsedDir.line,
      };
    }
  }

  const underMatch = /^(.+)_(over|under)(?:_([+-]?\d+(?:\.\d+)?))?$/.exec(selClean);
  if (underMatch) {
    const prefix = underMatch[1]!;
    const direction: "over" | "under" = underMatch[2] === "under" ? "under" : "over";
    const parsedLine = underMatch[3] ? parseStrictFiniteNumber(underMatch[3]) : lineFallback;
    if (parsedLine !== null) {
      let matchedPlayer = rawPlayer;
      let matchedStat = rawStat;
      if (!matchedPlayer || !matchedStat) {
        let foundKnown = false;
        for (const suffix of KNOWN_PROP_STAT_SUFFIXES_V6) {
          const tail = `_${suffix}`;
          if (prefix.endsWith(tail) && prefix.length > tail.length) {
            if (
              propInfo.defaultStatKey !== null &&
              normalizePropStatAliasV6(suffix) !== propInfo.defaultStatKey
            ) {
              continue;
            }
            matchedPlayer = matchedPlayer || prefix.slice(0, -tail.length);
            matchedStat = matchedStat || suffix;
            foundKnown = true;
            break;
          }
        }
        if (!foundKnown) {
          if (propInfo.defaultStatKey) {
            matchedPlayer = matchedPlayer || prefix;
            matchedStat = matchedStat || propInfo.defaultStatKey;
          } else {
            const lastIdx = prefix.lastIndexOf("_");
            if (lastIdx > 0) {
              matchedPlayer = matchedPlayer || prefix.slice(0, lastIdx);
              matchedStat = matchedStat || prefix.slice(lastIdx + 1);
            }
          }
        }
      }
      const playerSlug = normalizePropPlayerSlugV6(matchedPlayer);
      const statKey = normalizePropStatAliasV6(matchedStat || propInfo.defaultStatKey || "");
      if (playerSlug && statKey) {
        return {
          canonicalMarket: statKey === "saves" ? "goalkeeper_saves" : propInfo.canonicalMarket,
          playerSlug,
          statKey,
          direction,
          line: parsedLine,
        };
      }
    }
  }

  if (rawPlayer) {
    const parsedDir = parsePropDirectionAndLineToken(selClean, lineFallback, true);
    const playerSlug = normalizePropPlayerSlugV6(rawPlayer);
    const statKey = normalizePropStatAliasV6(rawStat || propInfo.defaultStatKey || "");
    if (playerSlug && statKey && parsedDir) {
      return {
        canonicalMarket: statKey === "saves" ? "goalkeeper_saves" : propInfo.canonicalMarket,
        playerSlug,
        statKey,
        direction: parsedDir.direction,
        line: parsedDir.line,
      };
    }
  }

  return null;
}

export function normalizeClosingMarketKey(market: string): string {
  const m = market.trim().toLowerCase();
  if (
    m === "1x2" ||
    m === "moneyline" ||
    m === "h2h" ||
    m === "2way" ||
    m === "match_odds" ||
    m === "nba_moneyline" ||
    m === "mlb_moneyline" ||
    m === "nhl_moneyline" ||
    m === "nfl_moneyline"
  ) {
    return "h2h";
  }
  if (
    m.startsWith("totals_") ||
    m === "totals" ||
    m === "alt_totals" ||
    m === "ou" ||
    m === "over_under" ||
    m === "nba_totals" ||
    m === "mlb_totals" ||
    m === "nhl_totals" ||
    m === "nfl_totals"
  ) {
    return "totals";
  }
  if (
    m === "spread" ||
    m === "spreads" ||
    m === "alt_spread" ||
    m === "alt_spreads" ||
    m === "handicap" ||
    m === "asian_handicap" ||
    m === "ah" ||
    m === "puck_line" ||
    m === "run_line" ||
    m === "nba_spread" ||
    m === "nfl_spread" ||
    m === "mlb_run_line" ||
    m === "nhl_puck_line" ||
    m === "nhl_puckline"
  ) {
    return "spreads";
  }
  if (m === "dnb" || m === "draw_no_bet") return "dnb";
  if (m === "both_teams_to_score") return "btts";
  if (m === "booking_pts" || m === "booking_points") return "booking_points";
  const propInfo = classifyPropMarketV6(m);
  if (propInfo) return propInfo.canonicalMarket;
  return m;
}

export function normalizeClosingSelectionAndLine(
  market: string,
  selection: string,
  line?: number | null,
): { market: string; selection: string; lineKey: string } {
  const parsedProp = parseStructuredPropKeyV6(market, selection, line);
  if (parsedProp) {
    return {
      market: parsedProp.canonicalMarket,
      selection: `${parsedProp.playerSlug}:${parsedProp.statKey}:${parsedProp.direction}`,
      lineKey: canonicalNumberKey(parsedProp.line),
    };
  }

  const normMarket = normalizeClosingMarketKey(market);
  let normSel = selection.trim().toLowerCase();
  let resolvedLine = typeof line === "number" && Number.isFinite(line) ? line : null;

  if (normMarket === "totals") {
    const match = /^(over|under)[_\s-]?(\d+(?:\.\d+)?)$/.exec(normSel);
    if (match) {
      normSel = match[1]!;
      if (resolvedLine === null) resolvedLine = parseStrictFiniteNumber(match[2]);
    } else if (resolvedLine === null) {
      const mLine = /^totals_(\d+(?:[._]\d+)?)$/.exec(market.trim().toLowerCase());
      if (mLine) {
        resolvedLine = parseStrictFiniteNumber(mLine[1]!.replace("_", "."));
      }
    }
  } else if (normMarket === "spreads") {
    const match =
      /^(?:ah_)?(home|away)[_\s]+([+-]?\d+(?:\.\d+)?)$/.exec(normSel) ??
      /^(?:ah_)?(home|away)([+-]\d+(?:\.\d+)?)$/.exec(normSel);
    if (match) {
      normSel = match[1]!;
      if (resolvedLine === null) resolvedLine = parseStrictFiniteNumber(match[2]);
    }
  } else if (normMarket === "team_totals" || normMarket === "corners_team") {
    const match = /^(home|away)_(over|under)(?:[_-]([+-]?\d+(?:\.\d+)?))?$/.exec(normSel);
    if (match) {
      normSel = `${match[1]}_${match[2]}`;
      if (resolvedLine === null && match[3]) resolvedLine = parseStrictFiniteNumber(match[3]);
    }
  } else if (normMarket === "btts") {
    if (normSel === "btts_yes" || normSel === "si" || normSel === "sí") normSel = "yes";
    else if (normSel === "btts_no") normSel = "no";
  } else if (normMarket === "dnb") {
    if (normSel === "dnb_home") normSel = "home";
    else if (normSel === "dnb_away") normSel = "away";
  } else if (normMarket === "h2h") {
    if (normSel === "1") normSel = "home";
    else if (normSel === "2") normSel = "away";
    else if (normSel === "x") normSel = "draw";
  } else {
    const genericOu = /^(over|under)[_\s-]([+-]?\d+(?:\.\d+)?)$/.exec(normSel);
    if (genericOu) {
      normSel = genericOu[1]!;
      if (resolvedLine === null) resolvedLine = parseStrictFiniteNumber(genericOu[2]);
    }
  }

  const lineKey = resolvedLine !== null && Number.isFinite(resolvedLine) ? canonicalNumberKey(resolvedLine) : "";
  return { market: normMarket, selection: normSel, lineKey };
}

export function computeCredibleClvPctV6(
  userDecimal: number,
  closingOrFairDecimal: number,
  isParlay: boolean = false,
): number | null {
  if (
    !Number.isFinite(userDecimal) ||
    !Number.isFinite(closingOrFairDecimal) ||
    userDecimal <= 1 ||
    closingOrFairDecimal <= 1
  ) {
    return null;
  }
  const raw = Math.round((userDecimal / closingOrFairDecimal - 1) * 10_000) / 100;
  return isCredibleClvPct(raw, isParlay) ? raw : null;
}

export interface SameBookClosingQuoteCandidateV6 {
  readonly gameId: string;
  readonly sport: PlatformGame["sport"];
  readonly market: string;
  readonly selection: string;
  readonly line?: number | null;
  readonly book: string;
  readonly bookLabel?: string | null;
  readonly decimalOdds: number;
  readonly capturedAtUtc: string;
  readonly source: string;
}

export interface SameBookPowerDevigClosingRowV6 extends ClosingOddsInput {
  readonly overround: number;
  readonly powerAlpha: number;
}

interface MarketOutcomeGroupDescriptor {
  readonly groupKey: string;
  readonly requiredSelections: readonly string[];
  readonly canonicalSelection: string;
  readonly storedLineKey: string;
}

function resolveSameBookMarketGroup(
  sport: PlatformGame["sport"],
  normMarket: string,
  normSelection: string,
  lineKey: string,
): MarketOutcomeGroupDescriptor | null {
  if (normMarket === "h2h") {
    if (sport === "football") {
      if (normSelection !== "home" && normSelection !== "draw" && normSelection !== "away") return null;
      return {
        groupKey: "h2h|",
        requiredSelections: ["home", "draw", "away"],
        canonicalSelection: normSelection,
        storedLineKey: "",
      };
    }
    if (normSelection !== "home" && normSelection !== "away") return null;
    return {
      groupKey: "h2h|",
      requiredSelections: ["home", "away"],
      canonicalSelection: normSelection,
      storedLineKey: "",
    };
  }

  if (normMarket === "dnb") {
    if (normSelection !== "home" && normSelection !== "away") return null;
    return {
      groupKey: "dnb|",
      requiredSelections: ["home", "away"],
      canonicalSelection: normSelection,
      storedLineKey: "",
    };
  }

  if (normMarket === "btts") {
    if (normSelection !== "yes" && normSelection !== "no") return null;
    return {
      groupKey: "btts|",
      requiredSelections: ["yes", "no"],
      canonicalSelection: normSelection,
      storedLineKey: "",
    };
  }

  if (normMarket === "spreads") {
    if ((normSelection !== "home" && normSelection !== "away") || !lineKey) return null;
    const numericLine = parseStrictFiniteNumber(lineKey);
    if (numericLine === null) return null;
    const homeRelativeLine = normSelection === "home" ? numericLine : -numericLine;
    return {
      groupKey: `spreads|${canonicalNumberKey(homeRelativeLine)}`,
      requiredSelections: ["home", "away"],
      canonicalSelection: normSelection,
      storedLineKey: canonicalNumberKey(numericLine),
    };
  }

  if (normMarket === "team_totals" || normMarket === "corners_team") {
    if (!lineKey) return null;
    if (normSelection === "home_over" || normSelection === "home_under") {
      return {
        groupKey: `${normMarket}|home|${lineKey}`,
        requiredSelections: ["home_over", "home_under"],
        canonicalSelection: normSelection,
        storedLineKey: lineKey,
      };
    }
    if (normSelection === "away_over" || normSelection === "away_under") {
      return {
        groupKey: `${normMarket}|away|${lineKey}`,
        requiredSelections: ["away_over", "away_under"],
        canonicalSelection: normSelection,
        storedLineKey: lineKey,
      };
    }
    return null;
  }

  if (
    (normMarket === "goalkeeper_saves" || normMarket === "player_props") &&
    lineKey.length > 0
  ) {
    const propMatch = /^([a-z0-9-]+):([a-z0-9_]+):(over|under)$/.exec(normSelection);
    if (!propMatch) return null;
    const playerSlug = propMatch[1]!;
    const statKey = propMatch[2]!;
    const entity = `${playerSlug}:${statKey}`;
    return {
      groupKey: `${normMarket}|${playerSlug}|${statKey}|${lineKey}`,
      requiredSelections: [`${entity}:over`, `${entity}:under`],
      canonicalSelection: normSelection,
      storedLineKey: lineKey,
    };
  }

  if (
    (normSelection === "over" || normSelection === "under") &&
    lineKey.length > 0 &&
    (normMarket === "totals" ||
      normMarket === "corners_total" ||
      normMarket === "cards_total" ||
      normMarket === "booking_points" ||
      normMarket === "shots_total" ||
      normMarket === "shots_on_target" ||
      normMarket === "fouls_total")
  ) {
    return {
      groupKey: `${normMarket}|${lineKey}`,
      requiredSelections: ["over", "under"],
      canonicalSelection: normSelection,
      storedLineKey: lineKey,
    };
  }

  return null;
}

interface StoredCandidateOutcome {
  readonly decimalOdds: number;
  readonly capturedMs: number;
  readonly storedLineKey: string;
  readonly book: string;
  readonly source: string;
}

export function solveSameBookClosingPowerDevigV6(
  candidates: readonly SameBookClosingQuoteCandidateV6[],
  kickoffAt: Date,
): SameBookPowerDevigClosingRowV6[] {
  const kickoffMs = kickoffAt.getTime();
  if (!Number.isFinite(kickoffMs)) return [];

  const groupedByBookMarket = new Map<
    string,
    {
      readonly gameId: string;
      readonly market: string;
      readonly bookToken: string;
      readonly requiredSelections: readonly string[];
      readonly outcomes: Map<string, StoredCandidateOutcome>;
    }
  >();

  for (const cand of candidates) {
    if (!Number.isFinite(cand.decimalOdds) || cand.decimalOdds <= 1.0) continue;
    if (!isPermittedClosingBook(cand.book, cand.bookLabel)) continue;
    const capturedMs = parseIsoUtcEpochMs(cand.capturedAtUtc);
    if (capturedMs === null || capturedMs > kickoffMs) continue;

    const norm = normalizeClosingSelectionAndLine(cand.market, cand.selection, cand.line);
    const desc = resolveSameBookMarketGroup(
      cand.sport,
      norm.market,
      norm.selection,
      norm.lineKey,
    );
    if (!desc) continue;

    const bookToken = normalizeBookKey(cand.book || cand.bookLabel || "");
    if (!bookToken) continue;

    const bucketKey = `${cand.gameId}\u0000${bookToken}\u0000${desc.groupKey}`;
    let bucket = groupedByBookMarket.get(bucketKey);
    if (!bucket) {
      bucket = {
        gameId: cand.gameId,
        market: norm.market,
        bookToken,
        requiredSelections: desc.requiredSelections,
        outcomes: new Map<string, StoredCandidateOutcome>(),
      };
      groupedByBookMarket.set(bucketKey, bucket);
    }

    const prev = bucket.outcomes.get(desc.canonicalSelection);
    if (!prev || capturedMs >= prev.capturedMs) {
      bucket.outcomes.set(desc.canonicalSelection, {
        decimalOdds: cand.decimalOdds,
        capturedMs,
        storedLineKey: desc.storedLineKey,
        book: bookToken,
        source: cand.source,
      });
    }
  }

  const bestRowByClosingKey = new Map<
    string,
    {
      readonly priority: number;
      readonly capturedMs: number;
      readonly row: SameBookPowerDevigClosingRowV6;
    }
  >();

  for (const bucket of groupedByBookMarket.values()) {
    const req = bucket.requiredSelections;
    const entries: StoredCandidateOutcome[] = [];
    let complete = true;
    for (const sel of req) {
      const found = bucket.outcomes.get(sel);
      if (!found) {
        complete = false;
        break;
      }
      entries.push(found);
    }
    if (!complete) continue;

    let powerSol: PowerDevigSolutionV6;
    try {
      powerSol = solvePowerDevigExactV6(entries.map((e) => e.decimalOdds));
    } catch (err) {
      void err;
      continue;
    }

    const priority = SHARP_CLOSING_BOOK_PRIORITY[bucket.bookToken] ?? 1;
    for (let i = 0; i < req.length; i += 1) {
      const sel = req[i]!;
      const entry = entries[i]!;
      const noVigProb = powerSol.probsNoVig[i];
      if (typeof noVigProb !== "number" || !Number.isFinite(noVigProb) || noVigProb <= 0 || noVigProb >= 1) {
        continue;
      }
      const fairDecimal = Math.round((1 / noVigProb) * 1000) / 1000;
      const closingKey = `${bucket.gameId}|${bucket.market}|${sel}|${entry.storedLineKey}`;
      const existing = bestRowByClosingKey.get(closingKey);
      if (
        existing &&
        (existing.priority > priority ||
          (existing.priority === priority && existing.capturedMs >= entry.capturedMs))
      ) {
        continue;
      }
      bestRowByClosingKey.set(closingKey, {
        priority,
        capturedMs: entry.capturedMs,
        row: {
          gameId: bucket.gameId,
          market: bucket.market,
          selection: sel,
          lineKey: entry.storedLineKey,
          book: entry.book,
          decimalOdds: entry.decimalOdds,
          fairDecimal,
          noVigProb,
          source: entry.source,
          kickoffAt,
          capturedAt: new Date(entry.capturedMs),
          overround: powerSol.overround,
          powerAlpha: powerSol.alphaExponent,
        },
      });
    }
  }

  return Array.from(bestRowByClosingKey.values()).map((item) => item.row);
}

export function collectPreKickoffClosingOdds(
  dataset: PlatformDataset = buildServerRawPlatformDataset(),
): ClosingOddsInput[] {
  const rows: ClosingOddsInput[] = [];

  for (const game of dataset.games) {
    const snapKickoff = findGameKickoff(game.id);
    const parsedKoMs = parseIsoUtcEpochMs(game.kickoffUtc);
    const kickoffAt = snapKickoff ?? (parsedKoMs !== null ? new Date(parsedKoMs) : null);
    if (!kickoffAt || Number.isNaN(kickoffAt.getTime())) continue;

    const candidates: SameBookClosingQuoteCandidateV6[] = [];
    const mkt = game.spacetime?.market;

    if (mkt && mkt.asOfUtc && isPermittedClosingBook(null, mkt.bookLabel)) {
      const primaryBook = normalizeBookKey(mkt.bookLabel);
      const pushSpacetimeH2h = (sel: "home" | "draw" | "away", dec: number | null | undefined) => {
        if (typeof dec !== "number" || !Number.isFinite(dec) || dec <= 1.0) return;
        candidates.push({
          gameId: game.id,
          sport: game.sport,
          market: "h2h",
          selection: sel,
          line: null,
          book: primaryBook,
          bookLabel: mkt.bookLabel,
          decimalOdds: dec,
          capturedAtUtc: mkt.asOfUtc!,
          source: "spacetime_power_devig_v6",
        });
      };
      pushSpacetimeH2h("home", mkt.odds.home);
      pushSpacetimeH2h("away", mkt.odds.away);
      if (mkt.odds.draw !== null) {
        pushSpacetimeH2h("draw", mkt.odds.draw);
      }
    }

    for (const row of game.markets) {
      if (Array.isArray(row.bookQuotes) && row.bookQuotes.length > 0) {
        for (const q of row.bookQuotes) {
          if (!Number.isFinite(q.decimal) || q.decimal <= 1.0) continue;
          if (!isPermittedClosingBook(q.book, q.bookLabel)) continue;
          candidates.push({
            gameId: game.id,
            sport: game.sport,
            market: row.market,
            selection: row.selection,
            line: row.line ?? null,
            book: q.book,
            bookLabel: q.bookLabel,
            decimalOdds: q.decimal,
            capturedAtUtc: q.capturedAtUtc,
            source: "market_book_power_devig_v6",
          });
        }
      } else if (
        typeof row.currentDecimal === "number" &&
        Number.isFinite(row.currentDecimal) &&
        row.currentDecimal > 1.0 &&
        row.quoteCapturedAtUtc &&
        isPermittedClosingBook(null, row.quoteBookLabel)
      ) {
        candidates.push({
          gameId: game.id,
          sport: game.sport,
          market: row.market,
          selection: row.selection,
          line: row.line ?? null,
          book: normalizeBookKey(row.quoteBookLabel ?? ""),
          bookLabel: row.quoteBookLabel,
          decimalOdds: row.currentDecimal,
          capturedAtUtc: row.quoteCapturedAtUtc,
          source: "market_line_power_devig_v6",
        });
      }
    }

    for (const pk of game.picks) {
      if (pk.isRedacted) continue;
      if (Array.isArray(pk.bookQuotes) && pk.bookQuotes.length > 0) {
        for (const q of pk.bookQuotes) {
          if (!Number.isFinite(q.decimal) || q.decimal <= 1.0) continue;
          if (!isPermittedClosingBook(q.book, q.bookLabel)) continue;
          candidates.push({
            gameId: game.id,
            sport: game.sport,
            market: pk.market ?? pk.marketGroup,
            selection: pk.selectionKey,
            line: pk.line ?? null,
            book: q.book,
            bookLabel: q.bookLabel,
            decimalOdds: q.decimal,
            capturedAtUtc: q.capturedAtUtc,
            source: "pick_quote_power_devig_v6",
          });
        }
      } else if (
        typeof pk.marketDecimal === "number" &&
        Number.isFinite(pk.marketDecimal) &&
        pk.marketDecimal > 1.0 &&
        pk.marketCapturedAtUtc &&
        isPermittedClosingBook(null, pk.marketBookLabel)
      ) {
        candidates.push({
          gameId: game.id,
          sport: game.sport,
          market: pk.market ?? pk.marketGroup,
          selection: pk.selectionKey,
          line: pk.line ?? null,
          book: normalizeBookKey(pk.marketBookLabel ?? ""),
          bookLabel: pk.marketBookLabel,
          decimalOdds: pk.marketDecimal,
          capturedAtUtc: pk.marketCapturedAtUtc,
          source: "pick_quote_power_devig_v6",
        });
      }
    }

    const solvedRows = solveSameBookClosingPowerDevigV6(candidates, kickoffAt);
    for (const solved of solvedRows) {
      rows.push({
        gameId: solved.gameId,
        market: solved.market,
        selection: solved.selection,
        lineKey: solved.lineKey,
        book: solved.book,
        decimalOdds: solved.decimalOdds,
        fairDecimal: solved.fairDecimal,
        noVigProb: solved.noVigProb,
        source: solved.source,
        kickoffAt: solved.kickoffAt,
        capturedAt: solved.capturedAt,
      });
    }
  }

  return rows;
}

export function buildEnginePreKickoffProbsFromDatasetV6(
  dataset: PlatformDataset,
): Record<string, EnginePreKickoffEventProbsV6> {
  const byEvent: Record<string, EnginePreKickoffEventProbsV6> = {};
  for (const game of dataset.games) {
    if (game.hasForecast === false || !game.x12) continue;
    const probs: Record<string, number> = {
      pHome: game.x12[0],
      pDraw: game.x12[1],
      pAway: game.x12[2],
    };
    for (const row of game.markets) {
      if (!(row.p > 0 && row.p < 1)) continue;
      const norm = normalizeClosingSelectionAndLine(row.market, row.selection, row.line);
      if (norm.market === "btts" && norm.selection === "yes") {
        probs.pBttsYes = row.p;
      } else if (norm.market === "totals" && norm.selection === "over" && norm.lineKey) {
        const lineNum = parseStrictFiniteNumber(norm.lineKey);
        if (lineNum !== null) {
          probs[`pOver${lineNum.toFixed(1).replace(".", "")}`] = row.p;
        }
      }
    }
    byEvent[game.id] = {
      matchedSnapshotGameId: game.id,
      v6Probs: probs,
      rawPreKickoffProbs: probs,
    };
  }
  return byEvent;
}

export function evaluateProspectiveClosingQuotesV6(params: {
  readonly ticks: readonly QuoteTickInputV6[];
  readonly dataset?: PlatformDataset;
  readonly enginePreKickoffByEvent?: Readonly<
    Record<string, EnginePreKickoffEventProbsV6 | Readonly<Record<string, number>>>
  >;
  readonly settledScoresByEvent?: Readonly<Record<string, SettledScoreRecordV6>> | null;
  readonly nResamples?: number;
  readonly seed?: number;
}): ProspectiveQuotesEvaluationReportV6 {
  const permittedTicks = params.ticks.filter((tick) => isPermittedClosingBook(tick.book, tick.book));
  const engineMap =
    params.enginePreKickoffByEvent ??
    (params.dataset ? buildEnginePreKickoffProbsFromDatasetV6(params.dataset) : {});
  return evaluateProspectiveQuotesPowerDevigV6({
    ticks: permittedTicks,
    enginePreKickoffByEvent: engineMap,
    settledScoresByEvent: params.settledScoresByEvent ?? null,
    ...(params.nResamples !== undefined ? { nResamples: params.nResamples } : {}),
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
  });
}

export async function syncPreKickoffClosingOdds(
  db: Db,
  dataset: PlatformDataset = buildServerRawPlatformDataset(),
  now: Date = new Date(),
): Promise<number> {
  const candidates = collectPreKickoffClosingOdds(dataset);
  return upsertClosingOdds(db, candidates, now);
}

export function findClosingQuoteForPick(
  rows: readonly ClosingOddsRow[],
  input: { gameId: string; market?: string | null; selection?: string | null; line?: number | null },
): ClosingOddsRow | null {
  if (!input.market || !input.selection) return null;
  const key = normalizeClosingSelectionAndLine(input.market, input.selection, input.line);
  return (
    rows.find(
      (r) =>
        r.gameId === input.gameId &&
        r.market === key.market &&
        r.selection === key.selection &&
        r.lineKey === key.lineKey &&
        r.capturedAt.getTime() <= r.kickoffAt.getTime(),
    ) ?? null
  );
}
