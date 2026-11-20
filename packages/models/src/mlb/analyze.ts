/**
 * `GameAnalysis` para MLB a partir de las ratings walk-forward (`ratings.ts`).
 *
 * Mercados publicados:
 *  - Ganador (ML, incluye entradas extra)
 *  - Run line (±1.5 carreras)
 *  - Total de carreras (Over/Under, con resolución de entradas extra)
 *  - Carreras por equipo
 * FD-16: cero menciones a proveedores o algoritmos internos en la copia visible.
 */
import {
  asMarketKey,
  formatCutTimestamp,
  type AnalysisMarketGroup,
  type GameAnalysis,
  type GameDTO,
  type MarketProbability,
} from "@pitchlab/contracts";
import { candidatesFromGroups, confidenceIndex, selectPicks } from "../picks.js";
import type { MlbPrediction } from "./ratings.js";

export interface MlbAnalysisInput {
  game: GameDTO;
  prediction: MlbPrediction;
  gamesSeen: number;
  homeGamesPlayed: number;
  awayGamesPlayed: number;
  homeStarterName?: string;
  awayStarterName?: string;
  inputsAsOf: string;
  publishedAt: string;
  source: string;
}

const clampP = (p: number) => Math.min(1 - 1e-4, Math.max(1e-4, p));

function halfLine(x: number): number {
  const h = Math.round(x * 2) / 2;
  return Number.isInteger(h) ? h + 0.5 : h;
}

function poissonPmf(lambda: number, max: number): number[] {
  const out = [Math.exp(-Math.max(0.05, lambda))];
  for (let i = 1; i <= max; i++) {
    out.push((out[i - 1]! * Math.max(0.05, lambda)) / i);
  }
  return out;
}

/**
 * Construye el análisis completo de un partido MLB respetando contratos y Cero-Fuga.
 */
export function analyzeMlbGame(input: MlbAnalysisInput): GameAnalysis {
  const { game, prediction: p, inputsAsOf, publishedAt, source } = input;
  const max = 20;
  const ph = poissonPmf(p.expectedHome, max);
  const pa = poissonPmf(p.expectedAway, max);

  const totalLine = halfLine(p.expectedTotal);
  const hLine = halfLine(p.expectedHome);
  const aLine = halfLine(p.expectedAway);

  let homeWin = 0;
  let homeByTwo = 0;
  let awayByTwo = 0;
  let over = 0;
  let homeOver = 0;
  let awayOver = 0;

  for (let i = 0; i <= max; i++) {
    for (let j = 0; j <= max; j++) {
      const pr = ph[i]! * pa[j]!;
      if (i === j) {
        // Desempate en entradas extra suma al menos +1 carrera al ganador
        homeWin += pr * p.pHome;
        if (i + j + 1 > totalLine) over += pr;
        if (i + 1 > hLine) homeOver += pr * p.pHome;
        if (i > hLine) homeOver += pr * (1 - p.pHome);
        if (j + 1 > aLine) awayOver += pr * (1 - p.pHome);
        if (j > aLine) awayOver += pr * p.pHome;
        continue;
      }
      if (i > j) homeWin += pr;
      if (i - j >= 2) homeByTwo += pr;
      if (j - i >= 2) awayByTwo += pr;
      if (i + j > totalLine) over += pr;
      if (i > hLine) homeOver += pr;
      if (j > aLine) awayOver += pr;
    }
  }

  const pHome = clampP(0.5 * p.pHome + 0.5 * homeWin);
  const pAway = clampP(1 - pHome);
  const homeFav = pHome >= 0.5;
  const runLine = homeFav ? -1.5 : 1.5;
  const coverHome = clampP(homeFav ? homeByTwo : 1 - awayByTwo);
  const coverAway = clampP(1 - coverHome);
  const pOver = clampP(over);
  const pUnder = clampP(1 - pOver);
  const pHomeOver = clampP(homeOver);
  const pAwayOver = clampP(awayOver);

  const row = (market: string, selection: string, label: string, prob: number, line?: number) => ({
    market: asMarketKey(market),
    selection,
    label,
    ...(line !== undefined ? { line } : {}),
    p: prob,
    fairOdds: 1 / prob,
  });

  const sign = (x: number) => (x > 0 ? "+" : "");
  const marketGroups: AnalysisMarketGroup[] = [
    {
      group: "Ganador",
      rows: [
        row("h2h", "home", `${game.home.shortName} gana`, pHome),
        row("h2h", "away", `${game.away.shortName} gana`, pAway),
      ],
    },
    {
      group: `Run line ${game.home.code} ${sign(runLine)}${runLine.toFixed(1)}`,
      rows: [
        row("spreads", "home", `${game.home.code} cubre`, coverHome, runLine),
        row("spreads", "away", `${game.away.code} cubre`, coverAway, -runLine),
      ],
    },
    {
      group: `Total ${totalLine.toFixed(1)} carreras`,
      rows: [
        row("totals", "over", `Más de ${totalLine.toFixed(1)} carreras`, pOver, totalLine),
        row("totals", "under", `Menos de ${totalLine.toFixed(1)} carreras`, pUnder, totalLine),
      ],
    },
    {
      group: "Carreras por equipo",
      rows: [
        row("team_totals", "home_over", `${game.home.code} más de ${hLine.toFixed(1)}`, pHomeOver, hLine),
        row("team_totals", "home_under", `${game.home.code} menos de ${hLine.toFixed(1)}`, clampP(1 - pHomeOver), hLine),
        row("team_totals", "away_over", `${game.away.code} más de ${aLine.toFixed(1)}`, pAwayOver, aLine),
        row("team_totals", "away_under", `${game.away.code} menos de ${aLine.toFixed(1)}`, clampP(1 - pAwayOver), aLine),
      ],
    },
  ];

  const probabilities: MarketProbability[] = marketGroups.flatMap((g) =>
    g.rows.map((r) => ({ market: r.market, selection: r.label, line: r.line, p: r.p, fairOdds: r.fairOdds })),
  );

  const cut = formatCutTimestamp(inputsAsOf);
  const steps = [
    `Sincronizando MLB · corte ${cut}`,
    `Ofensiva y pitcheo actualizados partido a partido (${input.gamesSeen} encuentros)`,
    "Expectativa de carreras ajustada por localía y abridor",
    `Proyección ${p.expectedHome.toFixed(1)} – ${p.expectedAway.toFixed(1)} carreras · margen ${sign(p.expectedMargin)}${p.expectedMargin.toFixed(1)}`,
    "Simulando 9 entradas y desempate de entradas extra",
    `${probabilities.length} mercados calculados`,
  ];

  const restText = (r: number | null) =>
    r === null ? "sin dato" : r === 0 ? "jugó ayer" : `${r} días de descanso`;
  const factors = [
    {
      key: "home_projection",
      label: "Local",
      value: `${p.expectedHome.toFixed(1)} car proyectadas`,
      detail: `${input.homeGamesPlayed} juegos esta temporada`,
    },
    {
      key: "away_projection",
      label: "Visitante",
      value: `${p.expectedAway.toFixed(1)} car proyectadas`,
      detail: `${input.awayGamesPlayed} juegos esta temporada`,
    },
    {
      key: "rest",
      label: "Descanso",
      value: `${game.home.code}: ${restText(p.restHome)}`,
      detail: `${game.away.code}: ${restText(p.restAway)}`,
    },
  ];

  if (input.homeStarterName || input.awayStarterName) {
    factors.push({
      key: "pitchers",
      label: "Abridores",
      value: `${game.home.code}: ${input.homeStarterName ?? "Por definir"}`,
      detail: `${game.away.code}: ${input.awayStarterName ?? "Por definir"}`,
    });
  }

  const picks = selectPicks(candidatesFromGroups(marketGroups), { maxScore: 30 });
  const confidence = confidenceIndex({
    favorite: Math.max(pHome, pAway),
    minGamesPlayed: Math.min(input.homeGamesPlayed, input.awayGamesPlayed),
    outcomes: 2,
  });

  const leader = pHome >= pAway ? game.home.shortName : game.away.shortName;
  const why = [
    `${leader} gana en ${Math.round(Math.max(pHome, pAway) * 100)} % de las simulaciones en 9 entradas y entradas extra.`,
    `Carreras esperadas: ${p.expectedTotal.toFixed(1)} totales (${p.expectedHome.toFixed(1)} de ${game.home.shortName} y ${p.expectedAway.toFixed(1)} de ${game.away.shortName}).`,
  ];

  return {
    game: game.id,
    picks: picks.map((pk) => ({ ...pk, market: asMarketKey(pk.market) })),
    confidence,
    insights: { why },
    model: {
      id: "pitchlab-kepler-mlb",
      version: "1.0.0",
      status: "candidate",
      label: "Modelo PitchLab · MLB",
    },
    projection: {
      home: p.expectedHome,
      away: p.expectedAway,
      total: p.expectedTotal,
      margin: p.expectedMargin,
    },
    x12: [pHome, 0, pAway],
    probabilities,
    marketGroups,
    factors,
    steps,
    inputsAsOf,
    publishedAt,
    source,
  };
}
