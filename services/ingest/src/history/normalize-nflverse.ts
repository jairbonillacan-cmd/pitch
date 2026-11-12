/**
 * Normalización del histórico de la NFL desde nflverse `games.csv` (CC-BY 4.0).
 *
 * - Identidad por franquicia: STL→Rams, OAK→Raiders, SD→Chargers (ver `teams.ts`).
 * - Se incluyen temporada regular y playoffs; el `phase` las separa.
 * - Las líneas de cierre (`spread_line`, `total_line`, moneylines) se conservan con
 *   `usage: research-only`: sirven para comparar el modelo contra el mercado, no para
 *   publicarlas como cuotas propias.
 * - La columna `ftn` (CC-BY-SA 4.0) se descarta en `parseCsv` y no se usa.
 */
import { z } from "zod";
import { parseCsv } from "../adapters/nflverse.js";
import type { HistoricalClosingOdds, HistoricalGame } from "./schema.js";
import { nflTeamKey } from "./teams.js";
import { scoreAvailableAt } from "./normalize-openfootball.js";

const REGULAR_SEASON_TYPES = new Set(["REG"]);
const POSTSEASON_TYPES = new Set(["WC", "DIV", "CON", "SB"]);

const NflverseHistoryRowSchema = z.object({
  game_id: z.string().min(3),
  season: z.coerce.number().int(),
  game_type: z.string().min(2),
  week: z.coerce.number().int().positive(),
  gameday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gametime: z.string().optional().default(""),
  away_team: z.string().min(2),
  away_score: z.string().optional().default(""),
  home_team: z.string().min(2),
  home_score: z.string().optional().default(""),
  location: z.string().optional().default(""),
  spread_line: z.string().optional().default(""),
  total_line: z.string().optional().default(""),
  away_moneyline: z.string().optional().default(""),
  home_moneyline: z.string().optional().default(""),
});

export interface NormalizeNflverseOptions {
  /** Primera temporada a conservar (nflverse publica desde 1999). */
  fromSeason?: number;
  /** Última temporada a conservar. */
  toSeason?: number;
  includePostseason?: boolean;
}

export interface NflverseHistoryResult {
  games: HistoricalGame[];
  seasons: number[];
  skipped: {
    otherGameTypes: number;
    withoutScore: number;
    outOfRange: number;
  };
}

function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function closingOdds(row: z.infer<typeof NflverseHistoryRowSchema>): HistoricalClosingOdds | undefined {
  const spread = numberOrNull(row.spread_line);
  const total = numberOrNull(row.total_line);
  const moneylineHome = numberOrNull(row.home_moneyline);
  const moneylineAway = numberOrNull(row.away_moneyline);
  if (spread === null && total === null && moneylineHome === null && moneylineAway === null) {
    return undefined;
  }
  return {
    spread,
    total,
    moneylineHome,
    moneylineAway,
    usage: "research-only",
  };
}

export function normalizeNflverseHistory(
  csvText: string,
  options: NormalizeNflverseOptions = {},
): NflverseHistoryResult {
  const includePostseason = options.includePostseason ?? true;
  const rows = parseCsv(csvText);
  const games: HistoricalGame[] = [];
  const seasons = new Set<number>();
  const skipped = { otherGameTypes: 0, withoutScore: 0, outOfRange: 0 };

  for (const raw of rows) {
    const parsed = NflverseHistoryRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;

    const isRegular = REGULAR_SEASON_TYPES.has(row.game_type);
    const isPostseason = POSTSEASON_TYPES.has(row.game_type);
    if (!isRegular && !isPostseason) {
      skipped.otherGameTypes++;
      continue;
    }
    if (isPostseason && !includePostseason) {
      skipped.otherGameTypes++;
      continue;
    }
    if (options.fromSeason !== undefined && row.season < options.fromSeason) {
      skipped.outOfRange++;
      continue;
    }
    if (options.toSeason !== undefined && row.season > options.toSeason) {
      skipped.outOfRange++;
      continue;
    }

    if (row.home_score.trim() === "" || row.away_score.trim() === "") {
      skipped.withoutScore++;
      continue;
    }
    const homeScore = Number(row.home_score);
    const awayScore = Number(row.away_score);
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
      skipped.withoutScore++;
      continue;
    }

    const odds = closingOdds(row);
    const game: HistoricalGame = {
      id: `nfl:${row.game_id}`,
      sport: "american-football",
      league: "nfl",
      season: String(row.season),
      period: row.week,
      stage: null,
      phase: isRegular ? "regular" : "postseason",
      date: row.gameday,
      kickoff: /^\d{2}:\d{2}$/.test(row.gametime) ? row.gametime : null,
      kickoffZone: "America/New_York",
      homeTeam: nflTeamKey(row.home_team),
      awayTeam: nflTeamKey(row.away_team),
      homeScore,
      awayScore,
      neutralSite: row.location.trim().toLowerCase() === "neutral",
      source: "nflverse",
      sourceId: row.game_id,
      availableAt: scoreAvailableAt(row.gameday),
      ...(odds ? { odds } : {}),
    };

    games.push(game);
    seasons.add(row.season);
  }

  return { games, seasons: [...seasons].sort((a, b) => a - b), skipped };
}
