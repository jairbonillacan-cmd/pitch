import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fetchNflverseCsv,
  normalizeNflverseSchedule,
} from "./adapters/nflverse.js";
import {
  fetchOpenFootballPl,
  normalizeOpenFootballPremierLeague,
} from "./adapters/openfootball.js";
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

function loadRootEnvFiles(): void {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = resolve(ROOT_DIR, fileName);
    if (!existsSync(filePath)) continue;
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line
        .slice(eqIdx + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
}

async function main() {
  loadRootEnvFiles();
  const now = new Date();
  const dateStr = process.env.SNAPSHOT_DATE ?? now.toISOString().slice(0, 10);
  const updatedAt = process.env.SNAPSHOT_TIMESTAMP ?? now.toISOString();

  console.log(`[snapshot] Generando snapshots para fecha=${dateStr} (${updatedAt})...`);

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
  });
  const nflFiles = writeSnapshotFiles(SNAPSHOTS_ROOT, nflSnapshot, dateStr);
  console.log(
    `[snapshot] NFL (${normNfl.periodLabel}): ${nflSnapshot.games.length} partidos -> ${nflFiles.latestPath}`,
  );

  // 2. Premier League (openfootball CC0)
  const prevPl = loadPreviousSnapshot(SNAPSHOTS_ROOT, "premier-league");
  const plJson = await fetchOpenFootballPl();
  const normPl = normalizeOpenFootballPremierLeague(plJson, {
    referenceDate: dateStr,
  });
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
  });
  const plFiles = writeSnapshotFiles(SNAPSHOTS_ROOT, plSnapshot, dateStr);
  console.log(
    `[snapshot] Premier League (${normPl.periodLabel}): ${plSnapshot.games.length} partidos -> ${plFiles.latestPath}`,
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
