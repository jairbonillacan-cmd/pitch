/**
 * `pnpm --filter @pitchlab/ingest backtest:counts`
 *
 * Walk-forward de tiros de esquina, faltas y amarillas por equipo (`@pitchlab/models` counts):
 *  1. Datos: football-data.co.uk para las 5 ligas europeas (`pnpm history:odds`, temporadas desde
 *     2010-11) y Bzzoiro para Liga MX (`history:providers`). Todo research-only, nada se publica.
 *  2. Parámetros (k, regresión, media de liga) elegidos SOLO con las temporadas de ajuste
 *     (europeas hasta 2017-18), compartidos entre ligas. La dispersión también sale del ajuste.
 *  3. Evaluación en 2018-19 en adelante (Liga MX: todo, con los parámetros europeos), contra la
 *     media de la liga sin ratings de equipo, con bootstrap pareado de la log-verosimilitud del
 *     total, error absoluto y Brier del más/menos en la línea equilibrada.
 *
 * Escribe `Reportes/modelos/BACKTEST-CORNERS-FOULS.json`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  balancedLine,
  countLogLik,
  createCountTracker,
  estimateDispersion,
  overProbability,
  pairedBootstrap,
  sumDispersion,
  type CountGame,
  type CountOptions,
} from "@pitchlab/models";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const RESEARCH = join(ROOT, "data", "history", "research");
const EUROPE = ["premier-league", "la-liga", "bundesliga", "serie-a", "ligue-1"] as const;
const TEST_FROM = "2018-19";
const STATS = ["corners", "fouls", "yellow"] as const;
type Stat = (typeof STATS)[number];

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

interface Row extends Omit<CountGame, "homeCount" | "awayCount"> {
  counts: Partial<Record<Stat, [number, number]>>;
}

const pair = (h: number | null | undefined, a: number | null | undefined): [number, number] | undefined =>
  typeof h === "number" && typeof a === "number" ? [h, a] : undefined;

function loadEurope(league: string): Row[] {
  type R = {
    date: string;
    season: string;
    homeTeam: string;
    awayTeam: string;
    stats?: {
      cornersHome: number | null;
      cornersAway: number | null;
      foulsHome?: number | null;
      foulsAway?: number | null;
      yellowHome: number | null;
      yellowAway: number | null;
    };
  };
  return readJsonl<R>(join(RESEARCH, `${league}.jsonl`))
    .filter((r) => r.stats)
    .map((r) => ({
      date: r.date,
      season: r.season,
      home: r.homeTeam,
      away: r.awayTeam,
      counts: {
        corners: pair(r.stats!.cornersHome, r.stats!.cornersAway),
        fouls: pair(r.stats!.foulsHome, r.stats!.foulsAway),
        yellow: pair(r.stats!.yellowHome, r.stats!.yellowAway),
      },
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function loadLigaMx(): Row[] {
  type S = { corners: number | null; fouls: number | null; yellowCards: number | null };
  type R = {
    status: string;
    kickoffUtc: string;
    providerSeasonId: number | string;
    home: { name: string };
    away: { name: string };
    stats?: { home: S; away: S } | null;
  };
  return readJsonl<R>(join(RESEARCH, "bzzoiro", "liga-mx.jsonl"))
    .filter((r) => r.status === "finished" && r.stats)
    .map((r) => ({
      date: r.kickoffUtc.slice(0, 10),
      season: String(r.providerSeasonId),
      home: r.home.name,
      away: r.away.name,
      counts: {
        corners: pair(r.stats!.home.corners, r.stats!.away.corners),
        fouls: pair(r.stats!.home.fouls, r.stats!.away.fouls),
        yellow: pair(r.stats!.home.yellowCards, r.stats!.away.yellowCards),
      },
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

interface Scored {
  expHome: number;
  expAway: number;
  obsHome: number;
  obsAway: number;
  baseHome: number;
  baseAway: number;
  test: boolean;
}

/** Corre modelo y base (misma media de liga, sin ratings) en una sola pasada cronológica. */
function run(rows: readonly Row[], stat: Stat, opts: CountOptions, isTest: (r: Row) => boolean): Scored[] {
  const model = createCountTracker(opts);
  const base = createCountTracker({ ...opts, k: 0 });
  const out: Scored[] = [];
  for (const r of rows) {
    const c = r.counts[stat];
    if (!c) continue;
    const g: CountGame = { ...r, homeCount: c[0], awayCount: c[1] };
    const p = model.predict(g);
    const b = base.predict(g);
    out.push({ expHome: p.home, expAway: p.away, obsHome: c[0], obsAway: c[1], baseHome: b.home, baseAway: b.away, test: isTest(r) });
    model.update(g);
    base.update(g);
  }
  return out;
}

function sideDispersion(scored: readonly Scored[], useBase = false): number {
  return estimateDispersion(
    scored.flatMap((s) => [
      { expected: useBase ? s.baseHome : s.expHome, observed: s.obsHome },
      { expected: useBase ? s.baseAway : s.expAway, observed: s.obsAway },
    ]),
  );
}

function totalLoglik(s: Scored, size: number, base = false): number {
  const h = base ? s.baseHome : s.expHome;
  const a = base ? s.baseAway : s.expAway;
  return countLogLik(h + a, sumDispersion(h, a, size), s.obsHome + s.obsAway);
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const round = (x: number, d = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x);

function grid(): Array<Pick<CountOptions, "k" | "seasonRegression" | "meanAlpha">> {
  const out = [];
  for (const k of [0.01, 0.02, 0.03, 0.05, 0.08])
    for (const seasonRegression of [0.2, 0.35, 0.5, 0.7])
      for (const meanAlpha of [0.005, 0.01, 0.02]) out.push({ k, seasonRegression, meanAlpha });
  return out;
}

function main(): void {
  const europe = Object.fromEntries(EUROPE.map((l) => [l, loadEurope(l)])) as Record<string, Row[]>;
  const missing = EUROPE.filter((l) => europe[l]!.length === 0);
  if (missing.length) {
    throw new Error(`Faltan datos de ${missing.join(", ")}. Corre \`pnpm --filter @pitchlab/ingest history:odds\`.`);
  }
  const ligaMx = loadLigaMx();
  const isTestEurope = (r: Row) => r.season >= TEST_FROM;

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    method:
      "Ratings log-lineales incrementales (genera/concede) por equipo con media de liga EWMA y regresión entre temporadas; binomial negativa por momentos. Ajuste en temporadas europeas < 2018-19, evaluación desde 2018-19; Liga MX con parámetros europeos.",
    stats: {},
  };

  for (const stat of STATS) {
    const initial = (() => {
      const first = EUROPE.flatMap((l) => europe[l]!.slice(0, 380)).map((r) => r.counts[stat]).filter(Boolean) as [number, number][];
      return { initialHome: mean(first.map((c) => c[0])), initialAway: mean(first.map((c) => c[1])) };
    })();

    // 1. Parámetros con el tramo de ajuste (todas las ligas europeas juntas).
    let best: { opts: CountOptions; ll: number } | null = null;
    for (const g of grid()) {
      const opts: CountOptions = { ...g, ...initial };
      let ll = 0;
      for (const l of EUROPE) {
        const scored = run(europe[l]!, stat, opts, isTestEurope).filter((s) => !s.test);
        const size = sideDispersion(scored);
        for (const s of scored.slice(200)) ll += totalLoglik(s, size);
      }
      if (!best || ll > best.ll) best = { opts, ll };
    }
    const opts = best!.opts;

    // 2. Dispersión del tramo de ajuste.
    const train = EUROPE.flatMap((l) => run(europe[l]!, stat, opts, isTestEurope).filter((s) => !s.test));
    const size = sideDispersion(train);
    const baseSize = sideDispersion(train, true);

    // 3. Evaluación.
    const evaluate = (scored: readonly Scored[]) => {
      const test = scored.filter((s) => s.test);
      const llModel = test.map((s) => totalLoglik(s, size));
      const llBase = test.map((s) => totalLoglik(s, baseSize, true));
      const brier = test.map((s) => {
        const m = s.expHome + s.expAway;
        const r = sumDispersion(s.expHome, s.expAway, size);
        const line = balancedLine(m, r);
        const p = overProbability(m, r, line);
        return (p - (s.obsHome + s.obsAway > line ? 1 : 0)) ** 2;
      });
      const brierBase = test.map((s) => {
        const m = s.baseHome + s.baseAway;
        const r = sumDispersion(s.baseHome, s.baseAway, baseSize);
        const line = balancedLine(m, r);
        const p = overProbability(m, r, line);
        return (p - (s.obsHome + s.obsAway > line ? 1 : 0)) ** 2;
      });
      // Pérdida = −log-verosimilitud; delta negativo = el modelo mejora a la base.
      const delta = pairedBootstrap(llModel.map((x) => -x), llBase.map((x) => -x));
      return {
        n: test.length,
        meanTotal: round(mean(test.map((s) => s.obsHome + s.obsAway)), 2),
        nllModel: round(-mean(llModel)),
        nllBase: round(-mean(llBase)),
        deltaModelVsBase: { mean: round(-delta.meanDiff), lower: round(-delta.upper), upper: round(-delta.lower) },
        maeTotalModel: round(mean(test.map((s) => Math.abs(s.obsHome + s.obsAway - s.expHome - s.expAway))), 3),
        maeTotalBase: round(mean(test.map((s) => Math.abs(s.obsHome + s.obsAway - s.baseHome - s.baseAway))), 3),
        brierOverModel: round(mean(brier)),
        brierOverBase: round(mean(brierBase)),
      };
    };

    const perLeague: Record<string, unknown> = {};
    const allEurope: Scored[] = [];
    for (const l of EUROPE) {
      const scored = run(europe[l]!, stat, opts, isTestEurope);
      allEurope.push(...scored);
      perLeague[l] = evaluate(scored);
    }
    perLeague["europa-5"] = evaluate(allEurope);
    if (ligaMx.length) {
      // Liga MX: sin tramo de ajuste propio; se evalúa desde el partido 100 para no castigar el arranque en frío.
      let i = 0;
      perLeague["liga-mx"] = evaluate(run(ligaMx, stat, opts, () => i++ >= 100));
    }

    (report.stats as Record<string, unknown>)[stat] = {
      params: { k: opts.k, seasonRegression: opts.seasonRegression, meanAlpha: opts.meanAlpha },
      initial: { home: round(initial.initialHome, 2), away: round(initial.initialAway, 2) },
      dispersion: { model: round(size, 2), base: round(baseSize, 2) },
      results: perLeague,
    };
    const e = perLeague["europa-5"] as ReturnType<typeof evaluate>;
    console.log(
      `[counts] ${stat}: k=${opts.k} reg=${opts.seasonRegression} α=${opts.meanAlpha} r=${round(size, 1)} · Europa n=${e.n} Δ=${e.deltaModelVsBase.mean} [${e.deltaModelVsBase.lower}, ${e.deltaModelVsBase.upper}] MAE ${e.maeTotalModel} vs ${e.maeTotalBase}`,
    );
    const mx = perLeague["liga-mx"] as ReturnType<typeof evaluate> | undefined;
    if (mx) {
      console.log(
        `[counts] ${stat}: Liga MX n=${mx.n} Δ=${mx.deltaModelVsBase.mean} [${mx.deltaModelVsBase.lower}, ${mx.deltaModelVsBase.upper}] MAE ${mx.maeTotalModel} vs ${mx.maeTotalBase}`,
      );
    }
  }

  const outDir = join(ROOT, "Reportes", "modelos");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "BACKTEST-CORNERS-FOULS.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log("[counts] → Reportes/modelos/BACKTEST-CORNERS-FOULS.json");
}

main();
