/**
 * CLI del histórico: `pnpm history [flags]`.
 *
 * Flags:
 *   --leagues=a,b            ligas del catálogo (por defecto las 7)
 *   --soccer-seasons=a,b     temporadas de openfootball (por defecto todas)
 *   --nfl-seasons=1999,2026  rango de temporadas NFL
 *   --no-postseason          excluye playoffs de la NFL
 *   --offline                solo usa data/history/raw (no descarga)
 *   --concurrency=4          descargas simultáneas
 *   --report-dir=<ruta>      destino del reporte Markdown
 *   --quiet                  sin progreso en consola
 */
import { resolve } from "node:path";
import { loadRootEnvFiles } from "../env.js";
import { buildHistoryDataset } from "./builder.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..", "..");

interface CliOptions {
  leagues?: string[];
  soccerSeasons?: string[];
  nflSeasons?: number[];
  includePostseason: boolean;
  offline: boolean;
  concurrency?: number;
  reportDir?: string;
  quiet: boolean;
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    includePostseason: true,
    offline: false,
    quiet: false,
  };

  for (const arg of argv) {
    if (arg === "--offline") {
      options.offline = true;
      continue;
    }
    if (arg === "--no-postseason") {
      options.includePostseason = false;
      continue;
    }
    if (arg === "--quiet") {
      options.quiet = true;
      continue;
    }
    const match = arg.match(/^--([a-z-]+)=(.+)$/);
    if (!match) {
      throw new Error(`Argumento no reconocido: '${arg}'.`);
    }
    const [, key, rawValue] = match;
    switch (key) {
      case "leagues":
        options.leagues = parseList(rawValue!);
        break;
      case "soccer-seasons":
        options.soccerSeasons = parseList(rawValue!);
        break;
      case "nfl-seasons": {
        const seasons = parseList(rawValue!).map((value) => Number(value));
        if (seasons.some((value) => !Number.isInteger(value) || value < 1900)) {
          throw new Error(`Temporadas NFL inválidas: '${rawValue}'.`);
        }
        options.nflSeasons = seasons;
        break;
      }
      case "concurrency": {
        const value = Number(rawValue);
        if (!Number.isInteger(value) || value < 1) {
          throw new Error(`--concurrency debe ser un entero positivo: '${rawValue}'.`);
        }
        options.concurrency = value;
        break;
      }
      case "report-dir":
        options.reportDir = resolve(ROOT_DIR, rawValue!);
        break;
      default:
        throw new Error(`Flag desconocida: '--${key}'.`);
    }
  }

  return options;
}

async function main(): Promise<void> {
  loadRootEnvFiles(ROOT_DIR);
  const options = parseArgs(process.argv.slice(2));

  const result = await buildHistoryDataset({
    rootDir: ROOT_DIR,
    ...(options.leagues ? { leagues: options.leagues } : {}),
    ...(options.soccerSeasons ? { soccerSeasons: options.soccerSeasons } : {}),
    ...(options.nflSeasons ? { nflSeasons: options.nflSeasons } : {}),
    includePostseason: options.includePostseason,
    offline: options.offline,
    ...(options.concurrency ? { concurrency: options.concurrency } : {}),
    ...(options.reportDir ? { reportDir: options.reportDir } : {}),
    log: options.quiet ? () => undefined : (message) => console.log(message),
  });

  const { manifest } = result;
  console.log("");
  console.log("[history] Dataset listo");
  console.log(`  datasetId : ${manifest.datasetId}`);
  console.log(`  partidos  : ${manifest.totals.rows.toLocaleString("es-MX")}`);
  console.log(`  ligas     : ${manifest.totals.leagues}`);
  console.log(`  temporadas: ${manifest.totals.seasons}`);
  console.log(`  errores   : ${manifest.quality.errors} · advertencias: ${manifest.quality.warnings}`);
  for (const league of manifest.leagues) {
    console.log(`  - ${league.id.padEnd(14)} ${String(league.rows).padStart(6)} partidos · ${league.quality.teams} equipos`);
  }
  console.log(`  manifiesto: ${result.manifestPath}`);
  console.log(`  reporte   : ${result.reportPath}`);

  if (manifest.quality.errors > 0) {
    console.error(
      "\n[history] Hay errores de calidad. Revisa el reporte antes de usar el dataset para entrenar.",
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("[history] Error fatal:", error);
  process.exit(1);
});
