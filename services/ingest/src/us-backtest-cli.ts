/**
 * `pnpm --filter @pitchlab/ingest backtest:us [--sports=nba,nhl]`
 *
 * Walk-forward honesto para NBA y NHL con la historia de Bzzoiro (`history:us`):
 *  1. Los parámetros se eligen SOLO con el tramo de ajuste (primera temporada en NBA; primeros
 *     700 partidos en NHL, que solo tiene una temporada completa).
 *  2. Se evalúa en todo lo posterior, prediciendo cada partido con lo previo y luego actualizando.
 *  3. Comparaciones con bootstrap pareado: modelo completo contra (a) tasa de local,
 *     (b) el mismo modelo sin descanso/back-to-back y (c) en NHL, el Elo que publica Bzzoiro.
 *
 * Escribe `Reportes/modelos/BACKTEST-US.json`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  binaryLogLoss,
  createNbaTracker,
  createNhlTracker,
  pairedBootstrap,
  type NbaOptions,
  type NhlOptions,
  type UsGame,
} from "@pitchlab/models";
import type { UsGameRow } from "./providers/bzzoiro-us.js";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const WARMUP = 150;

function load(sport: "nba" | "nhl"): (UsGame & { eloHome: number | null; eloAway: number | null })[] {
  const file = join(ROOT, "data", "history", "research", `bzzoiro-${sport}`, "games.jsonl");
  if (!existsSync(file)) throw new Error(`Falta ${file}. Corre primero \`pnpm --filter @pitchlab/ingest history:us\`.`);
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as UsGameRow)
    .filter((r) => r.status === "finished" && r.homeScore !== null && r.awayScore !== null && r.homeScore !== r.awayScore)
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))
    .map((r) => ({
      date: r.kickoffUtc.slice(0, 10),
      season: r.season,
      home: r.home.name,
      away: r.away.name,
      homeScore: r.homeScore!,
      awayScore: r.awayScore!,
      overtime: r.overtime,
      shootout: r.shootout,
      eloHome: r.providerEloHome,
      eloAway: r.providerEloAway,
    }));
}

interface Tracker {
  predict(g: UsGame): { pHome: number; expectedMargin: number; expectedTotal: number };
  update(g: UsGame): void;
}

/** Corre el tracker en orden y devuelve la pérdida por partido (log loss del ganador). */
function run(games: readonly UsGame[], tracker: Tracker): { losses: number[]; margins: number[]; totals: number[] } {
  const losses: number[] = [];
  const margins: number[] = [];
  const totals: number[] = [];
  for (const g of games) {
    const p = tracker.predict(g);
    losses.push(binaryLogLoss(p.pHome, g.homeScore > g.awayScore));
    margins.push(Math.abs(g.homeScore - g.awayScore - p.expectedMargin));
    totals.push(Math.abs(g.homeScore + g.awayScore - p.expectedTotal));
    tracker.update(g);
  }
  return { losses, margins, totals };
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

function grid<T extends object>(axes: { [K in keyof T]: readonly T[K][] }): T[] {
  let out: Partial<T>[] = [{}];
  for (const key of Object.keys(axes) as (keyof T)[]) {
    out = out.flatMap((o) => axes[key].map((v) => ({ ...o, [key]: v })));
  }
  return out as T[];
}

function report(name: string, losses: number[], margins: number[], totals: number[]) {
  return { model: name, n: losses.length, logLoss: round(mean(losses)), maeMargin: round(mean(margins), 2), maeTotal: round(mean(totals), 2) };
}

function backtest(sport: "nba" | "nhl") {
  const games = load(sport);
  const tuneEnd =
    sport === "nba"
      ? games.findIndex((g) => g.season !== games[0]!.season)
      : Math.min(700, Math.floor(games.length / 2));
  const evalIdx = (n: number) => Array.from({ length: n }, (_, i) => i).filter((i) => i >= tuneEnd);
  const tuneIdx = (n: number) => Array.from({ length: n }, (_, i) => i).filter((i) => i >= WARMUP && i < tuneEnd);

  const make = (opts: object): Tracker =>
    sport === "nba"
      ? createNbaTracker(opts as Partial<NbaOptions>)
      : createNhlTracker(opts as Partial<NhlOptions>);

  const candidates =
    sport === "nba"
      ? grid<Partial<NbaOptions>>({
          k: [0.03, 0.05, 0.07, 0.09],
          homeAdvantage: [1.6, 2.2, 2.8],
          sigmaMargin: [11, 12, 13],
          backToBack: [0, 1, 2, 3],
          wellRested: [0, 0.5],
          altitudeBonus: [0, 1.5],
        })
      : grid<Partial<NhlOptions>>({
          k: [0.01, 0.02, 0.04, 0.06],
          homeAdvantage: [0, 0.04, 0.08],
          backToBack: [0, 0.05, 0.1],
          overtimeTilt: [0, 0.5, 1],
          seasonRegression: [0.3],
        });

  let best: { opts: object; loss: number } | null = null;
  for (const opts of candidates) {
    const { losses } = run(games, make(opts));
    const loss = mean(tuneIdx(games.length).map((i) => losses[i]!));
    if (!best || loss < best.loss) best = { opts, loss };
  }
  const chosen = best!.opts as Record<string, number>;
  const noRest = { ...chosen, backToBack: 0, wellRested: 0 };

  const full = run(games, make(chosen));
  const plain = run(games, make(noRest));
  const idx = evalIdx(games.length);
  const pick = (xs: number[]) => idx.map((i) => xs[i]!);

  const tuneGames = games.slice(0, tuneEnd);
  const homeRate = tuneGames.filter((g) => g.homeScore > g.awayScore).length / tuneGames.length;
  const naive = idx.map((i) => binaryLogLoss(homeRate, games[i]!.homeScore > games[i]!.awayScore));

  const rows = [
    report("tasa de local", naive, [], []),
    report("ratings sin descanso", pick(plain.losses), pick(plain.margins), pick(plain.totals)),
    report("ratings + descanso/back-to-back", pick(full.losses), pick(full.margins), pick(full.totals)),
  ];
  const comparisons: Record<string, unknown> = {
    contraTasaDeLocal: pairedBootstrap(naive, pick(full.losses)),
    contraSinDescanso: pairedBootstrap(pick(plain.losses), pick(full.losses)),
  };

  if (sport === "nhl") {
    // Elo de Bzzoiro: ventaja de local elegida en el tramo de ajuste.
    const eloLoss = (hfa: number, i: number) => {
      const g = games[i]!;
      if (g.eloHome == null || g.eloAway == null) return null;
      const p = 1 / (1 + 10 ** (-(g.eloHome - g.eloAway + hfa) / 400));
      return binaryLogLoss(p, g.homeScore > g.awayScore);
    };
    let bestHfa = 0;
    let bestLoss = Infinity;
    for (const hfa of [0, 15, 30, 45, 60]) {
      const ls = tuneIdx(games.length).map((i) => eloLoss(hfa, i)).filter((x): x is number => x !== null);
      if (ls.length && mean(ls) < bestLoss) {
        bestLoss = mean(ls);
        bestHfa = hfa;
      }
    }
    const pairs = idx
      .map((i) => [eloLoss(bestHfa, i), full.losses[i]!] as const)
      .filter((p): p is readonly [number, number] => p[0] !== null);
    rows.push(report(`Elo de Bzzoiro (local +${bestHfa})`, pairs.map((p) => p[0]), [], []));
    comparisons.contraEloBzzoiro = pairedBootstrap(
      pairs.map((p) => p[0]),
      pairs.map((p) => p[1]),
    );
  }

  return {
    sport,
    games: games.length,
    tuneGames: tuneEnd,
    evalGames: idx.length,
    evalFrom: games[tuneEnd]?.date,
    evalTo: games.at(-1)?.date,
    chosenParams: chosen,
    rows,
    comparisons: Object.fromEntries(
      Object.entries(comparisons).map(([k, v]) => [
        k,
        Object.fromEntries(Object.entries(v as Record<string, number>).map(([a, b]) => [a, round(b)])),
      ]),
    ),
  };
}

function main(): void {
  const arg = process.argv.find((a) => a.startsWith("--sports="));
  const sports = (arg ? arg.slice(9).split(",") : ["nba", "nhl"]).filter((s): s is "nba" | "nhl" => s === "nba" || s === "nhl");
  const results = sports.map(backtest);
  for (const r of results) {
    console.log(`\n== ${r.sport.toUpperCase()} · ajuste ${r.tuneGames} · evaluación ${r.evalGames} (${r.evalFrom} → ${r.evalTo})`);
    console.log("   parámetros:", JSON.stringify(r.chosenParams));
    for (const row of r.rows) console.log("  ", JSON.stringify(row));
    for (const [k, v] of Object.entries(r.comparisons)) console.log(`   Δ ${k}:`, JSON.stringify(v));
  }
  const out = join(ROOT, "Reportes", "modelos", "BACKTEST-US.json");
  mkdirSync(resolve(out, ".."), { recursive: true });
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2) + "\n", "utf8");
  console.log(`\nReporte: ${out}`);
}

main();
