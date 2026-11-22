/**
 * `pnpm --filter @pitchlab/ingest cortex:write [--leagues=a,b] [--max-calls=60] [--ahead-days=4] [--dry-run]`
 *
 * Paso del corte, después de la ingesta: agrega el análisis de Cortex IA por secciones a los
 * partidos de fútbol por jugar de los próximos días que todavía no lo tienen (o cuyos datos de
 * entrada cambiaron). Una llamada por partido, con tope por corrida; la ficha solo lee el texto.
 *
 * Sin `OPENROUTER_API_KEY` o con `PITCHLAB_AI_ENABLED=0` no hace nada. `--dry-run` arma los datos
 * y la plantilla sin llamar al modelo (para revisar qué recibiría).
 */
import { resolve } from "node:path";
import {
  GameAnalysisSchema,
  parseStrictFiniteNumber,
  type LeagueSnapshot,
} from "@pitchlab/contracts";
import {
  cortexFactsFromAnalysis,
  cortexFingerprint,
  sectionKeys,
  templateSection,
  writeCortex,
} from "./cortex-writer.js";
import { loadRootEnvFiles } from "./env.js";
import { loadPreviousSnapshot, writeSnapshotFiles } from "./pipeline.js";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SNAPSHOTS = resolve(ROOT, "data", "snapshots");

const LEAGUES: Record<string, string> = {
  "liga-mx": "Liga MX",
  "premier-league": "Premier League",
  laliga: "LaLiga",
  "serie-a": "Serie A",
  bundesliga: "Bundesliga",
  "ligue-1": "Ligue 1",
};

async function main(): Promise<void> {
  loadRootEnvFiles(ROOT);
  let leagues = Object.keys(LEAGUES);
  let maxCalls = 60;
  let aheadDays = 4;
  let dryRun = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--leagues=")) leagues = arg.slice(10).split(",").filter((l) => l in LEAGUES);
    else if (arg.startsWith("--max-calls=")) {
      const parsed = parseStrictFiniteNumber(arg.slice(12));
      if (parsed === null || !Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`--max-calls inválido: '${arg}'.`);
      }
      maxCalls = parsed;
    } else if (arg.startsWith("--ahead-days=")) {
      const parsed = parseStrictFiniteNumber(arg.slice(13));
      if (parsed === null || parsed < 0) {
        throw new Error(`--ahead-days inválido: '${arg}'.`);
      }
      aheadDays = parsed;
    }
    else throw new Error(`Argumento no reconocido: '${arg}'.`);
  }
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (process.env.PITCHLAB_AI_ENABLED === "0" || process.env.PITCHLAB_AI_ENABLED === "false") {
    console.log("[cortex] IA apagada (PITCHLAB_AI_ENABLED=0).");
    return;
  }
  if (!apiKey && !dryRun) {
    console.log("[cortex] Falta OPENROUTER_API_KEY; los análisis salen sin texto de IA.");
    return;
  }

  const now = Date.now();
  let calls = 0;
  let written = 0;
  let reused = 0;
  for (const league of leagues) {
    const snap = loadPreviousSnapshot(SNAPSHOTS, league);
    if (!snap) continue;
    let changed = false;
    const analyses: LeagueSnapshot["analyses"] = { ...snap.analyses };
    const pending = snap.games
      .filter((g) => g.status === "scheduled")
      .filter((g) => {
        const t = Date.parse(g.startTime);
        return t > now && t - now <= aheadDays * 86_400_000;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    for (const game of pending) {
      const analysis = analyses[game.id];
      if (!analysis) continue;
      const facts = cortexFactsFromAnalysis({ leagueName: LEAGUES[league]!, game, analysis, standings: snap.standings });
      const fingerprint = cortexFingerprint(facts);
      if (analysis.cortex?.fingerprint === fingerprint) {
        reused++;
        continue;
      }
      if (dryRun) {
        console.log(`\n[cortex] ${game.id}\n${JSON.stringify(facts, null, 2)}`);
        for (const key of sectionKeys(facts)) console.log(`  · ${key}: ${templateSection(key, facts)}`);
        continue;
      }
      if (calls >= maxCalls) break;
      calls++;
      const writeup = await writeCortex(facts, {
        apiKey: apiKey!,
        model: process.env.OPENROUTER_MODEL?.trim() || undefined,
        provider: process.env.OPENROUTER_PROVIDER?.trim() || undefined,
      });
      if (!writeup) continue;
      analyses[game.id] = GameAnalysisSchema.parse({ ...analysis, cortex: writeup });
      changed = true;
      written++;
    }

    if (changed) {
      writeSnapshotFiles(SNAPSHOTS, { ...snap, analyses }, snap.updatedAt.slice(0, 10));
    }
  }
  console.log(`[cortex] ${written} análisis redactados · ${reused} sin cambios (sin llamada) · ${calls} llamadas`);
}

await main();
