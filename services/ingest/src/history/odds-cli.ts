/**
 * CLI del dataset de investigación: `pnpm history:odds [flags]`.
 *
 *   --leagues=premier-league,...   ligas con división de football-data.co.uk
 *   --seasons=2010-11,...,2026-27  temporadas a descargar
 *   --offline                      solo caché local
 *   --concurrency=3                descargas simultáneas
 *   --report-dir=<ruta>            destino del reporte Markdown
 *   --quiet                        sin progreso
 */
import { resolve } from "node:path";
import { loadRootEnvFiles } from "../env.js";
import { buildResearchDataset } from "./research.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..", "..");

interface CliOptions {
  leagues?: string[];
  seasons?: string[];
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
  const options: CliOptions = { offline: false, quiet: false };
  for (const arg of argv) {
    if (arg === "--offline") {
      options.offline = true;
      continue;
    }
    if (arg === "--quiet") {
      options.quiet = true;
      continue;
    }
    const match = arg.match(/^--([a-z-]+)=(.+)$/);
    if (!match) throw new Error(`Argumento no reconocido: '${arg}'.`);
    const [, key, value] = match;
    switch (key) {
      case "leagues":
        options.leagues = parseList(value!);
        break;
      case "seasons":
        options.seasons = parseList(value!);
        break;
      case "concurrency": {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1) {
          throw new Error(`--concurrency debe ser un entero positivo: '${value}'.`);
        }
        options.concurrency = parsed;
        break;
      }
      case "report-dir":
        options.reportDir = resolve(ROOT_DIR, value!);
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
  const result = await buildResearchDataset({
    rootDir: ROOT_DIR,
    ...(options.leagues ? { leagues: options.leagues } : {}),
    ...(options.seasons ? { seasons: options.seasons } : {}),
    offline: options.offline,
    ...(options.concurrency ? { concurrency: options.concurrency } : {}),
    ...(options.reportDir ? { reportDir: options.reportDir } : {}),
    log: options.quiet ? () => undefined : (message) => console.log(message),
  });

  const { manifest } = result;
  console.log("");
  console.log("[history:odds] Dataset de investigación listo");
  console.log(`  datasetId : ${manifest.datasetId}`);
  console.log(`  filas     : ${manifest.totals.rows.toLocaleString("es-MX")}`);
  console.log(`  con cuotas: ${manifest.totals.withOdds.toLocaleString("es-MX")} (cierre: ${manifest.totals.withClosingOdds})`);
  console.log(`  cobertura : ${(manifest.totals.oddsCoverage * 100).toFixed(1)}% del corpus`);
  for (const league of manifest.leagues) {
    console.log(
      `  - ${league.id.padEnd(14)} ${String(league.rows).padStart(6)} filas · ${(league.oddsCoverage * 100).toFixed(1)}% cobertura · ${league.unmatchedNames.length} sin mapear`,
    );
  }
  console.log(`  manifiesto: ${result.manifestPath}`);
  console.log(`  reporte   : ${result.reportPath}`);
}

main().catch((error: unknown) => {
  console.error("[history:odds] Error fatal:", error);
  process.exit(1);
});
