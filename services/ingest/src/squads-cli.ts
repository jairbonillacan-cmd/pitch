/**
 * CLI de descarga y generación de plantillas de fútbol, estadísticas de jugadores
 * y picks individuales aplicables:
 *   pnpm --filter @pitchlab/ingest squads:snapshot [--date=YYYY-MM-DD] [--leagues=liga-mx,premier-league]
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LeagueSnapshotSchema } from "@pitchlab/contracts";
import {
  SOCCER_SQUAD_LEAGUES,
  ingestLeagueSquads,
  writeLeagueSquadsFile,
} from "./adapters/espn-squads.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..");
const SNAPSHOTS_ROOT = resolve(ROOT_DIR, "data", "snapshots");
const CACHE_DIR = resolve(ROOT_DIR, "services", "ingest", ".cache");

async function main(): Promise<void> {
  const dateArg = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
  const leaguesArg = process.argv.find((a) => a.startsWith("--leagues="))?.split("=")[1];
  const dateStr = dateArg ?? new Date().toISOString().slice(0, 10);

  const selectedLeagues = leaguesArg
    ? leaguesArg.split(",").map((s) => s.trim()).filter(Boolean)
    : Object.keys(SOCCER_SQUAD_LEAGUES);

  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(SNAPSHOTS_ROOT, { recursive: true });

  console.log(`[squads] Descargando plantillas y estadísticas de jugadores (${dateStr})...`);

  for (const league of selectedLeagues) {
    const latestFile = join(SNAPSHOTS_ROOT, league, "latest.json");
    if (!existsSync(latestFile)) {
      console.warn(`[squads] Sin snapshot latest.json para '${league}', omitida.`);
      continue;
    }

    const raw = JSON.parse(readFileSync(latestFile, "utf8")) as unknown;
    const parsedSnap = LeagueSnapshotSchema.safeParse(raw);
    if (!parsedSnap.success) {
      console.warn(`[squads] Snapshot inválido para '${league}', omitida.`);
      continue;
    }

    const squadsFile = await ingestLeagueSquads({
      league,
      snapshot: parsedSnap.data,
      cacheDir: CACHE_DIR,
      dateStr,
    });

    if (!squadsFile) {
      console.warn(`[squads] Sin plantillas disponibles en '${league}'.`);
      continue;
    }

    const totalPlayers = squadsFile.teams.reduce((sum, t) => sum + t.players.length, 0);
    const totalPicks = squadsFile.teams.reduce(
      (sum, t) => sum + t.players.reduce((pSum, p) => pSum + p.candidatePicks.length, 0),
      0,
    );
    const dest = writeLeagueSquadsFile(SNAPSHOTS_ROOT, squadsFile);
    console.log(
      `[squads] ${league}: ${squadsFile.teams.length} equipos · ${totalPlayers} jugadores · ${totalPicks} picks aplicables -> ${dest}`,
    );
  }
}

main().catch((err) => {
  console.error("[squads] Error fatal:", err);
  process.exit(1);
});
