/**
 * Adaptador de Fútbol (Premier League y Liga MX) para el pre-MVP (PREMVP-01 §H).
 *
 * Conecta las tasas canónicas de la temporada en curso con `FootballEngine` (`../domain/aztecavet/football.ts`)
 * sin alterar su matemática.
 *
 * Supuestos documentados:
 * 1. Se usa exclusivamente la temporada en curso (`gf`, `ga`, `gp` acumulados antes de la jornada actual)
 *    con `cur = 0` y el freno bayesiano del motor `K = 6` hacia la media por liga (`FB.LG0.PL = 1.45`,
 *    `FB.LG0.MX = 1.51`).
 * 2. Lesiones vacías (`injuries: []`) y sin cuotas de casas (`odds: {}`).
 * 3. Los textos de `steps` y `factors` cumplen FD-16 (sin nombres de proveedores ni de algoritmos).
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
import { FB } from "../domain/aztecavet/constants.js";
import { FootballEngine, over, pois } from "../domain/aztecavet/football.js";
import type { FbComp, FbTeamRow } from "../domain/aztecavet/types.js";

export interface FootballTeamRateInput {
  teamId: string;
  name: string;
  shortName: string;
  code: string;
  goalsFor: number;
  goalsAgainst: number;
  gamesPlayed: number;
}

export interface FootballAdapterInput {
  league: "premier-league" | "liga-mx" | "laliga";
  leagueName: string;
  game: GameDTO;
  teams: FootballTeamRateInput[];
  inputsAsOf: string;
  publishedAt: string;
  source: string;
}

function getCompCode(league: "premier-league" | "liga-mx" | "laliga"): "PL" | "MX" | "LL" {
  return league === "liga-mx" ? "MX" : league === "laliga" ? "LL" : "PL";
}

export function computeFootballTeamRates(
  league: "premier-league" | "liga-mx" | "laliga",
  teams: FootballTeamRateInput[],
): { engine: FootballEngine; rates: Record<string, TeamSeasonRate>; compCode: "PL" | "MX" | "LL" } {
  const compCode = getCompCode(league);
  const lgAvg = FB.LG0[compCode];

  const rows: FbTeamRow[] = teams.map((t) => [
    t.teamId,
    t.shortName,
    compCode,
    t.goalsFor,
    t.goalsAgainst,
    t.gamesPlayed,
    0,
    "",
    compCode,
  ]);

  const fallbackHome = teams[0]?.teamId ?? "home";
  const fallbackAway = teams[1]?.teamId ?? "away";
  const compMeta: FbComp = {
    n: league === "liga-mx" ? "Liga MX" : league === "laliga" ? "LaLiga" : "Premier League",
    sub: "",
    lg: compCode,
    em: compCode,
    g: "",
    gl: "",
    ac: "",
    ac2: "",
    sim: [fallbackHome, fallbackAway],
  };

  const engine = new FootballEngine({
    teams: rows,
    fixtures: { [compCode]: [] },
    comps: { [compCode]: compMeta },
    injuries: [],
    odds: {},
  });

  const rates: Record<string, TeamSeasonRate> = {};
  for (const t of teams) {
    const n = t.gamesPlayed;
    const forPerGame = n > 0 ? t.goalsFor / n : lgAvg;
    const againstPerGame = n > 0 ? t.goalsAgainst / n : lgAvg;
    const adjustedFor = (t.goalsFor + FB.K * lgAvg) / (n + FB.K);
    const adjustedAgainst = (t.goalsAgainst + FB.K * lgAvg) / (n + FB.K);
    rates[t.teamId] = {
      teamId: t.teamId,
      name: t.name,
      shortName: t.shortName,
      code: t.code,
      forPerGame,
      againstPerGame,
      gamesPlayed: n,
      adjustedFor,
      adjustedAgainst,
    };
  }

  return { engine, rates, compCode };
}

export function analyzeFootballGame(input: FootballAdapterInput): GameAnalysis {
  const { league, leagueName, game, teams, inputsAsOf, publishedAt, source } = input;
  const { engine, rates, compCode } = computeFootballTeamRates(league, teams);

  // Ejecuta el motor exacto de fútbol (model0) sobre los dos equipos
  const m = engine.model0(game.home.id, game.away.id, compCode, false);

  // Calcula el marcador más probable usando la misma rejilla y ajuste del motor
  const NG = FB.NG;
  const P = pois(m.lh, NG);
  const Q = pois(m.la, NG);
  const rho = compCode === "MX" ? FB.RHO_MX : FB.RHO;
  const tau = (i: number, j: number): number =>
    i === 0 && j === 0
      ? 1 - m.lh * m.la * rho
      : i === 0 && j === 1
        ? 1 + m.lh * rho
        : i === 1 && j === 0
          ? 1 + m.la * rho
          : i === 1 && j === 1
            ? 1 - rho
            : 1;

  let bestHome = 0;
  let bestAway = 0;
  let bestProb = 0;
  for (let i = 0; i < NG; i++) {
    for (let j = 0; j < NG; j++) {
      const p = P[i]! * Q[j]! * tau(i, j);
      if (p > bestProb) {
        bestHome = i;
        bestAway = j;
        bestProb = p;
      }
    }
  }

  const byId = (id: string) => m.O.find((x) => x.id === id)!;
  const ph = byId("h").p;
  const pd = byId("d").p;
  const pa = byId("a").p;
  const dc1x = byId("dc1x").p;
  const dcx2 = byId("dcx2").p;
  const dc12 = byId("dc12").p;
  const o15 = byId("o15").p;
  const o25 = over(m.tot, 2.5, NG);
  const u25 = 1 - o25;
  const o35 = byId("o35").p;
  const u35 = byId("u35").p;
  const bttsYes = byId("by").p;
  const bttsNo = byId("bn").p;

  const marketGroups: AnalysisMarketGroup[] = [
    {
      group: "Resultado",
      rows: [
        {
          market: asMarketKey("h2h"),
          selection: "home",
          label: `${game.home.shortName} gana`,
          p: ph,
          fairOdds: 1 / ph,
        },
        {
          market: asMarketKey("h2h"),
          selection: "draw",
          label: "Empate",
          p: pd,
          fairOdds: 1 / pd,
        },
        {
          market: asMarketKey("h2h"),
          selection: "away",
          label: `${game.away.shortName} gana`,
          p: pa,
          fairOdds: 1 / pa,
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
          p: dc1x,
          fairOdds: 1 / dc1x,
        },
        {
          market: asMarketKey("double_chance"),
          selection: "x2",
          label: `${game.away.shortName} o empate`,
          p: dcx2,
          fairOdds: 1 / dcx2,
        },
        {
          market: asMarketKey("double_chance"),
          selection: "12",
          label: "Sin empate",
          p: dc12,
          fairOdds: 1 / dc12,
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
          p: o15,
          fairOdds: 1 / o15,
        },
        {
          market: asMarketKey("totals"),
          selection: "over_2.5",
          label: "Más de 2.5",
          line: 2.5,
          p: o25,
          fairOdds: 1 / o25,
        },
        {
          market: asMarketKey("totals"),
          selection: "under_2.5",
          label: "Menos de 2.5",
          line: 2.5,
          p: u25,
          fairOdds: 1 / u25,
        },
        {
          market: asMarketKey("totals"),
          selection: "over_3.5",
          label: "Más de 3.5",
          line: 3.5,
          p: o35,
          fairOdds: 1 / o35,
        },
        {
          market: asMarketKey("totals"),
          selection: "under_3.5",
          label: "Menos de 3.5",
          line: 3.5,
          p: u35,
          fairOdds: 1 / u35,
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
          p: bttsYes,
          fairOdds: 1 / bttsYes,
        },
        {
          market: asMarketKey("btts"),
          selection: "no",
          label: "No",
          p: bttsNo,
          fairOdds: 1 / bttsNo,
        },
      ],
    },
  ];

  const probabilities: MarketProbability[] = marketGroups.flatMap((g) =>
    g.rows.map((r) => ({
      market: r.market,
      selection: r.label,
      line: r.line,
      p: r.p,
      fairOdds: r.fairOdds,
    })),
  );

  const homeRate = rates[game.home.id]!;
  const awayRate = rates[game.away.id]!;
  const cutStr = formatCutTimestamp(inputsAsOf);
  const totalMarkets = probabilities.length;

  const steps: string[] = [
    `Sincronizando ${leagueName} · corte ${cutStr}`,
    `Fuerza de ataque y defensa · ${game.home.code} ${homeRate.forPerGame.toFixed(2)} / ${homeRate.againstPerGame.toFixed(2)} · ${game.away.code} ${awayRate.forPerGame.toFixed(2)} / ${awayRate.againstPerGame.toFixed(2)}`,
    `Ajuste por localía y tamaño de muestra (${homeRate.gamesPlayed} partidos)`,
    `Proyección de goles ${m.lh.toFixed(2)} – ${m.la.toFixed(2)}`,
    `Evaluando ${NG * NG} marcadores posibles`,
    `${totalMarkets} mercados listos · marcador más probable ${bestHome}–${bestAway}`,
  ];

  const factors = [
    {
      key: "home_attack",
      label: "Ataque local",
      value: `${homeRate.forPerGame.toFixed(2)} goles/partido`,
      detail: `${homeRate.gamesPlayed} partidos · ajustado a ${m.H.rs.toFixed(2)}`,
    },
    {
      key: "away_defense",
      label: "Defensa visitante",
      value: `${awayRate.againstPerGame.toFixed(2)} recibidos/partido`,
      detail: `ajustado a ${m.A.ra.toFixed(2)}`,
    },
    {
      key: "away_attack",
      label: "Ataque visitante",
      value: `${awayRate.forPerGame.toFixed(2)} goles/partido`,
      detail: `ajustado a ${m.A.rs.toFixed(2)}`,
    },
    {
      key: "home_defense",
      label: "Defensa local",
      value: `${homeRate.againstPerGame.toFixed(2)} recibidos/partido`,
      detail: `ajustado a ${m.H.ra.toFixed(2)}`,
    },
    {
      key: "home_advantage",
      label: "Localía",
      value: "Incluida",
      detail: "Ajuste del modelo PitchLab",
    },
    {
      key: "sample_size",
      label: "Muestra",
      value: `${homeRate.gamesPlayed} y ${awayRate.gamesPlayed} partidos`,
      detail: "Temporada actual",
    },
  ];

  return {
    game: game.id,
    model: {
      id: `pitchlab-statistical-${league}`,
      version: "1.0.0",
      status: "reference",
      label: "Modelo PitchLab · en validación",
    },
    projection: {
      home: m.lh,
      away: m.la,
      total: m.tot,
    },
    x12: [ph, pd, pa],
    probabilities,
    marketGroups,
    mostLikelyScore: {
      home: bestHome,
      away: bestAway,
      p: bestProb,
    },
    factors,
    steps,
    inputsAsOf,
    publishedAt,
    source,
  };
}
