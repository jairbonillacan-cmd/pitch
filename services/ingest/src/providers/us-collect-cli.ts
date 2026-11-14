/**
 * `pnpm --filter @pitchlab/ingest history:us [--sports=nba,nhl] [--seasons=3] [--max-requests=60] [--offline]`
 *
 * Baja de Bzzoiro las temporadas de NBA y NHL (la en curso incluida) a
 * `data/history/research/bzzoiro-<deporte>/games.jsonl` (fuera de Git por licencia).
 * Cada temporada cerrada se cachea; la en curso se refresca en cada corrida.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadRootEnvFiles } from "../env.js";
import { BZZOIRO_US, collectUsSeason, usSeasonOf, type UsSport } from "./bzzoiro-us.js";
import { readProviderConfigs } from "./config.js";
import { createProviderClient } from "./http.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..", "..");

async function main(): Promise<void> {
  loadRootEnvFiles(ROOT_DIR);
  let sports: UsSport[] = ["nba", "nhl"];
  let seasons = 3;
  let maxRequests = 60;
  let offline = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === "--offline") offline = true;
    else if (arg.startsWith("--sports=")) {
      sports = arg.slice(9).split(",").filter((s): s is UsSport => s in BZZOIRO_US);
    } else if (arg.startsWith("--seasons=")) seasons = Math.max(1, Number(arg.slice(10)) || 1);
    else if (arg.startsWith("--max-requests=")) maxRequests = Math.max(1, Number(arg.slice(15)) || 1);
    else throw new Error(`Argumento no reconocido: '${arg}'.`);
  }

  const cfg = readProviderConfigs().bzzoiro;
  // Baloncesto y hockey viven fuera de `/api/v2` (p. ej. `/basketball/api/v2/...`).
  const rootCfg = { ...cfg, baseUrl: cfg.baseUrl.replace(/\/api\/v2$/, "") };
  const currentStart = Number(usSeasonOf(new Date().toISOString()).slice(0, 4));

  for (const sport of sports) {
    // Cuota separada por deporte: un cliente por deporte.
    const client = createProviderClient(rootCfg, {
      cacheDir: join(ROOT_DIR, "data", "history", "raw"),
      minIntervalMs: 1_000,
      maxRequests,
      offline,
      log: (m) => console.log(`[${sport}] ${m}`),
    });
    const rows = [];
    for (let year = currentStart - seasons + 1; year <= currentStart; year++) {
      const season = await collectUsSeason(client, sport, year, year === currentStart);
      console.log(`[${sport}] ${year}-${String((year + 1) % 100).padStart(2, "0")}: ${season.length} partidos`);
      rows.push(...season);
    }
    const dir = join(ROOT_DIR, "data", "history", "research", `bzzoiro-${sport}`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "games.jsonl");
    writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
    console.log(`[${sport}] ${rows.length} partidos → ${file} · peticiones ${client.stats.requests}, caché ${client.stats.cacheHits}`);
  }
}

main().catch((error: unknown) => {
  console.error("[history:us] Error fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
