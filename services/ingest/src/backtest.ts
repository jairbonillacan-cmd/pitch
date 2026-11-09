/**
 * Backtest walk-forward de los modelos v2 frente al Baseline 0 y a una referencia ingenua.
 *
 * Regla de oro: para predecir la jornada/semana R solo se usan partidos anteriores a R.
 * Datos: openfootball (CC0) para la Premier League y nflverse (CC-BY 4.0) para la NFL.
 *
 * Uso:
 *   pnpm --filter @pitchlab/ingest backtest
 *   pnpm --filter @pitchlab/ingest backtest -- --seasons=2025-26,2026-27
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  asGameId,
  asLeagueId,
  asSeasonId,
  asTeamId,
  type GameDTO,
  type LeagueId,
  type Team,
} from "@pitchlab/contracts";
import { analyzeFootballGame, analyzeNflGame } from "@pitchlab/engines-reference";
import {
  evaluateFootball,
  evaluateNfl,
  expectedCalibrationError,
  fitDixonColes,
  fitNflRatings,
  fitTemperature,
  meanLogLoss,
  normalCdf,
  pairedBootstrap,
  predictFootball,
  predictNfl,
  type CalibrationSample,
  type ModelMetrics,
} from "@pitchlab/models";
import { OpenFootballSeasonSchema } from "./adapters/openfootball.js";
import { parseCsv, NflverseCsvRowSchema } from "./adapters/nflverse.js";
import { loadPriorMatches } from "./prior-season.js";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const OUTPUT_DIR = resolve(ROOT, "Reportes", "modelos");
const OF_BASE = "https://raw.githubusercontent.com/openfootball/football.json/master";
const NFL_CSV_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";

interface FootballRow {
  season: string;
  round: number;
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
}

function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function teamFor(id: string, league: LeagueId, name: string): Team {
  const letters = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z]/g, "");
  return {
    id: asTeamId(id),
    league,
    name,
    shortName: name,
    code: (letters.slice(0, 3) || "TEA").toUpperCase(),
  };
}

async function loadFootballSeason(season: string): Promise<FootballRow[]> {
  const res = await fetch(`${OF_BASE}/${season}/en.1.json`, {
    headers: { "User-Agent": "PitchLab-Backtest/1.0 (+https://pitchlab.mx)" },
  });
  if (!res.ok) throw new Error(`openfootball ${season}: HTTP ${res.status}`);
  const parsed = OpenFootballSeasonSchema.parse(await res.json());
  const rows: FootballRow[] = [];
  for (const m of parsed.matches) {
    const ft = m.score && "ft" in m.score ? m.score.ft : undefined;
    if (!ft || ft.length !== 2) continue;
    const md = Number((m.round.match(/(\d+)/) ?? ["0", "0"])[1]);
    if (!Number.isFinite(md) || md <= 0) continue;
    rows.push({
      season,
      round: md,
      date: m.date,
      home: slug(m.team1),
      away: slug(m.team2),
      homeGoals: ft[0]!,
      awayGoals: ft[1]!,
    });
  }
  return rows;
}

function aggregateFootball(rows: readonly FootballRow[]) {
  const stats = new Map<string, { gf: number; ga: number; gp: number; name: string }>();
  const nameOf = new Map<string, string>();
  for (const r of rows) {
    nameOf.set(r.home, r.home);
    nameOf.set(r.away, r.away);
  }
  for (const r of rows) {
    const h = stats.get(r.home) ?? { gf: 0, ga: 0, gp: 0, name: r.home };
    const a = stats.get(r.away) ?? { gf: 0, ga: 0, gp: 0, name: r.away };
    h.gf += r.homeGoals;
    h.ga += r.awayGoals;
    h.gp += 1;
    a.gf += r.awayGoals;
    a.ga += r.homeGoals;
    a.gp += 1;
    stats.set(r.home, h);
    stats.set(r.away, a);
  }
  return { stats, nameOf };
}

function naiveFootball(rows: readonly FootballRow[]) {
  let home = 1;
  let draw = 1;
  let away = 1;
  let over = 1;
  let btts = 1;
  let total = 3;
  for (const r of rows) {
    if (r.homeGoals > r.awayGoals) home++;
    else if (r.homeGoals === r.awayGoals) draw++;
    else away++;
    if (r.homeGoals + r.awayGoals > 2.5) over++;
    if (r.homeGoals > 0 && r.awayGoals > 0) btts++;
    total++;
  }
  return {
    p1x2: [home / total, draw / total, away / total] as [number, number, number],
    pOver25: over / total,
    pBtts: btts / total,
  };
}

interface Losses {
  v2: number[];
  baseline: number[];
  naive: number[];
}

function footballGameDto(row: FootballRow, league: LeagueId, seasonId: string): GameDTO {
  const home = teamFor(`premier-league.${row.home}`, league, row.home);
  const away = teamFor(`premier-league.${row.away}`, league, row.away);
  return {
    id: asGameId(`bt-${row.season}-r${row.round}-${row.home}-${row.away}`),
    league,
    season: asSeasonId(seasonId),
    week: row.round,
    round: `Jornada ${row.round}`,
    startTime: `${row.date}T15:00:00`,
    status: "final",
    home,
    away,
    neutralSite: false,
    result: {
      home: row.homeGoals,
      away: row.awayGoals,
      observedAt: `${row.date}T18:00:00Z`,
      source: "openfootball",
    },
  };
}

async function backtestFootball(seasons: string[]) {
  const all: FootballRow[] = [];
  for (const season of seasons) {
    all.push(...(await loadFootballSeason(season)));
  }

  const league = asLeagueId("premier-league");
  const rowsV2: Array<{ prediction: { p1x2: [number, number, number]; pOver25: number; pBtts: number }; outcome: { result1x2: 0 | 1 | 2; homeScore: number; awayScore: number } }> = [];
  const rowsBase = [...rowsV2];
  const rowsNaive = [...rowsV2];
  const losses: Losses = { v2: [], baseline: [], naive: [] };
  let evaluated = 0;

  for (const season of seasons) {
    const seasonRows = all.filter((r) => r.season === season);
    const rounds = [...new Set(seasonRows.map((r) => r.round))].sort((a, b) => a - b);

    for (const round of rounds) {
      if (round < 4) continue;
      const train = seasonRows.filter((r) => r.round < round);
      const test = seasonRows.filter((r) => r.round === round);
      if (train.length < 30 || test.length === 0) continue;

      const referenceDate = test[0]!.date;
      const seasonStart = seasonRows.reduce(
        (min, r) => (r.date < min ? r.date : min),
        seasonRows[0]!.date,
      );
      const priorRows =
        process.env.BACKTEST_PRIOR === "1"
          ? loadPriorMatches("premier-league", seasonStart, { weight: 0.45 })
          : [];
      const dc = fitDixonColes(
        [
          ...priorRows,
          ...train.map((r) => ({
            date: r.date,
            home: `premier-league.${r.home}`,
            away: `premier-league.${r.away}`,
            homeGoals: r.homeGoals,
            awayGoals: r.awayGoals,
          })),
        ],
        { referenceDate },
      );

      const { stats, nameOf } = aggregateFootball(train);
      const naive = naiveFootball(train);
      const teams = [...stats.entries()].map(([id, s]) => ({
        teamId: `premier-league.${id}`,
        name: nameOf.get(id) ?? id,
        shortName: (nameOf.get(id) ?? id).slice(0, 16),
        code: id.slice(0, 3).toUpperCase(),
        goalsFor: s.gf,
        goalsAgainst: s.ga,
        gamesPlayed: s.gp,
      }));

      for (const row of test) {
        const v2 = predictFootball(dc, `premier-league.${row.home}`, `premier-league.${row.away}`);
        const baseAnalysis = analyzeFootballGame({
          league: "premier-league",
          leagueName: "Premier League",
          game: footballGameDto(row, league, `premier-league-${season}`),
          teams,
          inputsAsOf: `${row.date}T12:00:00Z`,
          publishedAt: `${row.date}T12:00:00Z`,
          source: "openfootball",
        });

        const pick = (market: string, selection: string) =>
          baseAnalysis.probabilities.find(
            (p) => p.market === market && p.selection.toLowerCase().includes(selection),
          )?.p ?? 0.5;

        const basePrediction = {
          p1x2: [
            baseAnalysis.x12[0],
            baseAnalysis.x12[1],
            baseAnalysis.x12[2],
          ] as [number, number, number],
          pOver25: pick("totals", "más de 2.5"),
          pBtts: pick("btts", "sí"),
        };

        const outcome = {
          result1x2: (row.homeGoals > row.awayGoals
            ? 0
            : row.homeGoals === row.awayGoals
              ? 1
              : 2) as 0 | 1 | 2,
          homeScore: row.homeGoals,
          awayScore: row.awayGoals,
        };

        const v2Prediction = {
          p1x2: [v2.probabilities.home, v2.probabilities.draw, v2.probabilities.away] as [number, number, number],
          pOver25: v2.totals.find((t) => t.line === 2.5)!.over,
          pBtts: v2.btts.yes,
        };

        rowsV2.push({ prediction: v2Prediction, outcome });
        rowsBase.push({ prediction: basePrediction, outcome });
        rowsNaive.push({ prediction: naive, outcome });

        const oneHot = (p: [number, number, number]) => -Math.log(Math.max(p[outcome.result1x2], 1e-12));
        losses.v2.push(oneHot(v2Prediction.p1x2));
        losses.baseline.push(oneHot(basePrediction.p1x2));
        losses.naive.push(oneHot(naive.p1x2));
        evaluated++;
      }
    }
  }

  return {
    rowsV2,
    rowsBase,
    rowsNaive,
    losses,
    evaluated,
  };
}

interface NflRow {
  season: string;
  week: number;
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

async function loadNfl(seasons: number[]): Promise<NflRow[]> {
  const res = await fetch(NFL_CSV_URL, {
    headers: { "User-Agent": "PitchLab-Backtest/1.0 (+https://pitchlab.mx)" },
  });
  if (!res.ok) throw new Error(`nflverse: HTTP ${res.status}`);
  const csv = await res.text();
  const rows: NflRow[] = [];
  for (const raw of parseCsv(csv)) {
    if (raw.game_type !== "REG") continue;
    const season = Number(raw.season);
    if (!seasons.includes(season)) continue;
    if (!raw.home_score || !raw.away_score) continue;
    const parsed = NflverseCsvRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    rows.push({
      season: String(season),
      week: parsed.data.week,
      date: parsed.data.gameday,
      home: parsed.data.home_team,
      away: parsed.data.away_team,
      homeScore: Number(parsed.data.home_score),
      awayScore: Number(parsed.data.away_score),
    });
  }
  return rows;
}

function naiveNfl(rows: readonly NflRow[], line: number) {
  let home = 1;
  let total = 3;
  let over = 1;
  for (const r of rows) {
    if (r.homeScore > r.awayScore) home++;
    if (r.homeScore + r.awayScore > line) over++;
    total++;
  }
  return { pHome: home / total, pOver: over / total };
}

async function backtestNfl(seasons: number[]) {
  const all = await loadNfl([...seasons, ...seasons.map((s) => s - 1)]);
  const rowsV2: Array<{ prediction: { pHome: number; pOver: number; totalLine: number }; outcome: { result1x2: 0 | 1 | 2; homeScore: number; awayScore: number } }> = [];
  const rowsBase: typeof rowsV2 = [];
  const rowsNaive: typeof rowsV2 = [];
  const losses: Losses = { v2: [], baseline: [], naive: [] };
  let evaluated = 0;

  for (const season of seasons.map(String)) {
    const seasonRows = all.filter((r) => r.season === season);
    const weeks = [...new Set(seasonRows.map((r) => r.week))].sort((a, b) => a - b);

    for (const week of weeks) {
      if (week < 4) continue;
      const train = seasonRows.filter((r) => r.week < week);
      const test = seasonRows.filter((r) => r.week === week);
      if (train.length < 40 || test.length === 0) continue;

      const priorRows = all
        .filter((r) => r.season === String(Number(season) - 1))
        .map((r) => ({
          week: r.week,
          date: r.date,
          home: `nfl.${r.home.toLowerCase()}`,
          away: `nfl.${r.away.toLowerCase()}`,
          homeScore: r.homeScore,
          awayScore: r.awayScore,
        }));

      const model = fitNflRatings(
        train.map((r) => ({
          week: r.week,
          date: r.date,
          home: `nfl.${r.home.toLowerCase()}`,
          away: `nfl.${r.away.toLowerCase()}`,
          homeScore: r.homeScore,
          awayScore: r.awayScore,
        })),
        process.env.BACKTEST_NFL_PRIOR === "1"
          ? { priorRows, priorWeight: 0.35 }
          : {},
      );

      const stats = new Map<string, { pf: number; pa: number; gp: number }>();
      for (const r of train) {
        const h = stats.get(`nfl.${r.home.toLowerCase()}`) ?? { pf: 0, pa: 0, gp: 0 };
        const a = stats.get(`nfl.${r.away.toLowerCase()}`) ?? { pf: 0, pa: 0, gp: 0 };
        h.pf += r.homeScore;
        h.pa += r.awayScore;
        h.gp++;
        a.pf += r.awayScore;
        a.pa += r.homeScore;
        a.gp++;
        stats.set(`nfl.${r.home.toLowerCase()}`, h);
        stats.set(`nfl.${r.away.toLowerCase()}`, a);
      }
      const teams = [...stats.entries()].map(([id, s]) => ({
        teamId: id,
        name: id,
        shortName: id,
        code: id.split(".")[1]!.toUpperCase(),
        pointsFor: s.pf,
        pointsAgainst: s.pa,
        gamesPlayed: s.gp,
      }));

      for (const row of test) {
        const v2 = predictNfl(model, `nfl.${row.home.toLowerCase()}`, `nfl.${row.away.toLowerCase()}`);
        const league = asLeagueId("nfl");
        const game: GameDTO = {
          id: asGameId(`bt-nfl-${row.season}-w${row.week}-${row.away}-${row.home}`),
          league,
          season: asSeasonId(`nfl-${row.season}`),
          week: row.week,
          round: `Semana ${row.week}`,
          startTime: `${row.date}T18:00:00`,
          status: "final",
          home: teamFor(`nfl.${row.home.toLowerCase()}`, league, row.home),
          away: teamFor(`nfl.${row.away.toLowerCase()}`, league, row.away),
          neutralSite: false,
          result: {
            home: row.homeScore,
            away: row.awayScore,
            observedAt: `${row.date}T22:00:00Z`,
            source: "nflverse",
          },
        };
        const baseAnalysis = analyzeNflGame({
          game,
          teams,
          inputsAsOf: `${row.date}T12:00:00Z`,
          publishedAt: `${row.date}T12:00:00Z`,
          source: "nflverse",
        });
        const baseTotal = baseAnalysis.probabilities.find((p) => p.market === "totals" && p.selection === "Más");
        const line = baseTotal?.line ?? Math.floor(baseAnalysis.projection.total) + 0.5;
        const baseOver = baseTotal?.p ?? 0.5;
        const naive = naiveNfl(train, line);
        const v2Over = 1 - normalCdf((line - v2.total) / Math.max(1, model.sigmaTotal));

        const outcome = { result1x2: 0 as const, homeScore: row.homeScore, awayScore: row.awayScore };
        const v2Prediction = { pHome: v2.pHome, pOver: v2Over, totalLine: line };
        const basePrediction = { pHome: baseAnalysis.x12[0], pOver: baseOver, totalLine: line };
        const naivePrediction = { pHome: naive.pHome, pOver: naive.pOver, totalLine: line };

        rowsV2.push({ prediction: v2Prediction, outcome });
        rowsBase.push({ prediction: basePrediction, outcome });
        rowsNaive.push({ prediction: naivePrediction, outcome });

        const homeWon = row.homeScore > row.awayScore;
        const loss = (p: number) => -Math.log(Math.max(homeWon ? p : 1 - p, 1e-12));
        losses.v2.push(loss(v2Prediction.pHome));
        losses.baseline.push(loss(basePrediction.pHome));
        losses.naive.push(loss(naivePrediction.pHome));
        evaluated++;
      }
    }
  }

  return { rowsV2, rowsBase, rowsNaive, losses, evaluated };
}

/**
 * Ajusta la temperatura con la primera parte del histórico y la evalúa en la parte final
 * (holdout temporal). Nada del holdout se usa para elegir T.
 */
function holdoutCalibration(
  samples: readonly CalibrationSample[],
  fraction = 0.6,
): {
  temperature: number;
  fittedOn: number;
  holdout: number;
  rawLogLoss: number;
  calibratedLogLoss: number;
  rawEce: number;
  calibratedEce: number;
} {
  const cut = Math.max(1, Math.floor(samples.length * fraction));
  const train = samples.slice(0, cut);
  const holdout = samples.slice(cut);
  const { temperature } = fitTemperature(train);
  return {
    temperature,
    fittedOn: train.length,
    holdout: holdout.length,
    rawLogLoss: meanLogLoss(holdout),
    calibratedLogLoss: meanLogLoss(holdout, temperature),
    rawEce: expectedCalibrationError(holdout),
    calibratedEce: expectedCalibrationError(holdout, temperature),
  };
}

function fmt(metrics: ModelMetrics): string {  return [
    `n=${metrics.n}`,
    `logLoss=${metrics.logLoss1x2.toFixed(4)}`,
    `brier=${metrics.brier1x2.toFixed(4)}`,
    `acc=${(metrics.accuracy * 100).toFixed(1)}%`,
    `ece=${metrics.ece.toFixed(4)}`,
  ].join(" · ");
}

function reportBlock(name: string, v2: ModelMetrics, base: ModelMetrics, naive: ModelMetrics, bootstrap: ReturnType<typeof pairedBootstrap>) {
  const better1x2 = v2.logLoss1x2 < base.logLoss1x2;
  return {
    name,
    v2,
    baseline: base,
    naive,
    betterThanBaseline: better1x2,
    deltaLogLoss: v2.logLoss1x2 - base.logLoss1x2,
    bootstrap,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const seasonsArg = args.find((a) => a.startsWith("--seasons="))?.split("=")[1];
  const footballSeasons = seasonsArg ? seasonsArg.split(",") : ["2025-26", "2026-27"];
  const nflSeasons = [2025, 2026];

  console.log("[backtest] Fútbol:", footballSeasons.join(", "));
  const football = await backtestFootball(footballSeasons);
  const footballMetrics = {
    v2: evaluateFootball(football.rowsV2),
    baseline: evaluateFootball(football.rowsBase),
    naive: evaluateFootball(football.rowsNaive),
  };
  const footballBoot = pairedBootstrap(football.losses.baseline, football.losses.v2);

  const footballSamples = football.rowsV2.map((row) => ({
    probs: row.prediction.p1x2,
    outcome: row.outcome.result1x2,
  }));
  const footballCalibration = holdoutCalibration(footballSamples);

  console.log("\n=== FÚTBOL (Premier League, walk-forward) ===");
  console.log("v2      ", fmt(footballMetrics.v2));
  console.log("baseline", fmt(footballMetrics.baseline));
  console.log("naive   ", fmt(footballMetrics.naive));
  console.log(
    `Δ logLoss (v2 - baseline) = ${footballBoot.meanDiff.toFixed(4)} · IC95 [${footballBoot.lower.toFixed(4)}, ${footballBoot.upper.toFixed(4)}] · n=${football.evaluated}`,
  );
  console.log(
    `calibración: T=${footballCalibration.temperature.toFixed(2)} · holdout logLoss ${footballCalibration.rawLogLoss.toFixed(4)} -> ${footballCalibration.calibratedLogLoss.toFixed(4)} · ECE ${(footballCalibration.rawEce * 100).toFixed(1)}% -> ${(footballCalibration.calibratedEce * 100).toFixed(1)}%`,
  );

  console.log("\n[backtest] NFL:", nflSeasons.join(", "));
  const nfl = await backtestNfl(nflSeasons);
  const nflMetrics = {
    v2: evaluateNfl(nfl.rowsV2),
    baseline: evaluateNfl(nfl.rowsBase),
    naive: evaluateNfl(nfl.rowsNaive),
  };
  const nflBoot = pairedBootstrap(nfl.losses.baseline, nfl.losses.v2);

  const nflSamples = nfl.rowsV2.map((row) => ({
    probs: [row.prediction.pHome, 1 - row.prediction.pHome],
    outcome: row.outcome.homeScore > row.outcome.awayScore ? 0 : 1,
  }));
  const nflCalibration = holdoutCalibration(nflSamples);

  console.log("\n=== NFL (walk-forward) ===");
  console.log("v2      ", fmt(nflMetrics.v2));
  console.log("baseline", fmt(nflMetrics.baseline));
  console.log("naive   ", fmt(nflMetrics.naive));
  console.log(
    `Δ logLoss (v2 - baseline) = ${nflBoot.meanDiff.toFixed(4)} · IC95 [${nflBoot.lower.toFixed(4)}, ${nflBoot.upper.toFixed(4)}] · n=${nfl.evaluated}`,
  );
  console.log(
    `calibración: T=${nflCalibration.temperature.toFixed(2)} · holdout logLoss ${nflCalibration.rawLogLoss.toFixed(4)} -> ${nflCalibration.calibratedLogLoss.toFixed(4)} · ECE ${(nflCalibration.rawEce * 100).toFixed(1)}% -> ${(nflCalibration.calibratedEce * 100).toFixed(1)}%`,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    football: {
      seasons: footballSeasons,
      ...reportBlock("Premier League", footballMetrics.v2, footballMetrics.baseline, footballMetrics.naive, footballBoot),
    },
    nfl: {
      seasons: nflSeasons,
      ...reportBlock("NFL", nflMetrics.v2, nflMetrics.baseline, nflMetrics.naive, nflBoot),
    },
    calibration: {
      football: footballCalibration,
      nfl: nflCalibration,
      note:
        "T se ajusta con el 60% inicial y se evalúa en el 40% final. En fútbol mejora log-loss pero empeora ECE; en NFL no mejora. No se aplica en producción.",
    },
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(resolve(OUTPUT_DIR, "backtest-v2.json"), JSON.stringify(report, null, 2) + "\n", "utf8");

  const md = [
    "# Backtest walk-forward de los modelos v2",
    "",
    `Generado: ${report.generatedAt}`,
    "",
    "## Premier League",
    "",
    "| Modelo | n | LogLoss 1X2 | Brier 1X2 | LogLoss O/U 2.5 | LogLoss BTTS | Acierto | ECE |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    `| v2 | ${footballMetrics.v2.n} | ${footballMetrics.v2.logLoss1x2.toFixed(4)} | ${footballMetrics.v2.brier1x2.toFixed(4)} | ${footballMetrics.v2.logLossOver.toFixed(4)} | ${(footballMetrics.v2.logLossBtts ?? 0).toFixed(4)} | ${(footballMetrics.v2.accuracy * 100).toFixed(1)}% | ${footballMetrics.v2.ece.toFixed(4)} |`,
    `| Baseline 0 | ${footballMetrics.baseline.n} | ${footballMetrics.baseline.logLoss1x2.toFixed(4)} | ${footballMetrics.baseline.brier1x2.toFixed(4)} | ${footballMetrics.baseline.logLossOver.toFixed(4)} | ${(footballMetrics.baseline.logLossBtts ?? 0).toFixed(4)} | ${(footballMetrics.baseline.accuracy * 100).toFixed(1)}% | ${footballMetrics.baseline.ece.toFixed(4)} |`,
    `| Ingenuo | ${footballMetrics.naive.n} | ${footballMetrics.naive.logLoss1x2.toFixed(4)} | ${footballMetrics.naive.brier1x2.toFixed(4)} | ${footballMetrics.naive.logLossOver.toFixed(4)} | ${(footballMetrics.naive.logLossBtts ?? 0).toFixed(4)} | ${(footballMetrics.naive.accuracy * 100).toFixed(1)}% | ${footballMetrics.naive.ece.toFixed(4)} |`,
    "",
    `Δ logLoss (v2 − Baseline 0): **${footballBoot.meanDiff.toFixed(4)}**, IC 95% [${footballBoot.lower.toFixed(4)}, ${footballBoot.upper.toFixed(4)}].`,
    "",
    "## NFL",
    "",
    "| Modelo | n | LogLoss ML | Brier ML | LogLoss Total | Acierto | ECE |",
    "|---|---:|---:|---:|---:|---:|---:|",
    `| v2 | ${nflMetrics.v2.n} | ${nflMetrics.v2.logLoss1x2.toFixed(4)} | ${nflMetrics.v2.brier1x2.toFixed(4)} | ${nflMetrics.v2.logLossOver.toFixed(4)} | ${(nflMetrics.v2.accuracy * 100).toFixed(1)}% | ${nflMetrics.v2.ece.toFixed(4)} |`,
    `| Baseline 0 | ${nflMetrics.baseline.n} | ${nflMetrics.baseline.logLoss1x2.toFixed(4)} | ${nflMetrics.baseline.brier1x2.toFixed(4)} | ${nflMetrics.baseline.logLossOver.toFixed(4)} | ${(nflMetrics.baseline.accuracy * 100).toFixed(1)}% | ${nflMetrics.baseline.ece.toFixed(4)} |`,
    `| Ingenuo | ${nflMetrics.naive.n} | ${nflMetrics.naive.logLoss1x2.toFixed(4)} | ${nflMetrics.naive.brier1x2.toFixed(4)} | ${nflMetrics.naive.logLossOver.toFixed(4)} | ${(nflMetrics.naive.accuracy * 100).toFixed(1)}% | ${nflMetrics.naive.ece.toFixed(4)} |`,
    "",
    `Δ logLoss (v2 − Baseline 0): **${nflBoot.meanDiff.toFixed(4)}**, IC 95% [${nflBoot.lower.toFixed(4)}, ${nflBoot.upper.toFixed(4)}].`,
    "",
    "> Menor es mejor. Un Δ negativo significa que v2 pierde menos que el Baseline 0.",
    "",
    "## Calibración por temperatura (holdout temporal)",
    "",
    "| Liga | T | n ajuste | n holdout | logLoss crudo | logLoss calibrado | ECE crudo | ECE calibrado |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    `| Premier League | ${footballCalibration.temperature.toFixed(2)} | ${footballCalibration.fittedOn} | ${footballCalibration.holdout} | ${footballCalibration.rawLogLoss.toFixed(4)} | ${footballCalibration.calibratedLogLoss.toFixed(4)} | ${(footballCalibration.rawEce * 100).toFixed(1)}% | ${(footballCalibration.calibratedEce * 100).toFixed(1)}% |`,
    `| NFL | ${nflCalibration.temperature.toFixed(2)} | ${nflCalibration.fittedOn} | ${nflCalibration.holdout} | ${nflCalibration.rawLogLoss.toFixed(4)} | ${nflCalibration.calibratedLogLoss.toFixed(4)} | ${(nflCalibration.rawEce * 100).toFixed(1)}% | ${(nflCalibration.calibratedEce * 100).toFixed(1)}% |`,
    "",
    "> La temperatura mejora el log-loss de fútbol pero empeora su ECE, y en NFL no mejora: **no se aplica en producción**.",
    "",
  ].join("\n");

  writeFileSync(resolve(OUTPUT_DIR, "BACKTEST-V2.md"), md, "utf8");
  console.log(`\n[backtest] Reportes en ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error("[backtest] Error:", err);
  process.exit(1);
});
