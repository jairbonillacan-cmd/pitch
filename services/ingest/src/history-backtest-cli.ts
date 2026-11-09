/**
 * CLI del benchmark histórico: `pnpm backtest:history [flags]`.
 *
 *   --leagues=premier-league,nfl   ligas a evaluar (por defecto PL y NFL)
 *   --window-days=1095             ventana móvil de entrenamiento
 *   --min-train=200                mínimo de partidos para ajustar
 *   --bootstrap=2000               iteraciones del bootstrap pareado
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  renderHistoryBacktestReport,
  runHistoryBacktest,
} from "./history-backtest.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..");
const OUTPUT_DIR = resolve(ROOT_DIR, "Reportes", "modelos");

interface CliOptions {
  leagues?: string[];
  windowDays?: number;
  minTrainRows?: number;
  bootstrapIterations?: number;
  includeHistoricalResearch?: boolean;
  includeStack?: boolean;
  exportFeaturesPath?: string;
}

function parsePositiveInt(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} debe ser un entero positivo: '${raw}'.`);
  }
  return value;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {};
  for (const arg of argv) {
    if (arg === "--include-research-history") {
      options.includeHistoricalResearch = true;
      continue;
    }
    if (arg === "--with-stack") {
      options.includeStack = true;
      continue;
    }
    const match = arg.match(/^--([a-z-]+)=(.+)$/);
    if (!match) throw new Error(`Argumento no reconocido: '${arg}'.`);
    const [, key, value] = match;
    switch (key) {
      case "leagues":
        options.leagues = value!
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        break;
      case "window-days":
        options.windowDays = parsePositiveInt(value!, "--window-days");
        break;
      case "min-train":
        options.minTrainRows = parsePositiveInt(value!, "--min-train");
        break;
      case "bootstrap":
        options.bootstrapIterations = parsePositiveInt(value!, "--bootstrap");
        break;
      case "export-features":
        options.exportFeaturesPath = resolve(ROOT_DIR, value!);
        break;
      default:
        throw new Error(`Flag desconocida: '--${key}'.`);
    }
  }
  return options;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  console.log("[backtest-histórico] Ejecutando walk-forward sobre data/history…");

  const report = runHistoryBacktest({
    rootDir: ROOT_DIR,
    ...(options.leagues ? { leagues: options.leagues } : {}),
    ...(options.windowDays ? { windowDays: options.windowDays } : {}),
    ...(options.minTrainRows ? { minTrainRows: options.minTrainRows } : {}),
    ...(options.bootstrapIterations
      ? { bootstrapIterations: options.bootstrapIterations }
      : {}),
    ...(options.includeHistoricalResearch
      ? { includeHistoricalResearch: true }
      : {}),
    ...(options.includeStack ? { includeStack: true } : {}),
    ...(options.exportFeaturesPath
      ? { exportFeaturesPath: options.exportFeaturesPath }
      : {}),
  });

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    resolve(OUTPUT_DIR, "backtest-historico.json"),
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );
  writeFileSync(
    resolve(OUTPUT_DIR, "BACKTEST-HISTORICO.md"),
    renderHistoryBacktestReport(report, options.windowDays ?? 1095),
    "utf8",
  );

  for (const result of report.football) {
    console.log(
      `[fútbol] ${result.league}: n=${result.predictions} · LogLoss ${result.model.logLoss1x2.toFixed(4)} vs ingenuo ${result.naive.logLoss1x2.toFixed(4)} · Δ ${result.deltaNaive.meanDiff.toFixed(4)} [${result.deltaNaive.lower.toFixed(4)}, ${result.deltaNaive.upper.toFixed(4)}]`,
    );
  }
  if (report.nfl) {
    console.log(
      `[NFL] n=${report.nfl.predictions} · LogLoss ML ${report.nfl.model.logLoss1x2.toFixed(4)} vs ingenuo ${report.nfl.naive.logLoss1x2.toFixed(4)} · Δ ${report.nfl.deltaNaive.meanDiff.toFixed(4)} [${report.nfl.deltaNaive.lower.toFixed(4)}, ${report.nfl.deltaNaive.upper.toFixed(4)}]`,
    );
    if (report.nfl.market && report.nfl.deltaMarket) {
      console.log(
        `[NFL] mercado sin vig (n=${report.nfl.market.n}): LogLoss ${report.nfl.market.logLossMl.toFixed(4)} · Δ modelo−mercado ${report.nfl.deltaMarket.meanDiff.toFixed(4)} [${report.nfl.deltaMarket.lower.toFixed(4)}, ${report.nfl.deltaMarket.upper.toFixed(4)}]`,
      );
    }
  }
  console.log(`\n[backtest-histórico] Reportes en ${OUTPUT_DIR}`);
}

try {
  main();
} catch (error) {
  console.error("[backtest-histórico] Error:", error);
  process.exit(1);
}
