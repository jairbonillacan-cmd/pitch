import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { asMarketKey, LeagueSnapshotSchema, parseStrictFiniteNumber, selectionHolds } from "@pitchlab/contracts";
import {
  and,
  eq,
  lte,
  recordMatchResults,
  sealedPicks,
  type ClosingOddsRow,
  type Db,
  type SealedParlayLegResult,
  type SealedParlayLegSpec,
  listClosingOddsForGames,
} from "@pitchlab/db";
import type {
  ProspectiveQuotesEvaluationReportV6,
  QuoteTickInputV6,
  SettledScoreRecordV6,
} from "@pitchlab/spacetime/v6";
import type { PlatformDataset } from "@pitchlab/ui/types";
import type { Mailer } from "./mailer";
import {
  classifyPropMarketV6,
  computeCredibleClvPctV6,
  evaluateProspectiveClosingQuotesV6,
  findClosingQuoteForPick,
  normalizePropStatAliasV6,
  parseStructuredPropKeyV6,
  syncPreKickoffClosingOdds,
} from "./closing-odds";
import { buildServerRawPlatformDataset } from "./platform-data";
import { settleAndNotify, type PickResult } from "./pick-results";
import { resolveSnapshotsRoot } from "./snapshots";

export interface FinalMatchScore {
  gameId: string;
  home: number;
  away: number;
  observedAt: string | null;
}

export interface MatchFinalStatsV6 {
  readonly htScore?: { readonly home: number; readonly away: number } | null;
  readonly f5Score?: { readonly home: number; readonly away: number } | null;
  readonly cornersHome?: number;
  readonly cornersAway?: number;
  readonly shotsHome?: number;
  readonly shotsAway?: number;
  readonly shotsOnTargetHome?: number;
  readonly shotsOnTargetAway?: number;
  readonly foulsHome?: number;
  readonly foulsAway?: number;
  readonly yellowCardsHome?: number;
  readonly yellowCardsAway?: number;
  readonly redCardsHome?: number;
  readonly redCardsAway?: number;
  readonly goalkeeperSaves?: Readonly<Record<string, number>>;
  readonly playerStats?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly didNotPlayPlayers?: readonly string[];
}

export interface GradeSelectionInput {
  market?: string | null;
  selection?: string | null;
  line?: number | null;
  pickLabel?: string | null;
  finalStats?: MatchFinalStatsV6 | null;
  playerKey?: string | null;
  playerStatKey?: string | null;
}

function resolveHistoryRoot(): string {
  return path.resolve(resolveSnapshotsRoot(), "..", "history");
}

export function loadFinalMatchScores(
  snapshotsRoot: string = resolveSnapshotsRoot(),
  historyRoot: string = resolveHistoryRoot(),
): Map<string, FinalMatchScore> {
  const scores = new Map<string, FinalMatchScore>();

  if (existsSync(snapshotsRoot)) {
    const leagues = readdirSync(snapshotsRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const leagueDir of leagues) {
      const dirPath = path.join(snapshotsRoot, leagueDir.name);
      const files = readdirSync(dirPath)
        .filter(
          (f) =>
            f.endsWith(".json") &&
            f !== "injuries.json" &&
            f !== "market-pulse.json" &&
            f !== "squads.json" &&
            f !== "market-lines.json",
        )
        .sort((a, b) =>
          a === "latest.json"
            ? -1
            : b === "latest.json"
              ? 1
              : a === "season-results.json"
                ? -1
                : b === "season-results.json"
                  ? 1
                  : b.localeCompare(a),
        );

      for (const file of files) {
        try {
          const rawObj = JSON.parse(readFileSync(path.join(dirPath, file), "utf8")) as {
            games?: Array<{
              id?: string;
              status?: string;
              result?: { home?: number; away?: number; observedAt?: string };
            }>;
          };
          if (file === "season-results.json") {
            for (const game of rawObj.games ?? []) {
              if (!game?.id || game.status !== "final" || !game.result) continue;
              const { home, away, observedAt } = game.result;
              if (
                typeof home !== "number" ||
                typeof away !== "number" ||
                !Number.isInteger(home) ||
                !Number.isInteger(away) ||
                home < 0 ||
                away < 0
              ) {
                continue;
              }
              if (!scores.has(game.id)) {
                scores.set(game.id, { gameId: game.id, home, away, observedAt: observedAt ?? null });
              }
            }
            continue;
          }
          const parsed = LeagueSnapshotSchema.safeParse(rawObj);
          if (!parsed.success) continue;
          for (const game of parsed.data.games) {
            if (game.status !== "final" || !game.result) continue;
            const { home, away, observedAt } = game.result;
            if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) continue;
            if (!scores.has(game.id)) {
              scores.set(game.id, { gameId: game.id, home, away, observedAt: observedAt ?? null });
            }
          }
        } catch (err) {
          void err;
        }
      }
    }
  }

  if (existsSync(historyRoot)) {
    const files = readdirSync(historyRoot).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      try {
        const lines = readFileSync(path.join(historyRoot, file), "utf8").split(/\r?\n/);
        for (const rawLine of lines) {
          const trimmed = rawLine.trim();
          if (!trimmed) continue;
          const obj = JSON.parse(trimmed) as Record<string, unknown>;
          const gameId = typeof obj.id === "string" ? obj.id : null;
          const home = typeof obj.homeScore === "number" ? obj.homeScore : null;
          const away = typeof obj.awayScore === "number" ? obj.awayScore : null;
          if (!gameId || home === null || away === null || !Number.isInteger(home) || !Number.isInteger(away)) {
            continue;
          }
          if (home < 0 || away < 0 || scores.has(gameId)) continue;
          scores.set(gameId, {
            gameId,
            home,
            away,
            observedAt: typeof obj.availableAt === "string" ? obj.availableAt : null,
          });
        }
      } catch (err) {
        void err;
      }
    }
  }

  return scores;
}

function normalizeLookupToken(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isQuarterLine(line: number): boolean {
  const scaled = Math.abs(line * 4);
  const rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) < 1e-9 && rounded % 2 === 1;
}

function gradeOverUnderValue(
  observed: number,
  line: number,
  direction: "over" | "under",
): PickResult | null {
  const diff = observed - line;
  if (Math.abs(diff) < 1e-9) return "void";
  if (isQuarterLine(line) && Math.abs(Math.abs(diff) - 0.25) < 1e-9) return null;
  if (direction === "over") return diff > 0 ? "won" : "lost";
  return diff < 0 ? "won" : "lost";
}

function parseDirectionAndLineFromToken(
  token: string,
  fallbackLine?: number,
): { direction: "over" | "under"; line: number } | null {
  const clean = token.trim().toLowerCase();
  const withLine = /(over|under)[_\s-]?([+-]?\d+(?:\.\d+)?)$/.exec(clean);
  if (withLine) {
    const parsedLine = parseStrictFiniteNumber(withLine[2]);
    if (parsedLine !== null) {
      return {
        direction: withLine[1] === "under" ? "under" : "over",
        line: parsedLine,
      };
    }
  }
  if (fallbackLine !== undefined && Number.isFinite(fallbackLine)) {
    if (clean.includes("over")) return { direction: "over", line: fallbackLine };
    if (clean.includes("under")) return { direction: "under", line: fallbackLine };
  }
  return null;
}

function findNormalizedNumericEntry(
  record: Readonly<Record<string, number>> | undefined,
  targetKey: string,
): number | null {
  if (!record || !targetKey) return null;
  const direct = record[targetKey];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const normTarget = normalizeLookupToken(targetKey);
  for (const [k, v] of Object.entries(record)) {
    if (typeof v === "number" && Number.isFinite(v) && normalizeLookupToken(k) === normTarget) {
      return v;
    }
  }
  return null;
}

function findPlayerStatObserved(
  finalStats: MatchFinalStatsV6 | null | undefined,
  playerKey: string,
  statKey: string,
): number | null {
  if (!finalStats) return null;
  const normStat = normalizePropStatAliasV6(statKey);
  if (normStat === "saves" && finalStats.goalkeeperSaves) {
    const directSave = findNormalizedNumericEntry(finalStats.goalkeeperSaves, playerKey);
    if (directSave !== null) return directSave;
  }
  if (!finalStats.playerStats) return null;
  const normPlayer = normalizeLookupToken(playerKey);
  let matchedBag: Readonly<Record<string, number>> | null = finalStats.playerStats[playerKey] ?? null;
  if (!matchedBag) {
    for (const [pKey, bag] of Object.entries(finalStats.playerStats)) {
      if (normalizeLookupToken(pKey) === normPlayer) {
        matchedBag = bag;
        break;
      }
    }
  }
  if (!matchedBag) return null;
  const directVal = matchedBag[statKey];
  if (typeof directVal === "number" && Number.isFinite(directVal)) return directVal;
  let goalsVal: number | null = null;
  let assistsVal: number | null = null;
  let ptsVal: number | null = null;
  let rebVal: number | null = null;
  for (const [sKey, val] of Object.entries(matchedBag)) {
    if (typeof val !== "number" || !Number.isFinite(val)) continue;
    const alias = normalizePropStatAliasV6(sKey);
    if (alias === normStat) return val;
    if (alias === "goals") goalsVal = val;
    else if (alias === "assists") assistsVal = val;
    else if (alias === "pts") ptsVal = val;
    else if (alias === "reb") rebVal = val;
  }
  if (normStat === "goal_or_assist" && (goalsVal !== null || assistsVal !== null)) {
    return (goalsVal ?? 0) + (assistsVal ?? 0);
  }
  if (normStat === "pra" && ptsVal !== null && rebVal !== null && assistsVal !== null) {
    return ptsVal + rebVal + assistsVal;
  }
  return null;
}

function isPlayerMarkedDnp(
  finalStats: MatchFinalStatsV6 | null | undefined,
  playerKey: string,
): boolean {
  if (!finalStats?.didNotPlayPlayers || !playerKey) return false;
  const normTarget = normalizeLookupToken(playerKey);
  return finalStats.didNotPlayPlayers.some((p) => normalizeLookupToken(p) === normTarget);
}

function normalizeMarketForGrading(
  rawMarket: string,
  selection: string,
): { market: string; selection: string; line?: number; rawPropMarket?: string } {
  const m = rawMarket.trim().toLowerCase();
  const s = selection.trim().toLowerCase();

  if (
    m === "moneyline" ||
    m === "2way" ||
    m === "nba_moneyline" ||
    m === "mlb_moneyline" ||
    m === "nhl_moneyline" ||
    m === "nfl_moneyline"
  ) {
    const normSel = s === "1" ? "home" : s === "2" ? "away" : s;
    return { market: "moneyline_2way", selection: normSel };
  }
  if (m === "1x2" || m === "h2h" || m === "match_odds") {
    const normSel = s === "1" ? "home" : s === "2" ? "away" : s === "x" ? "draw" : s;
    return { market: "h2h", selection: normSel };
  }
  if (m === "double_chance" || m === "dc") {
    const normSel =
      s === "home_or_draw" ? "1x" : s === "away_or_draw" ? "x2" : s === "home_or_away" ? "12" : s;
    return { market: "double_chance", selection: normSel };
  }
  if (m === "dnb" || m === "draw_no_bet") {
    const normSel = s === "dnb_home" ? "home" : s === "dnb_away" ? "away" : s;
    return { market: "dnb", selection: normSel };
  }
  if (m === "btts" || m === "both_teams_to_score") {
    const normSel =
      s === "btts_yes" || s === "si" || s === "sí" ? "yes" : s === "btts_no" ? "no" : s;
    return { market: "btts", selection: normSel };
  }
  if (
    m.startsWith("totals_") ||
    m === "totals" ||
    m === "alt_totals" ||
    m === "ou" ||
    m === "over_under" ||
    m === "nba_totals" ||
    m === "nfl_totals" ||
    m === "mlb_totals" ||
    m === "nhl_totals"
  ) {
    const match = /^(over|under)[_\s-]?(\d+(?:\.\d+)?)$/.exec(s);
    if (match) {
      const line = parseStrictFiniteNumber(match[2]);
      if (line !== null) return { market: "totals", selection: `${match[1]}_${match[2]}`, line };
    }
    const mLine = /^totals_(\d+(?:[._]\d+)?)$/.exec(m);
    if (mLine) {
      const line = parseStrictFiniteNumber(mLine[1]!.replace("_", "."));
      if (line !== null) return { market: "totals", selection: s, line };
    }
    return { market: "totals", selection: s };
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
    const match =
      /^(?:ah_)?(home|away)[_\s]+([+-]?\d+(?:\.\d+)?)$/.exec(s) ??
      /^(?:ah_)?(home|away)([+-]\d+(?:\.\d+)?)$/.exec(s);
    if (match) {
      const line = parseStrictFiniteNumber(match[2]);
      if (line !== null) return { market: "spreads", selection: match[1]!, line };
    }
    return { market: "spreads", selection: s };
  }
  if (m === "team_totals" || m === "home_totals" || m === "away_totals") {
    const prefix = m === "home_totals" ? "home_" : m === "away_totals" ? "away_" : "";
    const prefixed = prefix && !s.startsWith(prefix) ? `${prefix}${s}` : s;
    const match = /^(home|away)_(over|under)(?:[_\s-]([+-]?\d+(?:\.\d+)?))?$/.exec(prefixed);
    if (match) {
      const line = match[3] ? parseStrictFiniteNumber(match[3]) : null;
      return {
        market: "team_totals",
        selection: `${match[1]}_${match[2]}`,
        ...(line !== null ? { line } : {}),
      };
    }
    return { market: "team_totals", selection: prefixed };
  }
  if (m === "correct_score") {
    return { market: "correct_score", selection: s.replace("–", "-") };
  }
  if (m === "booking_points" || m === "booking_pts") {
    return { market: "booking_points", selection: s };
  }
  if (m === "yellow_cards") {
    return { market: "cards_total", selection: s };
  }
  const propClass = classifyPropMarketV6(m);
  if (propClass) {
    return { market: propClass.canonicalMarket, selection: s, rawPropMarket: m };
  }
  return { market: m, selection: s };
}

function gradeStructuredPlayerOrKeeperProp(params: {
  readonly rawMarket: string;
  readonly selection: string;
  readonly line?: number;
  readonly playerKey?: string | null;
  readonly playerStatKey?: string | null;
  readonly finalStats?: MatchFinalStatsV6 | null;
}): PickResult | null {
  const { rawMarket, selection, line, finalStats } = params;
  if (!finalStats) return null;

  const parsed = parseStructuredPropKeyV6(rawMarket, selection, line, {
    playerKey: params.playerKey,
    playerStatKey: params.playerStatKey,
  });
  if (!parsed) return null;

  if (isPlayerMarkedDnp(finalStats, parsed.playerSlug)) return "void";

  const observed = findPlayerStatObserved(finalStats, parsed.playerSlug, parsed.statKey);
  if (observed === null) return null;
  return gradeOverUnderValue(observed, parsed.line, parsed.direction);
}

function gradeMatchMicroCountMarket(
  market: string,
  selection: string,
  line: number | undefined,
  finalStats: MatchFinalStatsV6 | null | undefined,
): PickResult | null {
  if (!finalStats) return null;
  const parsedDir = parseDirectionAndLineFromToken(selection, line);
  if (!parsedDir) return null;

  let observed: number | null = null;
  if (
    market === "corners_total" &&
    finalStats.cornersHome !== undefined &&
    finalStats.cornersAway !== undefined
  ) {
    observed = finalStats.cornersHome + finalStats.cornersAway;
  } else if (market === "corners_team") {
    if (selection.startsWith("home") && finalStats.cornersHome !== undefined) {
      observed = finalStats.cornersHome;
    } else if (selection.startsWith("away") && finalStats.cornersAway !== undefined) {
      observed = finalStats.cornersAway;
    }
  } else if (
    market === "shots_total" &&
    finalStats.shotsHome !== undefined &&
    finalStats.shotsAway !== undefined
  ) {
    observed = finalStats.shotsHome + finalStats.shotsAway;
  } else if (
    market === "shots_on_target" &&
    finalStats.shotsOnTargetHome !== undefined &&
    finalStats.shotsOnTargetAway !== undefined
  ) {
    observed = finalStats.shotsOnTargetHome + finalStats.shotsOnTargetAway;
  } else if (
    market === "fouls_total" &&
    finalStats.foulsHome !== undefined &&
    finalStats.foulsAway !== undefined
  ) {
    observed = finalStats.foulsHome + finalStats.foulsAway;
  } else if (
    market === "cards_total" &&
    finalStats.yellowCardsHome !== undefined &&
    finalStats.yellowCardsAway !== undefined
  ) {
    observed = finalStats.yellowCardsHome + finalStats.yellowCardsAway;
  } else if (
    market === "booking_points" &&
    finalStats.yellowCardsHome !== undefined &&
    finalStats.yellowCardsAway !== undefined
  ) {
    const reds = (finalStats.redCardsHome ?? 0) + (finalStats.redCardsAway ?? 0);
    observed = 10 * (finalStats.yellowCardsHome + finalStats.yellowCardsAway) + 25 * reds;
  }

  if (observed === null || !Number.isFinite(observed)) return null;
  return gradeOverUnderValue(observed, parsedDir.line, parsedDir.direction);
}

export function gradeSelection(
  input: GradeSelectionInput,
  home: number,
  away: number,
  extraStats?: MatchFinalStatsV6 | null,
): PickResult | null {
  const finalStats = extraStats ?? input.finalStats ?? null;
  let market = input.market?.trim().toLowerCase() ?? "";
  let selection = input.selection?.trim().toLowerCase() ?? "";
  let line = typeof input.line === "number" && Number.isFinite(input.line) ? input.line : undefined;

  if (!market || !selection) {
    const label = (input.pickLabel ?? "").trim().toLowerCase();
    if (!label) return null;
    if (label === "empate") {
      market = "h2h";
      selection = "draw";
    } else if (label.endsWith(" gana")) {
      return null;
    } else if (/^(?:m[aá]s de|over)\s+(\d+(?:\.\d+)?)/.test(label)) {
      const m = /^(?:m[aá]s de|over)\s+(\d+(?:\.\d+)?)/.exec(label)!;
      const parsedLine = parseStrictFiniteNumber(m[1]);
      if (parsedLine === null) return null;
      market = "totals";
      line = parsedLine;
      selection = `over_${line}`;
    } else if (/^(?:menos de|under)\s+(\d+(?:\.\d+)?)/.test(label)) {
      const m = /^(?:menos de|under)\s+(\d+(?:\.\d+)?)/.exec(label)!;
      const parsedLine = parseStrictFiniteNumber(m[1]);
      if (parsedLine === null) return null;
      market = "totals";
      line = parsedLine;
      selection = `under_${line}`;
    } else if (label.includes("ambos anotan") && (label.includes("sí") || label.includes("si"))) {
      market = "btts";
      selection = "yes";
    } else if (label.includes("ambos anotan") && label.includes("no")) {
      market = "btts";
      selection = "no";
    }
  }

  if (!market || !selection) return null;
  const norm = normalizeMarketForGrading(market, selection);
  const effectiveMarket = norm.market;
  const effectiveSelection = norm.selection;
  const effectiveLine = line ?? norm.line;

  const total = home + away;

  if (effectiveMarket === "moneyline_2way") {
    if (home === away) return "void";
    if (effectiveSelection === "home") return home > away ? "won" : "lost";
    if (effectiveSelection === "away") return away > home ? "won" : "lost";
    return null;
  }

  if (effectiveMarket === "dnb") {
    if (home === away) return "void";
    if (effectiveSelection === "home") return home > away ? "won" : "lost";
    if (effectiveSelection === "away") return away > home ? "won" : "lost";
    return null;
  }

  if (effectiveMarket === "totals") {
    if (effectiveLine === undefined) return null;
    if (effectiveSelection.startsWith("over")) {
      return gradeOverUnderValue(total, effectiveLine, "over");
    }
    if (effectiveSelection.startsWith("under")) {
      return gradeOverUnderValue(total, effectiveLine, "under");
    }
    return null;
  }

  if (effectiveMarket === "team_totals") {
    if (effectiveLine === undefined) return null;
    if (effectiveSelection.startsWith("home_")) {
      return gradeOverUnderValue(home, effectiveLine, effectiveSelection.includes("under") ? "under" : "over");
    }
    if (effectiveSelection.startsWith("away_")) {
      return gradeOverUnderValue(away, effectiveLine, effectiveSelection.includes("under") ? "under" : "over");
    }
    return null;
  }

  if (effectiveMarket === "spreads") {
    if (effectiveLine === undefined) return null;
    if (effectiveSelection.startsWith("home")) {
      const diff = home + effectiveLine - away;
      if (Math.abs(diff) < 1e-9) return "void";
      if (isQuarterLine(effectiveLine) && Math.abs(Math.abs(diff) - 0.25) < 1e-9) return null;
      return diff > 0 ? "won" : "lost";
    }
    if (effectiveSelection.startsWith("away")) {
      const diff = away + effectiveLine - home;
      if (Math.abs(diff) < 1e-9) return "void";
      if (isQuarterLine(effectiveLine) && Math.abs(Math.abs(diff) - 0.25) < 1e-9) return null;
      return diff > 0 ? "won" : "lost";
    }
    return null;
  }

  if (effectiveMarket === "clean_sheet") {
    if (effectiveSelection === "home_yes") return away === 0 ? "won" : "lost";
    if (effectiveSelection === "home_no") return away > 0 ? "won" : "lost";
    if (effectiveSelection === "away_yes") return home === 0 ? "won" : "lost";
    if (effectiveSelection === "away_no") return home > 0 ? "won" : "lost";
    return null;
  }

  if (effectiveMarket === "win_to_nil") {
    if (effectiveSelection === "home" || effectiveSelection === "home_yes") {
      return home > 0 && away === 0 ? "won" : "lost";
    }
    if (effectiveSelection === "away" || effectiveSelection === "away_yes") {
      return away > 0 && home === 0 ? "won" : "lost";
    }
    return null;
  }

  if (effectiveMarket === "combo_1x2_over") {
    const parsedDir = parseDirectionAndLineFromToken(effectiveSelection, effectiveLine);
    if (!parsedDir) return null;
    const resultHolds = effectiveSelection.startsWith("home")
      ? home > away
      : effectiveSelection.startsWith("away")
        ? away > home
        : effectiveSelection.startsWith("draw")
          ? home === away
          : effectiveSelection.startsWith("1x")
            ? home >= away
            : effectiveSelection.startsWith("x2")
              ? away >= home
              : null;
    if (resultHolds === null) return null;
    if (!resultHolds) return "lost";
    return gradeOverUnderValue(total, parsedDir.line, parsedDir.direction);
  }

  if (effectiveMarket === "combo_1x2_btts") {
    const both = home > 0 && away > 0;
    const resultHolds = effectiveSelection.startsWith("home")
      ? home > away
      : effectiveSelection.startsWith("away")
        ? away > home
        : effectiveSelection.startsWith("draw")
          ? home === away
          : null;
    if (resultHolds === null) return null;
    if (effectiveSelection.includes("btts_yes") || effectiveSelection.endsWith("_yes")) {
      return resultHolds && both ? "won" : "lost";
    }
    if (effectiveSelection.includes("btts_no") || effectiveSelection.endsWith("_no")) {
      return resultHolds && !both ? "won" : "lost";
    }
    return null;
  }

  if (effectiveMarket === "half_time_result") {
    const ht = finalStats?.htScore;
    if (!ht) return null;
    if (effectiveSelection.includes("home")) return ht.home > ht.away ? "won" : "lost";
    if (effectiveSelection.includes("away")) return ht.away > ht.home ? "won" : "lost";
    if (effectiveSelection.includes("draw")) return ht.home === ht.away ? "won" : "lost";
    return null;
  }

  if (effectiveMarket === "second_half_result") {
    const ht = finalStats?.htScore;
    if (!ht) return null;
    const h2 = home - ht.home;
    const a2 = away - ht.away;
    if (h2 < 0 || a2 < 0) return null;
    if (effectiveSelection.includes("home")) return h2 > a2 ? "won" : "lost";
    if (effectiveSelection.includes("away")) return a2 > h2 ? "won" : "lost";
    if (effectiveSelection.includes("draw")) return h2 === a2 ? "won" : "lost";
    return null;
  }

  if (effectiveMarket === "mlb_f5") {
    const f5 = finalStats?.f5Score;
    if (!f5) return null;
    if (effectiveSelection === "f5_home" || effectiveSelection === "home") {
      return f5.home > f5.away ? "won" : f5.home === f5.away ? "void" : "lost";
    }
    if (effectiveSelection === "f5_away" || effectiveSelection === "away") {
      return f5.away > f5.home ? "won" : f5.home === f5.away ? "void" : "lost";
    }
    if (effectiveSelection === "f5_tie" || effectiveSelection === "tie" || effectiveSelection === "draw") {
      return f5.home === f5.away ? "won" : "lost";
    }
    const parsedDir = parseDirectionAndLineFromToken(effectiveSelection, effectiveLine);
    if (parsedDir) {
      return gradeOverUnderValue(f5.home + f5.away, parsedDir.line, parsedDir.direction);
    }
    return null;
  }

  if (
    effectiveMarket === "corners_total" ||
    effectiveMarket === "corners_team" ||
    effectiveMarket === "shots_total" ||
    effectiveMarket === "shots_on_target" ||
    effectiveMarket === "fouls_total" ||
    effectiveMarket === "cards_total" ||
    effectiveMarket === "booking_points"
  ) {
    return gradeMatchMicroCountMarket(effectiveMarket, effectiveSelection, effectiveLine, finalStats);
  }

  if (effectiveMarket === "goalkeeper_saves" || effectiveMarket === "player_props") {
    return gradeStructuredPlayerOrKeeperProp({
      rawMarket: norm.rawPropMarket ?? market,
      selection: effectiveSelection,
      line: effectiveLine,
      playerKey: input.playerKey,
      playerStatKey: input.playerStatKey,
      finalStats,
    });
  }

  const holds = selectionHolds(
    {
      market: asMarketKey(effectiveMarket),
      selection: effectiveSelection,
      line: effectiveLine,
    },
    home,
    away,
  );
  if (holds === null) return null;
  return holds ? "won" : "lost";
}

export function evaluateSettledProspectiveQuotesV6(params: {
  readonly ticks: readonly QuoteTickInputV6[];
  readonly scores: ReadonlyMap<string, FinalMatchScore>;
  readonly dataset?: PlatformDataset;
  readonly nResamples?: number;
  readonly seed?: number;
}): ProspectiveQuotesEvaluationReportV6 {
  const settledScoresByEvent: Record<string, SettledScoreRecordV6> = {};
  for (const [gameId, score] of params.scores.entries()) {
    settledScoresByEvent[gameId] = {
      homeScore: score.home,
      awayScore: score.away,
    };
  }
  return evaluateProspectiveClosingQuotesV6({
    ticks: params.ticks,
    dataset: params.dataset,
    settledScoresByEvent,
    nResamples: params.nResamples,
    seed: params.seed,
  });
}

export interface SettlementRunReport {
  checkedPending: number;
  settledSingles: number;
  settledParlays: number;
  updatedPartialParlays: number;
  emailed: number;
  closingOddsCaptured: number;
  skippedUnresolved: number;
  prospectiveEvaluation?: ProspectiveQuotesEvaluationReportV6 | null;
}

export async function runPickSettlement(
  db: Db,
  mailer: Mailer,
  options: {
    now?: Date;
    snapshotsRoot?: string;
    historyRoot?: string;
    finalStatsByGame?: ReadonlyMap<string, MatchFinalStatsV6>;
    prospectiveQuoteTicks?: readonly QuoteTickInputV6[];
    onSettled?: (pick: { userId: string; status: PickResult; pickLabel: string }) => Promise<void>;
  } = {},
): Promise<SettlementRunReport> {
  const now = options.now ?? new Date();
  const dataset = buildServerRawPlatformDataset();

  const closingOddsCaptured = await syncPreKickoffClosingOdds(db, dataset, now).catch(() => 0);
  const scores = loadFinalMatchScores(options.snapshotsRoot, options.historyRoot);

  const resultInputs = Array.from(scores.values()).map((s) => ({
    gameId: s.gameId,
    home: s.home,
    away: s.away,
  }));
  if (resultInputs.length > 0) {
    await recordMatchResults(db, resultInputs, now).catch(() => undefined);
  }

  const prospectiveEvaluation =
    options.prospectiveQuoteTicks && options.prospectiveQuoteTicks.length > 0
      ? evaluateSettledProspectiveQuotesV6({
          ticks: options.prospectiveQuoteTicks,
          scores,
          dataset,
        })
      : null;

  const pending = await db
    .select()
    .from(sealedPicks)
    .where(and(eq(sealedPicks.status, "pending"), lte(sealedPicks.kickoffAt, now)));

  if (pending.length === 0) {
    return {
      checkedPending: 0,
      settledSingles: 0,
      settledParlays: 0,
      updatedPartialParlays: 0,
      emailed: 0,
      closingOddsCaptured,
      skippedUnresolved: 0,
      ...(prospectiveEvaluation ? { prospectiveEvaluation } : {}),
    };
  }

  const allGameIds = new Set<string>();
  for (const row of pending) {
    allGameIds.add(row.gameId);
    if (Array.isArray(row.parlayLegs)) {
      for (const leg of row.parlayLegs) {
        if (leg?.gameId) allGameIds.add(leg.gameId);
      }
    }
  }
  const closingRows: ClosingOddsRow[] = await listClosingOddsForGames(db, Array.from(allGameIds));
  const gamesById = new Map(dataset.games.map((g) => [g.id, g]));

  let settledSingles = 0;
  let settledParlays = 0;
  let updatedPartialParlays = 0;
  let emailed = 0;
  let skippedUnresolved = 0;

  for (const row of pending) {
    if (row.pickKind === "parlay" && Array.isArray(row.parlayLegs) && row.parlayLegs.length >= 2) {
      const legs = row.parlayLegs as SealedParlayLegSpec[];
      const prevResults = new Map(
        ((row.parlayLegResults as SealedParlayLegResult[] | null) ?? []).map((r) => [r.pickId, r]),
      );
      const nextResults: SealedParlayLegResult[] = [];
      let anyLost = false;
      let allGraded = true;

      for (const leg of legs) {
        const cached = prevResults.get(leg.pickId);
        if (cached) {
          nextResults.push(cached);
          if (cached.status === "lost") anyLost = true;
          continue;
        }
        const score = scores.get(leg.gameId);
        if (!score) {
          allGraded = false;
          continue;
        }
        const legOutcome = gradeSelection(
          {
            market: leg.market,
            selection: leg.selection,
            line: leg.line,
            pickLabel: leg.pickLabel,
          },
          score.home,
          score.away,
          options.finalStatsByGame?.get(leg.gameId) ?? null,
        );
        if (!legOutcome) {
          allGraded = false;
          continue;
        }
        const closing = findClosingQuoteForPick(closingRows, {
          gameId: leg.gameId,
          market: leg.market,
          selection: leg.selection,
          line: leg.line,
        });
        const legClosingRef = closing ? (closing.fairDecimal ?? closing.decimalOdds) : null;
        const legClv = legClosingRef
          ? computeCredibleClvPctV6(leg.fairDecimal, legClosingRef, false)
          : null;
        nextResults.push({
          pickId: leg.pickId,
          gameId: leg.gameId,
          status: legOutcome,
          homeScore: score.home,
          awayScore: score.away,
          closingDecimal: legClosingRef,
          clvPct: legClv,
          settledAt: now.toISOString(),
        });
        if (legOutcome === "lost") anyLost = true;
      }

      const finalStatus: PickResult | null = anyLost
        ? "lost"
        : allGraded
          ? nextResults.every((r) => r.status === "void")
            ? "void"
            : "won"
          : null;

      if (!finalStatus) {
        if (nextResults.length > prevResults.size) {
          await db
            .update(sealedPicks)
            .set({ parlayLegResults: nextResults })
            .where(and(eq(sealedPicks.id, row.id), eq(sealedPicks.status, "pending")));
          updatedPartialParlays += 1;
        } else {
          skippedUnresolved += 1;
        }
        continue;
      }

      const activeLegs = legs.filter((l) => nextResults.find((r) => r.pickId === l.pickId)?.status !== "void");
      const allLegsHaveClosing =
        activeLegs.length > 0 &&
        activeLegs.every((l) => nextResults.find((r) => r.pickId === l.pickId)?.closingDecimal != null);
      const closingDecimal = allLegsHaveClosing
        ? parseStrictFiniteNumber(
            activeLegs
              .reduce((acc, l) => acc * (nextResults.find((r) => r.pickId === l.pickId)!.closingDecimal ?? 1), 1)
              .toFixed(3),
          )
        : null;

      const userDec = parseStrictFiniteNumber(row.userDecimal) ?? 0;
      const refFair = closingDecimal ?? (parseStrictFiniteNumber(row.fairDecimal) ?? 0);
      const clvPct = computeCredibleClvPctV6(userDec, refFair, true);

      const res = await settleAndNotify(db, mailer, {
        userId: row.userId,
        pickId: row.pickId,
        result: finalStatus,
        clvPct,
        closingDecimal,
        parlayLegResults: nextResults,
        isParlay: true,
        now,
      });
      if (res.settled) {
        settledParlays += 1;
        if (res.notice === "enviado") emailed += 1;
        if (options.onSettled) {
          await options.onSettled({ userId: row.userId, status: finalStatus, pickLabel: row.pickLabel }).catch(() => undefined);
        }
      }
      continue;
    }

    const score = scores.get(row.gameId);
    if (!score) {
      skippedUnresolved += 1;
      continue;
    }

    let market = row.pickMarket;
    let selection = row.pickSelection;
    let line = row.pickLine !== null && row.pickLine !== undefined ? parseStrictFiniteNumber(row.pickLine) : null;

    if (!market || !selection) {
      const catGame = gamesById.get(row.gameId);
      const catPick = catGame?.picks.find((p) => p.id === row.pickId || p.label === row.pickLabel);
      if (catPick) {
        market = catPick.market ?? market;
        selection = catPick.selectionKey;
        line = catPick.line ?? line;
      } else {
        const catRow = catGame?.markets.find((m) => m.label === row.pickLabel);
        if (catRow) {
          market = catRow.market;
          selection = catRow.selection;
          line = catRow.line ?? line;
        }
      }
    }

    const result = gradeSelection(
      { market, selection, line, pickLabel: row.pickLabel },
      score.home,
      score.away,
      options.finalStatsByGame?.get(row.gameId) ?? null,
    );
    if (!result) {
      skippedUnresolved += 1;
      continue;
    }

    const closing = findClosingQuoteForPick(closingRows, {
      gameId: row.gameId,
      market,
      selection,
      line,
    });
    const closingRef = closing ? (closing.fairDecimal ?? closing.decimalOdds) : null;
    const clvPct = computeCredibleClvPctV6(
      parseStrictFiniteNumber(row.userDecimal) ?? 0,
      closingRef ?? (parseStrictFiniteNumber(row.fairDecimal) ?? 0),
      false,
    );

    const res = await settleAndNotify(db, mailer, {
      userId: row.userId,
      pickId: row.pickId,
      result,
      clvPct,
      closingDecimal: closingRef,
      isParlay: false,
      now,
    });
    if (res.settled) {
      settledSingles += 1;
      if (res.notice === "enviado") emailed += 1;
      if (options.onSettled) {
        await options.onSettled({ userId: row.userId, status: result, pickLabel: row.pickLabel }).catch(() => undefined);
      }
    }
  }

  return {
    checkedPending: pending.length,
    settledSingles,
    settledParlays,
    updatedPartialParlays,
    emailed,
    closingOddsCaptured,
    skippedUnresolved,
    ...(prospectiveEvaluation ? { prospectiveEvaluation } : {}),
  };
}
