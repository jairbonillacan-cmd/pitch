/**
 * CLI del enriquecimiento de native-stats: `pnpm history:native-stats [flags]`.
 *
 *   --leagues=premier-league,...  ligas a cubrir (por defecto las seis de fútbol)
 *   --offline                     solo caché local (reproducible, sin red)
 *   --delay-ms=400                pausa entre peticiones reales
 *   --max-teams=24                tope de páginas de equipo por liga
 *   --max-matches=20              tope de páginas de partido por liga
 *   --no-form                     no captura la forma avanzada del día
 *   --no-matches                  no lee páginas de partido
 *   --no-streaks                  no lee el ranking histórico de rachas
 *   --report-dir=<ruta>           destino del reporte Markdown
 *   --quiet                       sin progreso
 */
import { resolve } from "node:path";
import { buildNativeStatsDataset } from "./builder.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..", "..", "..");

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Valor inválido para --${flag}: '${value}'.`);
  }
  return parsed;
}

function parseArgs(argv: readonly string[]) {
  const options: {
    leagues?: string[];
    offline: boolean;
    quiet: boolean;
    reportDir?: string;
    requestDelayMs?: number;
    maxTeamsPerLeague?: number;
    maxMatchesPerLeague?: number;
    includeForm: boolean;
    includeMatches: boolean;
    includeStreakBoards: boolean;
  } = {
    offline: false,
    quiet: false,
    includeForm: true,
    includeMatches: true,
    includeStreakBoards: true,
  };

  for (const arg of argv) {
    if (arg === "--offline") {
      options.offline = true;
      continue;
    }
    if (arg === "--quiet") {
      options.quiet = true;
      continue;
    }
    if (arg === "--no-form") {
      options.includeForm = false;
      continue;
    }
    if (arg === "--no-matches") {
      options.includeMatches = false;
      continue;
    }
    if (arg === "--no-streaks") {
      options.includeStreakBoards = false;
      continue;
    }
    const match = arg.match(/^--([a-z-]+)=(.+)$/);
    if (!match) throw new Error(`Argumento no reconocido: '${arg}'.`);
    const key = match[1]!;
    const value = match[2]!;
    if (key === "leagues") options.leagues = parseList(value);
    else if (key === "report-dir") options.reportDir = resolve(ROOT_DIR, value);
    else if (key === "delay-ms") options.requestDelayMs = parsePositiveInteger(value, key);
    else if (key === "max-teams") options.maxTeamsPerLeague = parsePositiveInteger(value, key);
    else if (key === "max-matches") options.maxMatchesPerLeague = parsePositiveInteger(value, key);
    else throw new Error(`Flag desconocida: '--${key}'.`);
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const result = await buildNativeStatsDataset({
    rootDir: ROOT_DIR,
    ...(options.leagues ? { leagues: options.leagues } : {}),
    offline: options.offline,
    ...(options.reportDir ? { reportDir: options.reportDir } : {}),
    ...(options.requestDelayMs !== undefined ? { requestDelayMs: options.requestDelayMs } : {}),
    ...(options.maxTeamsPerLeague !== undefined
      ? { maxTeamsPerLeague: options.maxTeamsPerLeague }
      : {}),
    ...(options.maxMatchesPerLeague !== undefined
      ? { maxMatchesPerLeague: options.maxMatchesPerLeague }
      : {}),
    includeForm: options.includeForm,
    includeMatches: options.includeMatches,
    includeStreakBoards: options.includeStreakBoards,
    log: options.quiet ? () => undefined : (message) => console.log(message),
  });

  const { manifest } = result;
  console.log("");
  console.log("[history:native-stats] Dataset listo");
  console.log(`  datasetId : ${manifest.datasetId}`);
  for (const league of manifest.leagues) {
    console.log(
      `  - ${league.id.padEnd(14)} ${String(league.matchedTeams).padStart(2)}/${String(league.teams).padEnd(3)} equipos · ` +
        `${String(league.halfTimeAdded).padStart(2)} descansos nuevos · ` +
        `${league.streakChecks.agree}/${league.streakChecks.compared} rachas OK · ` +
        `${league.streakChecks.disagree} discrepan · ${league.unmatchedNames.length} sin alias`,
    );
  }
  console.log(`  forma     : ${manifest.totals.formRows} partidos (${manifest.files.form})`);
  console.log(`  manifiesto: ${result.manifestPath}`);
  console.log(`  reporte   : ${result.reportPath}`);
}

main().catch((error: unknown) => {
  console.error("[history:native-stats] Error fatal:", error);
  process.exit(1);
});
