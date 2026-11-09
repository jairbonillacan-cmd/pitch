/**
 * CLI de estadísticas Liga MX: `pnpm history:api-stats [flags]`.
 *
 *   --max=60          solicitudes máximas en esta corrida (presupuesto diario aparte)
 *   --seasons=2024,2023  temporadas iniciales a recorrer
 *   --build-only      no descarga; solo reconstruye el dataset desde la caché
 *   --quiet           sin progreso
 */
import { resolve } from "node:path";
import { loadRootEnvFiles } from "../env.js";
import { buildLigaMxStatsDataset, fetchLigaMxStats } from "./api-football-stats.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..", "..");

async function main(): Promise<void> {
  loadRootEnvFiles(ROOT_DIR);
  let max = 60;
  let seasons = [2024, 2023, 2022, 2021];
  let buildOnly = false;
  let quiet = false;

  for (const arg of process.argv.slice(2)) {
    if (arg === "--build-only") {
      buildOnly = true;
      continue;
    }
    if (arg === "--quiet") {
      quiet = true;
      continue;
    }
    const match = arg.match(/^--([a-z-]+)=(.+)$/);
    if (!match) throw new Error(`Argumento no reconocido: '${arg}'.`);
    const [, key, value] = match;
    if (key === "max") {
      max = Number(value);
      if (!Number.isInteger(max) || max < 1) throw new Error(`--max inválido: '${value}'.`);
    } else if (key === "seasons") {
      seasons = value!.split(",").map((item) => Number(item.trim()));
    } else {
      throw new Error(`Flag desconocida: '--${key}'.`);
    }
  }

  const log = quiet ? () => undefined : (message: string) => console.log(message);

  if (!buildOnly) {
    const apiKey = process.env.API_FOOTBALL_KEY?.trim() ?? "";
    if (!apiKey) throw new Error("Falta API_FOOTBALL_KEY en el entorno.");
    const result = await fetchLigaMxStats({
      rootDir: ROOT_DIR,
      apiKey,
      maxRequests: max,
      seasons,
      log,
    });
    if (result.errors.length > 0) log(`[api-stats] avisos: ${result.errors.slice(0, 5).join(" | ")}`);
  }

  const dataset = buildLigaMxStatsDataset({ rootDir: ROOT_DIR, log });
  console.log("[history:api-stats] listo");
  console.log(`  partidos : ${dataset.rows.length}`);
  console.log(`  con xG   : ${dataset.withXg}`);
  console.log(`  dataset  : ${dataset.filePath}`);
  console.log(`  manifiesto: ${dataset.manifestPath}`);
}

main().catch((error: unknown) => {
  console.error("[history:api-stats] Error fatal:", error);
  process.exit(1);
});
