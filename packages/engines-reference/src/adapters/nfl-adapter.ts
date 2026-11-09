/**
 * Adaptador NFL para el pre-MVP (PREMVP-01 §H).
 *
 * Conecta las tasas canónicas de la temporada en curso con `NflEngine` (`../domain/engine-nfl.ts`)
 * sin alterar su matemática.
 *
 * Supuestos documentados:
 * 1. Sin baseline de temporada previa: se inicializa cada equipo con `[shortName, 0, 0]` (`kn = false`),
 *    activando el prior de promedio de liga integrado en `NflEngine` (`LGPF / 17 = 395 / 17 ≈ 23.24` pts/partido)
 *    con el freno de regresión al promedio `K = 6` (`w = n / (n + 6)`).
 * 2. Lesiones vacías (`injuries: []`) y sin cuotas de casas.
 * 3. Si `game.neutralSite` es `true`, se incluye el enfrentamiento en `NEUT` (`hf = 0.5`);
 *    en caso contrario aplica `HFA = 0.55`.
 * 4. Los textos de `steps` y `factors` cumplen FD-16 (sin nombres de proveedores ni de algoritmos).
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
import { NflEngine, type NflConstants } from "../domain/engine-nfl.js";
import type { NflTeams, ResultRow } from "../domain/types.js";

export const DEFAULT_NFL_CONSTANTS: NflConstants = {
  E: 2.37,
  HFA: 0.55,
  K: 6,
  NG: 76,
  SDM: 13.4,
  SDT: 13.3,
  SDP: 9.5,
  LGPF: 395,
  NEUT: [],
};

export interface NflTeamRateInput {
  teamId: string;
  name: string;
  shortName: string;
  code: string;
  pointsFor: number;
  pointsAgainst: number;
  gamesPlayed: number;
}

export interface NflAdapterInput {
  game: GameDTO;
  teams: NflTeamRateInput[];
  completedResults?: ResultRow[];
  inputsAsOf: string;
  publishedAt: string;
  source: string;
}

export function computeNflTeamRates(
  teams: NflTeamRateInput[],
  completedResults?: ResultRow[],
  constants: NflConstants = DEFAULT_NFL_CONSTANTS,
): { engine: NflEngine; rates: Record<string, TeamSeasonRate> } {
  const nflTeams: NflTeams = {};
  for (const t of teams) {
    nflTeams[t.teamId] = [t.shortName, 0, 0];
  }

  const engine = new NflEngine({
    teams: nflTeams,
    results: completedResults ?? [],
    audit: [],
    injuries: [],
    constants,
  });

  // Si no se pasaron filas crudas de resultados pero sí totales por equipo, sincronizamos standings
  // con la misma ecuación exacta de NflEngine.build() (prior LGPF/17 y freno K=6).
  const standings = engine.standings;
  if (!completedResults || completedResults.length === 0) {
    const prior = constants.LGPF / 17;
    let sumRs = 0;
    for (const t of teams) {
      const n = t.gamesPlayed;
      const w = n / (n + constants.K);
      const pfPerGame = n > 0 ? t.pointsFor / n : 0;
      const paPerGame = n > 0 ? t.pointsAgainst / n : 0;
      const rs = prior * (1 - w) + pfPerGame * w;
      const ra = prior * (1 - w) + paPerGame * w;
      standings[t.teamId] = {
        rs,
        ra,
        n,
        kn: false,
        gf: "",
        ga: "",
      };
      sumRs += rs;
    }
    standings.LG = teams.length > 0 ? sumRs / teams.length : prior;
  }

  const rates: Record<string, TeamSeasonRate> = {};
  for (const t of teams) {
    const st = standings[t.teamId];
    const n = t.gamesPlayed;
    const forPerGame = n > 0 ? t.pointsFor / n : constants.LGPF / 17;
    const againstPerGame = n > 0 ? t.pointsAgainst / n : constants.LGPF / 17;
    const adjFor = typeof st === "object" && st ? st.rs : forPerGame;
    const adjAgainst = typeof st === "object" && st ? st.ra : againstPerGame;
    rates[t.teamId] = {
      teamId: t.teamId,
      name: t.name,
      shortName: t.shortName,
      code: t.code,
      forPerGame,
      againstPerGame,
      gamesPlayed: n,
      adjustedFor: adjFor,
      adjustedAgainst: adjAgainst,
    };
  }

  return { engine, rates };
}

export function analyzeNflGame(input: NflAdapterInput): GameAnalysis {
  const { game, teams, completedResults, inputsAsOf, publishedAt, source } = input;
  const matchupKey = `${game.home.id}-${game.away.id}`;
  const constants: NflConstants = {
    ...DEFAULT_NFL_CONSTANTS,
    NEUT: game.neutralSite ? [matchupKey] : [],
  };

  const { engine, rates } = computeNflTeamRates(teams, completedResults, constants);
  const m = engine.model(game.home.id, game.away.id);

  const homeRate = rates[game.home.id] ?? {
    teamId: game.home.id,
    name: game.home.name,
    shortName: game.home.shortName,
    code: game.home.code,
    forPerGame: m.H.rs,
    againstPerGame: m.H.ra,
    gamesPlayed: m.H.n,
    adjustedFor: m.H.rs,
    adjustedAgainst: m.H.ra,
  };
  const awayRate = rates[game.away.id] ?? {
    teamId: game.away.id,
    name: game.away.name,
    shortName: game.away.shortName,
    code: game.away.code,
    forPerGame: m.A.rs,
    againstPerGame: m.A.ra,
    gamesPlayed: m.A.n,
    adjustedFor: m.A.rs,
    adjustedAgainst: m.A.ra,
  };

  const pH = m.pH;
  const pA = 1 - pH;
  const favIsHome = pH >= 0.5;
  const plfMarket = m.O.find((x) => x.id === "plf")!;
  const pldMarket = m.O.find((x) => x.id === "pld")!;
  const ovMarket = m.O.find((x) => x.id === "ov")!;
  const unMarket = m.O.find((x) => x.id === "un")!;

  const homeSpreadLine = favIsHome ? -m.L : m.L;
  const homeCoverP = favIsHome ? plfMarket.p : pldMarket.p;
  const awayCoverP = 1 - homeCoverP;
  const totalLine = m.line;
  const overP = ovMarket.p;
  const underP = unMarket.p;
  const margin = m.lh - m.la;

  const spreadSign = homeSpreadLine > 0 ? "+" : "";
  const marketGroups: AnalysisMarketGroup[] = [
    {
      group: "Ganador",
      rows: [
        {
          market: asMarketKey("h2h"),
          selection: "home",
          label: `${game.home.shortName} gana`,
          p: pH,
          fairOdds: 1 / pH,
        },
        {
          market: asMarketKey("h2h"),
          selection: "away",
          label: `${game.away.shortName} gana`,
          p: pA,
          fairOdds: 1 / pA,
        },
      ],
    },
    {
      group: `Spread ${game.home.code} ${spreadSign}${homeSpreadLine.toFixed(1)}`,
      rows: [
        {
          market: asMarketKey("spreads"),
          selection: "home",
          label: `${game.home.code} cubre`,
          line: homeSpreadLine,
          p: homeCoverP,
          fairOdds: 1 / homeCoverP,
        },
        {
          market: asMarketKey("spreads"),
          selection: "away",
          label: `${game.away.code} cubre`,
          line: -homeSpreadLine,
          p: awayCoverP,
          fairOdds: 1 / awayCoverP,
        },
      ],
    },
    {
      group: `Total ${totalLine.toFixed(1)}`,
      rows: [
        {
          market: asMarketKey("totals"),
          selection: "over",
          label: "Más",
          line: totalLine,
          p: overP,
          fairOdds: 1 / overP,
        },
        {
          market: asMarketKey("totals"),
          selection: "under",
          label: "Menos",
          line: totalLine,
          p: underP,
          fairOdds: 1 / underP,
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

  const cutStr = formatCutTimestamp(inputsAsOf);
  const marginPrefix = margin > 0 ? "+" : "";
  const totalMarkets = probabilities.length;

  const steps: string[] = [
    `Sincronizando NFL · corte ${cutStr}`,
    `Ofensiva y defensa · ${game.home.code} ${homeRate.forPerGame.toFixed(1)} / ${homeRate.againstPerGame.toFixed(1)} · ${game.away.code} ${awayRate.forPerGame.toFixed(1)} / ${awayRate.againstPerGame.toFixed(1)}`,
    `Ajuste por localía y tamaño de muestra (${homeRate.gamesPlayed} partidos)`,
    `Proyección ${m.lh.toFixed(1)} – ${m.la.toFixed(1)} · margen ${marginPrefix}${margin.toFixed(1)}`,
    `Simulando escenarios de margen y total`,
    `${totalMarkets} mercados listos`,
  ];

  const factors = [
    {
      key: "home_offense",
      label: "Ofensiva local",
      value: `${homeRate.forPerGame.toFixed(1)} pts/partido`,
      detail: `${homeRate.gamesPlayed} partidos · ajustado a ${m.H.rs.toFixed(1)}`,
    },
    {
      key: "away_defense",
      label: "Defensa visitante",
      value: `${awayRate.againstPerGame.toFixed(1)} pts permitidos`,
      detail: `${awayRate.gamesPlayed} partidos · ajustado a ${m.A.ra.toFixed(1)}`,
    },
    {
      key: "away_offense",
      label: "Ofensiva visitante",
      value: `${awayRate.forPerGame.toFixed(1)} pts/partido`,
      detail: `${awayRate.gamesPlayed} partidos · ajustado a ${m.A.rs.toFixed(1)}`,
    },
    {
      key: "home_defense",
      label: "Defensa local",
      value: `${homeRate.againstPerGame.toFixed(1)} pts permitidos`,
      detail: `${homeRate.gamesPlayed} partidos · ajustado a ${m.H.ra.toFixed(1)}`,
    },
    {
      key: "home_advantage",
      label: "Localía",
      value: game.neutralSite ? "Campo neutral" : "Incluida",
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
      id: "pitchlab-statistical-nfl",
      version: "1.0.0",
      status: "reference",
      label: "Modelo PitchLab · en validación",
    },
    projection: {
      home: m.lh,
      away: m.la,
      total: m.tot,
      margin,
    },
    x12: [pH, 0, pA],
    probabilities,
    marketGroups,
    factors,
    steps,
    inputsAsOf,
    publishedAt,
    source,
  };
}
