/**
 * `GameAnalysis` para NBA y NHL a partir de las ratings incrementales (`ratings.ts`).
 *
 * Mercados:
 *  - NBA: ganador, spread (Normal sobre el margen) y total (Normal sobre el total).
 *  - NHL: ganador con tiempo extra incluido, puck line ±1.5 y total, todos sobre la malla de
 *    Poisson de tiempo regular + el gol del tiempo extra/penales cuando hay empate (así cuentan
 *    las casas el marcador final).
 * FD-16: sin nombres de proveedores ni algoritmos en los textos.
 */
import {
  asMarketKey,
  formatCutTimestamp,
  type AnalysisMarketGroup,
  type GameAnalysis,
  type GameDTO,
  type MarketProbability,
} from "@pitchlab/contracts";
import { normalCdf } from "../math.js";
import { candidatesFromGroups, confidenceIndex, selectPicks } from "../picks.js";
import type { NhlPrediction, UsPrediction } from "./ratings.js";

export interface UsAnalysisInput {
  sport: "nba" | "nhl";
  game: GameDTO;
  prediction: UsPrediction | NhlPrediction;
  /** Partidos con los que se calcularon las ratings. */
  gamesSeen: number;
  /** Partidos jugados por cada equipo en la temporada (para la confianza). */
  homeGamesPlayed: number;
  awayGamesPlayed: number;
  inputsAsOf: string;
  publishedAt: string;
  source: string;
  /** NBA: desviación del margen y del total. */
  sigmaMargin?: number;
  sigmaTotal?: number;
  /** NHL: probabilidad de que el local gane el tiempo extra si empatan en regulación. */
  pHomeOvertime?: number;
}

const clampP = (p: number) => Math.min(1 - 1e-4, Math.max(1e-4, p));
const half = (x: number) => Math.round(x * 2) / 2;
/** Línea con .5 para que no haya empate con la casa. */
const halfLine = (x: number) => {
  const h = half(x);
  return Number.isInteger(h) ? h + 0.5 : h;
};

function poissonPmf(lambda: number, max: number): number[] {
  const out = [Math.exp(-lambda)];
  for (let g = 1; g <= max; g++) out.push((out[g - 1]! * lambda) / g);
  return out;
}

interface Markets {
  pHome: number;
  spread: { line: number; home: number; away: number };
  total: { line: number; over: number; under: number };
  teamTotals: { home: { line: number; over: number }; away: { line: number; over: number } };
}

function nbaMarkets(p: UsPrediction, sigmaMargin: number, sigmaTotal: number): Markets {
  const homeLine = -halfLine(p.expectedMargin);
  const coverHome = clampP(normalCdf((p.expectedMargin + homeLine) / sigmaMargin));
  const totalLine = halfLine(p.expectedTotal);
  const over = clampP(1 - normalCdf((totalLine - p.expectedTotal) / sigmaTotal));
  // Cada equipo: la mitad de la varianza del total, aproximadamente.
  const sigmaTeam = sigmaTotal / Math.SQRT2;
  const hLine = halfLine(p.expectedHome);
  const aLine = halfLine(p.expectedAway);
  return {
    pHome: clampP(p.pHome),
    spread: { line: homeLine, home: coverHome, away: 1 - coverHome },
    total: { line: totalLine, over, under: 1 - over },
    teamTotals: {
      home: { line: hLine, over: clampP(1 - normalCdf((hLine - p.expectedHome) / sigmaTeam)) },
      away: { line: aLine, over: clampP(1 - normalCdf((aLine - p.expectedAway) / sigmaTeam)) },
    },
  };
}

function nhlMarkets(p: UsPrediction, pHomeOt: number): Markets {
  const max = 12;
  const ph = poissonPmf(p.expectedHome, max);
  const pa = poissonPmf(p.expectedAway, max);
  const totalLine = p.expectedTotal >= 6.25 ? 6.5 : 5.5;
  let homeWin = 0;
  let homeByTwo = 0;
  let awayByTwo = 0;
  let over = 0;
  let homeOver = 0;
  let awayOver = 0;
  const hLine = p.expectedHome >= 3.25 ? 3.5 : 2.5;
  const aLine = p.expectedAway >= 3.25 ? 3.5 : 2.5;
  for (let i = 0; i <= max; i++) {
    for (let j = 0; j <= max; j++) {
      const pr = ph[i]! * pa[j]!;
      if (i === j) {
        // Empate en regulación: el ganador del tiempo extra/penales suma un gol.
        homeWin += pr * pHomeOt;
        if (i + j + 1 > totalLine) over += pr;
        if (i + 1 > hLine) homeOver += pr * pHomeOt;
        if (i > hLine) homeOver += pr * (1 - pHomeOt);
        if (j + 1 > aLine) awayOver += pr * (1 - pHomeOt);
        if (j > aLine) awayOver += pr * pHomeOt;
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
  // Puck line: el favorito da −1.5.
  const homeFav = homeWin >= 0.5;
  const line = homeFav ? -1.5 : 1.5;
  const coverHome = homeFav ? homeByTwo : 1 - awayByTwo;
  return {
    pHome: clampP(homeWin),
    spread: { line, home: clampP(coverHome), away: clampP(1 - coverHome) },
    total: { line: totalLine, over: clampP(over), under: clampP(1 - over) },
    teamTotals: { home: { line: hLine, over: clampP(homeOver) }, away: { line: aLine, over: clampP(awayOver) } },
  };
}

export function analyzeUsGame(input: UsAnalysisInput): GameAnalysis {
  const { sport, game, prediction: p, inputsAsOf, publishedAt, source } = input;
  const nba = sport === "nba";
  const unit = nba ? "pts" : "goles";
  const m = nba
    ? nbaMarkets(p, input.sigmaMargin ?? 13, input.sigmaTotal ?? 18.5)
    : nhlMarkets(p, input.pHomeOvertime ?? 0.5);
  const pHome = m.pHome;
  const pAway = 1 - pHome;
  const sign = (x: number) => (x > 0 ? "+" : "");
  const spreadName = nba ? "Spread" : "Puck line";
  const row = (market: string, selection: string, label: string, prob: number, line?: number) => ({
    market: asMarketKey(market),
    selection,
    label,
    ...(line !== undefined ? { line } : {}),
    p: prob,
    fairOdds: 1 / prob,
  });

  const marketGroups: AnalysisMarketGroup[] = [
    {
      group: nba ? "Ganador" : "Ganador (incluye tiempo extra)",
      rows: [
        row("h2h", "home", `${game.home.shortName} gana`, pHome),
        row("h2h", "away", `${game.away.shortName} gana`, pAway),
      ],
    },
    {
      group: `${spreadName} ${game.home.code} ${sign(m.spread.line)}${m.spread.line.toFixed(1)}`,
      rows: [
        row("spreads", "home", `${game.home.code} cubre`, m.spread.home, m.spread.line),
        row("spreads", "away", `${game.away.code} cubre`, m.spread.away, -m.spread.line),
      ],
    },
    {
      group: `Total ${m.total.line.toFixed(1)}`,
      rows: [
        row("totals", "over", "Más", m.total.over, m.total.line),
        row("totals", "under", "Menos", m.total.under, m.total.line),
      ],
    },
    {
      group: nba ? "Puntos por equipo" : "Goles por equipo",
      rows: [
        row("team_totals", "home_over", `${game.home.code} más de ${m.teamTotals.home.line.toFixed(1)}`, m.teamTotals.home.over, m.teamTotals.home.line),
        row("team_totals", "home_under", `${game.home.code} menos de ${m.teamTotals.home.line.toFixed(1)}`, clampP(1 - m.teamTotals.home.over), m.teamTotals.home.line),
        row("team_totals", "away_over", `${game.away.code} más de ${m.teamTotals.away.line.toFixed(1)}`, m.teamTotals.away.over, m.teamTotals.away.line),
        row("team_totals", "away_under", `${game.away.code} menos de ${m.teamTotals.away.line.toFixed(1)}`, clampP(1 - m.teamTotals.away.over), m.teamTotals.away.line),
      ],
    },
  ];

  const probabilities: MarketProbability[] = marketGroups.flatMap((g) =>
    g.rows.map((r) => ({ market: r.market, selection: r.label, line: r.line, p: r.p, fairOdds: r.fairOdds })),
  );

  const digits = nba ? 1 : 2;
  const cut = formatCutTimestamp(inputsAsOf);
  const steps = [
    `Sincronizando ${nba ? "NBA" : "NHL"} · corte ${cut}`,
    `Ataque y defensa actualizados partido a partido (${input.gamesSeen} partidos)`,
    nba ? "Localía y altitud incluidas" : "Goles de tiempo regular separados del tiempo extra",
    `Proyección ${p.expectedHome.toFixed(digits)} – ${p.expectedAway.toFixed(digits)} · margen ${sign(p.expectedMargin)}${p.expectedMargin.toFixed(digits)}`,
    nba ? "Simulando escenarios de margen y total" : "Simulando marcadores y tiempo extra",
    `${probabilities.length} mercados listos`,
  ];

  const restText = (r: number | null) => (r === null ? "sin dato" : r === 0 ? "jugó ayer" : `${r} días de descanso`);
  const factors = [
    { key: "home_projection", label: "Local", value: `${p.expectedHome.toFixed(digits)} ${unit} proyectados`, detail: `${input.homeGamesPlayed} partidos esta temporada` },
    { key: "away_projection", label: "Visitante", value: `${p.expectedAway.toFixed(digits)} ${unit} proyectados`, detail: `${input.awayGamesPlayed} partidos esta temporada` },
    { key: "rest", label: "Descanso", value: `${game.home.code}: ${restText(p.restHome)}`, detail: `${game.away.code}: ${restText(p.restAway)}` },
  ];
  if (!nba && "pRegulationDraw" in p) {
    factors.push({
      key: "overtime",
      label: "Tiempo extra",
      value: `${Math.round(p.pRegulationDraw * 100)} % de llegar empatados al final`,
      detail: "se define en tiempo extra o penales",
    });
  }

  const picks = selectPicks(candidatesFromGroups(marketGroups), { maxScore: 70 });
  const confidence = confidenceIndex({
    favorite: Math.max(pHome, pAway),
    minGamesPlayed: Math.min(input.homeGamesPlayed, input.awayGamesPlayed),
    outcomes: 2,
  });
  const leader = pHome >= pAway ? game.home.shortName : game.away.shortName;
  const why = [
    `${leader} gana en ${Math.round(Math.max(pHome, pAway) * 100)} % de los escenarios${nba ? `, por ${Math.abs(p.expectedMargin).toFixed(1)} puntos en promedio` : ""}.`,
    `Se esperan ${p.expectedTotal.toFixed(digits)} ${unit}: ${p.expectedHome.toFixed(digits)} de ${game.home.shortName} y ${p.expectedAway.toFixed(digits)} de ${game.away.shortName}.`,
  ];

  return {
    game: game.id,
    picks: picks.map((pk) => ({ ...pk, market: asMarketKey(pk.market) })),
    confidence,
    insights: { why },
    model: {
      id: `pitchlab-ratings-${sport}`,
      version: "1.0.0",
      status: "candidate",
      label: "Modelo PitchLab · en validación",
    },
    projection: { home: p.expectedHome, away: p.expectedAway, total: p.expectedTotal, margin: p.expectedMargin },
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
