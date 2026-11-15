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
  type RefereeCountOptions,
} from "@pitchlab/models";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const RESEARCH = join(ROOT, "data", "history", "research");
const EUROPE = ["premier-league", "la-liga", "bundesliga", "serie-a", "ligue-1"] as const;
const TEST_FROM = "2018-19";
const STATS = ["corners", "fouls", "yellow"] as const;
const REFEREE_STATS = new Set<Stat>(["fouls", "yellow"]);
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
    referee?: string;
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
      ...(r.referee ? { referee: r.referee } : {}),
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
    context?: { refereeId?: number | null };
    stats?: { home: S; away: S } | null;
  };
  return readJsonl<R>(join(RESEARCH, "bzzoiro", "liga-mx.jsonl"))
    .filter((r) => r.status === "finished" && r.stats)
    .map((r) => ({
      date: r.kickoffUtc.slice(0, 10),
      season: String(r.providerSeasonId),
      home: r.home.name,
      away: r.away.name,
      ...(r.context?.refereeId != null ? { referee: `bzz:${r.context.refereeId}` } : {}),
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
  refHome: number;
  refAway: number;
  hasReferee: boolean;
  refActive: boolean;
  test: boolean;
}

/** Corre modelo actual, modelo con árbitro (si se pide) y base (media de liga) en orden cronológico. */
function run(
  rows: readonly Row[],
  stat: Stat,
  opts: CountOptions,
  isTest: (r: Row) => boolean,
  refOpts?: RefereeCountOptions,
): Scored[] {
  const model = createCountTracker({ ...opts, referee: { enabled: false } });
  const withRef = refOpts?.enabled ? createCountTracker({ ...opts, referee: refOpts }) : null;
  const base = createCountTracker({ ...opts, k: 0, referee: { enabled: false } });
  const out: Scored[] = [];
  for (const r of rows) {
    const c = r.counts[stat];
    if (!c) continue;
    const g: CountGame = { ...r, homeCount: c[0], awayCount: c[1] };
    const p = model.predict(g);
    const rp = withRef?.predict(g);
    const b = base.predict(g);
    out.push({
      expHome: p.home,
      expAway: p.away,
      obsHome: c[0],
      obsAway: c[1],
      baseHome: b.home,
      baseAway: b.away,
      refHome: rp ? rp.home : p.home,
      refAway: rp ? rp.away : p.away,
      hasReferee: Boolean(r.referee),
      refActive: Boolean(withRef && r.referee && rp && rp.refereeGames >= refOpts!.minGames),
      test: isTest(r),
    });
    model.update(g);
    withRef?.update(g);
    base.update(g);
  }
  return out;
}

function sideDispersion(scored: readonly Scored[], variant: "model" | "base" | "ref" = "model"): number {
  return estimateDispersion(
    scored.flatMap((s) => {
      const eh = variant === "base" ? s.baseHome : variant === "ref" ? s.refHome : s.expHome;
      const ea = variant === "base" ? s.baseAway : variant === "ref" ? s.refAway : s.expAway;
      return [
        { expected: eh, observed: s.obsHome },
        { expected: ea, observed: s.obsAway },
      ];
    }),
  );
}

function totalLoglik(s: Scored, size: number, variant: "model" | "base" | "ref" = "model"): number {
  const h = variant === "base" ? s.baseHome : variant === "ref" ? s.refHome : s.expHome;
  const a = variant === "base" ? s.baseAway : variant === "ref" ? s.refAway : s.expAway;
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

function refGrid(): RefereeCountOptions[] {
  const out: RefereeCountOptions[] = [];
  for (const k of [0.02, 0.03, 0.05])
    for (const seasonRegression of [0.4, 0.5, 0.65])
      for (const shrinkageGames of [30, 50, 80])
        for (const minGames of [15, 20]) {
          out.push({ enabled: true, k, seasonRegression, shrinkageGames, minGames, maxLog: 0.35 });
        }
  return out;
}

function bootstrapDelta(candidateNll: readonly number[], referenceNll: readonly number[]) {
  // pairedBootstrap(a, b) calcula mean(b - a); pasamos candidate como `b` para que negativo = mejora.
  const d = pairedBootstrap([...referenceNll], [...candidateNll]);
  return {
    mean: round(d.meanDiff),
    lower: round(d.lower),
    upper: round(d.upper),
    significant: d.upper < 0,
  };
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

    // 2. Dispersión del tramo de ajuste (y ajuste del multiplicador de árbitro para faltas/amarillas).
    const train = EUROPE.flatMap((l) => run(europe[l]!, stat, opts, isTestEurope).filter((s) => !s.test));
    const size = sideDispersion(train, "model");
    const baseSize = sideDispersion(train, "base");

    let refOpts: RefereeCountOptions | undefined;
    let refSize = size;
    if (REFEREE_STATS.has(stat)) {
      const refLeagues = EUROPE.filter((l) => europe[l]!.some((r) => Boolean(r.referee)));
      let bestRef: { opts: RefereeCountOptions; ll: number } | null = null;
      for (const candidate of refGrid()) {
        let ll = 0;
        for (const l of refLeagues) {
          const scored = run(europe[l]!, stat, opts, isTestEurope, candidate).filter((s) => !s.test);
          const rSize = sideDispersion(scored, "ref");
          for (const s of scored.slice(200)) ll += totalLoglik(s, rSize, "ref");
        }
        if (!bestRef || ll > bestRef.ll) bestRef = { opts: candidate, ll };
      }
      refOpts = bestRef!.opts;
      const trainRef = EUROPE.flatMap((l) => run(europe[l]!, stat, opts, isTestEurope, refOpts).filter((s) => !s.test));
      refSize = sideDispersion(trainRef, "ref");
    }

    // 3. Evaluación.
    const brierFor = (s: Scored, variant: "model" | "base" | "ref", disp: number) => {
      const m = variant === "base" ? s.baseHome + s.baseAway : variant === "ref" ? s.refHome + s.refAway : s.expHome + s.expAway;
      const a = variant === "base" ? s.baseHome : variant === "ref" ? s.refHome : s.expHome;
      const b = variant === "base" ? s.baseAway : variant === "ref" ? s.refAway : s.expAway;
      const r = sumDispersion(a, b, disp);
      const line = balancedLine(m, r);
      const p = overProbability(m, r, line);
      return (p - (s.obsHome + s.obsAway > line ? 1 : 0)) ** 2;
    };

    const evaluate = (scored: readonly Scored[]) => {
      const test = scored.filter((s) => s.test);
      const llModel = test.map((s) => totalLoglik(s, size, "model"));
      const llBase = test.map((s) => totalLoglik(s, baseSize, "base"));
      const brier = test.map((s) => brierFor(s, "model", size));
      const brierBase = test.map((s) => brierFor(s, "base", baseSize));
      // Pérdida = −log-verosimilitud; delta negativo = el modelo mejora a la base.
      const delta = pairedBootstrap(llModel.map((x) => -x), llBase.map((x) => -x));

      const refereeComparison = (() => {
        if (!refOpts) return undefined;
        // Sin árbitro activo el motor coincide con el actual y conserva su dispersión.
        const llRef = test.map((s) => totalLoglik(s, s.refActive ? refSize : size, "ref"));
        const nllRef = llRef.map((x) => -x);
        const nllMod = llModel.map((x) => -x);
        const brierRef = test.map((s) => brierFor(s, "ref", s.refActive ? refSize : size));
        const nWithReferee = test.filter((s) => s.hasReferee).length;
        const nActiveReferee = test.filter((s) => s.refActive).length;
        const activeIdx = test.flatMap((s, idx) => (s.refActive ? [idx] : []));
        const onActive =
          activeIdx.length > 0 && activeIdx.length < test.length
            ? {
                n: activeIdx.length,
                nllRef: round(mean(activeIdx.map((idx) => nllRef[idx]!))),
                nllModel: round(mean(activeIdx.map((idx) => nllMod[idx]!))),
                deltaRefVsModel: bootstrapDelta(
                  activeIdx.map((idx) => nllRef[idx]!),
                  activeIdx.map((idx) => nllMod[idx]!),
                ),
              }
            : undefined;
        return {
          nWithReferee,
          nActiveReferee,
          nllRef: round(mean(nllRef)),
          nllModel: round(mean(nllMod)),
          deltaRefVsModel: bootstrapDelta(nllRef, nllMod),
          maeTotalRef: round(mean(test.map((s) => Math.abs(s.obsHome + s.obsAway - s.refHome - s.refAway))), 3),
          maeTotalModel: round(mean(test.map((s) => Math.abs(s.obsHome + s.obsAway - s.expHome - s.expAway))), 3),
          brierOverRef: round(mean(brierRef)),
          brierOverModel: round(mean(brier)),
          ...(onActive ? { onActiveReferee: onActive } : {}),
        };
      })();

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
        ...(refereeComparison ? { referee: refereeComparison } : {}),
      };
    };

    const perLeague: Record<string, unknown> = {};
    const allEurope: Scored[] = [];
    for (const l of EUROPE) {
      const scored = run(europe[l]!, stat, opts, isTestEurope, refOpts);
      allEurope.push(...scored);
      perLeague[l] = evaluate(scored);
    }
    perLeague["europa-5"] = evaluate(allEurope);
    if (ligaMx.length) {
      // Liga MX: sin tramo de ajuste propio; se evalúa desde el partido 100 para no castigar el arranque en frío.
      let i = 0;
      perLeague["liga-mx"] = evaluate(run(ligaMx, stat, opts, () => i++ >= 100, refOpts));
    }

    (report.stats as Record<string, unknown>)[stat] = {
      params: { k: opts.k, seasonRegression: opts.seasonRegression, meanAlpha: opts.meanAlpha },
      ...(refOpts ? { refereeParams: refOpts } : {}),
      initial: { home: round(initial.initialHome, 2), away: round(initial.initialAway, 2) },
      dispersion: {
        model: round(size, 2),
        base: round(baseSize, 2),
        ...(refOpts ? { withReferee: round(refSize, 2) } : {}),
      },
      results: perLeague,
    };
    const e = perLeague["europa-5"] as ReturnType<typeof evaluate>;
    console.log(
      `[counts] ${stat}: k=${opts.k} reg=${opts.seasonRegression} α=${opts.meanAlpha} r=${round(size, 1)} · Europa n=${e.n} Δ=${e.deltaModelVsBase.mean} [${e.deltaModelVsBase.lower}, ${e.deltaModelVsBase.upper}] MAE ${e.maeTotalModel} vs ${e.maeTotalBase}`,
    );
    if (refOpts) {
      console.log(
        `[counts] ${stat} (árbitro): k=${refOpts.k} reg=${refOpts.seasonRegression} shrink=${refOpts.shrinkageGames} min=${refOpts.minGames} r=${round(refSize, 1)}`,
      );
      for (const l of ["premier-league", "europa-5", "liga-mx"] as const) {
        const res = perLeague[l] as ReturnType<typeof evaluate> | undefined;
        if (!res?.referee || res.referee.nWithReferee === 0) continue;
        const rc = res.referee;
        const d = rc.deltaRefVsModel;
        console.log(
          `[counts] ${stat} árb [${l}]: n=${res.n} conÁrb=${rc.nWithReferee} activos=${rc.nActiveReferee} ΔrefVsModel=${d.mean} [${d.lower}, ${d.upper}] sig=${d.significant} MAE ${rc.maeTotalRef} vs ${rc.maeTotalModel}`,
        );
        if (rc.onActiveReferee) {
          const oa = rc.onActiveReferee;
          console.log(
            `[counts] ${stat} árb [${l} solo activos n=${oa.n}]: Δ=${oa.deltaRefVsModel.mean} [${oa.deltaRefVsModel.lower}, ${oa.deltaRefVsModel.upper}] sig=${oa.deltaRefVsModel.significant}`,
          );
        }
      }
    }
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
