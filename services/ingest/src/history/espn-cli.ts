/**
 * CLI de estadísticas ESPN para Liga MX: `pnpm history:espn [flags]`.
 *
 *   --seasons=2024,2023  temporadas iniciales (año de inicio)
 *   --max=400            summaries máximos en esta corrida
 *   --offline            solo caché local
 *   --quiet              sin progreso
 */
import { resolve } from "node:path";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { buildEspnLigaMxStats } from "./espn-liga-mx.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..", "..");

async function main(): Promise<void> {
  let seasons = [2024, 2023];
  let maxSummaries = 400;
  let offline = false;
  let quiet = false;

  for (const arg of process.argv.slice(2)) {
    if (arg === "--offline") {
      offline = true;
      continue;
    }
    if (arg === "--quiet") {
      quiet = true;
      continue;
    }
    const match = arg.match(/^--([a-z-]+)=(.+)$/);
    if (!match) throw new Error(`Argumento no reconocido: '${arg}'.`);
    const [, key, value] = match;
    if (key === "seasons") {
      seasons = value!.split(",").map((item) => {
        const parsedYear = parseStrictFiniteNumber(item);
        if (parsedYear === null || !Number.isInteger(parsedYear)) {
          throw new Error(`--seasons inválido: '${value}'.`);
        }
        return parsedYear;
      });
    } else if (key === "max") {
      const parsedMax = parseStrictFiniteNumber(value);
      if (parsedMax === null || !Number.isInteger(parsedMax) || parsedMax < 1) {
        throw new Error(`--max inválido: '${value}'.`);
      }
      maxSummaries = parsedMax;
    } else {
      throw new Error(`Flag desconocida: '--${key}'.`);
    }
  }

  const result = await buildEspnLigaMxStats({
    rootDir: ROOT_DIR,
    seasons,
    maxSummaries,
    offline,
    ...(quiet ? { log: () => undefined } : {}),
  });
  console.log("[history:espn] listo");
  console.log(`  partidos: ${result.rows.length}/${result.total}`);
  console.log(`  dataset : ${result.filePath}`);
  console.log(`  manifiesto: ${result.manifestPath}`);
}

main().catch((error: unknown) => {
  console.error("[history:espn] Error fatal:", error);
  process.exit(1);
});
