/**
 * Benchmark silencioso fuera de línea contra `/api/v2/predictions/` de Bzzoiro Sports Data
 * más comprobación opcional de reprogramaciones (`/fixtures/changes/`).
 *
 * Uso:
 *   pnpm --filter @pitchlab/ingest benchmark:bzzoiro [--league=premier-league]
 *
 * Nunca altera ni alimenta probabilidades publicadas; solo audita calibración histórica.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { LeagueSnapshot } from "@pitchlab/contracts";
import { loadRootEnvFiles } from "../env.js";
import { BZZOIRO_LEAGUES, type BzzoiroLeagueKey } from "./bzzoiro.js";
import {
  compareModelVsBzzoiroPredictions,
  fetchBzzoiroFootballPredictions,
  fetchBzzoiroScheduleChanges,
  type BenchmarkSamplePair,
} from "./bzzoiro-enrichment.js";
import { readProviderConfigs } from "./config.js";
import { createProviderClient } from "./http.js";
import { slugifyTeamName } from "../team-slug.js";

const ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

async function main(): Promise<void> {
  loadRootEnvFiles(ROOT);
  const cfg = readProviderConfigs().bzzoiro;
  if (!cfg.enabled) {
    console.log("[benchmark:bzzoiro] BZZOIRO_API_KEY no configurada; nada que consultar.");
    return;
  }

  const leagueFlag = process.argv.find((a) => a.startsWith("--league="))?.slice("--league=".length);
  const client = createProviderClient(cfg, {
    cacheDir: join(ROOT, "data", "history", "raw"),
    minIntervalMs: 220,
    maxRequests: cfg.unlimitedQuota ? 0 : 250,
  });

  const changes = await fetchBzzoiroScheduleChanges(client);
  console.log(`[benchmark:bzzoiro] reprogramaciones activas detectadas: ${changes.length}`);

  const targets = Object.keys(BZZOIRO_LEAGUES).filter(
    (k): k is BzzoiroLeagueKey => !leagueFlag || k === leagueFlag,
  );

  for (const league of targets) {
    const snapPath = join(ROOT, "data", "snapshots", league, "latest.json");
    if (!existsSync(snapPath)) continue;
    const snapshot = JSON.parse(readFileSync(snapPath, "utf8")) as LeagueSnapshot;
    const bzIds = BZZOIRO_LEAGUES[league];
    const preds = (
      await Promise.all(bzIds.map((id) => fetchBzzoiroFootballPredictions(client, id)))
    ).flat();

    const pairs: BenchmarkSamplePair[] = [];
    for (const g of snapshot.games) {
      if (g.status !== "final" || !g.result) continue;
      const analysis = snapshot.analyses[g.id];
      if (!analysis) continue;
      const hs = slugifyTeamName(g.home.name);
      const as = slugifyTeamName(g.away.name);
      const matched = preds.find(
        (p) => slugifyTeamName(p.homeTeam) === hs && slugifyTeamName(p.awayTeam) === as,
      );
      if (!matched) continue;
      const actual: 0 | 1 | 2 =
        g.result.home > g.result.away ? 0 : g.result.home < g.result.away ? 2 : 1;
      pairs.push({
        model1X2: analysis.x12,
        bzzoiro1X2: [matched.pHome, matched.pDraw, matched.pAway],
        actualOutcome: actual,
      });
    }
    const summary = compareModelVsBzzoiroPredictions(pairs);
    console.log(
      `  - ${league}: n=${summary.nGames}, modelLL=${summary.modelLogLoss}, bzLL=${summary.bzzoiroLogLoss}, delta=${summary.logLossDelta}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
