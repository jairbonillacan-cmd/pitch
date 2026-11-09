/**
 * Backtest walk-forward del modelo de producción (v2) contra v2 mezclado con ratings
 * incrementales de todo el historial (Elo de goles).
 *
 * Reproduce el pipeline del pre-MVP: Dixon-Coles con la temporada en curso más la
 * temporada anterior a peso 0.45 (`prior-season.ts`). Se reajusta cada semana con los
 * partidos anteriores al lunes de esa semana; las ratings se actualizan partido a partido
 * y siempre se predice antes de actualizar, así que no hay fuga de información.
 *
 * El peso se elige en las temporadas de validación y se reporta en las de prueba.
 * Datos: `data/history/<liga>.jsonl` (versionado, ids del producto vía `remapTeam`).
 *
 * Uso: pnpm --filter @pitchlab/ingest backtest:blend
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createEloTracker,
  expectedCalibrationError,
  fitDixonColes,
  pairedBootstrap,
  predictFootball,
  type EloMatch,
  type FootballMatchRow,
} from "@pitchlab/models";
import { loadLeagueHistory } from "./prior-season.js";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const OUTPUT_DIR = resolve(ROOT, "Reportes", "modelos");
const DAY = 86_400_000;

const LEAGUES = ["premier-league", "laliga", "bundesliga", "serie-a", "ligue-1", "liga-mx"] as const;
const VALIDATION = ["2019-20", "2020-21", "2021-22", "2022-23"];
const TEST = ["2023-24", "2024-25", "2025-26", "2026-27"];
const WEIGHTS = [0, 0.3, 0.4, 0.5, 0.6, 0.7] as const;
/** Peso fijado antes de esta prueba (validación temporal de MODEL-08). */
const PRESET_WEIGHT = 0.5;

interface Sample {
  league: string;
  season: string;
  outcome: 0 | 1 | 2;
  /** 1X2 por peso, en el mismo orden que WEIGHTS. */
  probs: Array<[number, number, number]>;
  elo: [number, number, number];
}

function outcomeOf(m: EloMatch): 0 | 1 | 2 {
  return m.homeGoals > m.awayGoals ? 0 : m.homeGoals === m.awayGoals ? 1 : 2;
}

function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - shift * DAY).toISOString().slice(0, 10);
}

function logLoss(p: [number, number, number], y: number): number {
  return -Math.log(Math.max(1e-12, p[y]!));
}

function runLeague(league: string): Sample[] {
  const all = loadLeagueHistory(league, "2100-01-01");
  const seasons = [...new Set(all.map((m) => m.season))];
  const elo = createEloTracker();
  const samples: Sample[] = [];
  const targetSeasons = new Set([...VALIDATION, ...TEST]);

  let cursor = 0;
  const advanceElo = (beforeDate: string): void => {
    while (cursor < all.length && all[cursor]!.date < beforeDate) {
      const m = all[cursor]!;
      elo.beginSeason(m.season);
      elo.update(m);
      cursor++;
    }
  };

  for (const season of seasons) {
    const games = all.filter((m) => m.season === season);
    if (!targetSeasons.has(season) || games.length === 0) continue;
    const seasonStart = games[0]!.date;
    const startMs = Date.parse(`${seasonStart}T00:00:00Z`);
    // Igual que `loadPriorMatches`: 620 días antes del arranque, peso 0.45, máx. 900.
    const prior: FootballMatchRow[] = all
      .filter((m) => {
        const ms = Date.parse(`${m.date}T00:00:00Z`);
        return ms < startMs && ms >= startMs - 620 * DAY;
      })
      .slice(-900)
      .map((m) => ({ date: m.date, home: m.home, away: m.away, homeGoals: m.homeGoals, awayGoals: m.awayGoals, weight: 0.45 }));

    const weeks = new Map<string, EloMatch[]>();
    for (const g of games) {
      const key = mondayOf(g.date);
      const list = weeks.get(key) ?? [];
      list.push(g);
      weeks.set(key, list);
    }

    for (const [monday, week] of [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const played: FootballMatchRow[] = games
        .filter((g) => g.date < monday)
        .map((g) => ({ date: g.date, home: g.home, away: g.away, homeGoals: g.homeGoals, awayGoals: g.awayGoals }));
      const train = [...prior, ...played];
      if (train.length < 100) {
        advanceElo(week[week.length - 1]!.date + "Z");
        continue;
      }
      const model = fitDixonColes(train, { referenceDate: monday });

      for (const g of week) {
        advanceElo(g.date);
        elo.beginSeason(g.season);
        if (!(g.home in model.attack) || !(g.away in model.attack)) continue;
        const e = elo.predict(g.home, g.away);
        const probs = WEIGHTS.map((weight) => {
          const p = predictFootball(model, g.home, g.away, {
            simulations: 0,
            outcomeBlend: { home: e.home, draw: e.draw, away: e.away, weight },
          }).probabilities;
          return [p.home, p.draw, p.away] as [number, number, number];
        });
        samples.push({ league, season, outcome: outcomeOf(g), probs, elo: [e.home, e.draw, e.away] });
      }
    }
  }
  return samples;
}

function summarize(samples: Sample[]) {
  const n = samples.length;
  const byWeight = WEIGHTS.map((w, i) => ({
    weight: w,
    logLoss: samples.reduce((acc, s) => acc + logLoss(s.probs[i]!, s.outcome), 0) / Math.max(1, n),
    ece: expectedCalibrationError(samples.map((s) => ({ probs: s.probs[i]!, outcome: s.outcome }))),
    accuracy:
      samples.filter((s) => {
        const p = s.probs[i]!;
        return p.indexOf(Math.max(...p)) === s.outcome;
      }).length / Math.max(1, n),
  }));
  const eloOnly = samples.reduce((acc, s) => acc + logLoss(s.elo, s.outcome), 0) / Math.max(1, n);
  return { n, byWeight, eloOnly };
}

function main(): void {
  const started = Date.now();
  const samples: Sample[] = [];
  for (const league of LEAGUES) {
    const t = Date.now();
    const rows = runLeague(league);
    samples.push(...rows);
    console.log(`[blend] ${league}: ${rows.length} partidos evaluados (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }

  const validation = samples.filter((s) => VALIDATION.includes(s.season));
  const test = samples.filter((s) => TEST.includes(s.season));
  const valSummary = summarize(validation);
  const chosen = valSummary.byWeight.reduce((best, row) => (row.logLoss < best.logLoss ? row : best));
  const chosenIndex = WEIGHTS.indexOf(chosen.weight as (typeof WEIGHTS)[number]);
  const presetIndex = WEIGHTS.indexOf(PRESET_WEIGHT);

  const perLeague = LEAGUES.map((league) => {
    const rows = test.filter((s) => s.league === league);
    const summary = summarize(rows);
    const boot = pairedBootstrap(
      rows.map((s) => logLoss(s.probs[0]!, s.outcome)),
      rows.map((s) => logLoss(s.probs[presetIndex]!, s.outcome)),
    );
    return { league, ...summary, deltaPreset: boot };
  });
  const testSummary = summarize(test);
  const testBoot = pairedBootstrap(
    test.map((s) => logLoss(s.probs[0]!, s.outcome)),
    test.map((s) => logLoss(s.probs[presetIndex]!, s.outcome)),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    method:
      "Walk-forward semanal. v2 = Dixon-Coles con temporada anterior a peso 0.45 (igual que producción). Mezcla = 1X2 de v2 y de ratings incrementales de todo el historial; la matriz de marcadores se reescala al 1X2 mezclado.",
    validationSeasons: VALIDATION,
    testSeasons: TEST,
    presetWeight: PRESET_WEIGHT,
    weightChosenOnValidation: chosen.weight,
    validation: valSummary,
    test: { ...testSummary, deltaPresetVsV2: testBoot, perLeague },
  };
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(resolve(OUTPUT_DIR, "backtest-blend.json"), JSON.stringify(report, null, 2) + "\n", "utf8");

  const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
  const lines: string[] = [
    "# Mezcla de v2 con ratings del historial largo",
    "",
    `> Generado por \`pnpm --filter @pitchlab/ingest backtest:blend\` · ${report.generatedAt}`,
    "",
    "**Método.** Walk-forward semanal sobre `data/history` (6 ligas). v2 es el modelo publicado hoy: Dixon-Coles con la temporada en curso y la anterior a peso 0.45. La mezcla promedia su 1X2 con el de ratings incrementales (todas las temporadas disponibles, predicción antes de actualizar) y reescala la matriz de marcadores para que el resto de mercados siga siendo coherente.",
    "",
    `El peso se fijó en **${PRESET_WEIGHT}** antes de esta prueba (validación temporal 2010-2019 → 2020-2026 en el benchmark histórico). Aquí se vuelve a elegir en validación (${VALIDATION.join(", ")}) y se reporta en prueba (${TEST.join(", ")}).`,
    "",
    "## Validación: log loss 1X2 por peso",
    "",
    "| Peso ratings | n | Log loss | ECE | Acierto |",
    "|---|---|---|---|---|",
    ...valSummary.byWeight.map((r) => `| ${r.weight} | ${valSummary.n} | ${r.logLoss.toFixed(4)} | ${pct(r.ece)} | ${pct(r.accuracy)} |`),
    "",
    `Ratings solas: ${valSummary.eloOnly.toFixed(4)}. Peso con menor log loss en validación: **${chosen.weight}**.`,
    "",
    "## Prueba (fuera de muestra)",
    "",
    "| Peso ratings | n | Log loss | ECE | Acierto |",
    "|---|---|---|---|---|",
    ...testSummary.byWeight.map((r) => `| ${r.weight}${r.weight === 0 ? " (v2 actual)" : ""} | ${testSummary.n} | ${r.logLoss.toFixed(4)} | ${pct(r.ece)} | ${pct(r.accuracy)} |`),
    "",
    `Ratings solas: ${testSummary.eloOnly.toFixed(4)}.`,
    "",
    `Δ log loss (mezcla ${PRESET_WEIGHT} − v2): **${testBoot.meanDiff.toFixed(4)}**, IC 95 % [${testBoot.lower.toFixed(4)}, ${testBoot.upper.toFixed(4)}]. Negativo = la mezcla pierde menos.`,
    "",
    "### Por liga (prueba)",
    "",
    `| Liga | n | v2 | Mezcla ${PRESET_WEIGHT} | Δ | IC 95 % | ECE v2 | ECE mezcla |`,
    "|---|---|---|---|---|---|---|---|",
    ...perLeague.map(
      (l) =>
        `| ${l.league} | ${l.n} | ${l.byWeight[0]!.logLoss.toFixed(4)} | ${l.byWeight[presetIndex]!.logLoss.toFixed(4)} | ${l.deltaPreset.meanDiff.toFixed(4)} | [${l.deltaPreset.lower.toFixed(4)}, ${l.deltaPreset.upper.toFixed(4)}] | ${pct(l.byWeight[0]!.ece)} | ${pct(l.byWeight[presetIndex]!.ece)} |`,
    ),
    "",
    `Peso elegido en validación aplicado a prueba (${chosen.weight}): log loss ${testSummary.byWeight[chosenIndex]!.logLoss.toFixed(4)}.`,
    "",
  ];
  writeFileSync(resolve(OUTPUT_DIR, "BACKTEST-BLEND.md"), lines.join("\n"), "utf8");
  console.log(lines.slice(8).join("\n"));
  console.log(`[blend] listo en ${((Date.now() - started) / 1000).toFixed(0)} s`);
}

main();
