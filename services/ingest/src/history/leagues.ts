/**
 * Catálogo de ligas con histórico profundo.
 *
 * Regla de identidad: el histórico **no** depende del manifiesto de emblemas de la
 * temporada en curso. Un equipo relegado o una franquicia que se mudó de ciudad debe
 * conservar un identificador estable a través de las temporadas, así que aquí se usa
 * un registro propio (`<liga>.<slug>`), no el manifiesto de marca.
 *
 * Fuentes (docs/architecture/FREE_DATA_STRATEGY.md §1):
 *  - nflverse `games.csv` (CC-BY 4.0): temporada regular y playoffs desde 1999.
 *  - openfootball/football.json (CC0): calendario y resultados de fútbol desde 2010-11.
 */

export type HistorySport = "soccer" | "american-football";
export type HistorySourceId = "openfootball" | "nflverse";

export interface HistoryLeagueConfig {
  readonly id: string;
  readonly name: string;
  readonly sport: HistorySport;
  readonly source: HistorySourceId;
  /** Nombre del archivo dentro de `openfootball/football.json/<temporada>/`. */
  readonly openFootballCode?: string;
  /** `true` si la liga se muestra en el producto (las demás son corpus de entrenamiento). */
  readonly productLeague: boolean;
  /** Partidos esperados por temporada completa (control de calidad; no bloquea). */
  readonly expectedGamesPerSeason?: number;
  /** Nombre exacto de la fuente → slug canónico del histórico. */
  readonly teamAliases?: Readonly<Record<string, string>>;
  /**
   * Pares de slugs que la auditoría no debe sugerir como duplicados aunque compartan
   * tokens y nunca coincidan en la misma temporada (clubes homónimos de la misma ciudad).
   */
  readonly distinctTeamPairs?: ReadonlyArray<readonly [string, string]>;
}

/** Temporadas publicadas por openfootball (carpetas del repositorio). */
export const OPENFOOTBALL_SEASONS = [
  "2010-11",
  "2011-12",
  "2012-13",
  "2013-14",
  "2014-15",
  "2015-16",
  "2016-17",
  "2017-18",
  "2018-19",
  "2019-20",
  "2020-21",
  "2021-22",
  "2022-23",
  "2023-24",
  "2024-25",
  "2025-26",
  "2026-27",
] as const;

export const HISTORY_LEAGUES = {
  "premier-league": {
    id: "premier-league",
    name: "Premier League",
    sport: "soccer",
    source: "openfootball",
    openFootballCode: "en.1",
    productLeague: true,
    expectedGamesPerSeason: 380,
  },
  "la-liga": {
    id: "la-liga",
    name: "LaLiga",
    sport: "soccer",
    source: "openfootball",
    openFootballCode: "es.1",
    productLeague: true,
    expectedGamesPerSeason: 380,
    teamAliases: {
      "Deportivo Alavés": "alaves",
      "RC Celta de Vigo": "celta",
      "Rayo Vallecano de Madrid": "rayo-vallecano",
      "Real Betis Balompié": "real-betis",
    },
  },
  bundesliga: {
    id: "bundesliga",
    name: "Bundesliga",
    sport: "soccer",
    source: "openfootball",
    openFootballCode: "de.1",
    productLeague: true,
    expectedGamesPerSeason: 306,
    teamAliases: {
      "Bor. Mönchengladbach": "borussia-monchengladbach",
    },
  },
  "serie-a": {
    id: "serie-a",
    name: "Serie A",
    sport: "soccer",
    source: "openfootball",
    openFootballCode: "it.1",
    productLeague: true,
    expectedGamesPerSeason: 380,
    teamAliases: {
      "Atalanta BC": "atalanta",
      "FC Internazionale Milano": "inter",
      "Lazio Roma": "lazio",
      "UC Sampdoria": "sampdoria",
    },
  },
  "ligue-1": {
    id: "ligue-1",
    name: "Ligue 1",
    sport: "soccer",
    source: "openfootball",
    openFootballCode: "fr.1",
    productLeague: true,
    expectedGamesPerSeason: 306,
    teamAliases: {
      "ES Troyes AC": "estac-troyes",
      "Racing Club de Lens": "lens",
      "RC Strasbourg Alsace": "strasbourg",
    },
    distinctTeamPairs: [["ajaccio", "gazelec-ajaccio"]],
  },
  "liga-mx": {
    id: "liga-mx",
    name: "Liga MX",
    sport: "soccer",
    source: "openfootball",
    openFootballCode: "mx.1",
    productLeague: true,
    // 17 jornadas × 9 partidos × 2 torneos (Apertura y Clausura); la liguilla es extra.
    expectedGamesPerSeason: 306,
  },
  nfl: {
    id: "nfl",
    name: "NFL",
    sport: "american-football",
    source: "nflverse",
    productLeague: true,
  },
} as const satisfies Record<string, HistoryLeagueConfig>;

export type HistoryLeagueId = keyof typeof HISTORY_LEAGUES;

/** Ligas que se descargan por defecto: las 6 de fútbol y la NFL. */
export const DEFAULT_HISTORY_LEAGUES: readonly HistoryLeagueId[] = [
  "premier-league",
  "la-liga",
  "bundesliga",
  "serie-a",
  "ligue-1",
  "liga-mx",
  "nfl",
];

export function isHistoryLeagueId(value: string): value is HistoryLeagueId {
  return Object.prototype.hasOwnProperty.call(HISTORY_LEAGUES, value);
}

export function getHistoryLeague(id: string): HistoryLeagueConfig {
  if (!isHistoryLeagueId(id)) {
    throw new Error(
      `Liga histórica desconocida: '${id}'. Válidas: ${Object.keys(HISTORY_LEAGUES).join(", ")}.`,
    );
  }
  return HISTORY_LEAGUES[id];
}
