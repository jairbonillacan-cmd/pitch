import { z } from "zod";

export type Brand<T, B extends string> = T & { readonly __brand: B };

export const VALID_SPORTS = ["american-football", "soccer", "hockey", "baseball"] as const;
export const VALID_LEAGUES = ["nfl", "liga-mx", "premier-league", "ncaaf", "nhl", "mlb"] as const;

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

export const TeamIdSchema = z
  .string()
  .regex(
    /^(nfl|liga-mx|premier-league|ncaaf|nhl|mlb)\.[a-z0-9-]+$/,
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
