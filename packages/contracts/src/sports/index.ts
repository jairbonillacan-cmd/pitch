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
} from "../ids.js";

export interface League {
  id: LeagueId;
  sport: SportId;
  name: string;
  shortName: string;
  country: string;
  enabled: boolean;
  assetEdition?: string;
  mascot: string;
  defaultSeason: string;
  defaultPeriod: string;
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

export const TeamSchema = z.object({
  id: TeamIdSchema,
  league: LeagueIdSchema,
  name: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().min(2).max(5),
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
    enabled: false,
    mascot: "nhl",
    defaultSeason: "2026-27",
    defaultPeriod: "",
  },
  {
    id: asLeagueId("mlb"),
    sport: asSportId("baseball"),
    name: "MLB",
    shortName: "MLB",
    country: "EE. UU.",
    enabled: false,
    mascot: "mlb",
    defaultSeason: "2027",
    defaultPeriod: "",
  },
];
