import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPETITION_BY_ID,
  GameAnalysisSchema,
  LeagueSnapshotSchema,
  parseStrictFiniteNumber,
  sportForLeague,
  type GameAnalysis,
  type GameDTO,
  type LeagueSnapshot,
  type TeamSeasonRate,
} from "@pitchlab/contracts";
import type { FootballTeamRateInput } from "@pitchlab/engines-reference";
import {
  analyzeFootballGameV2,
  fitDixonColes,
  type DixonColesModel,
  type FootballMatchRow,
} from "@pitchlab/models";
import {
  addMatchContext,
  keepVerifiedPicks,
  withPreKickoffPicksOnly,
  type ContextRow,
} from "./pick-context.js";
import {
  HISTORY_BLEND_WEIGHT,
  buildHistoryRatings,
  computeStandings,
  toFootballMatchRows,
  type SeasonResultsFile,
} from "./pipeline.js";
import { loadLeagueHistory, loadPriorMatches } from "./prior-season.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const SNAPSHOTS_ROOT = join(REPO_ROOT, "data/snapshots");

function writeFileAtomic(filePath: string, contents: string): void {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, contents, "utf8");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      renameSync(tmpPath, filePath);
      return;
    } catch (err) {
      void err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60 * (attempt + 1));
    }
  }
  writeFileSync(filePath, contents, "utf8");
}

function footballTeamRatesFromModel(
  inputs: readonly FootballTeamRateInput[],
  model: DixonColesModel,
  existingRates: Readonly<Record<string, TeamSeasonRate>>,
): Record<string, TeamSeasonRate> {
  const rates: Record<string, TeamSeasonRate> = {};
  for (const team of inputs) {
    const attack = model.attack[team.teamId] ?? 1;
    const defense = model.defense[team.teamId] ?? 1;
    const prevLogo = existingRates[team.teamId]?.logoUrl;
    rates[team.teamId] = {
      teamId: team.teamId,
      name: team.name,
      shortName: team.shortName,
      code: team.code,
      ...(prevLogo ? { logoUrl: prevLogo } : {}),
      forPerGame: team.gamesPlayed > 0 ? team.goalsFor / team.gamesPlayed : model.baseRate,
      againstPerGame: team.gamesPlayed > 0 ? team.goalsAgainst / team.gamesPlayed : model.baseRate,
      gamesPlayed: team.gamesPlayed,
      adjustedFor: model.baseRate * attack,
      adjustedAgainst: model.baseRate * defense,
    };
  }
  return rates;
}

function loadSeasonResultsRows(seasonResultsPath: string): FootballMatchRow[] {
  if (!existsSync(seasonResultsPath)) return [];
  const raw = JSON.parse(readFileSync(seasonResultsPath, "utf8")) as Partial<SeasonResultsFile>;
  if (!Array.isArray(raw.matches)) return [];
  const rows: FootballMatchRow[] = [];
  for (const item of raw.matches) {
    if (!item || typeof item !== "object") continue;
    const homeGoals = parseStrictFiniteNumber(item.homeScore);
    const awayGoals = parseStrictFiniteNumber(item.awayScore);
    if (
      typeof item.date !== "string" ||
      typeof item.homeTeam !== "string" ||
      typeof item.awayTeam !== "string" ||
      homeGoals === null ||
      awayGoals === null ||
      homeGoals < 0 ||
      awayGoals < 0
    ) {
      continue;
    }
    rows.push({
      date: item.date.slice(0, 10),
      home: item.homeTeam,
      away: item.awayTeam,
      homeGoals,
      awayGoals,
    });
  }
  return rows;
}

function mergeSeasonRows(
  fromResultsFile: readonly FootballMatchRow[],
  fromSnapshotGames: readonly FootballMatchRow[],
): FootballMatchRow[] {
  const dedup = new Map<string, FootballMatchRow>();
  for (const row of [...fromResultsFile, ...fromSnapshotGames]) {
    const key = `${row.date}|${row.home}|${row.away}`;
    dedup.set(key, row);
  }
  return [...dedup.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.home.localeCompare(b.home) ||
      a.away.localeCompare(b.away),
  );
}

function buildTeamRateInputs(
  snapshot: LeagueSnapshot,
  seasonRows: readonly FootballMatchRow[],
): FootballTeamRateInput[] {
  const byTeam = new Map<string, FootballTeamRateInput>();
  const ensureTeam = (teamId: string, name: string, shortName: string, code: string) => {
    if (!byTeam.has(teamId)) {
      byTeam.set(teamId, {
        teamId,
        name,
        shortName,
        code,
        goalsFor: 0,
        goalsAgainst: 0,
        gamesPlayed: 0,
      });
    }
  };

  for (const rate of Object.values(snapshot.teamRates)) {
    ensureTeam(rate.teamId, rate.name, rate.shortName, rate.code);
  }
  for (const game of snapshot.games) {
    ensureTeam(game.home.id, game.home.name, game.home.shortName, game.home.code);
    ensureTeam(game.away.id, game.away.name, game.away.shortName, game.away.code);
  }
  for (const row of seasonRows) {
    if (!byTeam.has(row.home)) {
      const shortName = row.home.includes(".") ? row.home.split(".")[1]! : row.home;
      ensureTeam(row.home, shortName, shortName, shortName.slice(0, 3).toUpperCase());
    }
    if (!byTeam.has(row.away)) {
      const shortName = row.away.includes(".") ? row.away.split(".")[1]! : row.away;
      ensureTeam(row.away, shortName, shortName, shortName.slice(0, 3).toUpperCase());
    }
    const homeTeam = byTeam.get(row.home)!;
    const awayTeam = byTeam.get(row.away)!;
    homeTeam.gamesPlayed += 1;
    homeTeam.goalsFor += row.homeGoals;
    homeTeam.goalsAgainst += row.awayGoals;
    awayTeam.gamesPlayed += 1;
    awayTeam.goalsFor += row.awayGoals;
    awayTeam.goalsAgainst += row.homeGoals;
  }

  return [...byTeam.values()].sort((a, b) => a.teamId.localeCompare(b.teamId));
}

function countOver35AboveHalf(analyses: Readonly<Record<string, GameAnalysis>>, games: readonly GameDTO[]): {
  readonly avgTotal: number;
  readonly over35HighCount: number;
  readonly nonFinalCount: number;
} {
  let totalSum = 0;
  let nonFinalCount = 0;
  let over35HighCount = 0;
  for (const game of games) {
    if (game.status === "final") continue;
    const analysis = analyses[game.id];
    if (!analysis) continue;
    nonFinalCount += 1;
    totalSum += analysis.projection.total;
    const over35Row = analysis.marketGroups
      .flatMap((g) => g.rows)
      .find((r) => String(r.market) === "totals" && r.selection === "over_3.5");
    if (over35Row && over35Row.p > 0.5) over35HighCount += 1;
  }
  return {
    avgTotal: nonFinalCount > 0 ? totalSum / nonFinalCount : 0,
    over35HighCount,
    nonFinalCount,
  };
}

export interface RefitLeagueSummary {
  readonly league: string;
  readonly seasonMatches: number;
  readonly refittedGames: number;
  readonly preservedFinalGames: number;
  readonly avgTotalBefore: number;
  readonly avgTotalAfter: number;
  readonly over35HighBefore: number;
  readonly over35HighAfter: number;
  readonly wroteFile: boolean;
}

export function refitFootballLeagueSnapshot(
  snapshotsRoot: string,
  leagueKey: string,
  options: { readonly dryRun?: boolean; readonly nowIso?: string } = {},
): RefitLeagueSummary | null {
  if (sportForLeague(leagueKey) !== "football") return null;
  const leagueDir = join(snapshotsRoot, leagueKey);
  const latestPath = join(leagueDir, "latest.json");
  if (!existsSync(latestPath)) return null;

  const rawSnapshot = JSON.parse(readFileSync(latestPath, "utf8")) as unknown;
  const snapshot = LeagueSnapshotSchema.parse(rawSnapshot);
  const seasonResultsPath = join(leagueDir, "season-results.json");
  const seasonRows = mergeSeasonRows(
    loadSeasonResultsRows(seasonResultsPath),
    toFootballMatchRows(snapshot.games),
  );
  if (seasonRows.length === 0) return null;

  const refitAt = options.nowIso ?? snapshot.updatedAt;
  const referenceDate = refitAt.slice(0, 10);
  const seasonStart =
    seasonRows[0]?.date ??
    snapshot.games.map((g) => g.startTime.slice(0, 10)).sort()[0] ??
    referenceDate;

  const priorBeforeSeason = loadPriorMatches(leagueKey, seasonStart).filter(
    (row) => row.date < seasonStart,
  );
  const history = loadLeagueHistory(leagueKey, seasonStart);
  const ratings =
    history.length > 0
      ? buildHistoryRatings(history, seasonRows, seasonStart, String(snapshot.season), null)
      : null;

  const model = fitDixonColes([...priorBeforeSeason, ...seasonRows], {
    referenceDate,
  });

  const teamRateInputs = buildTeamRateInputs(snapshot, seasonRows);
  const nextTeamRates = footballTeamRatesFromModel(teamRateInputs, model, snapshot.teamRates);
  const standings =
    snapshot.standings && snapshot.standings.length > 0
      ? snapshot.standings
      : computeStandings(seasonRows, teamRateInputs);

  const contextSeen = new Set<string>();
  const contextRows: ContextRow[] = [];
  for (const row of [
    ...history.map((m) => ({
      date: m.date,
      home: m.home,
      away: m.away,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
    })),
    ...seasonRows,
  ]) {
    const key = `${row.date}|${row.home}|${row.away}`;
    if (!contextSeen.has(key)) {
      contextSeen.add(key);
      contextRows.push(row);
    }
  }

  const leagueName = COMPETITION_BY_ID[snapshot.league]?.label ?? leagueKey;
  const beforeStats = countOver35AboveHalf(snapshot.analyses, snapshot.games);
  const nextAnalyses: Record<string, GameAnalysis> = {};
  let refittedGames = 0;
  let preservedFinalGames = 0;

  for (const game of snapshot.games) {
    const prev = snapshot.analyses[game.id];
    if (game.status === "final") {
      if (prev) {
        nextAnalyses[game.id] = GameAnalysisSchema.parse(
          keepVerifiedPicks(GameAnalysisSchema.parse(prev), game),
        );
        preservedFinalGames += 1;
      }
      continue;
    }

    const publishedAt = prev?.publishedAt ?? refitAt;
    const fresh = analyzeFootballGameV2({
      league: snapshot.league,
      leagueName,
      game,
      model,
      teamRates: nextTeamRates,
      inputsAsOf: refitAt,
      publishedAt,
      source: prev?.source ?? snapshot.source,
      recentResults: seasonRows,
      standings,
      outcomeBlend: ratings
        ? {
            ...ratings.predict(game.home.id, game.away.id, {
              neutralSite: game.neutralSite,
            }),
            weight: HISTORY_BLEND_WEIGHT,
          }
        : undefined,
    });

    const withContext = addMatchContext(fresh, game, contextRows, seasonRows);
    const merged: GameAnalysis = {
      ...withContext,
      ...(prev?.cortex ? { cortex: prev.cortex } : {}),
      ...(prev?.counts ? { counts: prev.counts } : {}),
      ...(prev?.lineups ? { lineups: prev.lineups } : {}),
      ...(prev?.matchContext ? { matchContext: prev.matchContext } : {}),
    };
    const finalized = withPreKickoffPicksOnly(merged, game, refitAt);
    nextAnalyses[game.id] = GameAnalysisSchema.parse(finalized);
    refittedGames += 1;
  }

  const nextSnapshot: LeagueSnapshot = LeagueSnapshotSchema.parse({
    ...snapshot,
    updatedAt: refitAt,
    teamRates: nextTeamRates,
    analyses: nextAnalyses,
  });

  const afterStats = countOver35AboveHalf(nextSnapshot.analyses, nextSnapshot.games);
  const wroteFile = !options.dryRun && refittedGames > 0;
  if (wroteFile) {
    writeFileAtomic(latestPath, `${JSON.stringify(nextSnapshot, null, 2)}\n`);
  }

  return {
    league: leagueKey,
    seasonMatches: seasonRows.length,
    refittedGames,
    preservedFinalGames,
    avgTotalBefore: beforeStats.avgTotal,
    avgTotalAfter: afterStats.avgTotal,
    over35HighBefore: beforeStats.over35HighCount,
    over35HighAfter: afterStats.over35HighCount,
    wroteFile,
  };
}

function parseCliArgs(argv: readonly string[]): {
  readonly dryRun: boolean;
  readonly leaguesFilter: ReadonlySet<string> | null;
} {
  let dryRun = false;
  let leaguesFilter: ReadonlySet<string> | null = null;
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--leagues=")) {
      const items = arg
        .slice("--leagues=".length)
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      if (items.length > 0) leaguesFilter = new Set(items);
    }
  }
  return { dryRun, leaguesFilter };
}

function main(): void {
  const { dryRun, leaguesFilter } = parseCliArgs(process.argv.slice(2));
  const nowIso = new Date().toISOString();
  const dirs = readdirSync(SNAPSHOTS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((leagueKey) => sportForLeague(leagueKey) === "football")
    .filter((leagueKey) => !leaguesFilter || leaguesFilter.has(leagueKey))
    .sort();

  let totalRefitted = 0;
  let totalPreserved = 0;
  let leaguesUpdated = 0;

  for (const leagueKey of dirs) {
    const summary = refitFootballLeagueSnapshot(SNAPSHOTS_ROOT, leagueKey, {
      dryRun,
      nowIso,
    });
    if (!summary) continue;
    totalRefitted += summary.refittedGames;
    totalPreserved += summary.preservedFinalGames;
    if (summary.wroteFile) leaguesUpdated += 1;
    process.stdout.write(
      `[refit] ${summary.league}: matches=${summary.seasonMatches} refitted=${summary.refittedGames} preservedFinal=${summary.preservedFinalGames} avgTotal=${summary.avgTotalBefore.toFixed(2)}->${summary.avgTotalAfter.toFixed(2)} over35>50%=${summary.over35HighBefore}->${summary.over35HighAfter}${dryRun ? " (dry-run)" : ""}\n`,
    );
  }

  process.stdout.write(
    `[refit] DONE leaguesUpdated=${leaguesUpdated} totalRefitted=${totalRefitted} totalPreservedFinal=${totalPreserved}\n`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
