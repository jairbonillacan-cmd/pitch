import fs from "node:fs";
import path from "node:path";
import { landingLeagueFromSnapshot, type LandingSnapshot, type LvLeague } from "@pitchlab/ui";
import { PRODUCT_LEAGUES, resolveSnapshotsRoot } from "./snapshots.js";

/**
 * Ligas de la landing a partir de los snapshots crudos (`latest.json`), con caché por
 * fecha de modificación. Solo viaja al cliente lo que la landing muestra: ni la
 * fuente del dato ni el proveedor (FD-16).
 */
const cache = new Map<string, { mtime: number; league: LvLeague }>();

function loadOne(leagueKey: string): LvLeague | null {
  const file = path.join(resolveSnapshotsRoot(), leagueKey, "latest.json");
  let mtime = 0;
  try {
    mtime = fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
  const hit = cache.get(leagueKey);
  if (hit && hit.mtime === mtime) return hit.league;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as LandingSnapshot & { isDemo?: boolean };
    if (raw.isDemo) return null;
    const league = landingLeagueFromSnapshot(raw);
    cache.set(leagueKey, { mtime, league });
    return league;
  } catch (err) {
    console.error(`[landing] snapshot inválido para ${leagueKey}`, err);
    return null;
  }
}

/** Liga MX primero, luego el resto en el orden del producto. */
export function loadLandingLeagues(): LvLeague[] {
  return PRODUCT_LEAGUES.map(loadOne).filter((l): l is LvLeague => l !== null);
}
