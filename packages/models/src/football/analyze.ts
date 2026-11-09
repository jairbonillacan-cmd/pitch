/**
 * Productor de `GameAnalysis` para fútbol con el modelo v2.
 *
 * Mantiene exactamente el contrato visible del pre-MVP (grupos de mercado, factores y
 * pasos), pero con las probabilidades del modelo Dixon-Coles estimado.
 * FD-16: no se exponen nombres de proveedores ni de algoritmos en los textos.
 */
import {
  asMarketKey,
  formatCutTimestamp,
  type AnalysisMarketGroup,
  type GameAnalysis,
  type GameDTO,
  type MarketProbability,
  type StandingRow,
  type TeamSeasonRate,
} from "@pitchlab/contracts";
import {
  baseLambdaAway,
  baseLambdaHome,
  predictFootball,
  type DixonColesModel,
  type OutcomeBlend,
  type FootballMatchRow,
} from "./dixon-coles.js";
import { formatForm, recentForm } from "./form.js";
import { candidatesFromGroups, confidenceIndex, featuredPick, selectPicks } from "../picks.js";

/** «10 % más que la media» a partir de un índice multiplicativo. */
function vsAverage(index: number, more: string, less: string): string {
  const diff = Math.round((index - 1) * 100);
  if (Math.abs(diff) < 3) return "en la media de la liga";
  return `${Math.abs(diff)} % ${diff > 0 ? more : less} que la media`;
}

export interface FootballAnalysisInput {
  league: "premier-league" | "liga-mx" | "laliga" | "bundesliga" | "serie-a" | "ligue-1";
  leagueName: string;
  game: GameDTO;
  model: DixonColesModel;
  teamRates: Record<string, TeamSeasonRate>;
  inputsAsOf: string;
  publishedAt: string;
  source: string;
  version?: string;
  /** Partidos de la temporada (para mostrar la forma reciente de cada equipo). */
  recentResults?: readonly FootballMatchRow[];
  /** Tabla de posiciones del corte (para mostrar la posición de cada equipo). */
  standings?: readonly StandingRow[];
  /** 1X2 de la fuerza histórica larga (ratings incrementales) para mezclar. */
  outcomeBlend?: OutcomeBlend;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export function analyzeFootballGameV2(input: FootballAnalysisInput): GameAnalysis {
  const { league, leagueName, game, model, teamRates, inputsAsOf, publishedAt, source } = input;

  const prediction = predictFootball(model, game.home.id, game.away.id, {
    outcomeBlend: input.outcomeBlend,
  });
  const { home, draw, away } = prediction.probabilities;

  const over15 = prediction.totals.find((t) => t.line === 1.5);
  const over25 = prediction.totals.find((t) => t.line === 2.5);
  const over35 = prediction.totals.find((t) => t.line === 3.5);
  if (!over15 || !over25 || !over35) {
    throw new Error("Faltan líneas de goles en la predicción");
  }

  const marketGroups: AnalysisMarketGroup[] = [
    {
      group: "Resultado",
      rows: [
        {
          market: asMarketKey("h2h"),
          selection: "home",
          label: `${game.home.shortName} gana`,
          p: home,
          fairOdds: 1 / home,
        },
        {
          market: asMarketKey("h2h"),
          selection: "draw",
          label: "Empate",
          p: draw,
          fairOdds: 1 / draw,
        },
        {
          market: asMarketKey("h2h"),
          selection: "away",
          label: `${game.away.shortName} gana`,
          p: away,
          fairOdds: 1 / away,
        },
      ],
    },
    {
      group: "Doble oportunidad",
      rows: [
        {
          market: asMarketKey("double_chance"),
          selection: "1x",
          label: `${game.home.shortName} o empate`,
          p: prediction.doubleChance.homeOrDraw,
          fairOdds: 1 / prediction.doubleChance.homeOrDraw,
        },
        {
          market: asMarketKey("double_chance"),
          selection: "x2",
          label: `${game.away.shortName} o empate`,
          p: prediction.doubleChance.drawOrAway,
          fairOdds: 1 / prediction.doubleChance.drawOrAway,
        },
        {
          market: asMarketKey("double_chance"),
          selection: "12",
          label: "Sin empate",
          p: prediction.doubleChance.homeOrAway,
          fairOdds: 1 / prediction.doubleChance.homeOrAway,
        },
      ],
    },
    {
      group: "Goles totales",
      rows: [
        {
          market: asMarketKey("totals"),
          selection: "over_1.5",
          label: "Más de 1.5",
          line: 1.5,
          p: over15.over,
          fairOdds: 1 / over15.over,
        },
        {
          market: asMarketKey("totals"),
          selection: "over_2.5",
          label: "Más de 2.5",
          line: 2.5,
          p: over25.over,
          fairOdds: 1 / over25.over,
        },
        {
          market: asMarketKey("totals"),
          selection: "under_2.5",
          label: "Menos de 2.5",
          line: 2.5,
          p: over25.under,
          fairOdds: 1 / over25.under,
        },
        {
          market: asMarketKey("totals"),
          selection: "over_3.5",
          label: "Más de 3.5",
          line: 3.5,
          p: over35.over,
          fairOdds: 1 / over35.over,
        },
        {
          market: asMarketKey("totals"),
          selection: "under_3.5",
          label: "Menos de 3.5",
          line: 3.5,
          p: over35.under,
          fairOdds: 1 / over35.under,
        },
      ],
    },
    {
      group: "Ambos anotan",
      rows: [
        {
          market: asMarketKey("btts"),
          selection: "yes",
          label: "Sí",
          p: prediction.btts.yes,
          fairOdds: 1 / prediction.btts.yes,
        },
        {
          market: asMarketKey("btts"),
          selection: "no",
          label: "No",
          p: prediction.btts.no,
          fairOdds: 1 / prediction.btts.no,
        },
      ],
    },
    {
      group: `Goles por equipo (${prediction.teamTotals.home.line.toFixed(1)})`,
      rows: [
        {
          market: asMarketKey("team_totals"),
          selection: "home_over",
          label: `${game.home.shortName} más de ${prediction.teamTotals.home.line.toFixed(1)}`,
          line: prediction.teamTotals.home.line,
          p: prediction.teamTotals.home.over,
          fairOdds: 1 / prediction.teamTotals.home.over,
        },
        {
          market: asMarketKey("team_totals"),
          selection: "home_under",
          label: `${game.home.shortName} menos de ${prediction.teamTotals.home.line.toFixed(1)}`,
          line: prediction.teamTotals.home.line,
          p: prediction.teamTotals.home.under,
          fairOdds: 1 / prediction.teamTotals.home.under,
        },
        {
          market: asMarketKey("team_totals"),
          selection: "away_over",
          label: `${game.away.shortName} más de ${prediction.teamTotals.away.line.toFixed(1)}`,
          line: prediction.teamTotals.away.line,
          p: prediction.teamTotals.away.over,
          fairOdds: 1 / prediction.teamTotals.away.over,
        },
        {
          market: asMarketKey("team_totals"),
          selection: "away_under",
          label: `${game.away.shortName} menos de ${prediction.teamTotals.away.line.toFixed(1)}`,
          line: prediction.teamTotals.away.line,
          p: prediction.teamTotals.away.under,
          fairOdds: 1 / prediction.teamTotals.away.under,
        },
      ],
    },
    {
      group: "Marcador exacto (más probables)",
      rows: prediction.topScores.map((score) => ({
        market: asMarketKey("correct_score"),
        selection: `${score.home}-${score.away}`,
        label: `${score.home}–${score.away}`,
        p: score.p,
        fairOdds: 1 / score.p,
      })),
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
  const attackHome = model.attack[game.home.id] ?? 1;
  const defenseHome = model.defense[game.home.id] ?? 1;
  const attackAway = model.attack[game.away.id] ?? 1;
  const defenseAway = model.defense[game.away.id] ?? 1;

  const steps: string[] = [
    `Sincronizando ${leagueName} · corte ${cut}`,
    `Fuerza ajustada por rival · ${game.home.code} ${attackHome.toFixed(2)} / ${defenseHome.toFixed(2)} · ${game.away.code} ${attackAway.toFixed(2)} / ${defenseAway.toFixed(2)}`,
    `Ponderando ${model.weightedMatches.toFixed(1)} partidos por antigüedad y calidad del rival`,
    `Proyección de goles ${prediction.lambdaHome.toFixed(2)} – ${prediction.lambdaAway.toFixed(2)} · total ${prediction.total.toFixed(2)}`,
    `Simulando ${model.gridSize * model.gridSize} marcadores con incertidumbre del ajuste`,
    `${probabilities.length} mercados listos · marcador proyectado ${prediction.projectedScore.home}–${prediction.projectedScore.away}`,
  ];

  const factors = [
    {
      key: "home_attack",
      label: "Ataque local",
      value: `${(baseLambdaHome(model, game.home.id, game.away.id) / model.homeAdvantage).toFixed(2)} goles/partido`,
      detail: `${vsAverage(attackHome, "más", "menos")} · ${homeRate?.gamesPlayed ?? 0} partidos`,
    },
    {
      key: "away_defense",
      label: "Defensa visitante",
      value: `${(model.baseRate * defenseAway).toFixed(2)} concedidos/partido`,
      detail: `${vsAverage(defenseAway, "más", "menos")} · ${awayRate?.gamesPlayed ?? 0} partidos`,
    },
    {
      key: "away_attack",
      label: "Ataque visitante",
      value: `${baseLambdaAway(model, game.home.id, game.away.id).toFixed(2)} goles/partido`,
      detail: `${vsAverage(attackAway, "más", "menos")} · ajustado por rival`,
    },
    {
      key: "home_defense",
      label: "Defensa local",
      value: `${(model.baseRate * defenseHome).toFixed(2)} concedidos/partido`,
      detail: `${vsAverage(defenseHome, "más", "menos")} · ajustado por rival`,
    },
    {
      key: "home_advantage",
      label: "Localía",
      value: `×${model.homeAdvantage.toFixed(2)}`,
      detail: `estimada de ${model.matches} partidos`,
    },
    {
      key: "uncertainty",
      label: "Intervalo 90%",
      value: `goles ${prediction.intervals.total[0].toFixed(1)}–${prediction.intervals.total[1].toFixed(1)}`,
      detail: `local ${pct(prediction.intervals.homeWin[0])}–${pct(prediction.intervals.homeWin[1])} · ${model.matches} partidos`,
    },
  ];

  // Posición en la tabla (informativa) calculada en el mismo corte.
  if (input.standings && input.standings.length > 0) {
    const tableIndex = new Map(
      input.standings.map((row, index) => [row.teamId, { position: index + 1, points: row.points }]),
    );
    const homePosition = tableIndex.get(game.home.id);
    const awayPosition = tableIndex.get(game.away.id);
    if (homePosition) {
      factors.push({
        key: "home_position",
        label: "Posición local",
        value: `${homePosition.position}.º · ${homePosition.points} pts`,
        detail: `de ${input.standings.length} equipos`,
      });
    }
    if (awayPosition) {
      factors.push({
        key: "away_position",
        label: "Posición visitante",
        value: `${awayPosition.position}.º · ${awayPosition.points} pts`,
        detail: `de ${input.standings.length} equipos`,
      });
    }
  }

  // Forma reciente (informativa): últimos cinco resultados antes del partido.
  if (input.recentResults && input.recentResults.length > 0) {
    const matchDate = game.startTime.slice(0, 10);
    const homeForm = recentForm(input.recentResults, game.home.id, matchDate);
    const awayForm = recentForm(input.recentResults, game.away.id, matchDate);
    if (homeForm.played > 0) {
      factors.push({
        key: "home_form",
        label: "Forma local",
        value: formatForm(homeForm),
        detail: `${homeForm.goalsFor} goles a favor · ${homeForm.goalsAgainst} en contra`,
      });
    }
    if (awayForm.played > 0) {
      factors.push({
        key: "away_form",
        label: "Forma visitante",
        value: formatForm(awayForm),
        detail: `${awayForm.goalsFor} goles a favor · ${awayForm.goalsAgainst} en contra`,
      });
    }
  }

  // Memoria larga: cuánto mueve la historia al 1X2 de la temporada.
  const blend = input.outcomeBlend;
  const season = prediction.seasonProbabilities;
  if (blend && blend.weight > 0) {
    const shift = home - season.home;
    factors.push({
      key: "long_memory",
      label: "Memoria larga",
      value:
        Math.abs(shift) < 0.02
          ? "coincide con la temporada"
          : `${shift > 0 ? "+" : "−"}${Math.abs(shift * 100).toFixed(0)} pts al local`,
      detail: `historia ${pct(blend.home)} / ${pct(blend.draw)} / ${pct(blend.away)} · temporada ${pct(season.home)} / ${pct(season.draw)} / ${pct(season.away)}`,
    });
  }

  const picks = selectPicks(candidatesFromGroups(marketGroups), { maxScore: 10 });
  const confidence = confidenceIndex({
    favorite: Math.max(home, draw, away),
    minGamesPlayed: Math.min(homeRate?.gamesPlayed ?? 0, awayRate?.gamesPlayed ?? 0),
    intervalWidth: prediction.intervals.homeWin[1] - prediction.intervals.homeWin[0],
    disagreement: blend
      ? Math.max(
          Math.abs(season.home - blend.home),
          Math.abs(season.draw - blend.draw),
          Math.abs(season.away - blend.away),
        )
      : undefined,
    outcomes: 3,
  });

  // «Por qué»: el motivo del pick destacado y los factores más alejados de la media.
  const why: string[] = [];
  const featured = featuredPick(picks);
  if (featured) {
    if (featured.market === "totals" || featured.market === "btts" || featured.market === "team_totals") {
      why.push(
        `Se esperan ${prediction.total.toFixed(1)} goles: ${prediction.lambdaHome.toFixed(1)} de ${game.home.shortName} y ${prediction.lambdaAway.toFixed(1)} de ${game.away.shortName}.`,
      );
    } else {
      const leader = home >= away ? game.home.shortName : game.away.shortName;
      why.push(
        `${leader} gana en ${pct(Math.max(home, away))} de los escenarios; el empate, en ${pct(draw)}.`,
      );
    }
  }
  const drivers = [
    { v: attackHome, text: `${game.home.shortName} anota ${vsAverage(attackHome, "más", "menos")}.` },
    { v: attackAway, text: `${game.away.shortName} anota ${vsAverage(attackAway, "más", "menos")}.` },
    { v: defenseHome, text: `${game.home.shortName} concede ${vsAverage(defenseHome, "más", "menos")}.` },
    { v: defenseAway, text: `${game.away.shortName} concede ${vsAverage(defenseAway, "más", "menos")}.` },
  ]
    .filter((d) => Math.abs(d.v - 1) >= 0.08)
    .sort((a, b) => Math.abs(Math.log(b.v)) - Math.abs(Math.log(a.v)));
  for (const d of drivers.slice(0, 2)) why.push(d.text);
  if (blend && Math.abs(home - season.home) >= 0.04) {
    why.push(
      `La historia larga ${home > season.home ? "favorece más" : "favorece menos"} a ${game.home.shortName} que esta temporada.`,
    );
  }

  return {
    game: game.id,
    picks: picks.map((pk) => ({ ...pk, market: asMarketKey(pk.market) })),
    confidence,
    projectedScore: prediction.projectedScore,
    insights: { why: why.slice(0, 4) },
    model: {
      id: `pitchlab-statistical-${league}`,
      version: input.version ?? "2.0.0",
      status: "candidate",
      label: "Modelo PitchLab · en validación",
    },
    projection: {
      home: prediction.lambdaHome,
      away: prediction.lambdaAway,
      total: prediction.total,
      margin: prediction.lambdaHome - prediction.lambdaAway,
    },
    x12: [home, draw, away],
    probabilities,
    marketGroups,
    mostLikelyScore: prediction.mostLikelyScore,
    factors,
    steps,
    inputsAsOf,
    publishedAt,
    source,
  };
}
