/**
 * Productor de `GameAnalysis` para NFL con el modelo v2 (ratings ajustados por rival).
 * Mantiene el contrato visible del pre-MVP. FD-16: sin nombres de proveedores ni algoritmos.
 */
import {
  asMarketKey,
  formatCutTimestamp,
  type AnalysisMarketGroup,
  type GameAnalysis,
  type GameDTO,
  type MarketProbability,
  type TeamSeasonRate,
} from "@pitchlab/contracts";
import { predictNfl, type NflRatingsModel } from "./ratings.js";

export interface NflAnalysisInput {
  game: GameDTO;
  model: NflRatingsModel;
  teamRates: Record<string, TeamSeasonRate>;
  inputsAsOf: string;
  publishedAt: string;
  source: string;
  version?: string;
}

export function analyzeNflGameV2(input: NflAnalysisInput): GameAnalysis {
  const { game, model, teamRates, inputsAsOf, publishedAt, source } = input;
  const prediction = predictNfl(model, game.home.id, game.away.id, {
    neutralSite: game.neutralSite,
  });

  const pHome = prediction.pHome;
  const pAway = prediction.pAway;
  const homeSpread = prediction.spread.line;
  const spreadSign = homeSpread > 0 ? "+" : "";

  const marketGroups: AnalysisMarketGroup[] = [
    {
      group: "Ganador",
      rows: [
        {
          market: asMarketKey("h2h"),
          selection: "home",
          label: `${game.home.shortName} gana`,
          p: pHome,
          fairOdds: 1 / pHome,
        },
        {
          market: asMarketKey("h2h"),
          selection: "away",
          label: `${game.away.shortName} gana`,
          p: pAway,
          fairOdds: 1 / pAway,
        },
      ],
    },
    {
      group: `Spread ${game.home.code} ${spreadSign}${homeSpread.toFixed(1)}`,
      rows: [
        {
          market: asMarketKey("spreads"),
          selection: "home",
          label: `${game.home.code} cubre`,
          line: homeSpread,
          p: prediction.spread.home,
          fairOdds: 1 / prediction.spread.home,
        },
        {
          market: asMarketKey("spreads"),
          selection: "away",
          label: `${game.away.code} cubre`,
          line: -homeSpread,
          p: prediction.spread.away,
          fairOdds: 1 / prediction.spread.away,
        },
      ],
    },
    {
      group: `Total ${prediction.totals.line.toFixed(1)}`,
      rows: [
        {
          market: asMarketKey("totals"),
          selection: "over",
          label: "Más",
          line: prediction.totals.line,
          p: prediction.totals.over,
          fairOdds: 1 / prediction.totals.over,
        },
        {
          market: asMarketKey("totals"),
          selection: "under",
          label: "Menos",
          line: prediction.totals.line,
          p: prediction.totals.under,
          fairOdds: 1 / prediction.totals.under,
        },
      ],
    },
  ];

  const probabilities: MarketProbability[] = marketGroups.flatMap((group) =>
    group.rows.map((row) => ({
      market: row.market,
      selection: row.label,
      line: row.line,
      p: row.p,
      fairOdds: row.fairOdds,
    })),
  );

  const homeRate = teamRates[game.home.id];
  const awayRate = teamRates[game.away.id];
  const cut = formatCutTimestamp(inputsAsOf);
  const marginPrefix = prediction.margin > 0 ? "+" : "";

  const steps: string[] = [
    `Sincronizando NFL · corte ${cut}`,
    `Ofensiva y defensa ajustadas por rival · ${game.home.code} ${prediction.homePoints.toFixed(1)} / ${prediction.awayPoints.toFixed(1)}`,
    `Fuerza de calendario incluida (${model.games} partidos)`,
    `Proyección ${prediction.homePoints.toFixed(1)} – ${prediction.awayPoints.toFixed(1)} · margen ${marginPrefix}${prediction.margin.toFixed(1)}`,
    `Simulando escenarios de margen (σ ${model.sigmaMargin.toFixed(1)}) y total (σ ${model.sigmaTotal.toFixed(1)})`,
    `${probabilities.length} mercados listos`,
  ];

  const factors = [
    {
      key: "home_offense",
      label: "Ofensiva local",
      value: `${prediction.homePoints.toFixed(1)} pts proyectados`,
      detail: `${homeRate?.gamesPlayed ?? 0} partidos · ajustado a ${(model.offense[game.home.id] ?? 0).toFixed(1)} sobre la media`,
    },
    {
      key: "away_defense",
      label: "Defensa visitante",
      value: `${(model.intercept - (model.defense[game.away.id] ?? 0)).toFixed(1)} pts permitidos`,
      detail: `${awayRate?.gamesPlayed ?? 0} partidos · ajustado por rival`,
    },
    {
      key: "away_offense",
      label: "Ofensiva visitante",
      value: `${prediction.awayPoints.toFixed(1)} pts proyectados`,
      detail: `${awayRate?.gamesPlayed ?? 0} partidos · ajustado a ${(model.offense[game.away.id] ?? 0).toFixed(1)} sobre la media`,
    },
    {
      key: "home_defense",
      label: "Defensa local",
      value: `${(model.intercept - (model.defense[game.home.id] ?? 0)).toFixed(1)} pts permitidos`,
      detail: `${homeRate?.gamesPlayed ?? 0} partidos · ajustado por rival`,
    },
    {
      key: "home_advantage",
      label: "Localía",
      value: game.neutralSite ? "Campo neutral" : `+${(2 * model.homeHalf).toFixed(1)} pts`,
      detail: `estimada de ${model.games} partidos`,
    },
    {
      key: "uncertainty",
      label: "Rango 90%",
      value: `margen ${prediction.intervals.margin[0].toFixed(1)} a ${prediction.intervals.margin[1].toFixed(1)}`,
      detail: `total ${prediction.intervals.total[0].toFixed(1)} a ${prediction.intervals.total[1].toFixed(1)}`,
    },
  ];

  return {
    game: game.id,
    model: {
      id: "pitchlab-statistical-nfl",
      version: input.version ?? "2.0.0",
      status: "candidate",
      label: "Modelo PitchLab · en validación",
    },
    projection: {
      home: prediction.homePoints,
      away: prediction.awayPoints,
      total: prediction.total,
      margin: prediction.margin,
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
