/**
 * Benchmark walk-forward sobre el corpus histórico (`data/history`).
 *
 * Objetivo: medir si el histórico sirve para entrenar, no lucir un número. Cada jornada
 * se predice con lo que se sabía **antes** de jugarla: ventana móvil de días, sin mirar
 * el futuro, y se compara contra una referencia ingenua (tasas base) y, en la NFL, contra
 * el mercado sin vig de las moneylines de cierre de nflverse (uso interno de investigación).
 *
 * Es una evaluación `retro`: no cuenta como track record (PREDICTION_ARCHITECTURE.md §2).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateFootball,
  evaluateNfl,
  fitDixonColes,
  fitNflRatings,
  normalCdf,
  pairedBootstrap,
  predictFootball,
  predictNfl,
  type FootballPredictionRow,
  type ModelMetrics,
  type NflPredictionRow,
  type Outcome,
} from "@pitchlab/models";
import { HistoricalGameSchema, type HistoricalGame } from "./history/schema.js";

const DAY_MS = 86_400_000;

export interface HistoryBacktestOptions {
  rootDir: string;
  leagues?: readonly string[];
  /** Ventana de entrenamiento en días (por defecto 3 temporadas ≈ 1095). */
  windowDays?: number;
  /** Mínimo de partidos para ajustar el modelo en una jornada. */
  minTrainRows?: number;
  bootstrapIterations?: number;
}

export interface PeriodBlock {
  key: string;
  date: string;
  games: HistoricalGame[];
}

export interface FootballBacktestResult {
  league: string;
  seasons: number;
  blocks: number;
  predictions: number;
  model: ModelMetrics;
  naive: ModelMetrics;
  deltaNaive: { meanDiff: number; lower: number; upper: number };
  brierNaive: number;
}

export interface NflBacktestResult {
  seasons: number;
  blocks: number;
  predictions: number;
  model: ModelMetrics;
  naive: ModelMetrics;
  deltaNaive: { meanDiff: number; lower: number; upper: number };
  market: { n: number; logLossMl: number; brierMl: number } | null;
  deltaMarket: { meanDiff: number; lower: number; upper: number } | null;
  totals: { n: number; modelLogLoss: number; naiveLogLoss: number };
}

export interface HistoryBacktestReport {
  generatedAt: string;
  windowDays: number;
  football: FootballBacktestResult[];
  nfl: NflBacktestResult | null;
  notes: string[];
}

/** Carga un archivo JSONL del histórico validando cada fila. */
export function loadHistoryGames(rootDir: string, league: string): HistoricalGame[] {
  const path = join(rootDir, "data", "history", `${league}.jsonl`);
  if (!existsSync(path)) {
    throw new Error(
      `No existe '${path}'. Genera el histórico primero con \`pnpm history\`.`,
    );
  }
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.map((line) => HistoricalGameSchema.parse(JSON.parse(line)));
}

/** Agrupa partidos por jornada (temporada + torneo + número) ordenados por fecha. */
export function groupIntoPeriods(games: readonly HistoricalGame[]): PeriodBlock[] {
  const blocks = new Map<string, PeriodBlock>();
  for (const game of games) {
    const key = `${game.season}|${game.stage ?? ""}|${game.period}`;
    const existing = blocks.get(key);
    if (existing) {
      existing.games.push(game);
      if (game.date < existing.date) existing.date = game.date;
    } else {
      blocks.set(key, { key, date: game.date, games: [game] });
    }
  }
  return [...blocks.values()]
    .map((block) => ({
      ...block,
      games: [...block.games].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

/** Probabilidad implícita de una cuota americana. */
export function americanToImplied(odds: number): number | null {
  if (!Number.isFinite(odds) || odds === 0) return null;
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

/** Par de probabilidades sin vig (normalización multiplicativa). */
export function noVigPair(
  home: number | null,
  away: number | null,
): { home: number; away: number } | null {
  if (home === null || away === null) return null;
  const sum = home + away;
  if (sum <= 0) return null;
  return { home: home / sum, away: away / sum };
}

function outcomeOf(game: HistoricalGame): Outcome {
  return {
    result1x2: game.homeScore > game.awayScore ? 0 : game.homeScore === game.awayScore ? 1 : 2,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
  };
}

interface NaiveFootball {
  p1x2: [number, number, number];
  pOver25: number;
  pBtts: number;
}

function naiveFootball(train: readonly HistoricalGame[]): NaiveFootball {
  let home = 1;
  let draw = 1;
  let away = 1;
  let over = 1;
  let btts = 1;
  const total = train.length + 3;
  for (const game of train) {
    if (game.homeScore > game.awayScore) home++;
    else if (game.homeScore === game.awayScore) draw++;
    else away++;
    if (game.homeScore + game.awayScore > 2.5) over++;
    if (game.homeScore > 0 && game.awayScore > 0) btts++;
  }
  return {
    p1x2: [home / total, draw / total, away / total],
    pOver25: over / (train.length + 2),
    pBtts: btts / (train.length + 2),
  };
}

function runFootballLeague(
  league: string,
  games: readonly HistoricalGame[],
  options: Required<Pick<HistoryBacktestOptions, "windowDays" | "minTrainRows" | "bootstrapIterations">>,
): FootballBacktestResult {
  const blocks = groupIntoPeriods(games);
  const history: HistoricalGame[] = [];
  const modelRows: Array<{ prediction: FootballPredictionRow; outcome: Outcome }> = [];
  const naiveRows: Array<{ prediction: FootballPredictionRow; outcome: Outcome }> = [];
  const modelLosses: number[] = [];
  const naiveLosses: number[] = [];
  const seasons = new Set<string>();

  for (const block of blocks) {
    const cutoffMs = Date.parse(`${block.date}T00:00:00Z`) - options.windowDays * DAY_MS;
    const train = history.filter((game) => Date.parse(`${game.date}T00:00:00Z`) >= cutoffMs);

    if (train.length >= options.minTrainRows) {
      const model = fitDixonColes(
        train.map((game) => ({
          date: game.date,
          home: game.homeTeam,
          away: game.awayTeam,
          homeGoals: game.homeScore,
          awayGoals: game.awayScore,
        })),
        { referenceDate: block.date },
      );
      const naive = naiveFootball(train);

      for (const game of block.games) {
        const prediction = predictFootball(model, game.homeTeam, game.awayTeam);
        const outcome = outcomeOf(game);
        const modelRow: FootballPredictionRow = {
          p1x2: [
            prediction.probabilities.home,
            prediction.probabilities.draw,
            prediction.probabilities.away,
          ],
          pOver25: prediction.totals.find((total) => total.line === 2.5)?.over ?? 0.5,
          pBtts: prediction.btts.yes,
        };
        modelRows.push({ prediction: modelRow, outcome });
        naiveRows.push({ prediction: naive, outcome });

        modelLosses.push(
          -Math.log(Math.max(modelRow.p1x2[outcome.result1x2]!, 1e-12)),
        );
        naiveLosses.push(
          -Math.log(Math.max(naive.p1x2[outcome.result1x2]!, 1e-12)),
        );
        seasons.add(game.season);
      }
    }

    history.push(...block.games);
  }

  const model = evaluateFootball(modelRows);
  const naive = evaluateFootball(naiveRows);
  return {
    league,
    seasons: seasons.size,
    blocks: blocks.length,
    predictions: modelRows.length,
    model,
    naive,
    deltaNaive: pairedBootstrap(naiveLosses, modelLosses, options.bootstrapIterations),
    brierNaive: naive.brier1x2,
  };
}

function runNfl(
  games: readonly HistoricalGame[],
  options: Required<Pick<HistoryBacktestOptions, "windowDays" | "minTrainRows" | "bootstrapIterations">>,
): NflBacktestResult {
  const blocks = groupIntoPeriods(games);
  const history: HistoricalGame[] = [];
  const modelRows: Array<{ prediction: NflPredictionRow; outcome: Outcome }> = [];
  const naiveRows: Array<{ prediction: NflPredictionRow; outcome: Outcome }> = [];
  const marketRows: Array<{ prediction: NflPredictionRow; outcome: Outcome }> = [];

  const modelLosses: number[] = [];
  const naiveLosses: number[] = [];
  const marketLosses: number[] = [];
  const marketModelLosses: number[] = [];
  const modelTotalLosses: number[] = [];
  const naiveTotalLosses: number[] = [];
  const seasons = new Set<string>();

  for (const block of blocks) {
    const cutoffMs = Date.parse(`${block.date}T00:00:00Z`) - options.windowDays * DAY_MS;
    const train = history.filter((game) => Date.parse(`${game.date}T00:00:00Z`) >= cutoffMs);

    if (train.length >= options.minTrainRows) {
      const model = fitNflRatings(
        train.map((game) => ({
          date: game.date,
          week: game.period,
          home: game.homeTeam,
          away: game.awayTeam,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
        })),
      );

      const trainTotalRate = (line: number): number => {
        if (train.length === 0) return 0.5;
        let over = 0;
        for (const game of train) if (game.homeScore + game.awayScore > line) over++;
        return over / train.length;
      };

      const trainHomeRate = (): number => {
        if (train.length === 0) return 0.5;
        let homeWins = 0;
        for (const game of train) if (game.homeScore > game.awayScore) homeWins++;
        return (homeWins + 1) / (train.length + 2);
      };
      const naiveHome = trainHomeRate();

      for (const game of block.games) {
        const prediction = predictNfl(model, game.homeTeam, game.awayTeam, {
          neutralSite: game.neutralSite,
        });
        const outcome = outcomeOf(game);
        const homeWon = game.homeScore > game.awayScore;

        const closeTotal = game.odds?.total ?? null;
        const line = closeTotal ?? prediction.totals.line;
        const pOverModel =
          1 - normalCdf((line - prediction.total) / Math.max(1, model.sigmaTotal));
        const pOverNaive = trainTotalRate(line);

        const modelPrediction: NflPredictionRow = {
          pHome: prediction.pHome,
          pOver: pOverModel,
          totalLine: line,
        };
        const naivePrediction: NflPredictionRow = {
          pHome: naiveHome,
          pOver: pOverNaive,
          totalLine: line,
        };

        modelRows.push({ prediction: modelPrediction, outcome });
        naiveRows.push({ prediction: naivePrediction, outcome });

        modelLosses.push(
          -Math.log(Math.max(homeWon ? modelPrediction.pHome : 1 - modelPrediction.pHome, 1e-12)),
        );
        naiveLosses.push(
          -Math.log(Math.max(homeWon ? naivePrediction.pHome : 1 - naivePrediction.pHome, 1e-12)),
        );

        if (closeTotal !== null) {
          modelTotalLosses.push(
            -Math.log(
              Math.max(
                game.homeScore + game.awayScore > line ? pOverModel : 1 - pOverModel,
                1e-12,
              ),
            ),
          );
          naiveTotalLosses.push(
            -Math.log(
              Math.max(
                game.homeScore + game.awayScore > line ? pOverNaive : 1 - pOverNaive,
                1e-12,
              ),
            ),
          );
        }

        const impliedHome =
          game.odds?.moneylineHome !== null && game.odds?.moneylineHome !== undefined
            ? americanToImplied(game.odds.moneylineHome)
            : null;
        const impliedAway =
          game.odds?.moneylineAway !== null && game.odds?.moneylineAway !== undefined
            ? americanToImplied(game.odds.moneylineAway)
            : null;
        const market = noVigPair(impliedHome, impliedAway);
        if (market) {
          marketRows.push({
            prediction: { pHome: market.home, pOver: pOverModel, totalLine: line },
            outcome,
          });
          marketLosses.push(-Math.log(Math.max(homeWon ? market.home : market.away, 1e-12)));
          marketModelLosses.push(
            -Math.log(Math.max(homeWon ? modelPrediction.pHome : 1 - modelPrediction.pHome, 1e-12)),
          );
        }

        seasons.add(game.season);
      }
    }

    history.push(...block.games);
  }

  const model = evaluateNfl(modelRows);
  const naive = evaluateNfl(naiveRows);
  const market = marketRows.length > 0 ? evaluateNfl(marketRows) : null;
  const totalOf = (losses: number[]): number =>
    losses.length === 0 ? 0 : losses.reduce((sum, value) => sum + value, 0) / losses.length;

  const deltaMarket =
    market !== null && marketLosses.length > 0
      ? pairedBootstrap(marketLosses, marketModelLosses, options.bootstrapIterations)
      : null;

  return {
    seasons: seasons.size,
    blocks: blocks.length,
    predictions: modelRows.length,
    model,
    naive,
    deltaNaive: pairedBootstrap(naiveLosses, modelLosses, options.bootstrapIterations),
    market:
      market === null
        ? null
        : { n: market.n, logLossMl: market.logLoss1x2, brierMl: market.brier1x2 },
    deltaMarket,
    totals: {
      n: modelTotalLosses.length,
      modelLogLoss: totalOf(modelTotalLosses),
      naiveLogLoss: totalOf(naiveTotalLosses),
    },
  };
}

export function runHistoryBacktest(options: HistoryBacktestOptions): HistoryBacktestReport {
  const leagues = options.leagues ?? ["premier-league", "nfl"];
  const resolved = {
    windowDays: options.windowDays ?? 1095,
    minTrainRows: options.minTrainRows ?? 200,
    bootstrapIterations: options.bootstrapIterations ?? 2000,
  };

  const football: FootballBacktestResult[] = [];
  let nfl: NflBacktestResult | null = null;

  for (const league of leagues) {
    const games = loadHistoryGames(options.rootDir, league);
    if (games.length === 0) continue;
    if (league === "nfl") {
      nfl = runNfl(games, resolved);
    } else {
      football.push(runFootballLeague(league, games, resolved));
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    windowDays: resolved.windowDays,
    football,
    nfl,
    notes: [
      "Evaluación retro walk-forward: cada jornada se predice con datos anteriores a su fecha.",
      "El modelo de fútbol es Dixon-Coles con decaimiento temporal; el de NFL, ratings ridge con localía.",
      "La referencia ingenua usa las tasas base de la ventana de entrenamiento.",
      "El mercado NFL se deriva de las moneylines de cierre de nflverse, sin vig; es solo investigación interna.",
      "Un Δ logLoss negativo significa que el modelo pierde menos que la referencia.",
    ],
  };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Reporte Markdown del benchmark, listo para `Reportes/modelos/`. */
export function renderHistoryBacktestReport(
  report: HistoryBacktestReport,
  windowDays: number,
): string {
  const lines: string[] = [
    "# Benchmark histórico walk-forward",
    "",
    `Generado: ${report.generatedAt}`,
    "",
    `Ventana móvil de entrenamiento: ${windowDays} días. Cada jornada se predice solo con partidos anteriores a su fecha.`,
    "",
    "> Evaluación retro: **no** cuenta como track record (PREDICTION_ARCHITECTURE.md §2).",
    "",
    "## Fútbol (Dixon-Coles)",
    "",
    "| Liga | Temporadas | n | LogLoss 1X2 | Brier | Acierto | LogLoss ingenuo | Δ (IC 95%) |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const result of report.football) {
    lines.push(
      `| ${result.league} | ${result.seasons} | ${result.predictions} | ${result.model.logLoss1x2.toFixed(4)} | ${result.model.brier1x2.toFixed(4)} | ${percent(result.model.accuracy)} | ${result.naive.logLoss1x2.toFixed(4)} | ${result.deltaNaive.meanDiff.toFixed(4)} [${result.deltaNaive.lower.toFixed(4)}, ${result.deltaNaive.upper.toFixed(4)}] |`,
    );
  }

  if (report.nfl) {
    const nfl = report.nfl;
    lines.push(
      "",
      "## NFL (ratings ridge)",
      "",
      "| Métrica | n | Modelo | Ingenuo |",
      "|---|---:|---:|---:|",
      `| LogLoss moneyline | ${nfl.model.n} | ${nfl.model.logLoss1x2.toFixed(4)} | ${nfl.naive.logLoss1x2.toFixed(4)} |`,
      `| Brier moneyline | ${nfl.model.n} | ${nfl.model.brier1x2.toFixed(4)} | ${nfl.naive.brier1x2.toFixed(4)} |`,
      `| Acierto | ${nfl.model.n} | ${percent(nfl.model.accuracy)} | ${percent(nfl.naive.accuracy)} |`,
      `| LogLoss totales en la línea de cierre | ${nfl.totals.n} | ${nfl.totals.modelLogLoss.toFixed(4)} | ${nfl.totals.naiveLogLoss.toFixed(4)} |`,
      "",
      `Δ LogLoss moneyline frente al ingenuo: **${nfl.deltaNaive.meanDiff.toFixed(4)}**, IC 95% [${nfl.deltaNaive.lower.toFixed(4)}, ${nfl.deltaNaive.upper.toFixed(4)}].`,
    );

    if (nfl.market && nfl.deltaMarket) {
      lines.push(
        "",
        `Mercado sin vig (moneylines de cierre de nflverse), ${nfl.market.n} partidos: LogLoss ${nfl.market.logLossMl.toFixed(4)}, Brier ${nfl.market.brierMl.toFixed(4)}.`,
        "",
        `Δ LogLoss frente al mercado: **${nfl.deltaMarket.meanDiff.toFixed(4)}**, IC 95% [${nfl.deltaMarket.lower.toFixed(4)}, ${nfl.deltaMarket.upper.toFixed(4)}].`,
        "",
        "> Las líneas de cierre de nflverse se usan **solo para investigación interna** (CC-BY 4.0; no se publican como cuotas propias).",
      );
    }
  }

  lines.push("", "## Notas metodológicas", "");
  for (const note of report.notes) lines.push(`- ${note}`);
  lines.push(
    "- Un Δ negativo significa que el modelo pierde menos que la referencia; si el IC 95 % cruza el 0, la diferencia no es concluyente.",
    "",
  );
  return lines.join("\n");
}
