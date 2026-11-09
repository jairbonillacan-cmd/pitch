/**
 * Actualiza `data/snapshots/<liga>/market-pulse.json` con el volumen por resultado de los
 * mercados de predicción (FD-20). No toca los análisis publicados.
 *
 * Uso: pnpm --filter @pitchlab/ingest exec tsx src/market-pulse-cli.ts
 */
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  LeagueSnapshotSchema,
  MarketPulseFileSchema,
  type MarketPulseEntry,
  type MarketPulseFile,
} from "@pitchlab/contracts";
import {
  POLYMARKET_TAGS,
  fetchKalshiNflEvents,
  fetchPolymarketEvents,
  matchKalshiEvents,
  matchPolymarketEvents,
  mergeMarketPulse,
} from "./adapters/market-pulse.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..");
const SNAPSHOTS_ROOT = resolve(ROOT_DIR, "data", "snapshots");
const LEAGUES = [...Object.keys(POLYMARKET_TAGS), "nfl"];

function readPrevious(path: string): MarketPulseEntry[] {
  if (!existsSync(path)) return [];
  try {
    return MarketPulseFileSchema.parse(JSON.parse(readFileSync(path, "utf8"))).entries;
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const observedAt = new Date().toISOString();
  const now = Date.now();
  let failures = 0;

  for (const league of LEAGUES) {
    const latest = join(SNAPSHOTS_ROOT, league, "latest.json");
    if (!existsSync(latest)) continue;
    const snapshot = LeagueSnapshotSchema.parse(JSON.parse(readFileSync(latest, "utf8")));
    // Solo lecturas previas al inicio: el volumen en vivo no es sentimiento previo.
    const upcoming = snapshot.games.filter((g) => {
      const raw = /[zZ]|[+-]\d\d:?\d\d$/.test(g.startTime) ? g.startTime : `${g.startTime}Z`;
      return g.status === "scheduled" && Date.parse(raw) > now;
    });

    let fresh: MarketPulseEntry[] = [];
    try {
      fresh =
        league === "nfl"
          ? matchKalshiEvents(await fetchKalshiNflEvents(), upcoming, observedAt)
          : matchPolymarketEvents(
              await fetchPolymarketEvents(POLYMARKET_TAGS[league]!),
              upcoming,
              observedAt,
            );
    } catch (err) {
      failures += 1;
      console.warn(`[market-pulse] ${league}: ${err instanceof Error ? err.message : err}`);
    }

    const path = join(SNAPSHOTS_ROOT, league, "market-pulse.json");
    const entries = mergeMarketPulse(
      readPrevious(path),
      fresh,
      new Set(snapshot.games.map((g) => g.id)),
    );
    const file: MarketPulseFile = MarketPulseFileSchema.parse({
      schemaVersion: 1,
      league,
      observedAt,
      entries,
    });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(file, null, 2) + "\n", "utf8");
    renameSync(tmp, path);
    console.log(
      `[market-pulse] ${league}: ${fresh.length} nuevos de ${upcoming.length} por jugar · ${entries.length} en archivo`,
    );
  }

  if (failures === LEAGUES.length) process.exitCode = 1;
}

void main();
