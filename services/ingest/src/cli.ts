import { resolve } from "node:path";
import {
  fetchNflverseCsv,
  normalizeNflverseSchedule,
} from "./adapters/nflverse.js";
import { loadRootEnvFiles } from "./env.js";
import { loadPriorMatches } from "./prior-season.js";
import {
  fetchOpenFootballLaliga,
  fetchOpenFootballPl,
  normalizeOpenFootballLaliga,
  normalizeOpenFootballPremierLeague,
} from "./adapters/openfootball.js";
import {
  fetchFootballDataPl,
  normalizeFootballDataPremierLeague,
} from "./adapters/football-data.js";
import {
  fetchApiFootballLigaMx,
  normalizeApiFootballLigaMx,
} from "./adapters/api-football.js";
import {
  buildFootballSnapshot,
  buildNflSnapshot,
  loadPreviousSnapshot,
  writeSnapshotFiles,
} from "./pipeline.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..");
const SNAPSHOTS_ROOT = resolve(ROOT_DIR, "data", "snapshots");
const CACHE_DIR = resolve(import.meta.dirname, "..", ".cache");

async function main() {
  loadRootEnvFiles(ROOT_DIR);
  const now = new Date();
  const dateStr = process.env.SNAPSHOT_DATE ?? now.toISOString().slice(0, 10);
  const updatedAt = process.env.SNAPSHOT_TIMESTAMP ?? now.toISOString();
  const modelVersion: "v1" | "v2" = process.env.MODEL_VERSION === "v1" ? "v1" : "v2";

  console.log(
    `[snapshot] Generando snapshots para fecha=${dateStr} (${updatedAt}) · modelo=${modelVersion}...`,
  );

  // 1. NFL (nflverse CC-BY 4.0)
  const prevNfl = loadPreviousSnapshot(SNAPSHOTS_ROOT, "nfl");
  const nflCsv = await fetchNflverseCsv();
  const normNfl = normalizeNflverseSchedule(nflCsv, {
    season: 2026,
    referenceDate: dateStr,
  });
  const nflSnapshot = buildNflSnapshot({
    seasonId: normNfl.seasonId,
    seasonLabel: normNfl.seasonLabel,
    periodLabel: normNfl.periodLabel,
    games: normNfl.activeWeekGames,
    teamRateInputs: normNfl.teamRateInputs,
    updatedAt,
    previousSnapshot: prevNfl,
    seasonGames: normNfl.allGames,
    modelVersion,
  });
  const nflFiles = writeSnapshotFiles(SNAPSHOTS_ROOT, nflSnapshot, dateStr);
  console.log(
    `[snapshot] NFL (${normNfl.periodLabel}): ${nflSnapshot.games.length} partidos -> ${nflFiles.latestPath}`,
  );

  // 2. Premier League (football-data.org si existe FOOTBALL_DATA_API_KEY, si no openfootball CC0)
  const prevPl = loadPreviousSnapshot(SNAPSHOTS_ROOT, "premier-league");
  const footballDataKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  const normPl = footballDataKey
    ? normalizeFootballDataPremierLeague(
        await fetchFootballDataPl({
          apiKey: footballDataKey,
          cacheFilePath: resolve(CACHE_DIR, "football-data-pl.json"),
        }),
        { referenceDate: dateStr },
      )
    : normalizeOpenFootballPremierLeague(await fetchOpenFootballPl(), {
        referenceDate: dateStr,
      });
  const priorPl = loadPriorMatches("premier-league", dateStr);
  const plSnapshot = buildFootballSnapshot({
    league: "premier-league",
    leagueName: "Premier League",
    seasonId: normPl.seasonId,
    seasonLabel: normPl.seasonLabel,
    periodLabel: normPl.periodLabel,
    games: normPl.activeRoundGames,
    teamRateInputs: normPl.teamRateInputs,
    updatedAt,
    source: "openfootball",
    previousSnapshot: prevPl,
    seasonGames: normPl.allGames,
    priorMatches: priorPl,
    modelVersion,
  });
  const plFiles = writeSnapshotFiles(SNAPSHOTS_ROOT, plSnapshot, dateStr);
  console.log(
    `[snapshot] Premier League (${normPl.periodLabel}): ${plSnapshot.games.length} partidos -> ${plFiles.latestPath}`,
  );

  // 3. LaLiga (openfootball CC0)
  const prevLl = loadPreviousSnapshot(SNAPSHOTS_ROOT, "laliga");
  const normLl = normalizeOpenFootballLaliga(await fetchOpenFootballLaliga(), {
    referenceDate: dateStr,
  });
  const priorLl = loadPriorMatches("laliga", dateStr);
  const llSnapshot = buildFootballSnapshot({
    league: "laliga",
    leagueName: "LaLiga",
    seasonId: normLl.seasonId,
    seasonLabel: normLl.seasonLabel,
    periodLabel: normLl.periodLabel,
    games: normLl.activeRoundGames,
    teamRateInputs: normLl.teamRateInputs,
    updatedAt,
    source: "openfootball",
    previousSnapshot: prevLl,
    seasonGames: normLl.allGames,
    priorMatches: priorLl,
    modelVersion,
  });
  const llFiles = writeSnapshotFiles(SNAPSHOTS_ROOT, llSnapshot, dateStr);
  console.log(
    `[snapshot] LaLiga (${normLl.periodLabel}): ${llSnapshot.games.length} partidos -> ${llFiles.latestPath}`,
  );

  // 3. Liga MX (API-Football Free — solo si existe API_FOOTBALL_KEY)
  const apiFootballKey = process.env.API_FOOTBALL_KEY?.trim();
  if (apiFootballKey) {
    const prevMx = loadPreviousSnapshot(SNAPSHOTS_ROOT, "liga-mx");
    const mxPayload = await fetchApiFootballLigaMx({
      apiKey: apiFootballKey,
      season: 2026,
      cacheFilePath: resolve(CACHE_DIR, "api-football-liga-mx-2026.json"),
      budgetFilePath: resolve(CACHE_DIR, "api-football-budget.json"),
    });
    const normMx = normalizeApiFootballLigaMx(mxPayload, {
      referenceDate: dateStr,
    });
    const priorMx = loadPriorMatches("liga-mx", dateStr);
    const mxSnapshot = buildFootballSnapshot({
      league: "liga-mx",
      leagueName: "Liga MX",
      seasonId: normMx.seasonId,
      seasonLabel: normMx.seasonLabel,
      periodLabel: normMx.periodLabel,
      games: normMx.activeRoundGames,
      teamRateInputs: normMx.teamRateInputs,
      updatedAt,
      source: "api-football",
      previousSnapshot: prevMx,
      seasonGames: normMx.allGames,
      priorMatches: priorMx,
      modelVersion,
    });
    const mxFiles = writeSnapshotFiles(SNAPSHOTS_ROOT, mxSnapshot, dateStr);
    console.log(
      `[snapshot] Liga MX (${normMx.periodLabel}): ${mxSnapshot.games.length} partidos -> ${mxFiles.latestPath}`,
    );
  } else {
    console.log(
      "[snapshot] Liga MX omitida: API_FOOTBALL_KEY no configurada (aparecerá como 'Pronto' en la UI).",
    );
  }
}

main().catch((err) => {
  console.error("[snapshot] Error fatal:", err);
  process.exit(1);
});
