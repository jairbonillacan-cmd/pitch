/**
 * CLI de generación de snapshots e historial para selecciones nacionales:
 *   pnpm --filter @pitchlab/ingest national:snapshot [--date=YYYY-MM-DD]
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadRootEnvFiles } from "./env.js";
import { readProviderConfigs } from "./providers/config.js";
import {
  buildFootballSnapshot,
  loadPreviousSnapshot,
  writeSnapshotFiles,
} from "./pipeline.js";
import { validateLeagueSnapshotCandidate } from "./validation/snapshot-validator.js";
import {
  NATIONAL_COMPETITION_SPECS,
  enrichTeamRatesFromHistory,
  fetchNationalCompetition,
  historyRowsForCompetition,
  priorFootballRowsForCompetition,
  writeInternationalHistoryFile,
  type NormalizedNationalSeason,
} from "./adapters/espn-national.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..");
const SNAPSHOTS_ROOT = resolve(ROOT_DIR, "data", "snapshots");
const HISTORY_FILE = resolve(ROOT_DIR, "data", "history", "international.jsonl");
const CACHE_DIR = resolve(ROOT_DIR, "services", "ingest", ".cache");

async function main(): Promise<void> {
  loadRootEnvFiles(ROOT_DIR);
  const providers = readProviderConfigs();
  const bzzoiroSource = providers.bzzoiro.enabled
    ? { baseUrl: providers.bzzoiro.baseUrl, headers: providers.bzzoiro.headers }
    : null;

  const dateArg = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
  const dateStr = dateArg ?? new Date().toISOString().slice(0, 10);
  const updatedAt = new Date().toISOString();
  const nowMs = Date.now();

  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(SNAPSHOTS_ROOT, { recursive: true });

  console.log(
    `[national] Descargando y normalizando ${NATIONAL_COMPETITION_SPECS.length} competencias de selecciones (${dateStr})${bzzoiroSource ? " + enriquecimiento multi-fuente activo" : ""}...`,
  );
  const seasons: NormalizedNationalSeason[] = [];
  for (const spec of NATIONAL_COMPETITION_SPECS) {
    const season = await fetchNationalCompetition({
      spec,
      cacheDir: CACHE_DIR,
      referenceDate: dateStr,
      bzzoiro: bzzoiroSource,
    });
    seasons.push(season);
    console.log(
      `  · ${spec.league}: ${season.activeGames.length} visibles / ${season.allGames.length} temporada · ${season.teamRateInputs.length} selecciones`,
    );
  }

  const historyRows = writeInternationalHistoryFile(HISTORY_FILE, seasons);
  console.log(`[national] Histórico internacional guardado: ${historyRows.length} partidos -> data/history/international.jsonl`);

  for (const season of seasons) {
    const previous = loadPreviousSnapshot(SNAPSHOTS_ROOT, season.league);
    const eloHistory = historyRowsForCompetition(historyRows, season.league);
    const priorMatches = priorFootballRowsForCompetition(historyRows, season.league);
    const enrichedRates = enrichTeamRatesFromHistory(season.teamRateInputs, historyRows, season.league);

    const candidate = buildFootballSnapshot({
      league: season.league,
      leagueName: season.leagueName,
      seasonId: season.seasonId,
      seasonLabel: season.seasonLabel,
      periodLabel: season.periodLabel,
      games: season.activeGames,
      teamRateInputs: enrichedRates,
      updatedAt,
      source: bzzoiroSource ? "espn+bzzoiro" : "espn",
      previousSnapshot: previous,
      seasonGames: season.allGames,
      priorMatches,
      history: eloHistory,
    });

    const validated = validateLeagueSnapshotCandidate(candidate, previous, { nowMs });
    if (!validated.ok || !validated.value) {
      console.error(`[national] Falló validación para '${season.league}':`);
      for (const issue of validated.issues.slice(0, 8)) {
        console.error(`  - [${issue.code}] ${issue.path ?? ""}: ${issue.message}`);
      }
      process.exitCode = 1;
      continue;
    }

    const written = writeSnapshotFiles(SNAPSHOTS_ROOT, validated.value, dateStr);
    const scheduledCount = validated.value.games.filter((g) => g.status === "scheduled").length;
    console.log(
      `[national] Publicado ${season.league}: ${validated.value.games.length} partidos (${scheduledCount} próximos) -> ${written.latestPath}`,
    );
  }
}

main().catch((err) => {
  console.error("[national] Error fatal:", err);
  process.exit(1);
});
