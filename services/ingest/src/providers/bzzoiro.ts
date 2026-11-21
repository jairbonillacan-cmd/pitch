/**
 * Adaptador de Bzzoiro Sports Data (API v2) para entrenar los motores de fútbol.
 *
 * Por partido terminado guarda: marcador final y al medio tiempo, xG y xG a puerta (con la
 * bandera de si es estimado), tiros, ocasiones claras, córners, faltas, tarjetas, posesión,
 * alineación confirmada (ids del XI) y jugadores no disponibles con su motivo.
 *
 * Cada fila lleva `source: "bzzoiro"` y los ids del proveedor; el emparejamiento con el
 * `match_id` canónico de PitchLab se hace aparte, nunca usando el id del proveedor como llave.
 *
 * Licencia (API Data Usage and License v4.0): se permite guardar, entrenar modelos y mostrar
 * resultados derivados; no se permite redistribuir el dato crudo. Por eso el JSONL vive en
 * `data/history/research/` (ignorado por Git).
 */
import {
  buildBzzoiroTeamEmblemUrlById,
  getBzzoiroLeagueEmblemUrl,
  getBzzoiroTeamEmblemUrl,
  isValidBzzoiroImageUrl,
} from "@pitchlab/sports-assets";
import { slugifyTeamName } from "../team-slug.js";
import type { ProviderClient } from "./http.js";

/** Ligas de Bzzoiro por liga de PitchLab (ids de `/api/v2/leagues/`). */
export const BZZOIRO_LEAGUES = {
  "liga-mx": [19, 20],
  "premier-league": [1],
  laliga: [3],
  bundesliga: [5],
  "serie-a": [4],
  "ligue-1": [6],
  // Expansión clubes fútbol (ADR-043)
  mls: [18],
  "champions-league": [7],
  "europa-league": [8],
  "conference-league": [83],
  "uefa-super-cup": [90],
  libertadores: [32],
  sudamericana: [33],
  "caf-champions": [29],
  "liga-argentina": [85],
  brasileirao: [9],
  "brasileirao-b": [34],
  "copa-do-brasil": [35],
  "primera-a-colombia": [80],
  "copa-colombia": [81],
  "primera-chile": [111],
  "ligapro-ecuador": [112],
  "liga-1-peru": [113],
  championship: [12],
  "fa-cup": [39],
  "carabao-cup": [40],
  "segunda-espana": [38],
  "copa-del-rey": [41],
  "liga-f": [36],
  "bundesliga-2": [94],
  "dfb-pokal": [43],
  "serie-b": [100],
  "coppa-italia": [42],
  "ligue-2": [89],
  "coupe-de-france": [44],
  eredivisie: [10],
  "liga-portugal": [2],
  "pro-league-belgica": [14],
  "super-lig": [11],
  "saudi-pro-league": [17],
  "j1-league": [49],
} as const satisfies Record<string, readonly number[]>;

export type BzzoiroLeagueKey = keyof typeof BZZOIRO_LEAGUES;

// ---------- Formas de la API (solo los campos que usamos) ----------

export interface BzImageFields {
  logo?: string | null;
  logo_url?: string | null;
  image?: string | null;
  image_url?: string | null;
  crest?: string | null;
  badge?: string | null;
}

export interface BzEvent extends BzImageFields {
  id: number;
  league_id: number;
  season_id: number;
  home_team_id: number;
  home_team: string;
  away_team_id: number;
  away_team: string;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  league_logo?: string | null;
  home_coach_id?: number | null;
  away_coach_id?: number | null;
  referee_id?: number | null;
  venue_id?: number | null;
  event_date: string;
  status: string;
  round_number?: number | null;
  stage?: string | null;
  home_score: number | null;
  away_score: number | null;
  home_score_ht?: number | null;
  away_score_ht?: number | null;
  extra_time_score?: unknown;
  penalty_shootout?: unknown;
  is_local_derby?: boolean | null;
  is_neutral_ground?: boolean | null;
  travel_distance_km?: number | null;
  weather?: { code?: number; description?: string; wind_speed?: number; temperature_c?: number } | null;
  pitch_condition?: number | null;
  has_xg?: boolean | null;
}

export interface BzPage<T> {
  count: number;
  next: string | null;
  results: T[];
}

type Ratio = { value?: number; total?: number; pct?: number };
export type BzTeamStatsRaw = Record<string, number | Ratio | { actual?: number; estimated?: boolean } | null | undefined>;

export interface BzStatsResponse {
  event_id: number;
  stats?: { home?: BzTeamStatsRaw; away?: BzTeamStatsRaw } | null;
  xg_estimated?: boolean | null;
  momentum?: readonly { m?: number; v?: number }[] | null;
  xg_per_minute?: readonly {
    m?: number;
    xg_home?: number;
    xg_away?: number;
    cum_home?: number;
    cum_away?: number;
    estimated?: boolean;
  }[] | null;
  shotmap?: readonly Record<string, unknown>[] | null;
  average_positions?: unknown;
  averagePositions?: unknown;
}

export interface BzRefereeRaw {
  id?: number | null;
  name?: string | null;
  full_name?: string | null;
  country?: string | null;
  nationality?: string | null;
  matches?: number | null;
  matches_total?: number | null;
  games?: number | null;
  avg_yellow_per_match?: number | null;
  yellow_cards_per_game?: number | null;
  avg_yellow?: number | null;
  yellow_cards?: number | null;
  avg_red_per_match?: number | null;
  red_cards_per_game?: number | null;
  avg_red?: number | null;
  red_cards?: number | null;
  avg_fouls_per_match?: number | null;
  fouls_per_game?: number | null;
  avg_fouls?: number | null;
  fouls?: number | null;
  avg_goals_per_match?: number | null;
  avg_goals?: number | null;
  avg_penalties_per_match?: number | null;
}

export interface BzH2hMatchRaw {
  id?: number | null;
  event_id?: number | null;
  event_date?: string | null;
  date?: string | null;
  home_team?: string | { id?: number | null; name?: string | null } | null;
  away_team?: string | { id?: number | null; name?: string | null } | null;
  home_score?: number | null;
  away_score?: number | null;
  league?: string | { id?: number | null; name?: string | null } | null;
  competition?: string | null;
  status?: string | null;
}

export interface BzLineupPlayer {
  id: number;
  name?: string;
  position?: string | null;
}

export interface BzUnavailable {
  id: number;
  name?: string;
  status?: string | null;
  reason?: string | null;
}

export interface BzLineupsResponse {
  event_id: number;
  lineup_status: "confirmed" | "predicted" | "unavailable" | string;
  lineups?: {
    home?: { formation?: string | null; players?: BzLineupPlayer[] } | null;
    away?: { formation?: string | null; players?: BzLineupPlayer[] } | null;
  } | null;
  unavailable_players?: { home?: BzUnavailable[]; away?: BzUnavailable[] } | null;
}

// ---------- Filas normalizadas ----------

export interface TeamMatchStats {
  xg: number | null;
  xgEstimated: boolean | null;
  xgOnTarget: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  shotsInsideBox: number | null;
  bigChances: number | null;
  corners: number | null;
  fouls: number | null;
  yellowCards: number | null;
  redCards: number | null;
  possessionPct: number | null;
  touchesInBox: number | null;
  passAccuracyPct: number | null;
  goalsPrevented: number | null;
}

export interface TeamLineup {
  formation: string | null;
  starterIds: number[];
  unavailable: { id: number; name: string; status: string | null; reason: string | null }[];
}

export interface BzzoiroMatchRow {
  source: "bzzoiro";
  league: BzzoiroLeagueKey;
  providerMatchId: number;
  providerLeagueId: number;
  providerSeasonId: number;
  kickoffUtc: string;
  status: string;
  stage: string | null;
  round: number | null;
  home: { providerTeamId: number; name: string; slug: string; coachId: number | null; logoUrl?: string };
  away: { providerTeamId: number; name: string; slug: string; coachId: number | null; logoUrl?: string };
  score: { home: number | null; away: number | null; htHome: number | null; htAway: number | null };
  wentBeyond90: boolean;
  context: {
    refereeId: number | null;
    venueId: number | null;
    neutral: boolean;
    derby: boolean;
    travelKm: number | null;
    temperatureC: number | null;
    windSpeed: number | null;
    weatherCode: number | null;
  };
  stats: { home: TeamMatchStats; away: TeamMatchStats } | null;
  lineups: { status: string; home: TeamLineup; away: TeamLineup } | null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const UNCOVERED_BZZOIRO_LEAGUES = new Set(["nfl", "mlb", "nhl"]);
const EXPLICIT_IMAGE_KEYS = ["logoUrl", "logo_url", "logo", "image_url", "image", "crest", "badge"] as const;

/** Extrae una URL explícita si algún payload de Bzzoiro incluye campo de imagen válido. */
export function pickExplicitBzzoiroImageUrl(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    return isValidBzzoiroImageUrl(raw) ? raw : undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  for (const key of EXPLICIT_IMAGE_KEYS) {
    const candidate = record[key];
    if (isValidBzzoiroImageUrl(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Resuelve la URL de escudo de un club desde el campo explícito de Bzzoiro (si existe),
 * su `providerTeamId`, o el catálogo canónico en `@pitchlab/sports-assets`.
 * Devuelve `undefined` para ligas sin cobertura (NFL, MLB, NHL).
 */
export function mapBzzoiroTeamLogoUrl(
  league: string,
  teamSlugOrId: string,
  options?: { providerTeamId?: number | null; raw?: unknown },
): string | undefined {
  if (UNCOVERED_BZZOIRO_LEAGUES.has(league)) return undefined;
  const explicit = pickExplicitBzzoiroImageUrl(options?.raw);
  if (explicit) return explicit;
  if (typeof options?.providerTeamId === "number" && Number.isInteger(options.providerTeamId) && options.providerTeamId > 0) {
    return buildBzzoiroTeamEmblemUrlById(league, options.providerTeamId) ?? undefined;
  }
  if (!teamSlugOrId) return undefined;
  const cleanSlug = teamSlugOrId.includes(".") ? teamSlugOrId.split(".")[1]! : teamSlugOrId;
  return getBzzoiroTeamEmblemUrl(league, cleanSlug) ?? undefined;
}

/**
 * Resuelve la URL de emblema de una competición desde Bzzoiro o su id canónico.
 * Devuelve `undefined` para ligas sin cobertura (NFL, MLB, NHL).
 */
export function mapBzzoiroLeagueLogoUrl(
  league: string,
  options?: { providerLeagueId?: number | null; raw?: unknown },
): string | undefined {
  if (UNCOVERED_BZZOIRO_LEAGUES.has(league)) return undefined;
  const explicit = pickExplicitBzzoiroImageUrl(options?.raw);
  if (explicit) return explicit;
  if (
    typeof options?.providerLeagueId === "number" &&
    Number.isInteger(options.providerLeagueId) &&
    options.providerLeagueId > 0
  ) {
    const segment = league === "nba" ? "basketball/league" : "league";
    return `https://sports.bzzoiro.com/img/${segment}/${options.providerLeagueId}/?bg=transparent`;
  }
  return getBzzoiroLeagueEmblemUrl(league) ?? undefined;
}

function plain(raw: BzTeamStatsRaw | undefined, key: string): number | null {
  const value = raw?.[key];
  if (typeof value === "number") return num(value);
  if (value && typeof value === "object" && "value" in value) return num((value as Ratio).value);
  return null;
}

export function parseTeamStats(raw: BzTeamStatsRaw | undefined): TeamMatchStats {
  const xgNode = raw?.xg;
  const xgObj = xgNode && typeof xgNode === "object" && "actual" in xgNode ? xgNode : null;
  return {
    xg: num(xgObj?.actual) ?? plain(raw, "xg") ?? plain(raw, "expected_goals"),
    xgEstimated: typeof xgObj?.estimated === "boolean" ? xgObj.estimated : null,
    xgOnTarget: plain(raw, "expected_goals_on_target"),
    shots: plain(raw, "total_shots"),
    shotsOnTarget: plain(raw, "shots_on_target"),
    shotsInsideBox: plain(raw, "shots_inside_box"),
    bigChances: plain(raw, "big_chances"),
    corners: plain(raw, "corner_kicks"),
    fouls: plain(raw, "fouls"),
    yellowCards: plain(raw, "yellow_cards"),
    redCards: plain(raw, "red_cards"),
    possessionPct: plain(raw, "ball_possession"),
    touchesInBox: plain(raw, "touches_in_penalty_area"),
    passAccuracyPct: plain(raw, "pass_accuracy_pct"),
    goalsPrevented: plain(raw, "goals_prevented"),
  };
}

function parseSide(
  side: { formation?: string | null; players?: BzLineupPlayer[] } | null | undefined,
  unavailable: BzUnavailable[] | undefined,
): TeamLineup {
  return {
    formation: side?.formation ?? null,
    starterIds: (side?.players ?? []).map((p) => p.id).filter((id) => Number.isInteger(id)),
    unavailable: (unavailable ?? []).map((u) => ({
      id: u.id,
      name: u.name ?? "",
      status: u.status ?? null,
      reason: u.reason ?? null,
    })),
  };
}

export function parseLineups(raw: BzLineupsResponse | null): BzzoiroMatchRow["lineups"] {
  if (!raw) return null;
  return {
    status: raw.lineup_status,
    home: parseSide(raw.lineups?.home, raw.unavailable_players?.home),
    away: parseSide(raw.lineups?.away, raw.unavailable_players?.away),
  };
}

export function toMatchRow(
  league: BzzoiroLeagueKey,
  event: BzEvent,
  stats: BzStatsResponse | null,
  lineups: BzLineupsResponse | null,
): BzzoiroMatchRow {
  const home = stats?.stats?.home;
  const away = stats?.stats?.away;
  return {
    source: "bzzoiro",
    league,
    providerMatchId: event.id,
    providerLeagueId: event.league_id,
    providerSeasonId: event.season_id,
    kickoffUtc: event.event_date,
    status: event.status,
    stage: event.stage ?? null,
    round: num(event.round_number),
    home: {
      providerTeamId: event.home_team_id,
      name: event.home_team,
      slug: slugifyTeamName(event.home_team),
      coachId: num(event.home_coach_id),
      logoUrl: mapBzzoiroTeamLogoUrl(league, slugifyTeamName(event.home_team), {
        providerTeamId: event.home_team_id,
        raw: event.home_team_logo,
      }),
    },
    away: {
      providerTeamId: event.away_team_id,
      name: event.away_team,
      slug: slugifyTeamName(event.away_team),
      coachId: num(event.away_coach_id),
      logoUrl: mapBzzoiroTeamLogoUrl(league, slugifyTeamName(event.away_team), {
        providerTeamId: event.away_team_id,
        raw: event.away_team_logo,
      }),
    },
    score: {
      home: num(event.home_score),
      away: num(event.away_score),
      htHome: num(event.home_score_ht),
      htAway: num(event.away_score_ht),
    },
    wentBeyond90: event.extra_time_score != null || event.penalty_shootout != null,
    context: {
      refereeId: num(event.referee_id),
      venueId: num(event.venue_id),
      neutral: event.is_neutral_ground === true,
      derby: event.is_local_derby === true,
      travelKm: num(event.travel_distance_km),
      temperatureC: num(event.weather?.temperature_c),
      windSpeed: num(event.weather?.wind_speed),
      weatherCode: num(event.weather?.code),
    },
    stats: home || away ? { home: parseTeamStats(home), away: parseTeamStats(away) } : null,
    lineups: parseLineups(lineups),
  };
}

// ---------- Recolección ----------

export interface BzSeason {
  id: number;
  name: string;
  year: number | null;
  is_current: boolean;
}

export async function listSeasons(client: ProviderClient, leagueId: number): Promise<BzSeason[]> {
  // La temporada en curso cambia; la lista se pide fresca.
  const res = await client.get<{ seasons?: BzSeason[] }>(`/leagues/${leagueId}/seasons/`, { cache: false });
  return res?.seasons ?? [];
}

export async function listFinishedEvents(
  client: ProviderClient,
  seasonId: number,
  isCurrentSeason: boolean,
): Promise<BzEvent[]> {
  const events: BzEvent[] = [];
  const limit = 200;
  for (let offset = 0; ; offset += limit) {
    const page = await client.get<BzPage<BzEvent>>(
      `/events/?season_id=${seasonId}&status=finished&limit=${limit}&offset=${offset}`,
      { cache: !isCurrentSeason },
    );
    if (!page) break;
    events.push(...page.results);
    if (!page.next || page.results.length < limit) break;
  }
  return events;
}

export interface CollectSeasonOptions {
  readonly withDetails: boolean;
  readonly onProgress?: (done: number, total: number) => void;
}

export async function collectSeason(
  client: ProviderClient,
  league: BzzoiroLeagueKey,
  season: BzSeason,
  options: CollectSeasonOptions,
): Promise<BzzoiroMatchRow[]> {
  const events = await listFinishedEvents(client, season.id, season.is_current);
  const rows: BzzoiroMatchRow[] = [];
  for (const [index, event] of events.entries()) {
    let stats: BzStatsResponse | null = null;
    let lineups: BzLineupsResponse | null = null;
    if (options.withDetails) {
      // Un partido terminado ya no cambia: se cachea para siempre.
      stats = await client.get<BzStatsResponse>(`/events/${event.id}/stats/`);
      lineups = await client.get<BzLineupsResponse>(`/events/${event.id}/lineups/`);
    }
    rows.push(toMatchRow(league, event, stats, lineups));
    options.onProgress?.(index + 1, events.length);
  }
  return rows;
}
