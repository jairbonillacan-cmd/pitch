import { z } from "zod";

export type Brand<T, B extends string> = T & { readonly __brand: B };

export const VALID_SPORTS = ["american-football", "soccer", "hockey", "baseball", "basketball"] as const;
export const VALID_LEAGUES = [
  "nfl",
  "liga-mx",
  "premier-league",
  "laliga",
  "bundesliga",
  "serie-a",
  "ligue-1",
  "ncaaf",
  "nhl",
  "mlb",
  "nba",
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
  // Norteamérica y CONCACAF clubes
  "mls",
  "concacaf-champions",
  "leagues-cup",
  // Copas internacionales de clubes
  "champions-league",
  "europa-league",
  "conference-league",
  "uefa-super-cup",
  "libertadores",
  "sudamericana",
  "caf-champions",
  // Sudamérica
  "liga-argentina",
  "brasileirao",
  "brasileirao-b",
  "copa-do-brasil",
  "primera-a-colombia",
  "copa-colombia",
  "primera-chile",
  "ligapro-ecuador",
  "liga-1-peru",
  // Copas y 2.ª división del Top 5 europeo
  "championship",
  "fa-cup",
  "carabao-cup",
  "segunda-espana",
  "copa-del-rey",
  "liga-f",
  "bundesliga-2",
  "dfb-pokal",
  "serie-b",
  "coppa-italia",
  "ligue-2",
  "coupe-de-france",
  // Otras 1.ª divisiones europeas, Medio Oriente y Asia
  "eredivisie",
  "liga-portugal",
  "pro-league-belgica",
  "super-lig",
  "saudi-pro-league",
  "j1-league",
] as const;

export type SportId = Brand<(typeof VALID_SPORTS)[number], "SportId">;
export type LeagueId = Brand<(typeof VALID_LEAGUES)[number], "LeagueId">;
export type SeasonId = Brand<string, "SeasonId">;
export type TeamId = Brand<string, "TeamId">;
export type PlayerId = Brand<string, "PlayerId">;
export type GameId = Brand<string, "GameId">;
export type BookmakerId = Brand<string, "BookmakerId">;
export type MarketKey = Brand<string, "MarketKey">;
export type ModelVersionId = Brand<string, "ModelVersionId">;
export type PickId = Brand<string, "PickId">;

export const SportIdSchema = z
  .enum(VALID_SPORTS)
  .transform((v) => v as SportId);

export const LeagueIdSchema = z
  .enum(VALID_LEAGUES)
  .transform((v) => v as LeagueId);

export const SeasonIdSchema = z
  .string()
  .min(3)
  .regex(/^[a-z0-9-]+$/, "SeasonId debe ser kebab-case alfanumérico")
  .transform((v) => v as SeasonId);

const TEAM_ID_PATTERN = new RegExp(`^(${VALID_LEAGUES.join("|")})\\.[a-z0-9-]+$`);

export const TeamIdSchema = z
  .string()
  .regex(
    TEAM_ID_PATTERN,
    "TeamId debe seguir el formato canónico <league>.<slug>",
  )
  .transform((v) => v as TeamId);

export const GameIdSchema = z
  .string()
  .min(3)
  .regex(/^[a-zA-Z0-9._-]+$/, "GameId inválido")
  .transform((v) => v as GameId);

export const MarketKeySchema = z
  .string()
  .min(2)
  .transform((v) => v as MarketKey);

export const asSportId = (v: (typeof VALID_SPORTS)[number]): SportId => v as SportId;
export const asLeagueId = (v: (typeof VALID_LEAGUES)[number]): LeagueId => v as LeagueId;
export const asSeasonId = (v: string): SeasonId => SeasonIdSchema.parse(v);
export const asTeamId = (v: string): TeamId => TeamIdSchema.parse(v);
export const asGameId = (v: string): GameId => GameIdSchema.parse(v);
export const asMarketKey = (v: string): MarketKey => MarketKeySchema.parse(v);
