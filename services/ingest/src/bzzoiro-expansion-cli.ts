/**
 * Pipeline homogéneo para la expansión del catálogo de fútbol (+37 competiciones) e hidratación
 * de árbitros en todas las ligas de PitchLab (ADR-043).
 *
 * - 35 competiciones vía Bzzoiro Sports Data (`/api/v2/events/`, `/api/venues/`,
 *   `/api/v2/referees/`, `/api/managers/`, `/api/v2/players/`, `/api/player-stats/`, `/api/odds/`).
 * - 2 competiciones CONCACAF de clubes (`concacaf-champions`, `leagues-cup`) vía ESPN público
 *   gratuito, cruzando clubes de Liga MX y MLS con sus plantillas y escudos oficiales de Bzzoiro.
 * - Hidratación de árbitros y promedios disciplinarios para las ligas Top 5 + Liga MX (Bzzoiro)
 *   y oficiales para deportes US (ESPN `summary`).
 *
 * Cumple FD-16, Cero-Fuga y ADR-039: IDs de juego opacos sin prefijos de proveedor, retratos con
 * llave opaca `pl-p:<id>` / `pl-m:<id>` y calibración propia con `buildFootballSnapshot`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BZZOIRO_EXPANSION_COMPETITIONS,
  COMPETITION_BY_ID,
  LeagueInjuriesFileSchema,
  LeagueSnapshotSchema,
  LeagueSquadsFileSchema,
  asGameId,
  asLeagueId,
  asSeasonId,
  asTeamId,
  opaqueShortCode,
  parseStrictFiniteNumber,
  slugifyPlayerName,
  type CompetitionMeta,
  type GameDTO,
  type LeagueId,
  type LeagueSnapshot,
  type MatchPreGameContext,
  type SquadCoachProfile,
  type SquadPlayerEntry,
  type Team,
  type TeamInjuryEntry,
  type TeamSquadEntry,
} from "@pitchlab/contracts";
import type { FootballTeamRateInput } from "@pitchlab/engines-reference";
import {
  buildBzzoiroTeamEmblemUrlById,
  getBzzoiroLeagueEmblemUrl,
  getBzzoiroTeamEmblemUrl,
  getOfficialEspnLeagueLogoUrl,
} from "@pitchlab/sports-assets";
import { loadRootEnvFiles } from "./env.js";
import {
  BZZOIRO_TIER1_CUP_ODDS_LEAGUES,
  classifyLineMovement,
  type LineMovementSignal,
} from "./odds/bzzoiro-odds.js";
import {
  buildFootballSnapshot,
  loadPreviousSnapshot,
  writeSeasonResultsFile,
  writeSnapshotFiles,
} from "./pipeline.js";
import { parseBzzoiroH2h, parseBzzoiroRefereeProfile } from "./providers/bzzoiro-enrichment.js";
import { parseBroadcastsMx, type BzBroadcastRaw, type BzList } from "./providers/bzzoiro-live.js";
import { slugifyTeamName, teamCodeFromSlug } from "./team-slug.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const SNAPSHOTS_ROOT = join(REPO_ROOT, "data/snapshots");
const BZZOIRO_BASE = "https://sports.bzzoiro.com";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface BzEventV2 {
  id: number;
  league_id: number;
  season_id?: number;
  home_team_id: number;
  home_team: string;
  away_team_id: number;
  away_team: string;
  home_coach_id?: number | null;
  away_coach_id?: number | null;
  referee_id?: number | null;
  venue_id?: number | null;
  event_date: string;
  status: string;
  round_number?: number | null;
  round_name?: string | null;
  group_name?: string | null;
  stage?: string | null;
  stage_name?: string | null;
  round_label?: string | null;
  home_score: number | null;
  away_score: number | null;
  home_score_ht?: number | null;
  away_score_ht?: number | null;
  extra_time_score?: { home?: number; away?: number } | null;
  penalty_shootout?: { home?: number; away?: number } | null;
  previous_leg_event_id?: number | null;
  is_local_derby?: boolean | null;
  is_neutral_ground?: boolean | null;
  travel_distance_km?: number | null;
  attendance?: number | null;
  weather?: { description?: string; temperature_c?: number; wind_speed?: number } | null;
  pitch_condition?: string | number | null;
  head_to_head?: Array<{
    event_date?: string;
    date?: string;
    home_team?: string;
    away_team?: string;
    home_score?: number;
    away_score?: number;
  }> | null;
}

interface BzVenue {
  id: number;
  name?: string;
  city?: string;
  country?: string;
  capacity?: number | null;
}

interface BzReferee {
  id: number;
  name?: string;
  country?: string;
  matches?: number | null;
  avg_yellow_per_match?: number | null;
  avg_red_per_match?: number | null;
  avg_fouls_per_match?: number | null;
  avg_goals_per_match?: number | null;
}

interface BzManager {
  id: number;
  name?: string;
  short_name?: string | null;
  country?: string | null;
  preferred_formation?: string | null;
  profile?: string | null;
  tactical_styles?: Array<{ name?: string; description?: string }> | null;
  matches_total?: number | null;
  wins?: number | null;
  draws?: number | null;
  losses?: number | null;
  win_pct?: number | null;
}

interface BzPlayer {
  id: number;
  name?: string;
  short_name?: string | null;
  position?: string | null;
  shirt_number?: number | null;
  jersey_number?: number | null;
  date_of_birth?: string | null;
  birthdate?: string | null;
  height?: number | null;
  height_cm?: number | null;
  weight?: number | null;
  preferred_foot?: string | null;
  nationality?: string | null;
  country?: string | null;
  availability?: string | null;
  status?: string | null;
  injury_type?: string | null;
  expected_return?: string | null;
}

interface BzPlayerStat {
  player_id?: number;
  player?: number | { id?: number; name?: string };
  appearances?: number;
  matches?: number;
  goals?: number;
  assists?: number;
  shots?: number;
  total_shots?: number;
  shots_on_target?: number;
  yellow_cards?: number;
  red_cards?: number;
  fouls_committed?: number;
  fouls_drawn?: number;
  saves?: number;
  goals_conceded?: number;
}

interface BzOddsEntry {
  event_id?: number;
  market?: string;
  outcome?: string;
  line?: number | null;
  bookmaker_slug?: string;
  bookmaker_name?: string;
  decimal_odds?: number;
  opening_odds?: number | null;
  opening_decimal_odds?: number | null;
  movement?: string | null;
  updated_at?: string | null;
}

interface CompactMarketLine {
  gameId: string;
  homeName: string;
  awayName: string;
  market: string;
  outcome: string;
  line: number | null;
  book: string;
  decimal: number;
  openingDecimal?: number;
  deltaPct?: number;
  movement?: "shortening" | "drifting" | "stable";
  movementSignal?: LineMovementSignal;
  capturedAtUtc: string;
}

class BzzoiroClient {
  private readonly token: string;
  readonly unlimited: boolean;
  private readonly venueCache = new Map<number, BzVenue | null>();
  private readonly refereeCache = new Map<number, BzReferee | null>();
  private readonly managerCache = new Map<number, BzManager | null>();
  private requestCount = 0;

  constructor(token: string, unlimited = false) {
    this.token = token;
    this.unlimited = unlimited;
  }

  async getJson<T>(pathWithQuery: string, retries = 2): Promise<T | null> {
    const url = pathWithQuery.startsWith("http") ? pathWithQuery : `${BZZOIRO_BASE}${pathWithQuery}`;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      this.requestCount += 1;
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Token ${this.token}`, Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status === 429) {
          const waitSec = Number(res.headers.get("retry-after") ?? "2");
          await sleep(Math.min(10_000, Math.max(1_000, waitSec * 1_000)));
          continue;
        }
        if (res.status === 404) return null;
        if (!res.ok) {
          if (attempt < retries) {
            await sleep(500 * (attempt + 1));
            continue;
          }
          return null;
        }
        return (await res.json()) as T;
      } catch (err) {
        void err;
        if (attempt < retries) await sleep(500 * (attempt + 1));
      }
    }
    return null;
  }

  async fetchEvents(leagueId: number, dateFrom: string, dateTo: string, maxPages = 4): Promise<BzEventV2[]> {
    const out: BzEventV2[] = [];
    let nextUrl: string | null =
      `/api/v2/events/?league=${leagueId}&date_from=${dateFrom}&date_to=${dateTo}&limit=200`;
    for (let page = 0; page < maxPages && nextUrl; page += 1) {
      const data: { results?: BzEventV2[]; next?: string | null } | null = await this.getJson<{
        results?: BzEventV2[];
        next?: string | null;
      }>(nextUrl);
      if (!data?.results?.length) break;
      out.push(...data.results);
      nextUrl = data.next ?? null;
      if (nextUrl) await sleep(80);
    }
    return out;
  }

  async getVenue(id: number): Promise<BzVenue | null> {
    if (this.venueCache.has(id)) return this.venueCache.get(id) ?? null;
    const data = await this.getJson<BzVenue>(`/api/venues/${id}/`);
    this.venueCache.set(id, data);
    return data;
  }

  async getReferee(id: number): Promise<BzReferee | null> {
    if (this.refereeCache.has(id)) return this.refereeCache.get(id) ?? null;
    const data = await this.getJson<BzReferee>(`/api/v2/referees/${id}/`);
    this.refereeCache.set(id, data);
    return data;
  }

  async getManager(id: number): Promise<BzManager | null> {
    if (this.managerCache.has(id)) return this.managerCache.get(id) ?? null;
    const data = await this.getJson<BzManager>(`/api/managers/${id}/`);
    this.managerCache.set(id, data);
    return data;
  }

  async fetchTeamPlayers(teamId: number): Promise<BzPlayer[]> {
    const data = await this.getJson<{ results?: BzPlayer[] } | BzPlayer[]>(
      `/api/v2/players/?team_id=${teamId}&limit=50`,
    );
    if (!data) return [];
    return Array.isArray(data) ? data : (data.results ?? []);
  }

  async fetchTeamPlayerStats(teamId: number): Promise<BzPlayerStat[]> {
    const data = await this.getJson<{ results?: BzPlayerStat[] } | BzPlayerStat[]>(
      `/api/player-stats/?team=${teamId}&limit=50`,
    );
    if (!data) return [];
    return Array.isArray(data) ? data : (data.results ?? []);
  }

  async fetchEventOdds(eventId: number): Promise<BzOddsEntry[]> {
    const data = await this.getJson<{ results?: BzOddsEntry[] } | BzOddsEntry[]>(
      `/api/v2/odds/?event_id=${eventId}&limit=200`,
    );
    if (!data) return [];
    return Array.isArray(data) ? data : (data.results ?? []);
  }

  async fetchEventOddsComparison(eventId: number): Promise<BzOddsEntry[]> {
    const data = await this.getJson<{ results?: BzOddsEntry[]; comparisons?: BzOddsEntry[] } | BzOddsEntry[]>(
      `/api/v2/events/${eventId}/odds/comparison/`,
    );
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return data.results ?? data.comparisons ?? [];
  }

  async fetchEventBroadcastsMx(eventId: number): Promise<string[]> {
    const data = await this.getJson<BzList<BzBroadcastRaw>>(
      `/api/v2/events/${eventId}/broadcasts/?country_code=MX`,
    );
    return parseBroadcastsMx(data);
  }

  async fetchEventH2h(eventId: number, homeTeam: string, awayTeam: string) {
    const data = await this.getJson<BzList<{ event_date?: string; date?: string; home_team?: string; away_team?: string; home_score?: number; away_score?: number }>>(
      `/api/v2/events/${eventId}/h2h/`,
    );
    return parseBzzoiroH2h(data, { homeTeamName: homeTeam, awayTeamName: awayTeam, limit: 6 });
  }

  get totalRequests(): number {
    return this.requestCount;
  }
}

function mapBzStatus(raw: string): GameDTO["status"] {
  const s = (raw ?? "").toLowerCase();
  if (s === "finished" || s === "ft" || s === "aet" || s === "pen") return "final";
  if (s === "live" || s === "inplay" || s === "in_progress" || s === "ht" || s === "1h" || s === "2h") {
    return "in_progress";
  }
  if (s === "postponed") return "postponed";
  if (s === "canceled" || s === "cancelled" || s === "abandoned") return "canceled";
  return "scheduled";
}

function mapPositionGroup(pos: string | null | undefined): "GK" | "DEF" | "MID" | "FWD" {
  const p = (pos ?? "").trim().toUpperCase();
  if (p.includes("GK") || p.includes("GOAL") || p.includes("POR")) return "GK";
  if (p.includes("DEF") || p.includes("CB") || p.includes("LB") || p.includes("RB") || p.includes("WB")) return "DEF";
  if (p.includes("FW") || p.includes("ST") || p.includes("CF") || p.includes("LW") || p.includes("RW") || p.includes("ATT")) return "FWD";
  return "MID";
}

function positionLabelEs(pos: string | null | undefined, group: "GK" | "DEF" | "MID" | "FWD"): string {
  const clean = (pos ?? "").trim();
  if (clean) return clean.slice(0, 32);
  if (group === "GK") return "Portero";
  if (group === "DEF") return "Defensa";
  if (group === "FWD") return "Delantero";
  return "Mediocampista";
}

function mapPreferredFoot(raw: string | null | undefined): "R" | "L" | "B" | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (v.startsWith("r") || v.startsWith("der")) return "R";
  if (v.startsWith("l") || v.startsWith("izq")) return "L";
  if (v.startsWith("b") || v.includes("amb")) return "B";
  return null;
}

function mapAvailability(raw: string | null | undefined): "available" | "injured" | "doubtful" | "suspended" | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v || v === "available" || v === "fit") return "available";
  if (v.includes("suspend")) return "suspended";
  if (v.includes("doubt") || v.includes("quest")) return "doubtful";
  if (v.includes("injur") || v.includes("out")) return "injured";
  return null;
}

function computeAge(birthDate: string | null | undefined, refDate: Date): number | null {
  if (!birthDate) return null;
  const parsed = Date.parse(birthDate);
  if (!Number.isFinite(parsed)) return null;
  const age = Math.floor((refDate.getTime() - parsed) / (365.25 * 86_400_000));
  return age >= 14 && age <= 55 ? age : null;
}

function cleanShortTeamName(name: string): string {
  const stripped = name
    .replace(/\b(FC|CF|SC|AC|AS|CD|CA|UD|SD|RCD|SV|VfL|VfB|TSG|Club|Atlético|Atletico|Deportivo)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (stripped.length >= 3 ? stripped : name).slice(0, 22);
}

function makeOpaqueGameId(league: string, dateIso: string, homeSlug: string, awaySlug: string, salt: string): string {
  const day = dateIso.slice(0, 10);
  const code = opaqueShortCode(`${league}|${day}|${homeSlug}|${awaySlug}|${salt}`);
  return `${league}-${day}-${homeSlug.slice(0, 14)}-${awaySlug.slice(0, 14)}-${code}`;
}

function buildFootballTeamRates(
  league: LeagueId,
  teamsById: Map<string, Team>,
  seasonGames: readonly GameDTO[],
): FootballTeamRateInput[] {
  const stats = new Map<string, { gp: number; gf: number; ga: number }>();
  for (const id of teamsById.keys()) stats.set(id, { gp: 0, gf: 0, ga: 0 });
  for (const g of seasonGames) {
    if (g.status !== "final" || !g.result) continue;
    const hs = stats.get(g.home.id) ?? { gp: 0, gf: 0, ga: 0 };
    hs.gp += 1;
    hs.gf += g.result.home;
    hs.ga += g.result.away;
    stats.set(g.home.id, hs);

    const as = stats.get(g.away.id) ?? { gp: 0, gf: 0, ga: 0 };
    as.gp += 1;
    as.gf += g.result.away;
    as.ga += g.result.home;
    stats.set(g.away.id, as);
  }
  return [...teamsById.values()].map((t) => {
    const s = stats.get(t.id) ?? { gp: 0, gf: 0, ga: 0 };
    return {
      teamId: t.id,
      name: t.name,
      shortName: t.shortName,
      code: t.code,
      gamesPlayed: s.gp,
      goalsFor: s.gf,
      goalsAgainst: s.ga,
    };
  });
}

function buildContextFromEvent(
  ev: BzEventV2,
  venue: BzVenue | null,
  referee: BzReferee | null,
  broadcastsMx: readonly string[] = [],
): MatchPreGameContext | undefined {
  const ctx: MatchPreGameContext = {};
  const parsedRef = parseBzzoiroRefereeProfile(referee);
  if (parsedRef) {
    ctx.referee = parsedRef.name;
    ctx.refereeStats = {
      ...(parsedRef.country ? { country: parsedRef.country } : {}),
      ...(parsedRef.matches > 0 ? { matches: parsedRef.matches } : {}),
      ...(parsedRef.avgYellow !== null ? { avgYellow: parsedRef.avgYellow } : {}),
      ...(parsedRef.avgRed !== null ? { avgRed: parsedRef.avgRed } : {}),
      ...(parsedRef.avgFouls !== null ? { avgFouls: parsedRef.avgFouls } : {}),
      ...(parsedRef.avgGoals !== null ? { avgGoals: parsedRef.avgGoals } : {}),
    };
  }
  if (broadcastsMx.length > 0) {
    ctx.broadcastsMx = [...broadcastsMx].slice(0, 8);
  }
  if (ev.weather && (ev.weather.description || ev.weather.temperature_c != null || ev.weather.wind_speed != null)) {
    ctx.weather = {
      ...(ev.weather.description ? { description: String(ev.weather.description).slice(0, 120) } : {}),
      ...(typeof ev.weather.temperature_c === "number" ? { temperatureC: ev.weather.temperature_c } : {}),
      ...(typeof ev.weather.wind_speed === "number" ? { windSpeedKmh: Math.round(ev.weather.wind_speed * 3.6) } : {}),
    };
  }
  if (typeof ev.travel_distance_km === "number" && ev.travel_distance_km >= 0) {
    ctx.travelDistanceKm = Math.round(ev.travel_distance_km);
  }
  if (ev.is_local_derby) ctx.isLocalDerby = true;
  if (typeof ev.home_score_ht === "number" && typeof ev.away_score_ht === "number") {
    ctx.halfTimeScore = { home: ev.home_score_ht, away: ev.away_score_ht };
  }
  if (ev.extra_time_score && typeof ev.extra_time_score.home === "number" && typeof ev.extra_time_score.away === "number") {
    ctx.extraTimeScore = { home: ev.extra_time_score.home, away: ev.extra_time_score.away };
  }
  if (ev.penalty_shootout && typeof ev.penalty_shootout.home === "number" && typeof ev.penalty_shootout.away === "number") {
    ctx.penaltyShootout = { home: ev.penalty_shootout.home, away: ev.penalty_shootout.away };
  }
  if (ev.group_name) ctx.groupName = String(ev.group_name).slice(0, 80);
  if (ev.stage_name || ev.stage) ctx.stageName = String(ev.stage_name || ev.stage).slice(0, 100);
  if (venue?.city) ctx.venueCity = venue.city.slice(0, 80);
  if (venue?.country) ctx.venueCountry = venue.country.slice(0, 80);
  if (typeof venue?.capacity === "number" && venue.capacity > 0) ctx.venueCapacity = venue.capacity;
  if (typeof ev.attendance === "number" && ev.attendance > 0) ctx.attendance = ev.attendance;

  return Object.keys(ctx).length > 0 ? ctx : undefined;
}

function buildCoachProfile(mgr: BzManager | null): SquadCoachProfile | null {
  if (!mgr?.name) return null;
  const style = mgr.tactical_styles?.[0]?.name ?? mgr.profile ?? null;
  return {
    name: mgr.name,
    shortName: mgr.short_name ?? null,
    photoKey: `pl-m:${mgr.id}`,
    nationality: mgr.country ?? null,
    preferredFormation: mgr.preferred_formation ?? null,
    styleLabel: style,
    careerRecord:
      typeof mgr.matches_total === "number" && mgr.matches_total > 0
        ? {
            matches: mgr.matches_total,
            wins: mgr.wins ?? 0,
            draws: mgr.draws ?? 0,
            losses: mgr.losses ?? 0,
            winPct: typeof mgr.win_pct === "number" ? mgr.win_pct : null,
          }
        : null,
  };
}

async function ingestBzzoiroCompetition(
  client: BzzoiroClient,
  meta: CompetitionMeta,
  now: Date,
  options: { hydrateSquads: boolean; maxSquadTeams: number },
): Promise<{ league: string; upcoming: number; finished: number; squads: number; referees: number }> {
  const league = meta.id;
  const bzLeagueId = meta.bzzoiroId!;
  const todayIso = now.toISOString().slice(0, 10);
  const seasonFrom = new Date(now.getTime() - 150 * 86_400_000).toISOString().slice(0, 10);
  const horizonTo = new Date(now.getTime() + 35 * 86_400_000).toISOString().slice(0, 10);

  const rawEvents = await client.fetchEvents(bzLeagueId, seasonFrom, horizonTo, 4);
  const updatedAt = now.toISOString();
  const leagueLogoUrl = getBzzoiroLeagueEmblemUrl(league) ?? undefined;

  const teamsById = new Map<string, Team>();
  const bzTeamIdByTeamId = new Map<string, number>();
  const coachIdByTeamId = new Map<string, number>();
  const allGames: GameDTO[] = [];
  const contextByGameId = new Map<string, MatchPreGameContext>();
  const h2hByGameId = new Map<
    string,
    Array<{ date: string; homeTeamId: string; awayTeamId: string; homeGoals: number; awayGoals: number }>
  >();

  // Filtramos primero para limitar consultas de venue/referee a partidos relevantes del snapshot
  const sortedRaw = [...rawEvents].sort((a, b) => (a.event_date || "").localeCompare(b.event_date || ""));
  const upcomingRaw = sortedRaw.filter((e) => {
    const st = mapBzStatus(e.status);
    return (st === "scheduled" || st === "in_progress") && (e.event_date || "").slice(0, 10) >= new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  });
  const finishedRaw = sortedRaw.filter((e) => mapBzStatus(e.status) === "final" && e.home_score != null && e.away_score != null);
  const recentFinishedRaw = finishedRaw.slice(-16);
  const snapshotRawSet = new Set<number>([
    ...recentFinishedRaw.map((e) => e.id),
    ...upcomingRaw.slice(0, 32).map((e) => e.id),
  ]);

  let refereeHits = 0;

  for (const ev of sortedRaw) {
    if (!ev.home_team || !ev.away_team || !ev.event_date) continue;
    const homeSlug = slugifyTeamName(ev.home_team);
    const awaySlug = slugifyTeamName(ev.away_team);
    const homeTeamId = asTeamId(`${league}.${homeSlug}`);
    const awayTeamId = asTeamId(`${league}.${awaySlug}`);

    const homeLogo = buildBzzoiroTeamEmblemUrlById(league, ev.home_team_id) ?? getBzzoiroTeamEmblemUrl(league, homeSlug) ?? undefined;
    const awayLogo = buildBzzoiroTeamEmblemUrlById(league, ev.away_team_id) ?? getBzzoiroTeamEmblemUrl(league, awaySlug) ?? undefined;

    const homeTeam: Team = {
      id: homeTeamId,
      league,
      name: ev.home_team.trim(),
      shortName: cleanShortTeamName(ev.home_team),
      code: teamCodeFromSlug(homeSlug),
      ...(homeLogo ? { logoUrl: homeLogo } : {}),
    };
    const awayTeam: Team = {
      id: awayTeamId,
      league,
      name: ev.away_team.trim(),
      shortName: cleanShortTeamName(ev.away_team),
      code: teamCodeFromSlug(awaySlug),
      ...(awayLogo ? { logoUrl: awayLogo } : {}),
    };

    teamsById.set(homeTeamId, homeTeam);
    teamsById.set(awayTeamId, awayTeam);
    if (ev.home_team_id > 0) bzTeamIdByTeamId.set(homeTeamId, ev.home_team_id);
    if (ev.away_team_id > 0) bzTeamIdByTeamId.set(awayTeamId, ev.away_team_id);
    if (ev.home_coach_id && ev.home_coach_id > 0) coachIdByTeamId.set(homeTeamId, ev.home_coach_id);
    if (ev.away_coach_id && ev.away_coach_id > 0) coachIdByTeamId.set(awayTeamId, ev.away_coach_id);

    const status = mapBzStatus(ev.status);
    const gameId = asGameId(makeOpaqueGameId(league, ev.event_date, homeSlug, awaySlug, String(ev.id)));
    const isInSnapshot = snapshotRawSet.has(ev.id);

    let venue: BzVenue | null = null;
    let referee: BzReferee | null = null;
    if (isInSnapshot) {
      if (ev.venue_id && ev.venue_id > 0) venue = await client.getVenue(ev.venue_id);
      if (ev.referee_id && ev.referee_id > 0) {
        referee = await client.getReferee(ev.referee_id);
        if (referee?.name) refereeHits += 1;
      }
      let broadcastsMx: string[] = [];
      if (client.unlimited && status !== "final") {
        broadcastsMx = await client.fetchEventBroadcastsMx(ev.id);
      }
      const ctx = buildContextFromEvent(ev, venue, referee, broadcastsMx);
      if (ctx) contextByGameId.set(gameId, ctx);
      if (Array.isArray(ev.head_to_head) && ev.head_to_head.length > 0) {
        const parsedH2h = ev.head_to_head
          .filter((h) => h.home_team && h.away_team && typeof h.home_score === "number" && typeof h.away_score === "number")
          .slice(0, 6)
          .map((h) => ({
            date: String(h.event_date ?? h.date ?? "").slice(0, 10) || todayIso,
            homeTeamId: `${league}.${slugifyTeamName(String(h.home_team))}`,
            awayTeamId: `${league}.${slugifyTeamName(String(h.away_team))}`,
            homeGoals: Number(h.home_score),
            awayGoals: Number(h.away_score),
          }));
        if (parsedH2h.length > 0) h2hByGameId.set(gameId, parsedH2h);
      } else if (client.unlimited && status !== "final") {
        const remoteH2h = await client.fetchEventH2h(ev.id, ev.home_team, ev.away_team);
        if (remoteH2h.matches.length > 0) {
          h2hByGameId.set(
            gameId,
            remoteH2h.matches.slice(0, 5).map((m) => ({
              date: m.dateIso,
              homeTeamId: `${league}.${slugifyTeamName(m.homeTeam)}`,
              awayTeamId: `${league}.${slugifyTeamName(m.awayTeam)}`,
              homeGoals: m.homeScore,
              awayGoals: m.awayScore,
            })),
          );
        }
      }
    }

    const roundLabel =
      ev.round_label ||
      ev.round_name ||
      ev.stage_name ||
      (ev.group_name ? `Grupo ${ev.group_name}` : undefined) ||
      (typeof ev.round_number === "number" && ev.round_number > 0 ? `Jornada ${ev.round_number}` : undefined);

    const dto: GameDTO = {
      id: gameId,
      league,
      season: asSeasonId(`${league}-${meta.season.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`),
      ...(typeof ev.round_number === "number" && ev.round_number > 0 ? { week: ev.round_number } : {}),
      ...(roundLabel ? { round: roundLabel.slice(0, 80) } : {}),
      ...(ev.stage_name || ev.stage ? { phase: String(ev.stage_name || ev.stage).slice(0, 60) } : {}),
      startTime: new Date(ev.event_date).toISOString(),
      status,
      home: homeTeam,
      away: awayTeam,
      ...(venue?.name ? { venue: venue.city ? `${venue.name}, ${venue.city}` : venue.name } : {}),
      ...(referee?.name ? { referee: referee.name.slice(0, 120) } : {}),
      neutralSite: Boolean(ev.is_neutral_ground),
      ...(status === "final" && typeof ev.home_score === "number" && typeof ev.away_score === "number"
        ? {
            result: {
              home: ev.home_score,
              away: ev.away_score,
              observedAt: updatedAt,
              source: "pitchlab-feed",
            },
          }
        : {}),
    };
    allGames.push(dto);
  }

  const snapshotGames = allGames.filter((_, idx) => snapshotRawSet.has(sortedRaw[idx]!.id));
  const rateInputs = buildFootballTeamRates(league, teamsById, allGames);
  const previousSnapshot = loadPreviousSnapshot(SNAPSHOTS_ROOT, league);

  let snapshot: LeagueSnapshot;
  if (snapshotGames.length > 0 && rateInputs.length > 0) {
    const useV2 = finishedRaw.length >= 20 && !meta.isKnockoutCup;
    try {
      snapshot = buildFootballSnapshot({
        league,
        leagueName: meta.label,
        seasonId: `${league}-${meta.season.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        seasonLabel: meta.season,
        periodLabel: snapshotGames[0]?.round ?? meta.defaultPeriod,
        games: snapshotGames,
        teamRateInputs: rateInputs,
        updatedAt,
        source: "pitchlab-football-v2",
        previousSnapshot,
        seasonGames: allGames,
        modelVersion: useV2 ? "v2" : "v1",
      });
    } catch (err) {
      void err;
      snapshot = buildFootballSnapshot({
        league,
        leagueName: meta.label,
        seasonId: `${league}-${meta.season.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        seasonLabel: meta.season,
        periodLabel: snapshotGames[0]?.round ?? meta.defaultPeriod,
        games: snapshotGames,
        teamRateInputs: rateInputs,
        updatedAt,
        source: "pitchlab-football-v1",
        previousSnapshot,
        seasonGames: allGames,
        modelVersion: "v1",
      });
    }
  } else {
    snapshot = LeagueSnapshotSchema.parse({
      schemaVersion: 1,
      league,
      ...(leagueLogoUrl ? { logoUrl: leagueLogoUrl } : {}),
      season: asSeasonId(`${league}-${meta.season.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`),
      seasonLabel: meta.season,
      periodLabel: meta.defaultPeriod,
      updatedAt,
      source: "pitchlab-football-v2",
      provenance: "derived",
      isDemo: false,
      teamRates: {},
      games: [],
      analyses: {},
    });
  }

  // Adjuntar logo de liga, matchContext (árbitro + stats, clima, HT/ET/PEN, estadio) y H2H en analyses
  if (leagueLogoUrl) snapshot.logoUrl = leagueLogoUrl;
  for (const [gid, analysis] of Object.entries(snapshot.analyses)) {
    const ctx = contextByGameId.get(gid);
    if (ctx) analysis.matchContext = { ...(analysis.matchContext ?? {}), ...ctx };
    const h2h = h2hByGameId.get(gid);
    if (h2h && (!analysis.insights?.headToHead || analysis.insights.headToHead.length === 0)) {
      analysis.insights = {
        why: analysis.insights?.why ?? [],
        ...(analysis.insights?.restDays ? { restDays: analysis.insights.restDays } : {}),
        headToHead: h2h,
      };
    }
  }

  // Consultar momios prepartido v2 por partido próximo (próximos 10 días) y guardar market-lines.json
  const oddsCutoffMs = now.getTime() + 10 * 86_400_000;
  const upcomingForOdds = upcomingRaw
    .filter((ev) => Date.parse(ev.event_date) <= oddsCutoffMs)
    .slice(0, 16);
  if (upcomingForOdds.length > 0) {
    const compactOdds = await collectCompactOddsForEvents(client, league, upcomingForOdds, updatedAt);
    if (compactOdds.length > 0) {
      const dir = join(SNAPSHOTS_ROOT, league);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "market-lines.json"),
        JSON.stringify({ schemaVersion: 1, league, updatedAt, lines: compactOdds }, null, 2) + "\n",
      );
    }
  }

  writeSnapshotFiles(SNAPSHOTS_ROOT, snapshot, todayIso);
  writeSeasonResultsFile(SNAPSHOTS_ROOT, {
    league,
    season: meta.season,
    updatedAt,
    games: allGames,
  });

  // Plantillas, entrenadores y bajas (equipos con partidos en el snapshot activo)
  let squadsCount = 0;
  if (options.hydrateSquads && upcomingRaw.length > 0) {
    const activeTeamIds = new Set<string>();
    for (const g of snapshotGames) {
      activeTeamIds.add(g.home.id);
      activeTeamIds.add(g.away.id);
    }
    const targetTeams = [...activeTeamIds].slice(0, options.maxSquadTeams);
    const squadTeams: TeamSquadEntry[] = [];
    const injuries: TeamInjuryEntry[] = [];

    for (const tid of targetTeams) {
      const team = teamsById.get(tid);
      const bzTid = bzTeamIdByTeamId.get(tid);
      if (!team || !bzTid) continue;

      const [rawPlayers, rawStats, rawMgr] = await Promise.all([
        client.fetchTeamPlayers(bzTid),
        client.fetchTeamPlayerStats(bzTid),
        coachIdByTeamId.has(tid) ? client.getManager(coachIdByTeamId.get(tid)!) : Promise.resolve(null),
      ]);

      const statsByPid = new Map<number, BzPlayerStat>();
      for (const st of rawStats) {
        const pid = typeof st.player_id === "number" ? st.player_id : typeof st.player === "number" ? st.player : st.player?.id;
        if (typeof pid === "number") statsByPid.set(pid, st);
      }

      const players: SquadPlayerEntry[] = [];
      const seenSlugs = new Set<string>();
      for (const p of rawPlayers.slice(0, 32)) {
        const name = (p.name ?? "").trim();
        if (!name) continue;
        let pSlug = slugifyPlayerName(name);
        if (seenSlugs.has(pSlug)) pSlug = `${pSlug}-${p.id % 97}`;
        seenSlugs.add(pSlug);

        const group = mapPositionGroup(p.position);
        const st = statsByPid.get(p.id);
        const avail = mapAvailability(p.availability ?? p.status);
        const dob = p.date_of_birth ?? p.birthdate ?? null;

        if (avail === "injured" || avail === "doubtful" || avail === "suspended") {
          injuries.push({
            teamId: asTeamId(tid),
            player: name.slice(0, 120),
            position: positionLabelEs(p.position, group),
            status: avail === "doubtful" ? "Duda" : "Baja",
            detail: (p.injury_type?.trim() || (avail === "suspended" ? "Suspensión disciplinaria" : "Lesión reportada")).slice(0, 200),
            ...(p.injury_type?.trim() ? { injuryType: p.injury_type.trim().slice(0, 120) } : {}),
            ...(p.expected_return?.trim() ? { returnDate: p.expected_return.trim().slice(0, 80) } : {}),
            reportedAt: updatedAt,
          });
        }

        const jerseyNum = p.shirt_number ?? p.jersey_number;
        const heightCm = p.height_cm ?? p.height;
        const apps = Math.max(0, Math.trunc(st?.appearances ?? st?.matches ?? 0));
        const goals = Math.max(0, Math.trunc(st?.goals ?? 0));
        const assists = Math.max(0, Math.trunc(st?.assists ?? 0));
        const shots = Math.max(0, Math.trunc(st?.shots ?? st?.total_shots ?? 0));
        const sot = Math.max(0, Math.trunc(st?.shots_on_target ?? 0));

        players.push({
          id: `${tid}.${pSlug}`,
          slug: pSlug,
          name,
          shortName: (p.short_name?.trim() || name).slice(0, 28),
          jersey: typeof jerseyNum === "number" && jerseyNum > 0 ? String(jerseyNum) : null,
          positionGroup: group,
          positionLabel: positionLabelEs(p.position, group),
          age: computeAge(dob, now),
          birthDate: dob,
          heightCm: typeof heightCm === "number" && heightCm >= 140 && heightCm <= 230 ? Math.round(heightCm) : null,
          weightKg: typeof p.weight === "number" && p.weight >= 40 && p.weight <= 140 ? Math.round(p.weight) : null,
          preferredFoot: mapPreferredFoot(p.preferred_foot),
          nationality: p.nationality ?? p.country ?? null,
          nationalityCode: null,
          photoKey: `pl-p:${p.id}`,
          availability: avail,
          injuryDetail: p.injury_type?.trim() || null,
          expectedReturn: p.expected_return?.trim() || null,
          stats: {
            appearances: apps,
            subIns: 0,
            goals,
            assists,
            shots,
            shotsOnTarget: sot,
            foulsCommitted: Math.max(0, Math.trunc(st?.fouls_committed ?? 0)),
            foulsSuffered: Math.max(0, Math.trunc(st?.fouls_drawn ?? 0)),
            yellowCards: Math.max(0, Math.trunc(st?.yellow_cards ?? 0)),
            redCards: Math.max(0, Math.trunc(st?.red_cards ?? 0)),
            offsides: 0,
            saves: Math.max(0, Math.trunc(st?.saves ?? 0)),
            shotsFaced: 0,
            goalsConceded: Math.max(0, Math.trunc(st?.goals_conceded ?? 0)),
          },
          ...(apps > 0
            ? {
                seasonMetrics: [
                  { key: "apps", label: "PJ", value: String(apps) },
                  { key: "goals", label: "Goles", value: String(goals) },
                  { key: "assists", label: "Asist.", value: String(assists) },
                  ...(shots > 0 ? [{ key: "shots", label: "Tiros", value: String(shots) }] : []),
                ],
              }
            : {}),
          candidatePicks: [],
        });
      }

      const coach = buildCoachProfile(rawMgr);
      squadTeams.push({
        teamId: asTeamId(tid),
        teamSlug: tid.includes(".") ? tid.split(".").slice(1).join(".") : tid,
        teamName: team.name,
        coachName: coach?.name ?? null,
        coach,
        updatedAt,
        players,
      });
      squadsCount += 1;
      await sleep(60);
    }

    if (squadTeams.length > 0) {
      const squadsFile = LeagueSquadsFileSchema.parse({
        schemaVersion: 1,
        league,
        seasonLabel: meta.season,
        observedAt: updatedAt,
        teams: squadTeams,
      });
      writeFileSync(join(SNAPSHOTS_ROOT, league, "squads.json"), JSON.stringify(squadsFile, null, 2) + "\n");
    }

    const injuriesFile = LeagueInjuriesFileSchema.parse({
      schemaVersion: 1,
      league,
      observedAt: updatedAt,
      source: "pitchlab-availability",
      coverageStatus: injuries.length > 0 ? "ok" : "partial",
      entries: injuries,
    });
    writeFileSync(join(SNAPSHOTS_ROOT, league, "injuries.json"), JSON.stringify(injuriesFile, null, 2) + "\n");
  }

  return {
    league,
    upcoming: upcomingRaw.length,
    finished: finishedRaw.length,
    squads: squadsCount,
    referees: refereeHits,
  };
}

/**
 * Ingesta gratuita ESPN para CONCACAF Champions Cup y Leagues Cup, cruzando escudos y plantillas
 * oficiales de clubes Liga MX y MLS ya hidratados desde Bzzoiro.
 */
async function ingestConcacafEspnCompetition(
  meta: CompetitionMeta,
  now: Date,
): Promise<{ league: string; upcoming: number; finished: number }> {
  const league = meta.id;
  const slug = meta.espnSoccerSlug!;
  const todayIso = now.toISOString().slice(0, 10);
  const updatedAt = now.toISOString();

  // Construimos índice de escudos y plantillas Liga MX + MLS para enriquecer clubes CONCACAF
  const crossClubLogo = new Map<string, string>();
  for (const donorLeague of ["liga-mx", "mls"]) {
    const snap = loadPreviousSnapshot(SNAPSHOTS_ROOT, donorLeague);
    if (!snap) continue;
    for (const g of snap.games) {
      for (const side of [g.home, g.away]) {
        if (side.logoUrl) {
          crossClubLogo.set(slugifyTeamName(side.name), side.logoUrl);
          crossClubLogo.set(slugifyTeamName(side.shortName), side.logoUrl);
        }
      }
    }
  }

  const datesFrom = new Date(now.getTime() - 120 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const datesTo = new Date(now.getTime() + 90 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  let events: Array<{
    id?: string;
    date?: string;
    name?: string;
    status?: { type?: { state?: string; completed?: boolean } };
    competitions?: Array<{
      venue?: { fullName?: string; address?: { city?: string } };
      neutralSite?: boolean;
      notes?: Array<{ headline?: string }>;
      competitors?: Array<{
        homeAway?: string;
        score?: string;
        team?: { displayName?: string; shortDisplayName?: string; abbreviation?: string; logo?: string };
      }>;
    }>;
  }> = [];

  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${datesFrom}-${datesTo}&limit=100`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (res.ok) {
      const json = (await res.json()) as { events?: typeof events };
      events = json.events ?? [];
    }
    if (events.length === 0) {
      const fallbackRes = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (fallbackRes.ok) {
        const json = (await fallbackRes.json()) as { events?: typeof events };
        events = json.events ?? [];
      }
    }
  } catch (err) {
    void err;
  }

  const teamsById = new Map<string, Team>();
  const allGames: GameDTO[] = [];

  for (const ev of events) {
    const comp = ev.competitions?.[0];
    const homeComp = comp?.competitors?.find((c) => c.homeAway === "home");
    const awayComp = comp?.competitors?.find((c) => c.homeAway === "away");
    if (!homeComp?.team?.displayName || !awayComp?.team?.displayName || !ev.date) continue;

    const homeName = homeComp.team.displayName.trim();
    const awayName = awayComp.team.displayName.trim();
    const homeSlug = slugifyTeamName(homeName);
    const awaySlug = slugifyTeamName(awayName);
    const homeTeamId = asTeamId(`${league}.${homeSlug}`);
    const awayTeamId = asTeamId(`${league}.${awaySlug}`);

    const homeLogo = crossClubLogo.get(homeSlug) ?? homeComp.team.logo ?? undefined;
    const awayLogo = crossClubLogo.get(awaySlug) ?? awayComp.team.logo ?? undefined;

    const homeTeam: Team = {
      id: homeTeamId,
      league,
      name: homeName,
      shortName: homeComp.team.shortDisplayName?.trim() || cleanShortTeamName(homeName),
      code: (homeComp.team.abbreviation?.trim() || teamCodeFromSlug(homeSlug)).slice(0, 5).toUpperCase(),
      ...(homeLogo ? { logoUrl: homeLogo } : {}),
    };
    const awayTeam: Team = {
      id: awayTeamId,
      league,
      name: awayName,
      shortName: awayComp.team.shortDisplayName?.trim() || cleanShortTeamName(awayName),
      code: (awayComp.team.abbreviation?.trim() || teamCodeFromSlug(awaySlug)).slice(0, 5).toUpperCase(),
      ...(awayLogo ? { logoUrl: awayLogo } : {}),
    };
    teamsById.set(homeTeamId, homeTeam);
    teamsById.set(awayTeamId, awayTeam);

    const state = ev.status?.type?.state;
    const status: GameDTO["status"] =
      state === "post" || ev.status?.type?.completed ? "final" : state === "in" ? "in_progress" : "scheduled";

    const homeScore = Number(homeComp.score);
    const awayScore = Number(awayComp.score);

    allGames.push({
      id: asGameId(makeOpaqueGameId(league, ev.date, homeSlug, awaySlug, ev.id ?? homeSlug)),
      league,
      season: asSeasonId(`${league}-${meta.season}`),
      ...(comp?.notes?.[0]?.headline ? { round: comp.notes[0].headline.slice(0, 80) } : {}),
      startTime: new Date(ev.date).toISOString(),
      status,
      home: homeTeam,
      away: awayTeam,
      ...(comp?.venue?.fullName
        ? {
            venue: comp.venue.address?.city
              ? `${comp.venue.fullName}, ${comp.venue.address.city}`
              : comp.venue.fullName,
          }
        : {}),
      neutralSite: Boolean(comp?.neutralSite),
      ...(status === "final" && Number.isFinite(homeScore) && Number.isFinite(awayScore)
        ? { result: { home: homeScore, away: awayScore, observedAt: updatedAt, source: "pitchlab-concacaf" } }
        : {}),
    });
  }

  const rateInputs = buildFootballTeamRates(league, teamsById, allGames);
  const previousSnapshot = loadPreviousSnapshot(SNAPSHOTS_ROOT, league);

  const snapshot =
    allGames.length > 0 && rateInputs.length > 0
      ? buildFootballSnapshot({
          league,
          leagueName: meta.label,
          seasonId: `${league}-${meta.season}`,
          seasonLabel: meta.season,
          periodLabel: allGames[0]?.round ?? meta.defaultPeriod,
          games: allGames.slice(-32),
          teamRateInputs: rateInputs,
          updatedAt,
          source: "pitchlab-concacaf-v1",
          previousSnapshot,
          seasonGames: allGames,
        })
      : LeagueSnapshotSchema.parse({
          schemaVersion: 1,
          league,
          season: asSeasonId(`${league}-${meta.season}`),
          seasonLabel: meta.season,
          periodLabel: meta.defaultPeriod,
          updatedAt,
          source: "pitchlab-concacaf-v1",
          provenance: "derived",
          isDemo: false,
          teamRates: {},
          games: [],
          analyses: {},
        });

  const concacafLogoUrl = getOfficialEspnLeagueLogoUrl(league);
  if (concacafLogoUrl) snapshot.logoUrl = concacafLogoUrl;

  writeSnapshotFiles(SNAPSHOTS_ROOT, snapshot, todayIso);
  writeSeasonResultsFile(SNAPSHOTS_ROOT, {
    league,
    season: meta.season,
    updatedAt,
    games: allGames,
  });

  return {
    league,
    upcoming: allGames.filter((g) => g.status !== "final").length,
    finished: allGames.filter((g) => g.status === "final").length,
  };
}

/**
 * Hidrata árbitros y promedios disciplinarios en los snapshots vigentes de Top 5 + Liga MX
 * desde Bzzoiro `/api/v2/events/` + `/api/v2/referees/<id>/`.
 */
async function hydrateRefereesForCoreFootballLeagues(client: BzzoiroClient, now: Date): Promise<number> {
  const coreLeagues: ReadonlyArray<{ league: string; bzId: number }> = [
    { league: "liga-mx", bzId: 19 },
    { league: "premier-league", bzId: 1 },
    { league: "laliga", bzId: 3 },
    { league: "bundesliga", bzId: 5 },
    { league: "serie-a", bzId: 4 },
    { league: "ligue-1", bzId: 6 },
  ];
  const dateFrom = new Date(now.getTime() - 21 * 86_400_000).toISOString().slice(0, 10);
  const dateTo = new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
  const todayIso = now.toISOString().slice(0, 10);
  let totalUpdated = 0;

  for (const { league, bzId } of coreLeagues) {
    const snap = loadPreviousSnapshot(SNAPSHOTS_ROOT, league);
    if (!snap || snap.games.length === 0) continue;
    const events = await client.fetchEvents(bzId, dateFrom, dateTo, 2);
    if (events.length === 0) continue;

    const byMatchKey = new Map<string, BzEventV2>();
    for (const ev of events) {
      if (!ev.home_team || !ev.away_team || !ev.event_date) continue;
      const day = ev.event_date.slice(0, 10);
      const k = `${day}|${slugifyTeamName(ev.home_team).slice(0, 8)}|${slugifyTeamName(ev.away_team).slice(0, 8)}`;
      byMatchKey.set(k, ev);
    }

    let leagueHits = 0;
    for (const g of snap.games) {
      const day = g.startTime.slice(0, 10);
      const hKey = slugifyTeamName(g.home.name).slice(0, 8);
      const aKey = slugifyTeamName(g.away.name).slice(0, 8);
      const ev =
        byMatchKey.get(`${day}|${hKey}|${aKey}`) ??
        events.find(
          (e) =>
            e.event_date.slice(0, 10) === day &&
            (slugifyTeamName(e.home_team).includes(hKey.slice(0, 5)) ||
              slugifyTeamName(e.away_team).includes(aKey.slice(0, 5))),
        );
      if (!ev) continue;

      let ref: BzReferee | null = null;
      if (ev.referee_id && ev.referee_id > 0) {
        ref = await client.getReferee(ev.referee_id);
      }
      if (ref?.name) {
        g.referee = ref.name.slice(0, 120);
        const analysis = snap.analyses[g.id];
        if (analysis) {
          analysis.matchContext = {
            ...(analysis.matchContext ?? {}),
            referee: ref.name.slice(0, 120),
            refereeStats: {
              ...(ref.country ? { country: ref.country } : {}),
              ...(typeof ref.matches === "number" ? { matches: ref.matches } : {}),
              ...(typeof ref.avg_yellow_per_match === "number" ? { avgYellow: Number(ref.avg_yellow_per_match.toFixed(2)) } : {}),
              ...(typeof ref.avg_red_per_match === "number" ? { avgRed: Number(ref.avg_red_per_match.toFixed(2)) } : {}),
              ...(typeof ref.avg_fouls_per_match === "number" ? { avgFouls: Number(ref.avg_fouls_per_match.toFixed(1)) } : {}),
              ...(typeof ref.avg_goals_per_match === "number" ? { avgGoals: Number(ref.avg_goals_per_match.toFixed(2)) } : {}),
            },
          };
        }
        leagueHits += 1;
      }
    }

    if (leagueHits > 0) {
      writeSnapshotFiles(SNAPSHOTS_ROOT, snap, todayIso);
      totalUpdated += leagueHits;
    }
  }
  return totalUpdated;
}

/**
 * Hidrata oficiales/árbitros principales de partidos US (NFL, NBA, NHL, MLB) vía ESPN `summary`.
 */
async function hydrateOfficialsForUsLeagues(now: Date): Promise<number> {
  const usSpecs: ReadonlyArray<{ league: string; sportPath: string }> = [
    { league: "nfl", sportPath: "football/nfl" },
    { league: "nba", sportPath: "basketball/nba" },
    { league: "nhl", sportPath: "hockey/nhl" },
    { league: "mlb", sportPath: "baseball/mlb" },
  ];
  const todayIso = now.toISOString().slice(0, 10);
  let totalUpdated = 0;

  for (const { league, sportPath } of usSpecs) {
    const snap = loadPreviousSnapshot(SNAPSHOTS_ROOT, league);
    if (!snap || snap.games.length === 0) continue;
    let leagueHits = 0;

    try {
      const sbRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!sbRes.ok) continue;
      const sbJson = (await sbRes.json()) as {
        events?: Array<{
          id?: string;
          date?: string;
          competitions?: Array<{
            competitors?: Array<{
              homeAway?: string;
              team?: { abbreviation?: string; displayName?: string };
              probables?: Array<{
                athlete?: {
                  displayName?: string;
                  fullName?: string;
                  headshot?: string | { href?: string };
                  throws?: { abbreviation?: string };
                };
                record?: string;
                statistics?: Array<{ name?: string; displayValue?: string }>;
              }>;
            }>;
          }>;
        }>;
      };
      for (const ev of (sbJson.events ?? []).slice(0, 16)) {
        if (!ev.id) continue;
        const comp = ev.competitions?.[0];
        const homeComp = comp?.competitors?.find((c) => c.homeAway === "home");
        const awayComp = comp?.competitors?.find((c) => c.homeAway === "away");
        const homeAbbr = homeComp?.team?.abbreviation?.toUpperCase();
        const awayAbbr = awayComp?.team?.abbreviation?.toUpperCase();
        if (!homeAbbr || !awayAbbr) continue;

        const targetGame = snap.games.find(
          (g) => g.home.code.toUpperCase() === homeAbbr && g.away.code.toUpperCase() === awayAbbr,
        );
        if (!targetGame) continue;

        // En MLB también hidratamos lanzadores abridores probables (ERA, WHIP, K/9, récord y mano).
        if (league === "mlb") {
          const parseProbable = (
            prob:
              | {
                  athlete?: {
                    displayName?: string;
                    fullName?: string;
                    headshot?: string | { href?: string };
                    throws?: { abbreviation?: string };
                  };
                  record?: string;
                  statistics?: Array<{ name?: string; displayValue?: string }>;
                }
              | undefined,
          ) => {
            const pName = (prob?.athlete?.displayName ?? prob?.athlete?.fullName ?? "").trim();
            if (!pName) return undefined;
            const statVal = (names: readonly string[]): number | undefined => {
              const hit = prob?.statistics?.find((s) =>
                names.includes((s.name ?? "").toLowerCase()),
              );
              const n = hit?.displayValue ? Number(hit.displayValue) : NaN;
              return Number.isFinite(n) && n >= 0 ? n : undefined;
            };
            const rawHand = prob?.athlete?.throws?.abbreviation?.trim().toUpperCase();
            const throwingHand: "R" | "L" | "S" | undefined =
              rawHand === "R" || rawHand === "L" || rawHand === "S" ? rawHand : undefined;
            const rawHead =
              typeof prob?.athlete?.headshot === "string"
                ? prob.athlete.headshot
                : prob?.athlete?.headshot?.href;
            const safePhoto =
              rawHead && rawHead.startsWith("https://a.espncdn.com/i/headshots/") ? rawHead : undefined;
            const era = statVal(["era", "earnedrunaverage"]);
            const whip = statVal(["whip"]);
            const k9 = statVal(["strikeoutspernine", "k/9", "k9"]);
            return {
              name: pName.slice(0, 120),
              ...(throwingHand ? { throwingHand } : {}),
              ...(era !== undefined ? { era } : {}),
              ...(whip !== undefined ? { whip } : {}),
              ...(k9 !== undefined ? { strikeoutsPer9: k9 } : {}),
              ...(prob?.record?.trim() ? { record: prob.record.trim().slice(0, 32) } : {}),
              ...(safePhoto ? { photoKey: safePhoto } : {}),
            };
          };
          const homePitcher = parseProbable(homeComp?.probables?.[0]);
          const awayPitcher = parseProbable(awayComp?.probables?.[0]);
          const analysis = snap.analyses[targetGame.id];
          if (analysis && (homePitcher || awayPitcher)) {
            analysis.matchContext = {
              ...(analysis.matchContext ?? {}),
              probablePitchers: {
                ...(homePitcher ? { home: homePitcher } : {}),
                ...(awayPitcher ? { away: awayPitcher } : {}),
              },
            };
            leagueHits += 1;
          }
        }

        if (targetGame.referee) continue;

        const sumRes = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/summary?event=${ev.id}`,
          { signal: AbortSignal.timeout(10_000) },
        );
        if (!sumRes.ok) continue;
        const sumJson = (await sumRes.json()) as {
          gameInfo?: { officials?: Array<{ fullName?: string; displayName?: string; position?: { name?: string } }> };
        };
        const officials = sumJson.gameInfo?.officials ?? [];
        const lead =
          officials.find((o) => /referee|crew chief|home plate/i.test(o.position?.name ?? "")) ?? officials[0];
        const officialName = (lead?.fullName ?? lead?.displayName ?? "").trim();
        if (!officialName) continue;

        targetGame.referee = officialName.slice(0, 120);
        const analysis = snap.analyses[targetGame.id];
        if (analysis) {
          analysis.matchContext = {
            ...(analysis.matchContext ?? {}),
            referee: officialName.slice(0, 120),
          };
        }
        leagueHits += 1;
        await sleep(80);
      }
    } catch (err) {
      void err;
    }

    if (leagueHits > 0) {
      writeSnapshotFiles(SNAPSHOTS_ROOT, snap, todayIso);
      totalUpdated += leagueHits;
    }
  }
  return totalUpdated;
}

async function collectCompactOddsForEvents(
  client: BzzoiroClient,
  league: LeagueId,
  events: readonly BzEventV2[],
  fallbackCapturedAt: string,
): Promise<CompactMarketLine[]> {
  const compactOdds: CompactMarketLine[] = [];
  for (const ev of events) {
    const primary = await client.fetchEventOdds(ev.id);
    const list =
      primary.length > 0
        ? primary
        : client.unlimited
          ? await client.fetchEventOddsComparison(ev.id)
          : [];
    if (list.length === 0) continue;
    const homeSlug = slugifyTeamName(ev.home_team);
    const awaySlug = slugifyTeamName(ev.away_team);
    const gid = makeOpaqueGameId(league, ev.event_date, homeSlug, awaySlug, String(ev.id));
    const seen = new Set<string>();
    for (const q of list) {
      if (!q.market || !q.outcome || typeof q.decimal_odds !== "number" || q.decimal_odds <= 1.01) continue;
      const book = (q.bookmaker_slug ?? q.bookmaker_name ?? "consensus").trim().toLowerCase();
      const k = `${q.market}|${q.outcome}|${q.line ?? ""}|${book}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const rawOpen = q.opening_decimal_odds ?? q.opening_odds;
      const openingDecimal =
        typeof rawOpen === "number" && Number.isFinite(rawOpen) && rawOpen > 1.01
          ? Number(rawOpen.toFixed(3))
          : undefined;
      const classified = classifyLineMovement({
        openingDecimal: openingDecimal ?? null,
        currentDecimal: q.decimal_odds,
        rawMovement: q.movement ?? null,
      });
      const hasMovement = openingDecimal !== undefined || Boolean(q.movement?.trim());
      compactOdds.push({
        gameId: gid,
        homeName: ev.home_team,
        awayName: ev.away_team,
        market: String(q.market),
        outcome: String(q.outcome),
        line: typeof q.line === "number" ? q.line : null,
        book,
        decimal: Number(q.decimal_odds.toFixed(3)),
        ...(openingDecimal !== undefined ? { openingDecimal } : {}),
        ...(classified.deltaPct !== null ? { deltaPct: classified.deltaPct } : {}),
        ...(hasMovement ? { movement: classified.legacyDirection, movementSignal: classified.signal } : {}),
        capturedAtUtc: q.updated_at && !Number.isNaN(Date.parse(q.updated_at)) ? q.updated_at : fallbackCapturedAt,
      });
    }
    await sleep(client.unlimited ? 20 : 40);
  }
  return compactOdds;
}

const TIER1_CUP_ODDS_ORDER: ReadonlyMap<string, number> = new Map(
  BZZOIRO_TIER1_CUP_ODDS_LEAGUES.map((id, idx) => [id, idx]),
);

export function selectExpansionOddsTargets(
  options: {
    readonly tier1CupsOnly?: boolean;
    readonly leaguesFilter?: ReadonlySet<string> | null;
  } = {},
): CompetitionMeta[] {
  const filtered = BZZOIRO_EXPANSION_COMPETITIONS.filter((meta) => {
    if (options.tier1CupsOnly && !TIER1_CUP_ODDS_ORDER.has(meta.id)) {
      return false;
    }
    if (options.leaguesFilter && !options.leaguesFilter.has(meta.id)) {
      return false;
    }
    return typeof meta.bzzoiroId === "number";
  });

  const nonTier1Rank = BZZOIRO_TIER1_CUP_ODDS_LEAGUES.length;
  return [...filtered].sort((a, b) => {
    const aRank = TIER1_CUP_ODDS_ORDER.get(a.id) ?? nonTier1Rank;
    const bRank = TIER1_CUP_ODDS_ORDER.get(b.id) ?? nonTier1Rank;
    return aRank - bRank;
  });
}

async function hydrateOddsOnlyForExpansion(
  client: BzzoiroClient,
  targets: readonly CompetitionMeta[],
  now: Date,
  snapshotsRoot: string = SNAPSHOTS_ROOT,
): Promise<{ leaguesWithOdds: number; totalLines: number; updatedLeagues: string[] }> {
  const dateFrom = now.toISOString().slice(0, 10);
  const dateTo = new Date(now.getTime() + 10 * 86_400_000).toISOString().slice(0, 10);
  const updatedAt = now.toISOString();
  let leaguesWithOdds = 0;
  let totalLines = 0;
  const updatedLeagues: string[] = [];

  for (const meta of targets) {
    if (!meta.bzzoiroId) continue;
    const rawEvents = await client.fetchEvents(meta.bzzoiroId, dateFrom, dateTo, 1);
    const upcoming = rawEvents
      .filter((ev) => mapBzStatus(ev.status) !== "final" && ev.home_team && ev.away_team)
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
      .slice(0, 16);
    if (upcoming.length === 0) continue;

    const lines = await collectCompactOddsForEvents(client, meta.id, upcoming, updatedAt);
    if (lines.length === 0) continue;

    const dir = join(snapshotsRoot, meta.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "market-lines.json"),
      JSON.stringify({ schemaVersion: 1, league: meta.id, updatedAt, lines }, null, 2) + "\n",
    );
    leaguesWithOdds += 1;
    totalLines += lines.length;
    updatedLeagues.push(meta.id);
    console.log(`[expansion:odds] ${meta.id}: ${lines.length} líneas en ${new Set(lines.map((l) => l.gameId)).size} partidos`);
  }
  return { leaguesWithOdds, totalLines, updatedLeagues };
}

export async function hydrateOddsOnlyForLeagues(options: {
  readonly token: string;
  readonly unlimited?: boolean;
  readonly tier1CupsOnly?: boolean;
  readonly leaguesFilter?: ReadonlySet<string> | null;
  readonly now?: Date;
  readonly snapshotsRoot?: string;
}): Promise<{ leaguesWithOdds: number; totalLines: number; updatedLeagues: string[]; totalRequests: number }> {
  const client = new BzzoiroClient(options.token, Boolean(options.unlimited));
  const targets = selectExpansionOddsTargets({
    tier1CupsOnly: options.tier1CupsOnly,
    leaguesFilter: options.leaguesFilter,
  });
  const summary = await hydrateOddsOnlyForExpansion(
    client,
    targets,
    options.now ?? new Date(),
    options.snapshotsRoot ?? SNAPSHOTS_ROOT,
  );
  return {
    ...summary,
    totalRequests: client.totalRequests,
  };
}

async function main(): Promise<void> {
  loadRootEnvFiles(REPO_ROOT);
  const args = process.argv.slice(2);
  const refereesOnly = args.includes("--referees-only");
  const oddsOnly = args.includes("--odds-only");
  const tier1CupsOnly = args.includes("--tier1-cups-only");
  const skipSquads = args.includes("--skip-squads");
  const leaguesArg = args.find((a) => a.startsWith("--leagues="))?.slice("--leagues=".length);
  const parsedMaxSquadTeams = parseStrictFiniteNumber(
    args.find((a) => a.startsWith("--max-squad-teams="))?.slice("--max-squad-teams=".length) ?? "8",
  );
  const maxSquadTeams = parsedMaxSquadTeams !== null && parsedMaxSquadTeams > 0 ? parsedMaxSquadTeams : 8;

  if (process.env.PITCHLAB_OFFLINE === "1") {
    console.log("[expansion] PITCHLAB_OFFLINE=1; se omiten consultas remotas.");
    return;
  }

  const filterSet = leaguesArg
    ? new Set(leaguesArg.split(",").map((s) => s.trim()).filter(Boolean))
    : null;

  const now = new Date();
  const apiKey = process.env.BZZOIRO_API_KEY?.trim() ?? "";
  const unlimitedRaw = (process.env.BZZOIRO_UNLIMITED ?? "").trim().toLowerCase();
  const isUnlimited = unlimitedRaw === "1" || unlimitedRaw === "true" || unlimitedRaw === "yes";

  if (!apiKey) {
    console.warn("[expansion] BZZOIRO_API_KEY ausente; solo se ejecutarán adaptadores públicos ESPN.");
  }

  const client = apiKey ? new BzzoiroClient(apiKey, isUnlimited) : null;

  if (oddsOnly) {
    if (!client) {
      console.warn("[expansion:odds] BZZOIRO_API_KEY ausente; omitiendo.");
      return;
    }
    const bzTargets = selectExpansionOddsTargets({
      tier1CupsOnly,
      leaguesFilter: filterSet,
    });
    const summary = await hydrateOddsOnlyForExpansion(client, bzTargets, now);
    console.log(
      `[expansion:odds] Completado (${tier1CupsOnly ? "copas Tier 1" : "copas Tier 1 + expansión"}): ${summary.leaguesWithOdds} ligas con momios reales (${summary.totalLines} líneas, ${client.totalRequests} solicitudes).`,
    );
    return;
  }

  if (client) {
    const coreRefCount = await hydrateRefereesForCoreFootballLeagues(client, now);
    console.log(`[expansion] Árbitros hidratados en ligas principales fútbol: ${coreRefCount}`);
  }
  const usOfficialCount = await hydrateOfficialsForUsLeagues(now);
  console.log(`[expansion] Oficiales hidratados en deportes EE. UU.: ${usOfficialCount}`);

  if (refereesOnly) return;

  // 1) Competiciones Bzzoiro de expansión
  const bzTargets = BZZOIRO_EXPANSION_COMPETITIONS.filter((m) => !filterSet || filterSet.has(m.id));
  if (client) {
    for (const meta of bzTargets) {
      try {
        const res = await ingestBzzoiroCompetition(client, meta, now, {
          hydrateSquads: !skipSquads,
          maxSquadTeams,
        });
        console.log(
          `[expansion] ${res.league}: próximos=${res.upcoming}, finalizados=${res.finished}, plantillas=${res.squads}, árbitros=${res.referees}`,
        );
      } catch (err) {
        console.warn(`[expansion] ${meta.id} falló:`, err instanceof Error ? err.message : String(err));
      }
      await sleep(120);
    }
    console.log(`[expansion] Total solicitudes Bzzoiro: ${client.totalRequests}`);
  }

  // 2) CONCACAF Champions Cup y Leagues Cup vía ESPN (cruzando clubes Liga MX + MLS)
  for (const id of ["concacaf-champions", "leagues-cup"] as const) {
    if (filterSet && !filterSet.has(id)) continue;
    const meta = COMPETITION_BY_ID[id];
    if (!meta) continue;
    const res = await ingestConcacafEspnCompetition(meta, now);
    console.log(`[expansion] ${res.league} (ESPN): próximos=${res.upcoming}, finalizados=${res.finished}`);
  }
}

const isDirectEntry =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectEntry) {
  main().catch((err) => {
    console.error("[expansion] error fatal:", err);
    process.exit(1);
  });
}
