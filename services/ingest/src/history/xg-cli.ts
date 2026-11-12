/**
 * CLI del dataset de xG: `pnpm history:xg [flags]`.
 *
 *   --leagues=premier-league,...  ligas con Understat
 *   --seasons=2014,2015,...       años iniciales de temporada
 *   --offline                     solo caché local
 *   --report-dir=<ruta>           destino del reporte Markdown
 *   --quiet                       sin progreso
 */
import { resolve } from "node:path";
import { buildXgDataset } from "./xg.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..", "..");

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function main(): Promise<void> {
  const options: { leagues?: string[]; seasons?: number[]; offline: boolean; reportDir?: string; quiet: boolean } = {
    offline: false,
    quiet: false,
  };
  for (const arg of process.argv.slice(2)) {
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
    if (key === "leagues") options.leagues = parseList(value!);
    else if (key === "seasons") {
      const seasons = parseList(value!).map(Number);
      if (seasons.some((season) => !Number.isInteger(season) || season < 2000)) {
        throw new Error(`Temporadas inválidas: '${value}'.`);
      }
      options.seasons = seasons;
    } else if (key === "report-dir") options.reportDir = resolve(ROOT_DIR, value!);
    else throw new Error(`Flag desconocida: '--${key}'.`);
  }

  const result = await buildXgDataset({
    rootDir: ROOT_DIR,
    ...(options.leagues ? { leagues: options.leagues } : {}),
    ...(options.seasons ? { seasons: options.seasons } : {}),
    offline: options.offline,
    ...(options.reportDir ? { reportDir: options.reportDir } : {}),
    log: options.quiet ? () => undefined : (message) => console.log(message),
  });

  console.log("");
  console.log("[history:xg] Dataset listo");
  console.log(`  datasetId: ${result.manifest.datasetId}`);
  for (const league of result.manifest.leagues) {
    console.log(
      `  - ${league.id.padEnd(14)} ${String(league.rows).padStart(5)} xG · ${(league.coverage * 100).toFixed(1)}% del corpus · ${league.unmatchedNames.length} sin alias`,
    );
  }
  console.log(`  manifiesto: ${result.manifestPath}`);
  console.log(`  reporte   : ${result.reportPath}`);
}

main().catch((error: unknown) => {
  console.error("[history:xg] Error fatal:", error);
  process.exit(1);
});
