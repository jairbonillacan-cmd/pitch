/**
 * `pnpm --filter @pitchlab/ingest snapshot:us [--sports=nba,nhl] [--offline]`
 *
 * Corte de NBA y NHL: refresca la temporada en curso desde Bzzoiro (~7 peticiones por deporte;
 * las temporadas anteriores salen de caché), arma el snapshot con el motor de ratings, lo pasa
 * por el mismo validador previo que el resto de ligas y solo entonces escribe
 * `data/snapshots/<deporte>/latest.json`. Si la validación falla, se conserva el anterior.
 */
import { resolve } from "node:path";
import { loadRootEnvFiles } from "./env.js";
import { loadPreviousSnapshot, writeSnapshotFiles } from "./pipeline.js";
import { BZZOIRO_US, collectUsSeason, usSeasonOf, type UsSport } from "./providers/bzzoiro-us.js";
import { readProviderConfigs } from "./providers/config.js";
import { createProviderClient } from "./providers/http.js";
import { buildUsLeagueSnapshot } from "./us-snapshot.js";
import { validateLeagueSnapshotCandidate } from "./validation/snapshot-validator.js";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SNAPSHOTS = resolve(ROOT, "data", "snapshots");

async function main(): Promise<void> {
  loadRootEnvFiles(ROOT);
  let sports: UsSport[] = ["nba", "nhl"];
  let offline = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === "--offline") offline = true;
    else if (arg.startsWith("--sports=")) sports = arg.slice(9).split(",").filter((s): s is UsSport => s in BZZOIRO_US);
    else throw new Error(`Argumento no reconocido: '${arg}'.`);
  }
  const cfg = readProviderConfigs().bzzoiro;
  if (!cfg.enabled && !offline) {
    console.log("[snapshot:us] Falta BZZOIRO_API_KEY; no se genera NBA/NHL.");
    return;
  }
  const rootCfg = { ...cfg, baseUrl: cfg.baseUrl.replace(/\/api\/v2$/, "") };
  const now = new Date();
  const currentStart = Number(usSeasonOf(now.toISOString()).slice(0, 4));
  let failures = 0;

  for (const sport of sports) {
    try {
      const client = createProviderClient(rootCfg, {
        cacheDir: resolve(ROOT, "data", "history", "raw"),
        minIntervalMs: 1_000,
        maxRequests: 30,
        offline,
        log: (m) => console.log(`[snapshot:${sport}] ${m}`),
      });
      const rows = [];
      for (let year = currentStart - 2; year <= currentStart; year++) {
        rows.push(...(await collectUsSeason(client, sport, year, year === currentStart)));
      }
      const previous = loadPreviousSnapshot(SNAPSHOTS, sport);
      const candidate = buildUsLeagueSnapshot({ sport, rows, now, previousSnapshot: previous });
      const validation = validateLeagueSnapshotCandidate(candidate, previous, { nowMs: now.getTime() });
      if (!validation.ok) {
        failures++;
        const reason = validation.issues.slice(0, 3).map((i) => `${i.code}: ${i.message}`).join(" | ");
        console.error(`[snapshot:${sport}] rechazado por validación; se conserva el anterior (${reason}).`);
        continue;
      }
      const { latestPath } = writeSnapshotFiles(SNAPSHOTS, validation.value ?? candidate, now.toISOString().slice(0, 10));
      console.log(
        `[snapshot:${sport}] ${candidate.games.length} partidos (${Object.keys(candidate.analyses).length} con análisis) → ${latestPath} · peticiones ${client.stats.requests}`,
      );
    } catch (error) {
      failures++;
      console.error(`[snapshot:${sport}] error; se conserva el anterior:`, error instanceof Error ? error.message : error);
    }
  }
  if (failures > 0) process.exitCode = 1;
}

await main();
