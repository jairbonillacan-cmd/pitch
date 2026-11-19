import { z } from "zod";
import {
  GameIdSchema,
  LeagueIdSchema,
  SeasonIdSchema,
  SportIdSchema,
  TeamIdSchema,
  asLeagueId,
  asSportId,
  type GameId,
  type LeagueId,
  type MarketKey,
  type SeasonId,
  type SportId,
  type TeamId,
} from "../ids";

export interface League {
  id: LeagueId;
  sport: SportId;
  name: string;
  shortName: string;
  country: string;
  enabled: boolean;
  competitionType?: "club" | "national";
  assetEdition?: string;
  mascot: string;
  defaultSeason: string;
  defaultPeriod: string;
  logoUrl?: string;
}

export const NATIONAL_COMPETITION_IDS = [
  "uefa-nations",
  "concacaf-nations",
  "amistosos",
  "copa-del-mundo",
  "eliminatorias",
  "copa-america",
  "eurocopa",
  "copa-oro",
  "copa-africana",
  "copa-asiatica",
] as const;

export type NationalCompetitionId = (typeof NATIONAL_COMPETITION_IDS)[number];

const NATIONAL_COMPETITION_SET = new Set<string>(NATIONAL_COMPETITION_IDS);

export function isNationalCompetition(leagueId: string): boolean {
  return NATIONAL_COMPETITION_SET.has(leagueId);
}

export interface Season {
  id: SeasonId;
  league: LeagueId;
  label: string;
  start: string;
  end: string;
  structure: "round" | "week";
}

export interface Team {
  id: TeamId;
  league: LeagueId;
  name: string;
  shortName: string;
  code: string;
  logoUrl?: string;
}

export interface GameResult {
  home: number;
  away: number;
  periods?: number[];
  observedAt: string;
  source: string;
}

export interface GameDTO {
  id: GameId;
  league: LeagueId;
  season: SeasonId;
  week?: number;
  round?: string;
  phase?: string;
  startTime: string;
  status: "scheduled" | "in_progress" | "final" | "postponed" | "canceled";
  home: Team;
  away: Team;
  venue?: string;
  referee?: string;
  neutralSite: boolean;
  result?: GameResult;
}

export interface SportConfig {
  sport: SportId;
  periodLabel: "week" | "round";
  hubTabs: Array<"games" | "standings" | "teams" | "players" | "markets">;
  gameMarkets: MarketKey[];
  propMarkets: MarketKey[];
  allowsDraw: boolean;
}

export const LogoUrlSchema = z
  .string()
  .refine(
    (v) => v.startsWith("/brand/") || z.string().url().safeParse(v).success,
    "logoUrl debe ser una URL absoluta o ruta /brand/...",
  );

export const TeamSchema = z.object({
  id: TeamIdSchema,
  league: LeagueIdSchema,
  name: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().min(2).max(5),
  logoUrl: LogoUrlSchema.optional(),
});

export const GameResultSchema = z.object({
  home: z.number().int().nonnegative(),
  away: z.number().int().nonnegative(),
  periods: z.array(z.number()).optional(),
  observedAt: z.string().min(10),
  source: z.string().min(1),
});

export const GameDTOSchema = z.object({
  id: GameIdSchema,
  league: LeagueIdSchema,
  season: SeasonIdSchema,
  week: z.number().int().positive().optional(),
  round: z.string().optional(),
  phase: z.string().optional(),
  startTime: z.string().min(10),
  status: z.enum(["scheduled", "in_progress", "final", "postponed", "canceled"]),
  home: TeamSchema,
  away: TeamSchema,
  venue: z.string().optional(),
  referee: z.string().optional(),
  neutralSite: z.boolean(),
  result: GameResultSchema.optional(),
});

export const LEAGUE_CATALOG: League[] = [
  {
    id: asLeagueId("liga-mx"),
    sport: asSportId("soccer"),
    name: "Liga MX",
    shortName: "Liga MX",
    country: "México",
    enabled: true,
    assetEdition: "football/liga-mx-apertura-2026",
    mascot: "liga-mx",
    defaultSeason: "Apertura 2026",
    defaultPeriod: "Jornada 16",
  },
  {
    id: asLeagueId("premier-league"),
    sport: asSportId("soccer"),
    name: "Premier League",
    shortName: "Premier",
    country: "Inglaterra",
    enabled: true,
    assetEdition: "football/premier-league-2026-27",
    mascot: "premier-league",
    defaultSeason: "2026/27",
    defaultPeriod: "Jornada 10",
  },
  {
    id: asLeagueId("laliga"),
    sport: asSportId("soccer"),
    name: "LaLiga",
    shortName: "LaLiga",
    country: "España",
    enabled: true,
    assetEdition: "football/laliga-2026-27",
    mascot: "laliga",
    defaultSeason: "2026/27",
    defaultPeriod: "Jornada 11",
  },
  {
    id: asLeagueId("bundesliga"),
    sport: asSportId("soccer"),
    name: "Bundesliga",
    shortName: "Bundesliga",
    country: "Alemania",
    enabled: true,
    mascot: "soccer",
    defaultSeason: "2026/27",
    defaultPeriod: "Jornada 10",
  },
  {
    id: asLeagueId("serie-a"),
    sport: asSportId("soccer"),
    name: "Serie A",
    shortName: "Serie A",
    country: "Italia",
    enabled: true,
    mascot: "soccer",
    defaultSeason: "2026/27",
    defaultPeriod: "Jornada 11",
  },
  {
    id: asLeagueId("ligue-1"),
    sport: asSportId("soccer"),
    name: "Ligue 1",
    shortName: "Ligue 1",
    country: "Francia",
    enabled: true,
    mascot: "soccer",
    defaultSeason: "2026/27",
    defaultPeriod: "Jornada 11",
  },
  {
    id: asLeagueId("nfl"),
    sport: asSportId("american-football"),
    name: "NFL",
    shortName: "NFL",
    country: "EE. UU.",
    enabled: true,
    assetEdition: "american-football/nfl-2026",
    mascot: "nfl",
    defaultSeason: "2026",
    defaultPeriod: "Semana 9",
  },
  {
    id: asLeagueId("nhl"),
    sport: asSportId("hockey"),
    name: "NHL",
    shortName: "NHL",
    country: "EE. UU. y Canadá",
    enabled: true,
    mascot: "nhl",
    defaultSeason: "2026-27",
    defaultPeriod: "",
  },
  {
    id: asLeagueId("nba"),
    sport: asSportId("basketball"),
    name: "NBA",
    shortName: "NBA",
    country: "EE. UU. y Canadá",
    enabled: true,
    mascot: "nba",
    defaultSeason: "2026-27",
    defaultPeriod: "",
  },
  {
    id: asLeagueId("concacaf-nations"),
    sport: asSportId("soccer"),
    name: "Concacaf Nations League",
    shortName: "Concacaf Nations",
    country: "Norteamérica y Caribe",
    enabled: true,
    competitionType: "national",
    mascot: "soccer",
    defaultSeason: "2026/27",
    defaultPeriod: "Fase de grupos y cuartos",
  },
  {
    id: asLeagueId("uefa-nations"),
    sport: asSportId("soccer"),
    name: "UEFA Nations League",
    shortName: "Nations League",
    country: "Europa",
    enabled: true,
    competitionType: "national",
    mascot: "soccer",
    defaultSeason: "2026/27",
    defaultPeriod: "Fase de ligas",
  },
  {
    id: asLeagueId("amistosos"),
    sport: asSportId("soccer"),
    name: "Amistosos FIFA",
    shortName: "Amistosos",
    country: "Internacional",
    enabled: true,
    competitionType: "national",
    mascot: "soccer",
    defaultSeason: "2026",
    defaultPeriod: "Fecha FIFA",
  },
  {
    id: asLeagueId("copa-del-mundo"),
    sport: asSportId("soccer"),
    name: "Copa del Mundo FIFA",
    shortName: "Mundial",
    country: "Internacional",
    enabled: true,
    competitionType: "national",
    mascot: "soccer",
    defaultSeason: "2026",
    defaultPeriod: "Torneo 2026",
  },
  {
    id: asLeagueId("eliminatorias"),
    sport: asSportId("soccer"),
    name: "Eliminatorias Mundialistas",
    shortName: "Eliminatorias",
    country: "Internacional",
    enabled: true,
    competitionType: "national",
    mascot: "soccer",
    defaultSeason: "2025–26",
    defaultPeriod: "Clasificación FIFA",
  },
  {
    id: asLeagueId("copa-america"),
    sport: asSportId("soccer"),
    name: "Copa América",
    shortName: "Copa América",
    country: "Conmebol",
    enabled: true,
    competitionType: "national",
    mascot: "soccer",
    defaultSeason: "2024",
    defaultPeriod: "Edición 2024",
  },
  {
    id: asLeagueId("eurocopa"),
    sport: asSportId("soccer"),
    name: "Eurocopa UEFA",
    shortName: "Eurocopa",
    country: "Europa",
    enabled: true,
    competitionType: "national",
    mascot: "soccer",
    defaultSeason: "2024",
    defaultPeriod: "Edición 2024",
  },
  {
    id: asLeagueId("copa-oro"),
    sport: asSportId("soccer"),
    name: "Copa Oro Concacaf",
    shortName: "Copa Oro",
    country: "Concacaf",
    enabled: true,
    competitionType: "national",
    mascot: "soccer",
    defaultSeason: "2025",
    defaultPeriod: "Edición 2025",
  },
  {
    id: asLeagueId("copa-africana"),
    sport: asSportId("soccer"),
    name: "Copa Africana de Naciones",
    shortName: "Copa Africana",
    country: "CAF · África",
    enabled: true,
    competitionType: "national",
    mascot: "soccer",
    defaultSeason: "2025/26",
    defaultPeriod: "Edición 2025–26",
  },
  {
    id: asLeagueId("copa-asiatica"),
    sport: asSportId("soccer"),
    name: "Copa Asiática AFC",
    shortName: "Copa Asiática",
    country: "AFC · Asia",
    enabled: true,
    competitionType: "national",
    mascot: "soccer",
    defaultSeason: "2026/27",
    defaultPeriod: "Clasificación y Fase Final",
  },
  {
    id: asLeagueId("mlb"),
    sport: asSportId("baseball"),
    name: "MLB",
    shortName: "MLB",
    country: "EE. UU.",
    enabled: true,
    mascot: "mlb",
    defaultSeason: "2026",
    defaultPeriod: "Temporada 2026",
  },
  // Expansión fútbol clubes (ADR-043)
  { id: asLeagueId("mls"), sport: asSportId("soccer"), name: "MLS", shortName: "MLS", country: "EE. UU.", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Temporada 2026" },
  { id: asLeagueId("concacaf-champions"), sport: asSportId("soccer"), name: "CONCACAF Champions Cup", shortName: "Concachampions", country: "CONCACAF", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Fase final" },
  { id: asLeagueId("leagues-cup"), sport: asSportId("soccer"), name: "Leagues Cup", shortName: "Leagues Cup", country: "Norteamérica", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Fase de grupos" },
  { id: asLeagueId("champions-league"), sport: asSportId("soccer"), name: "UEFA Champions League", shortName: "Champions", country: "Europa", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Fase de liga" },
  { id: asLeagueId("europa-league"), sport: asSportId("soccer"), name: "UEFA Europa League", shortName: "Europa League", country: "Europa", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Fase de liga" },
  { id: asLeagueId("conference-league"), sport: asSportId("soccer"), name: "UEFA Conference League", shortName: "Conference", country: "Europa", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Fase de liga" },
  { id: asLeagueId("uefa-super-cup"), sport: asSportId("soccer"), name: "UEFA Super Cup", shortName: "Supercopa UEFA", country: "Europa", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Final" },
  { id: asLeagueId("libertadores"), sport: asSportId("soccer"), name: "Copa Libertadores", shortName: "Libertadores", country: "Sudamérica", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Fase final" },
  { id: asLeagueId("sudamericana"), sport: asSportId("soccer"), name: "Copa Sudamericana", shortName: "Sudamericana", country: "Sudamérica", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Fase final" },
  { id: asLeagueId("caf-champions"), sport: asSportId("soccer"), name: "CAF Champions League", shortName: "CAF Champions", country: "África", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Fase de grupos" },
  { id: asLeagueId("liga-argentina"), sport: asSportId("soccer"), name: "Liga Profesional Argentina", shortName: "Argentina", country: "Argentina", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Torneo 2026" },
  { id: asLeagueId("brasileirao"), sport: asSportId("soccer"), name: "Brasileirão Serie A", shortName: "Brasileirão", country: "Brasil", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Temporada 2026" },
  { id: asLeagueId("brasileirao-b"), sport: asSportId("soccer"), name: "Brasileirão Serie B", shortName: "Serie B BR", country: "Brasil", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Temporada 2026" },
  { id: asLeagueId("copa-do-brasil"), sport: asSportId("soccer"), name: "Copa do Brasil", shortName: "Copa do Brasil", country: "Brasil", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Eliminatorias" },
  { id: asLeagueId("primera-a-colombia"), sport: asSportId("soccer"), name: "Categoría Primera A", shortName: "Colombia", country: "Colombia", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Temporada 2026" },
  { id: asLeagueId("copa-colombia"), sport: asSportId("soccer"), name: "Copa Colombia", shortName: "Copa Colombia", country: "Colombia", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Eliminatorias" },
  { id: asLeagueId("primera-chile"), sport: asSportId("soccer"), name: "Liga de Primera", shortName: "Chile", country: "Chile", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Temporada 2026" },
  { id: asLeagueId("ligapro-ecuador"), sport: asSportId("soccer"), name: "LigaPro Serie A", shortName: "Ecuador", country: "Ecuador", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Temporada 2026" },
  { id: asLeagueId("liga-1-peru"), sport: asSportId("soccer"), name: "Liga 1 Perú", shortName: "Perú", country: "Perú", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Temporada 2026" },
  { id: asLeagueId("championship"), sport: asSportId("soccer"), name: "EFL Championship", shortName: "Championship", country: "Inglaterra", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Temporada 2026/27" },
  { id: asLeagueId("fa-cup"), sport: asSportId("soccer"), name: "FA Cup", shortName: "FA Cup", country: "Inglaterra", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Eliminatorias" },
  { id: asLeagueId("carabao-cup"), sport: asSportId("soccer"), name: "Carabao Cup", shortName: "Carabao Cup", country: "Inglaterra", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Eliminatorias" },
  { id: asLeagueId("segunda-espana"), sport: asSportId("soccer"), name: "LaLiga Hypermotion", shortName: "Segunda ES", country: "España", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Temporada 2026/27" },
  { id: asLeagueId("copa-del-rey"), sport: asSportId("soccer"), name: "Copa del Rey", shortName: "Copa del Rey", country: "España", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Eliminatorias" },
  { id: asLeagueId("liga-f"), sport: asSportId("soccer"), name: "Liga F", shortName: "Liga F", country: "España", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Temporada 2026/27" },
  { id: asLeagueId("bundesliga-2"), sport: asSportId("soccer"), name: "2. Bundesliga", shortName: "2. Bundesliga", country: "Alemania", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Temporada 2026/27" },
  { id: asLeagueId("dfb-pokal"), sport: asSportId("soccer"), name: "DFB-Pokal", shortName: "DFB-Pokal", country: "Alemania", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Eliminatorias" },
  { id: asLeagueId("serie-b"), sport: asSportId("soccer"), name: "Serie B Italia", shortName: "Serie B", country: "Italia", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Temporada 2026/27" },
  { id: asLeagueId("coppa-italia"), sport: asSportId("soccer"), name: "Coppa Italia", shortName: "Coppa Italia", country: "Italia", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Eliminatorias" },
  { id: asLeagueId("ligue-2"), sport: asSportId("soccer"), name: "Ligue 2", shortName: "Ligue 2", country: "Francia", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Temporada 2026/27" },
  { id: asLeagueId("coupe-de-france"), sport: asSportId("soccer"), name: "Coupe de France", shortName: "Coupe France", country: "Francia", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Eliminatorias" },
  { id: asLeagueId("eredivisie"), sport: asSportId("soccer"), name: "Eredivisie", shortName: "Eredivisie", country: "Países Bajos", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Temporada 2026/27" },
  { id: asLeagueId("liga-portugal"), sport: asSportId("soccer"), name: "Liga Portugal Betclic", shortName: "Liga Portugal", country: "Portugal", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Temporada 2026/27" },
  { id: asLeagueId("pro-league-belgica"), sport: asSportId("soccer"), name: "Pro League Bélgica", shortName: "Bélgica", country: "Bélgica", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Temporada 2026/27" },
  { id: asLeagueId("super-lig"), sport: asSportId("soccer"), name: "Süper Lig", shortName: "Süper Lig", country: "Turquía", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Temporada 2026/27" },
  { id: asLeagueId("saudi-pro-league"), sport: asSportId("soccer"), name: "Saudi Pro League", shortName: "Saudi Pro", country: "Arabia Saudita", enabled: true, mascot: "soccer", defaultSeason: "2026/27", defaultPeriod: "Temporada 2026/27" },
  { id: asLeagueId("j1-league"), sport: asSportId("soccer"), name: "J1 League", shortName: "J1 League", country: "Japón", enabled: true, mascot: "soccer", defaultSeason: "2026", defaultPeriod: "Temporada 2026" },
];
