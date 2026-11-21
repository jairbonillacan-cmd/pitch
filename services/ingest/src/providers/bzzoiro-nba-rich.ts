/**
 * NBA enriquecido desde Bzzoiro Basketball API (`/basketball/api/v2/`).
 *
 * Cubre los recursos adicionales disponibles en la cuenta (`BZZOIRO_UNLIMITED=1`):
 *  - `/basketball/api/v2/standings/?league=1` -> clasificación oficial Este/Oeste
 *  - `/basketball/api/v2/events/{id}/box-score/` y `/team-stats/` -> métricas de equipo y box score por jugador
 *  - `/basketball/api/v2/events/{id}/odds/` -> cuotas NBA (`moneyline`, `spread`, `totals`) con apertura, delta% y `SHORTENING`/`DRIFTING`/`STEAM`
 *  - `/basketball/api/v2/events/{id}/pregame/` -> contexto prepartido (árbitros, descanso, B2B, bajas reales)
 *  - `/basketball/api/v2/players/{id}/games/` -> bitácora de últimos juegos para props de jugador NBA con guardia `minMinutes`
 *
 * Cumple licencia Bzzoiro v4.0 + `FD-16`: salidas normalizadas sin IDs crudos de proveedor ni URLs externas.
 */
import {
  parseStrictFiniteNumber,
  type SpacetimeAnchoredQuote,
  type StandingRow,
} from "@pitchlab/contracts";
import type { OddsLineMovement, OddsSnapshotRow } from "@pitchlab/spacetime";
import { normalizeLine } from "@pitchlab/spacetime";
import { resolveCanonicalTeam } from "../mappings.js";
import {
  BZZOIRO_COMPARISON_BOOK_META,
  classifyLineMovement,
  toSpacetimeAnchoredQuote,
  type ComparisonBookQuote,
  type LineMovementSignal,
} from "../odds/bzzoiro-odds.js";
import { PERMITTED_BOOK_IDS } from "../validation/snapshot-validator.js";
import { divisionMetaForTeam, finalizeConferenceStandings } from "../us-divisions.js";
import { sanitizeClientText, type BzList } from "./bzzoiro-live.js";
import type { ProviderClient } from "./http.js";

const NBA_LEAGUE_ID = 1;
export const DEFAULT_NBA_PROP_MIN_MINUTES = 18;

export interface BzNbaStandingRowRaw {
  team?: string | { id?: number | null; name?: string | null; short_name?: string | null } | null;
  team_name?: string | null;
  wins?: number | null;
  losses?: number | null;
  played?: number | null;
  win_pct?: number | null;
  points_for?: number | null;
  points_against?: number | null;
  games_behind?: string | number | null;
  seed?: number | null;
  rank?: number | null;
  conference?: string | null;
  division?: string | null;
}

export interface BzNbaTeamBoxRaw {
  fg_pct?: number | null;
  three_pt_pct?: number | null;
  ft_pct?: number | null;
  rebounds?: number | null;
  assists?: number | null;
  turnovers?: number | null;
  steals?: number | null;
  blocks?: number | null;
  points_in_paint?: number | null;
  pace?: number | null;
  offensive_rating?: number | null;
  defensive_rating?: number | null;
}

export interface BzNbaPlayerBoxRaw {
  id?: number | null;
  player_id?: number | null;
  external_id?: string | number | null;
  player?: string | { id?: number | null; name?: string | null; position?: string | null } | null;
  player_name?: string | null;
  name?: string | null;
  position?: string | null;
  starter?: boolean | null;
  is_starter?: boolean | null;
  minutes?: number | string | null;
  min?: number | string | null;
  points?: number | null;
  pts?: number | null;
  rebounds?: number | null;
  reb?: number | null;
  assists?: number | null;
  ast?: number | null;
  three_pointers_made?: number | null;
  tpm?: number | null;
  steals?: number | null;
  stl?: number | null;
  blocks?: number | null;
  blk?: number | null;
  turnovers?: number | null;
  tov?: number | null;
  fg_pct?: number | null;
  plus_minus?: number | null;
  side?: string | null;
  is_home?: boolean | null;
  photo_url?: string | null;
}

export interface BzNbaBoxScoreRaw {
  home?: BzNbaTeamBoxRaw | null;
  away?: BzNbaTeamBoxRaw | null;
  team_stats?: { home?: BzNbaTeamBoxRaw | null; away?: BzNbaTeamBoxRaw | null } | null;
  players?:
    | { home?: BzNbaPlayerBoxRaw[]; away?: BzNbaPlayerBoxRaw[] }
    | BzNbaPlayerBoxRaw[]
    | null;
  home_players?: BzNbaPlayerBoxRaw[] | null;
  away_players?: BzNbaPlayerBoxRaw[] | null;
}

export interface BzNbaBoxScoreSummary {
  home: NbaBoxTeamMetrics;
  away: NbaBoxTeamMetrics;
}

export interface NbaBoxTeamMetrics {
  fgPct: number | null;
  threePtPct: number | null;
  ftPct: number | null;
  rebounds: number | null;
  assists: number | null;
  turnovers: number | null;
  steals: number | null;
  blocks: number | null;
  pointsInPaint: number | null;
  pace: number | null;
  offRating: number | null;
  defRating: number | null;
}

export interface NormalizedNbaPlayerBoxLine {
  readonly playerName: string;
  readonly position: string;
  readonly starter: boolean;
  readonly minutes: number | null;
  readonly points: number;
  readonly rebounds: number;
  readonly assists: number;
  readonly threePointersMade: number;
  readonly steals: number;
  readonly blocks: number;
  readonly turnovers: number;
  readonly fgPct: number | null;
  readonly plusMinus: number | null;
}

export interface NormalizedNbaBoxScoreDetail {
  readonly teamMetrics: BzNbaBoxScoreSummary | null;
  readonly players: {
    readonly home: readonly NormalizedNbaPlayerBoxLine[];
    readonly away: readonly NormalizedNbaPlayerBoxLine[];
  };
}

export interface BzNbaInjuryRaw {
  id?: number | null;
  player_id?: number | null;
  player?: string | { id?: number | null; name?: string | null } | null;
  player_name?: string | null;
  name?: string | null;
  position?: string | null;
  status?: string | null;
  availability?: string | null;
  injury?: string | null;
  injury_type?: string | null;
  reason?: string | null;
  expected_return?: string | null;
  return_date?: string | null;
  side?: string | null;
  team?: string | { name?: string | null } | null;
  is_home?: boolean | null;
}

export interface BzNbaPregameRaw {
  event_id?: number | null;
  officials?: Array<string | { id?: number | null; name?: string | null }> | null;
  referees?: Array<string | { id?: number | null; name?: string | null }> | null;
  home_rest_days?: number | null;
  away_rest_days?: number | null;
  rest_days?: { home?: number | null; away?: number | null } | null;
  is_back_to_back_home?: boolean | null;
  is_back_to_back_away?: boolean | null;
  back_to_back?: { home?: boolean | null; away?: boolean | null } | null;
  injuries?: { home?: BzNbaInjuryRaw[]; away?: BzNbaInjuryRaw[] } | BzNbaInjuryRaw[] | null;
  unavailable_players?: { home?: BzNbaInjuryRaw[]; away?: BzNbaInjuryRaw[] } | null;
  availability?: { home?: BzNbaInjuryRaw[]; away?: BzNbaInjuryRaw[] } | BzNbaInjuryRaw[] | null;
  projected_pace?: number | null;
  pace_projected?: number | null;
  expected_total?: number | null;
  notes?: Array<string | null> | string | null;
  tipoff_notes?: Array<string | null> | string | null;
}

export type NbaInjuryRawStatus = "out" | "doubtful" | "questionable" | "probable";

export interface NormalizedNbaInjury {
  readonly playerName: string;
  readonly position?: string;
  readonly status: "Baja" | "Duda";
  readonly rawStatus: NbaInjuryRawStatus;
  readonly detail: string;
  readonly injuryType?: string;
  readonly returnDate?: string;
}

export interface NormalizedNbaPregame {
  readonly officials: readonly string[];
  readonly restDays: { readonly home: number | null; readonly away: number | null };
  readonly backToBack: { readonly home: boolean; readonly away: boolean };
  readonly injuries: {
    readonly home: readonly NormalizedNbaInjury[];
    readonly away: readonly NormalizedNbaInjury[];
  };
  readonly projectedPace: number | null;
  readonly expectedTotal: number | null;
  readonly notes: readonly string[];
}

export interface BzNbaOddsRowRaw {
  event_id?: number | null;
  market?: string | null;
  outcome?: string | null;
  selection?: string | null;
  line?: number | null;
  bookmaker_slug?: string | null;
  bookmaker?: string | null;
  bookmaker_name?: string | null;
  decimal_odds?: number | null;
  odds?: number | null;
  opening_odds?: number | null;
  opening_decimal_odds?: number | null;
  opening_price?: number | null;
  movement?: string | null;
  movement_direction?: string | null;
  is_live?: boolean | null;
  updated_at?: string | null;
}

export interface NbaSelectionOddsComparison {
  readonly market: "moneyline" | "spread" | "totals";
  readonly selection: "home" | "away" | "over" | "under";
  readonly line: number | null;
  readonly bestBook: string;
  readonly bestBookLabel: string;
  readonly bestDecimal: number;
  readonly pinnacleDecimal: number | null;
  readonly openingConsensusDecimal: number | null;
  readonly currentConsensusDecimal: number;
  readonly deltaPct: number | null;
  readonly signal: LineMovementSignal;
  readonly modelProb: number | null;
  readonly fairOdds: number | null;
  readonly edgePts: number | null;
  readonly evPct: number | null;
  readonly anchoredQuote?: SpacetimeAnchoredQuote;
  readonly books: readonly ComparisonBookQuote[];
}

export interface BzNbaPlayerGameRaw {
  id?: number | null;
  event_id?: number | null;
  game_id?: number | string | null;
  game_date?: string | null;
  date?: string | null;
  opponent?: string | { id?: number | null; name?: string | null; abbreviation?: string | null } | null;
  opponent_abbr?: string | null;
  is_home?: boolean | null;
  score?: string | null;
  result?: string | null;
  minutes?: number | string | null;
  min?: number | string | null;
  points?: number | null;
  pts?: number | null;
  rebounds?: number | null;
  reb?: number | null;
  assists?: number | null;
  ast?: number | null;
  three_pointers_made?: number | null;
  tpm?: number | null;
  steals?: number | null;
  stl?: number | null;
  blocks?: number | null;
  blk?: number | null;
  turnovers?: number | null;
  tov?: number | null;
}

export interface NormalizedNbaPlayerGame {
  readonly dateIso: string | null;
  readonly opponent: string;
  readonly opponentAbbr: string | null;
  readonly isHome: boolean | null;
  readonly score: string | null;
  readonly result: "W" | "L" | null;
  readonly minutes: number | null;
  readonly points: number | null;
  readonly rebounds: number | null;
  readonly assists: number | null;
  readonly threePointersMade: number | null;
  readonly steals: number | null;
  readonly blocks: number | null;
  readonly turnovers: number | null;
}

export interface NbaPlayerPropSeed {
  readonly player: string;
  readonly teamSlug: string;
  readonly teamName: string;
  readonly position: string;
  readonly statKey: "pts" | "reb" | "ast" | "tpm" | "pra";
  readonly statLabel: string;
  readonly baseLine: number;
  readonly projectionMean: number;
  readonly projectionSd: number;
  readonly last10: number[];
  readonly avgMinutes?: number;
  readonly sampleGames?: number;
}

function num(v: unknown): number | null {
  return parseStrictFiniteNumber(v);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function parseNbaMinutes(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 && raw <= 70 ? round2(raw) : null;
  }
  const s = raw.trim();
  if (!s) return null;
  const clockMatch = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  if (clockMatch) {
    const mins = parseStrictFiniteNumber(clockMatch[1]);
    const secs = parseStrictFiniteNumber(clockMatch[2]);
    if (mins !== null && secs !== null && secs < 60 && mins <= 70) {
      return round2(mins + secs / 60);
    }
    return null;
  }
  const direct = parseStrictFiniteNumber(s);
  return direct !== null && direct >= 0 && direct <= 70 ? round2(direct) : null;
}

function mapConferenceEs(raw: string | null | undefined, fallback?: string): string | undefined {
  const v = (raw ?? "").trim().toLowerCase();
  if (v.includes("east") || v === "este") return "Este";
  if (v.includes("west") || v === "oeste") return "Oeste";
  return fallback;
}

function teamSlugOf(teamId: string): string {
  return teamId.includes(".") ? teamId.split(".").slice(1).join(".") : teamId;
}

/** Convierte `/basketball/api/v2/standings/?league=1` a `StandingRow[]` canónicos NBA. */
export function parseBzzoiroNbaStandings(
  raw: BzList<BzNbaStandingRowRaw> | { east?: BzNbaStandingRowRaw[]; west?: BzNbaStandingRowRaw[] } | null,
): StandingRow[] {
  if (!raw) return [];
  const entries: Array<{ row: BzNbaStandingRowRaw; forcedConf?: string }> = [];
  if (typeof raw === "object" && !Array.isArray(raw) && ("east" in raw || "west" in raw)) {
    const conf = raw as { east?: BzNbaStandingRowRaw[]; west?: BzNbaStandingRowRaw[] };
    for (const row of conf.east ?? []) entries.push({ row, forcedConf: "Este" });
    for (const row of conf.west ?? []) entries.push({ row, forcedConf: "Oeste" });
  } else {
    const listObj = raw as { results?: BzNbaStandingRowRaw[] };
    const arr = Array.isArray(raw) ? raw : (listObj.results ?? []);
    for (const row of arr) entries.push({ row });
  }

  const parsed: StandingRow[] = [];
  for (const { row, forcedConf } of entries) {
    const rawName =
      typeof row.team === "string"
        ? row.team
        : row.team?.name ?? row.team_name ?? "";
    if (!rawName.trim()) continue;
    let resolved: ReturnType<typeof resolveCanonicalTeam>;
    try {
      resolved = resolveCanonicalTeam("nba", rawName);
    } catch (err) {
      void err;
      continue;
    }

    const won = num(row.wins) ?? 0;
    const lost = num(row.losses) ?? 0;
    const played = num(row.played) ?? won + lost;
    const meta = divisionMetaForTeam("nba", teamSlugOf(resolved.id));
    const conference = forcedConf ?? mapConferenceEs(row.conference, meta?.conference);
    const winPctRaw = num(row.win_pct);
    const winPct =
      winPctRaw !== null
        ? Math.round((winPctRaw > 1 ? winPctRaw / 100 : winPctRaw) * 1000) / 1000
        : played > 0
          ? Math.round((won / played) * 1000) / 1000
          : 0;
    const gbRaw = row.games_behind != null ? String(row.games_behind).trim() : "";
    const gamesBehind = gbRaw === "0" || gbRaw === "0.0" || gbRaw === "-" ? "-" : gbRaw || undefined;
    const seed = num(row.seed ?? row.rank);

    parsed.push({
      teamId: resolved.id,
      name: resolved.name,
      shortName: resolved.shortName,
      code: resolved.code,
      played,
      won,
      drawn: 0,
      lost,
      goalsFor: num(row.points_for) ?? 0,
      goalsAgainst: num(row.points_against) ?? 0,
      points: won * 2,
      winPct,
      ...(conference ? { conference } : {}),
      ...(meta?.division || row.division ? { division: row.division?.trim() || meta?.division } : {}),
      ...(gamesBehind ? { gamesBehind } : {}),
      ...(seed !== null && seed >= 1 ? { seed: Math.round(seed) } : {}),
    });
  }

  return finalizeConferenceStandings("nba", parsed, { computeGamesBehind: true });
}

function parseNbaSideBox(raw: BzNbaTeamBoxRaw | null | undefined): NbaBoxTeamMetrics {
  return {
    fgPct: num(raw?.fg_pct),
    threePtPct: num(raw?.three_pt_pct),
    ftPct: num(raw?.ft_pct),
    rebounds: num(raw?.rebounds),
    assists: num(raw?.assists),
    turnovers: num(raw?.turnovers),
    steals: num(raw?.steals),
    blocks: num(raw?.blocks),
    pointsInPaint: num(raw?.points_in_paint),
    pace: num(raw?.pace),
    offRating: num(raw?.offensive_rating),
    defRating: num(raw?.defensive_rating),
  };
}

/** Interpreta `/basketball/api/v2/events/{id}/box-score/` y `/team-stats/` (métricas por equipo). */
export function parseBzzoiroNbaBoxScore(
  raw: BzNbaBoxScoreRaw | null | undefined,
): BzNbaBoxScoreSummary | null {
  if (!raw) return null;
  const h = raw.team_stats?.home ?? raw.home;
  const a = raw.team_stats?.away ?? raw.away;
  if (!h && !a) return null;
  return { home: parseNbaSideBox(h), away: parseNbaSideBox(a) };
}

function parseNbaPlayerBoxRows(
  rows: readonly BzNbaPlayerBoxRaw[] | null | undefined,
): NormalizedNbaPlayerBoxLine[] {
  if (!rows) return [];
  const out: NormalizedNbaPlayerBoxLine[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const pObj = r.player && typeof r.player === "object" ? r.player : null;
    const playerName = sanitizeClientText(
      typeof r.player === "string" ? r.player : pObj?.name ?? r.player_name ?? r.name,
    );
    if (!playerName) continue;
    out.push({
      playerName: playerName.slice(0, 120),
      position: sanitizeClientText(r.position ?? pObj?.position)?.slice(0, 16) ?? "NBA",
      starter: Boolean(r.starter ?? r.is_starter),
      minutes: parseNbaMinutes(r.minutes ?? r.min),
      points: Math.max(0, Math.round(num(r.points ?? r.pts) ?? 0)),
      rebounds: Math.max(0, Math.round(num(r.rebounds ?? r.reb) ?? 0)),
      assists: Math.max(0, Math.round(num(r.assists ?? r.ast) ?? 0)),
      threePointersMade: Math.max(0, Math.round(num(r.three_pointers_made ?? r.tpm) ?? 0)),
      steals: Math.max(0, Math.round(num(r.steals ?? r.stl) ?? 0)),
      blocks: Math.max(0, Math.round(num(r.blocks ?? r.blk) ?? 0)),
      turnovers: Math.max(0, Math.round(num(r.turnovers ?? r.tov) ?? 0)),
      fgPct: num(r.fg_pct),
      plusMinus: num(r.plus_minus),
    });
  }
  return out.sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0) || b.points - a.points);
}

/** Extrae box score completo (equipo + líneas individuales por jugador) sin IDs crudos (`FD-16`). */
export function parseBzzoiroNbaBoxScoreDetail(
  raw: BzNbaBoxScoreRaw | null | undefined,
): NormalizedNbaBoxScoreDetail {
  if (!raw) {
    return { teamMetrics: null, players: { home: [], away: [] } };
  }
  const teamMetrics = parseBzzoiroNbaBoxScore(raw);
  let homePlayersRaw: BzNbaPlayerBoxRaw[] = [];
  let awayPlayersRaw: BzNbaPlayerBoxRaw[] = [];

  if (raw.home_players || raw.away_players) {
    homePlayersRaw = raw.home_players ?? [];
    awayPlayersRaw = raw.away_players ?? [];
  } else if (raw.players && !Array.isArray(raw.players)) {
    homePlayersRaw = raw.players.home ?? [];
    awayPlayersRaw = raw.players.away ?? [];
  } else if (Array.isArray(raw.players)) {
    for (const p of raw.players) {
      if (p.is_home === false || p.side === "away") awayPlayersRaw.push(p);
      else homePlayersRaw.push(p);
    }
  }

  return {
    teamMetrics,
    players: {
      home: parseNbaPlayerBoxRows(homePlayersRaw),
      away: parseNbaPlayerBoxRows(awayPlayersRaw),
    },
  };
}

function mapNbaInjuryStatus(raw: string | null | undefined): NbaInjuryRawStatus | null {
  const s = (raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!s || s === "available" || s === "active" || s === "healthy" || s === "fit") return null;
  if (s === "out" || s === "injured" || s === "suspended" || s === "baja" || s === "o") return "out";
  if (s === "doubtful" || s === "d") return "doubtful";
  if (s === "questionable" || s === "gtd" || s === "gametimedecision" || s === "daytoday" || s === "duda" || s === "q") {
    return "questionable";
  }
  if (s === "probable" || s === "p") return "probable";
  return null;
}

function parseNbaInjurySide(rows: readonly BzNbaInjuryRaw[] | undefined): NormalizedNbaInjury[] {
  if (!rows) return [];
  const seen = new Set<string>();
  const out: NormalizedNbaInjury[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const rawName = typeof r.player === "string" ? r.player : r.player?.name ?? r.player_name ?? r.name;
    const playerName = sanitizeClientText(rawName);
    if (!playerName) continue;
    const rawStatus = mapNbaInjuryStatus(r.status ?? r.availability);
    if (!rawStatus || rawStatus === "probable") continue;
    const key = playerName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const injuryType = sanitizeClientText(r.injury_type ?? r.injury ?? r.reason)?.slice(0, 120);
    const rawReturn = sanitizeClientText(r.expected_return ?? r.return_date);
    const returnDate = rawReturn && /^\d{4}-\d{2}-\d{2}/.test(rawReturn) ? rawReturn.slice(0, 10) : rawReturn?.slice(0, 60);
    const position = sanitizeClientText(r.position)?.slice(0, 16);

    out.push({
      playerName: playerName.slice(0, 120),
      ...(position ? { position } : {}),
      status: rawStatus === "out" ? "Baja" : "Duda",
      rawStatus,
      detail: injuryType || (rawStatus === "out" ? "Descartado en reporte oficial" : "Evaluación previa al salto"),
      ...(injuryType ? { injuryType } : {}),
      ...(returnDate ? { returnDate } : {}),
    });
  }
  return out;
}

/**
 * Normaliza `/basketball/api/v2/events/{id}/pregame/` (árbitros, descanso, B2B y bajas reales) sin IDs crudos (`FD-16`).
 */
export function parseBzzoiroNbaPregame(raw: BzNbaPregameRaw | null | undefined): NormalizedNbaPregame | null {
  if (!raw || typeof raw !== "object") return null;

  const officialsSet = new Set<string>();
  const officials: string[] = [];
  for (const o of [...(raw.officials ?? []), ...(raw.referees ?? [])]) {
    const name = sanitizeClientText(typeof o === "string" ? o : o?.name);
    if (name && !officialsSet.has(name.toLowerCase())) {
      officialsSet.add(name.toLowerCase());
      officials.push(name.slice(0, 100));
    }
  }

  const homeRest = num(raw.rest_days?.home ?? raw.home_rest_days);
  const awayRest = num(raw.rest_days?.away ?? raw.away_rest_days);
  const homeB2b = Boolean(raw.back_to_back?.home ?? raw.is_back_to_back_home ?? (homeRest !== null && homeRest === 0));
  const awayB2b = Boolean(raw.back_to_back?.away ?? raw.is_back_to_back_away ?? (awayRest !== null && awayRest === 0));

  const homeRawInj: BzNbaInjuryRaw[] = [];
  const awayRawInj: BzNbaInjuryRaw[] = [];
  const sources = [raw.injuries, raw.unavailable_players, raw.availability];
  for (const src of sources) {
    if (!src) continue;
    if (Array.isArray(src)) {
      for (const item of src) {
        if (item.is_home === false || item.side === "away" || item.team === "away") awayRawInj.push(item);
        else homeRawInj.push(item);
      }
    } else if (typeof src === "object") {
      homeRawInj.push(...(src.home ?? []));
      awayRawInj.push(...(src.away ?? []));
    }
  }

  const rawNotes = [...(Array.isArray(raw.notes) ? raw.notes : raw.notes ? [raw.notes] : []), ...(Array.isArray(raw.tipoff_notes) ? raw.tipoff_notes : raw.tipoff_notes ? [raw.tipoff_notes] : [])];
  const notes = rawNotes
    .map((n) => sanitizeClientText(n))
    .filter((n): n is string => Boolean(n))
    .slice(0, 6);

  const projectedPace = num(raw.projected_pace ?? raw.pace_projected);
  const expectedTotal = num(raw.expected_total);
  const homeInjuries = parseNbaInjurySide(homeRawInj);
  const awayInjuries = parseNbaInjurySide(awayRawInj);

  if (
    officials.length === 0 &&
    homeRest === null &&
    awayRest === null &&
    !homeB2b &&
    !awayB2b &&
    homeInjuries.length === 0 &&
    awayInjuries.length === 0 &&
    projectedPace === null &&
    expectedTotal === null &&
    notes.length === 0
  ) {
    return null;
  }

  return {
    officials,
    restDays: {
      home: homeRest !== null && homeRest >= 0 ? Math.round(homeRest) : null,
      away: awayRest !== null && awayRest >= 0 ? Math.round(awayRest) : null,
    },
    backToBack: { home: homeB2b, away: awayB2b },
    injuries: { home: homeInjuries, away: awayInjuries },
    projectedPace: projectedPace !== null ? round2(projectedPace) : null,
    expectedTotal: expectedTotal !== null ? round2(expectedTotal) : null,
    notes,
  };
}

const NBA_BOOK_MAP: Readonly<Record<string, string>> = {
  pinnacle: "pinnacle",
  bet365: "bet365",
  codere: "codere",
  betcris: "betcris",
  draftkings: "draftkings",
  fanduel: "fanduel",
  betmgm: "betmgm",
  bwin: "bwin",
  "william-hill": "william_hill",
  unibet: "unibet",
  betonline: "betonline",
};

function mapNbaMarket(row: BzNbaOddsRowRaw): {
  market: "moneyline" | "spread" | "totals";
  selection: "home" | "away" | "over" | "under";
  line: number | null;
} | null {
  const rawMkt = String(row.market ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const rawSel = String(row.outcome ?? row.selection ?? "").trim().toLowerCase();

  if (rawMkt === "moneyline" || rawMkt === "h2h" || rawMkt === "winner") {
    if (rawSel === "home" || rawSel === "away") {
      return { market: "moneyline", selection: rawSel, line: null };
    }
    return null;
  }
  if (rawMkt === "spread" || rawMkt === "handicap" || rawMkt === "point_spread") {
    const rawLine = num(row.line);
    const line = rawLine !== null ? normalizeLine(rawLine) : null;
    if (line !== null && (rawSel === "home" || rawSel === "away")) {
      return { market: "spread", selection: rawSel, line };
    }
    return null;
  }
  if (rawMkt === "totals" || rawMkt === "over_under" || rawMkt === "total_points") {
    const rawLine = num(row.line);
    const line = rawLine !== null ? normalizeLine(rawLine) : null;
    if (line !== null && line > 0 && (rawSel === "over" || rawSel === "under")) {
      return { market: "totals", selection: rawSel, line };
    }
    return null;
  }
  return null;
}

/** Interpreta `/basketball/api/v2/events/{id}/odds/` en filas `OddsSnapshotRow` canónicas para NBA. */
export function parseBzzoiroNbaOdds(params: {
  homeTeamRaw: string;
  awayTeamRaw: string;
  kickoffUtc: string;
  capturedAtUtc: string;
  odds: readonly BzNbaOddsRowRaw[];
}): OddsSnapshotRow[] {
  let home: ReturnType<typeof resolveCanonicalTeam>;
  let away: ReturnType<typeof resolveCanonicalTeam>;
  try {
    home = resolveCanonicalTeam("nba", params.homeTeamRaw);
    away = resolveCanonicalTeam("nba", params.awayTeamRaw);
  } catch (err) {
    void err;
    return [];
  }
  const homeSlug = teamSlugOf(home.id);
  const awaySlug = teamSlugOf(away.id);
  if (homeSlug === awaySlug) return [];

  const ymd = params.kickoffUtc.slice(0, 10).replace(/-/g, "");
  const eventId = `ws:basketball:NBA:${ymd}:${homeSlug}:${awaySlug}`;
  const out: OddsSnapshotRow[] = [];

  for (const row of params.odds) {
    if (row.is_live === true) continue;
    const bookSlug = String(row.bookmaker_slug ?? row.bookmaker ?? "").trim().toLowerCase();
    const book = NBA_BOOK_MAP[bookSlug];
    if (!book || !PERMITTED_BOOK_IDS.has(book)) continue;

    const price = num(row.decimal_odds ?? row.odds);
    if (price === null || price < 1.01 || price > 1000) continue;

    const mapped = mapNbaMarket(row);
    if (!mapped) continue;

    const rawOpen = num(row.opening_odds ?? row.opening_decimal_odds ?? row.opening_price);
    const hasOpen = rawOpen !== null && rawOpen >= 1.01 && rawOpen <= 1000;
    const rawMov = typeof (row.movement ?? row.movement_direction) === "string"
      ? String(row.movement ?? row.movement_direction).trim()
      : null;
    const mv = classifyLineMovement({
      openingDecimal: hasOpen ? rawOpen : null,
      currentDecimal: price,
      rawMovement: rawMov,
    });
    const movement: OddsLineMovement | undefined = hasOpen || rawMov ? mv.legacyDirection : undefined;

    out.push({
      event_id: eventId,
      sport: "basketball",
      league: "NBA",
      market: mapped.market,
      line: mapped.line,
      selection: mapped.selection,
      book,
      price_decimal: round3(price),
      ...(mv.openingDecimal !== null ? { opening_price: mv.openingDecimal } : {}),
      ...(movement ? { movement_direction: movement } : {}),
      ts_captured: params.capturedAtUtc,
      ts_event_start: params.kickoffUtc,
      source: "scraped_ws",
    });
  }

  return out;
}

/**
 * Comparativa multi-casa NBA con detección de `SHORTENING`/`DRIFTING`/`STEAM` y anclaje Spacetime (`FD-16`).
 */
export function parseBzzoiroNbaOddsComparison(
  odds: readonly BzNbaOddsRowRaw[] | null | undefined,
  options: {
    modelProbsByKey?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
    requireSpacetimeAnchor?: boolean;
  } = {},
): NbaSelectionOddsComparison[] {
  if (!odds || odds.length === 0) return [];
  const grouped = new Map<
    string,
    {
      market: "moneyline" | "spread" | "totals";
      selection: "home" | "away" | "over" | "under";
      line: number | null;
      byBook: Map<
        string,
        {
          book: string;
          bookLabel: string;
          isSharp: boolean;
          openingDecimal: number | null;
          currentDecimal: number;
          rawMovement: string | null;
          capturedAtUtc?: string;
        }
      >;
    }
  >();

  for (const row of odds) {
    if (row.is_live === true) continue;
    const slug = String(row.bookmaker_slug ?? row.bookmaker ?? row.bookmaker_name ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    const bookMeta = BZZOIRO_COMPARISON_BOOK_META[slug] ?? BZZOIRO_COMPARISON_BOOK_META[slug.replace(/_/g, "-")];
    if (!bookMeta) continue;
    const mapped = mapNbaMarket(row);
    if (!mapped) continue;
    const price = num(row.decimal_odds ?? row.odds);
    if (price === null || price < 1.01 || price > 1000) continue;
    const openRaw = num(row.opening_odds ?? row.opening_decimal_odds ?? row.opening_price);
    const openingDecimal = openRaw !== null && openRaw >= 1.01 && openRaw <= 1000 ? round3(openRaw) : null;
    const rawMovement =
      typeof (row.movement ?? row.movement_direction) === "string"
        ? String(row.movement ?? row.movement_direction).trim()
        : null;
    const key = `${mapped.market}|${mapped.line ?? "null"}|${mapped.selection}`;
    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = { ...mapped, byBook: new Map() };
      grouped.set(key, bucket);
    }
    const rawUpdatedAt = typeof row.updated_at === "string" ? row.updated_at.trim() : "";
    const parsedUpdatedMs = rawUpdatedAt ? Date.parse(rawUpdatedAt) : Number.NaN;
    const capturedAtUtc = Number.isFinite(parsedUpdatedMs)
      ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(rawUpdatedAt)
        ? rawUpdatedAt
        : new Date(parsedUpdatedMs).toISOString()
      : undefined;
    const existing = bucket.byBook.get(bookMeta.canonical);
    if (existing?.capturedAtUtc) {
      const existingMs = Date.parse(existing.capturedAtUtc);
      const incomingMs = capturedAtUtc ? Date.parse(capturedAtUtc) : Number.NaN;
      if (Number.isFinite(existingMs) && (!Number.isFinite(incomingMs) || existingMs > incomingMs)) {
        continue;
      }
    }
    bucket.byBook.set(bookMeta.canonical, {
      book: bookMeta.canonical,
      bookLabel: bookMeta.label,
      isSharp: Boolean(bookMeta.isSharp),
      openingDecimal,
      currentDecimal: round3(price),
      rawMovement,
      ...(capturedAtUtc ? { capturedAtUtc } : {}),
    });
  }

  const out: NbaSelectionOddsComparison[] = [];
  for (const [key, bucket] of grouped.entries()) {
    const entries = [...bucket.byBook.values()];
    if (entries.length === 0) continue;

    let coordinatedShorteningBooks = 0;
    let sharpShortened = false;
    for (const e of entries) {
      const prelim = classifyLineMovement({
        openingDecimal: e.openingDecimal,
        currentDecimal: e.currentDecimal,
        rawMovement: e.rawMovement,
      });
      if (prelim.signal === "SHORTENING" || prelim.signal === "STEAM") {
        coordinatedShorteningBooks += 1;
        if (e.isSharp) sharpShortened = true;
      }
    }

    const sorted = entries.sort((a, b) => b.currentDecimal - a.currentDecimal || a.book.localeCompare(b.book));
    const bestDecimal = sorted[0]!.currentDecimal;
    const books: ComparisonBookQuote[] = sorted.map((e) => {
      const mv = classifyLineMovement({
        openingDecimal: e.openingDecimal,
        currentDecimal: e.currentDecimal,
        rawMovement: e.rawMovement,
        coordinatedShorteningBooks,
        sharpShortened,
      });
      return {
        book: e.book,
        bookLabel: e.bookLabel,
        openingDecimal: mv.openingDecimal,
        currentDecimal: mv.currentDecimal,
        deltaPct: mv.deltaPct,
        impliedProbDeltaPts: mv.impliedProbDeltaPts,
        signal: mv.signal,
        isBest: Math.abs(e.currentDecimal - bestDecimal) < 1e-6,
        ...(e.capturedAtUtc ? { capturedAtUtc: e.capturedAtUtc } : {}),
      };
    });

    const openings = books.map((b) => b.openingDecimal).filter((v): v is number => v !== null);
    const openingConsensusDecimal =
      openings.length > 0 ? round3(openings.reduce((acc, v) => acc + v, 0) / openings.length) : null;
    const currentConsensusDecimal = round3(books.reduce((acc, b) => acc + b.currentDecimal, 0) / books.length);
    const consensusDeltaPct =
      openingConsensusDecimal !== null
        ? round2(((currentConsensusDecimal - openingConsensusDecimal) / openingConsensusDecimal) * 100)
        : null;
    const consensusShorteningOrUnknown = consensusDeltaPct === null || consensusDeltaPct < 0;
    const consensusMv = classifyLineMovement({
      openingDecimal: openingConsensusDecimal,
      currentDecimal: currentConsensusDecimal,
      rawMovement: consensusShorteningOrUnknown && books.some((b) => b.signal === "STEAM") ? "STEAM" : null,
      coordinatedShorteningBooks,
      sharpShortened,
    });

    const rawProb = options.modelProbsByKey
      ? options.modelProbsByKey instanceof Map
        ? options.modelProbsByKey.get(key)
        : (options.modelProbsByKey as Readonly<Record<string, number>>)[key]
      : undefined;
    const validRawProb =
      typeof rawProb === "number" && Number.isFinite(rawProb) && rawProb > 0.001 && rawProb < 0.999
        ? rawProb
        : null;
    if (options.requireSpacetimeAnchor === true && validRawProb === null) continue;
    const modelProb = validRawProb !== null ? round3(validRawProb) : null;
    const anchoredQuote =
      validRawProb !== null
        ? toSpacetimeAnchoredQuote({
            bookLabel: sorted[0]!.bookLabel,
            marketKey: bucket.market,
            selection: bucket.selection,
            line: bucket.line,
            bookDecimal: bestDecimal,
            modelProb: validRawProb,
            movement: consensusMv.signal,
            capturedAtIso: sorted[0]!.capturedAtUtc,
          })
        : undefined;

    out.push({
      market: bucket.market,
      selection: bucket.selection,
      line: bucket.line,
      bestBook: sorted[0]!.book,
      bestBookLabel: sorted[0]!.bookLabel,
      bestDecimal,
      pinnacleDecimal: books.find((b) => b.book === "pinnacle")?.currentDecimal ?? null,
      openingConsensusDecimal,
      currentConsensusDecimal,
      deltaPct: consensusMv.deltaPct,
      signal: consensusMv.signal,
      modelProb,
      fairOdds: validRawProb !== null ? round3(1 / validRawProb) : null,
      edgePts: validRawProb !== null ? round2((validRawProb - 1 / bestDecimal) * 100) : null,
      evPct: validRawProb !== null ? round2((validRawProb * bestDecimal - 1) * 100) : null,
      ...(anchoredQuote ? { anchoredQuote } : {}),
      books,
    });
  }

  return out;
}

/** Normaliza `/basketball/api/v2/players/{id}/games/` sin IDs crudos ni URLs (`FD-16`). */
export function parseBzzoiroNbaPlayerGames(
  raw: readonly BzNbaPlayerGameRaw[] | BzList<BzNbaPlayerGameRaw> | null | undefined,
): NormalizedNbaPlayerGame[] {
  const arr: readonly BzNbaPlayerGameRaw[] = !raw
    ? []
    : Array.isArray(raw)
      ? raw
      : ("results" in raw && Array.isArray(raw.results)
          ? raw.results
          : "events" in raw && Array.isArray(raw.events)
            ? raw.events
            : []);
  const out: NormalizedNbaPlayerGame[] = [];
  for (const g of arr) {
    if (!g || typeof g !== "object") continue;
    const oppRaw = typeof g.opponent === "string" ? g.opponent : g.opponent?.name;
    const oppAbbrRaw =
      g.opponent_abbr ?? (g.opponent && typeof g.opponent === "object" ? g.opponent.abbreviation : null);
    const dateRaw = String(g.game_date ?? g.date ?? "").trim();
    const dateIso = /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? dateRaw.slice(0, 10) : null;
    const resRaw = (g.result ?? "").trim().toUpperCase();
    const result: "W" | "L" | null = resRaw === "W" ? "W" : resRaw === "L" ? "L" : null;

    out.push({
      dateIso,
      opponent: sanitizeClientText(oppRaw)?.slice(0, 80) ?? "Rival NBA",
      opponentAbbr: sanitizeClientText(oppAbbrRaw)?.slice(0, 8) ?? null,
      isHome: typeof g.is_home === "boolean" ? g.is_home : null,
      score: sanitizeClientText(g.score)?.slice(0, 20) ?? null,
      result,
      minutes: parseNbaMinutes(g.minutes ?? g.min),
      points: num(g.points ?? g.pts),
      rebounds: num(g.rebounds ?? g.reb),
      assists: num(g.assists ?? g.ast),
      threePointersMade: num(g.three_pointers_made ?? g.tpm),
      steals: num(g.steals ?? g.stl),
      blocks: num(g.blocks ?? g.blk),
      turnovers: num(g.turnovers ?? g.tov),
    });
  }
  return out;
}

function meanAndSd(values: readonly number[]): { mean: number; sd: number } {
  if (values.length === 0) return { mean: 0, sd: 1 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return {
    mean: Math.round(mean * 100) / 100,
    sd: Math.max(0.6, Math.round(Math.sqrt(variance) * 100) / 100),
  };
}

function roundHalfLine(mean: number): number {
  return Math.max(0.5, Math.floor(mean) + 0.5);
}

/**
 * Construye seeds de props NBA (`PTS`, `REB`, `AST`, `3PM`, `P+R+A`) a partir de
 * `/basketball/api/v2/players/{id}/games/`, con soporte opcional de guardia `minMinutes`
 * y exclusión de bajas reales (`availabilityStatus`).
 */
export function buildNbaPlayerPropSeeds(params: {
  player: string;
  teamSlug: string;
  teamName: string;
  position?: string;
  games: readonly BzNbaPlayerGameRaw[];
  /** Mínimo de minutos por partido para admitir la muestra (p. ej. `18` en producción). */
  minMinutes?: number;
  /** Mínimo de promedio de minutos en la ventana reciente. */
  minAvgMinutes?: number;
  minSampleGames?: number;
  availabilityStatus?: string | null;
}): NbaPlayerPropSeed[] {
  const availMapped = mapNbaInjuryStatus(params.availabilityStatus);
  if (availMapped === "out") return [];

  const minMinutes = Math.max(0, params.minMinutes ?? 0);
  const minAvgMinutes = Math.max(0, params.minAvgMinutes ?? 0);
  const minSample = Math.max(2, params.minSampleGames ?? 3);

  const eligibleGames: Array<{ game: BzNbaPlayerGameRaw; minutes: number | null }> = [];
  for (const g of params.games) {
    const mins = parseNbaMinutes(g.minutes ?? g.min);
    if (minMinutes > 0) {
      if (mins === null || mins < minMinutes) continue;
    }
    eligibleGames.push({ game: g, minutes: mins });
    if (eligibleGames.length >= 10) break;
  }

  if (eligibleGames.length < minSample) return [];

  const measuredMinutes = eligibleGames
    .map((e) => e.minutes)
    .filter((m): m is number => m !== null);
  const avgMinutes =
    measuredMinutes.length > 0
      ? round2(measuredMinutes.reduce((acc, m) => acc + m, 0) / measuredMinutes.length)
      : undefined;

  if (minAvgMinutes > 0 && (avgMinutes === undefined || avgMinutes < minAvgMinutes)) {
    return [];
  }

  const recent = eligibleGames.map((e) => e.game);

  const defs: Array<{
    key: NbaPlayerPropSeed["statKey"];
    label: string;
    extract: (g: BzNbaPlayerGameRaw) => number | null;
  }> = [
    { key: "pts", label: "Puntos anotados", extract: (g) => num(g.points ?? g.pts) },
    { key: "reb", label: "Rebotes totales", extract: (g) => num(g.rebounds ?? g.reb) },
    { key: "ast", label: "Asistencias", extract: (g) => num(g.assists ?? g.ast) },
    { key: "tpm", label: "Triples anotados", extract: (g) => num(g.three_pointers_made ?? g.tpm) },
    {
      key: "pra",
      label: "Puntos + Rebotes + Asistencias",
      extract: (g) => {
        const p = num(g.points ?? g.pts);
        const r = num(g.rebounds ?? g.reb);
        const a = num(g.assists ?? g.ast);
        return p !== null && r !== null && a !== null ? p + r + a : null;
      },
    },
  ];

  const cleanPlayer = sanitizeClientText(params.player) ?? params.player.trim();
  const seeds: NbaPlayerPropSeed[] = [];
  for (const d of defs) {
    const vals = recent.map(d.extract).filter((v): v is number => v !== null && v >= 0);
    if (vals.length < minSample) continue;
    const { mean, sd } = meanAndSd(vals);
    if (mean < 0.8) continue;
    seeds.push({
      player: cleanPlayer.slice(0, 120),
      teamSlug: params.teamSlug,
      teamName: sanitizeClientText(params.teamName) ?? params.teamName,
      position: sanitizeClientText(params.position) ?? "NBA",
      statKey: d.key,
      statLabel: d.label,
      baseLine: roundHalfLine(mean),
      projectionMean: mean,
      projectionSd: sd,
      last10: vals.slice(0, 10),
      ...(avgMinutes !== undefined ? { avgMinutes } : {}),
      sampleGames: vals.length,
    });
  }
  return seeds;
}

/** Atajo estricto para producción NBA: aplica guardia `minMinutes >= 18` y filtra bajas reales. */
export function buildGuardedNbaPlayerPropSeeds(params: {
  player: string;
  teamSlug: string;
  teamName: string;
  position?: string;
  games: readonly BzNbaPlayerGameRaw[];
  minMinutes?: number;
  minSampleGames?: number;
  availabilityStatus?: string | null;
}): NbaPlayerPropSeed[] {
  const minMins = params.minMinutes ?? DEFAULT_NBA_PROP_MIN_MINUTES;
  return buildNbaPlayerPropSeeds({
    ...params,
    minMinutes: minMins,
    minAvgMinutes: minMins,
    minSampleGames: params.minSampleGames ?? 3,
  });
}

/** Fetchers de alto nivel sobre `ProviderClient` (`/basketball/api/v2/`). */
export async function fetchBzzoiroNbaStandings(client: ProviderClient): Promise<StandingRow[]> {
  const raw = await client.get<BzList<BzNbaStandingRowRaw> | { east?: BzNbaStandingRowRaw[]; west?: BzNbaStandingRowRaw[] }>(
    `/basketball/api/v2/standings/?league=${NBA_LEAGUE_ID}`,
    { cache: false },
  );
  return parseBzzoiroNbaStandings(raw);
}

export async function fetchBzzoiroNbaBoxScore(
  client: ProviderClient,
  providerEventId: number,
  options: { cache?: boolean } = {},
): Promise<NormalizedNbaBoxScoreDetail> {
  const useCache = options.cache ?? false;
  const box = await client.get<BzNbaBoxScoreRaw>(
    `/basketball/api/v2/events/${providerEventId}/box-score/`,
    { cache: useCache },
  );
  const parsed = parseBzzoiroNbaBoxScoreDetail(box);
  if (parsed.teamMetrics) return parsed;

  const teamStats = await client.get<BzNbaBoxScoreRaw>(
    `/basketball/api/v2/events/${providerEventId}/team-stats/`,
    { cache: useCache },
  );
  return {
    teamMetrics: parseBzzoiroNbaBoxScore(teamStats),
    players: parsed.players,
  };
}

export async function fetchBzzoiroNbaPregame(
  client: ProviderClient,
  providerEventId: number,
): Promise<NormalizedNbaPregame | null> {
  const raw = await client.get<BzNbaPregameRaw>(
    `/basketball/api/v2/events/${providerEventId}/pregame/`,
    { cache: false },
  );
  return parseBzzoiroNbaPregame(raw);
}

export async function fetchBzzoiroNbaOdds(
  client: ProviderClient,
  params: {
    providerEventId: number;
    homeTeamRaw: string;
    awayTeamRaw: string;
    kickoffUtc: string;
    capturedAtUtc?: string;
    modelProbsByKey?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
    requireSpacetimeAnchor?: boolean;
  },
): Promise<{
  snapshotRows: OddsSnapshotRow[];
  comparison: NbaSelectionOddsComparison[];
}> {
  const raw = await client.get<BzList<BzNbaOddsRowRaw>>(
    `/basketball/api/v2/events/${params.providerEventId}/odds/`,
    { cache: false },
  );
  const listRaw = !raw ? [] : Array.isArray(raw) ? raw : (raw.results ?? raw.events ?? []);
  const capturedAtUtc = params.capturedAtUtc ?? new Date().toISOString();
  return {
    snapshotRows: parseBzzoiroNbaOdds({
      homeTeamRaw: params.homeTeamRaw,
      awayTeamRaw: params.awayTeamRaw,
      kickoffUtc: params.kickoffUtc,
      capturedAtUtc,
      odds: listRaw,
    }),
    comparison: parseBzzoiroNbaOddsComparison(listRaw, {
      modelProbsByKey: params.modelProbsByKey,
      requireSpacetimeAnchor: params.requireSpacetimeAnchor,
    }),
  };
}

export async function fetchBzzoiroNbaPlayerGames(
  client: ProviderClient,
  providerPlayerId: number,
): Promise<BzNbaPlayerGameRaw[]> {
  const raw = await client.get<BzList<BzNbaPlayerGameRaw>>(
    `/basketball/api/v2/players/${providerPlayerId}/games/?limit=15`,
    { cache: false },
  );
  if (!raw) return [];
  return Array.isArray(raw) ? raw : (raw.results ?? []);
}

export interface BzNbaPlayerListItemRaw {
  id?: number | null;
  player_id?: number | null;
  name?: string | null;
  player_name?: string | null;
  position?: string | null;
  status?: string | null;
  availability?: string | null;
}

export interface NormalizedNbaRosterPlayer {
  readonly providerPlayerId: number;
  readonly name: string;
  readonly position: string;
  readonly availabilityStatus: string | null;
}

export function parseBzzoiroNbaTeamPlayers(
  raw:
    | readonly BzNbaPlayerListItemRaw[]
    | BzList<BzNbaPlayerListItemRaw>
    | { players?: readonly BzNbaPlayerListItemRaw[] }
    | null
    | undefined,
): NormalizedNbaRosterPlayer[] {
  if (!raw) return [];
  const list: readonly BzNbaPlayerListItemRaw[] = Array.isArray(raw)
    ? raw
    : "results" in raw && Array.isArray(raw.results)
      ? raw.results
      : "players" in raw && Array.isArray(raw.players)
        ? raw.players
        : [];
  const seen = new Set<number>();
  const out: NormalizedNbaRosterPlayer[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const pid = num(item.id ?? item.player_id);
    if (pid === null || !Number.isInteger(pid) || pid <= 0 || seen.has(pid)) continue;
    const name = sanitizeClientText(item.name ?? item.player_name);
    if (!name) continue;
    seen.add(pid);
    const position = sanitizeClientText(item.position)?.slice(0, 16) ?? "NBA";
    const availabilityStatus = sanitizeClientText(item.availability ?? item.status) ?? null;
    out.push({
      providerPlayerId: pid,
      name: name.slice(0, 120),
      position,
      availabilityStatus,
    });
  }
  return out;
}

export async function fetchBzzoiroNbaTeamPlayers(
  client: ProviderClient,
  providerTeamId: number,
): Promise<NormalizedNbaRosterPlayer[]> {
  const raw = await client.get<
    BzList<BzNbaPlayerListItemRaw> | { players?: readonly BzNbaPlayerListItemRaw[] }
  >(`/basketball/api/v2/players/?team_id=${providerTeamId}&limit=30`, { cache: false });
  return parseBzzoiroNbaTeamPlayers(raw);
}

export interface NbaPlayerPropsSnapshotFile {
  readonly schemaVersion: 1;
  readonly league: "nba";
  readonly updatedAt: string;
  readonly minMinutesGuard: number;
  readonly seeds: readonly NbaPlayerPropSeed[];
}

export function buildNbaPlayerPropsSnapshotFile(
  seeds: readonly NbaPlayerPropSeed[],
  updatedAtIso: string,
  minMinutesGuard: number = DEFAULT_NBA_PROP_MIN_MINUTES,
): NbaPlayerPropsSnapshotFile {
  return {
    schemaVersion: 1,
    league: "nba",
    updatedAt: updatedAtIso,
    minMinutesGuard,
    seeds: [...seeds],
  };
}

export interface NbaCompactMarketLine {
  readonly gameId: string;
  readonly homeName: string;
  readonly awayName: string;
  readonly market: string;
  readonly outcome: string;
  readonly line: number | null;
  readonly book: string;
  readonly decimal: number;
  readonly openingDecimal?: number;
  readonly movement?: OddsLineMovement;
  readonly capturedAtUtc: string;
}

export interface NbaRichEventTarget {
  readonly providerMatchId: number;
  readonly gameId: string;
  readonly homeTeamId: string;
  readonly homeTeamName: string;
  readonly homeProviderTeamId: number;
  readonly awayTeamId: string;
  readonly awayTeamName: string;
  readonly awayProviderTeamId: number;
  readonly kickoffUtc: string;
}

export interface CollectNbaRichOptions {
  readonly client: ProviderClient;
  readonly upcomingEvents: readonly NbaRichEventTarget[];
  readonly nowIso: string;
  readonly includeStandings?: boolean;
  readonly includePregame?: boolean;
  readonly includeOdds?: boolean;
  readonly includePlayerProps?: boolean;
  readonly maxEvents?: number;
  readonly maxTeamsForProps?: number;
  readonly maxPlayersPerTeam?: number;
  readonly minMinutes?: number;
}

export interface NbaRichCollectionResult {
  readonly standings: StandingRow[];
  readonly standingsOk: boolean;
  readonly pregameByGameId: ReadonlyMap<string, NormalizedNbaPregame>;
  readonly marketLines: NbaCompactMarketLine[];
  readonly propSeeds: NbaPlayerPropSeed[];
}

export async function collectBzzoiroNbaRichBundle(
  options: CollectNbaRichOptions,
): Promise<NbaRichCollectionResult> {
  const { client, upcomingEvents, nowIso } = options;
  const maxEvents = Math.max(0, options.maxEvents ?? 12);
  const maxTeamsForProps = Math.max(0, options.maxTeamsForProps ?? 16);
  const maxPlayersPerTeam = Math.max(0, options.maxPlayersPerTeam ?? 8);
  const minMinutes = options.minMinutes ?? DEFAULT_NBA_PROP_MIN_MINUTES;

  let standings: StandingRow[] = [];
  let standingsOk = false;
  if (options.includeStandings !== false) {
    try {
      const fetched = await fetchBzzoiroNbaStandings(client);
      if (fetched.length > 0) {
        standings = fetched;
        standingsOk = true;
      }
    } catch (err) {
      void err;
    }
  }

  const pregameByGameId = new Map<string, NormalizedNbaPregame>();
  const injuryStatusByTeamPlayer = new Map<string, NbaInjuryRawStatus>();
  const marketLines: NbaCompactMarketLine[] = [];
  const seenLineKeys = new Set<string>();
  const targetEvents = upcomingEvents.slice(0, maxEvents);

  for (const ev of targetEvents) {
    if (options.includePregame !== false) {
      try {
        const pregame = await fetchBzzoiroNbaPregame(client, ev.providerMatchId);
        if (pregame) {
          pregameByGameId.set(ev.gameId, pregame);
          const homeSlug = teamSlugOf(ev.homeTeamId);
          const awaySlug = teamSlugOf(ev.awayTeamId);
          for (const inj of pregame.injuries.home) {
            injuryStatusByTeamPlayer.set(`${homeSlug}|${inj.playerName.toLowerCase()}`, inj.rawStatus);
          }
          for (const inj of pregame.injuries.away) {
            injuryStatusByTeamPlayer.set(`${awaySlug}|${inj.playerName.toLowerCase()}`, inj.rawStatus);
          }
        }
      } catch (err) {
        void err;
      }
    }

    if (options.includeOdds !== false) {
      try {
        const { snapshotRows } = await fetchBzzoiroNbaOdds(client, {
          providerEventId: ev.providerMatchId,
          homeTeamRaw: ev.homeTeamName,
          awayTeamRaw: ev.awayTeamName,
          kickoffUtc: ev.kickoffUtc,
          capturedAtUtc: nowIso,
        });
        for (const row of snapshotRows) {
          const dedupKey = `${ev.gameId}|${row.market}|${row.selection}|${row.line ?? ""}|${row.book}`;
          if (seenLineKeys.has(dedupKey)) continue;
          seenLineKeys.add(dedupKey);
          marketLines.push({
            gameId: ev.gameId,
            homeName: ev.homeTeamName,
            awayName: ev.awayTeamName,
            market: row.market,
            outcome: row.selection,
            line: row.line,
            book: row.book,
            decimal: row.price_decimal,
            ...(row.opening_price != null ? { openingDecimal: row.opening_price } : {}),
            ...(row.movement_direction != null ? { movement: row.movement_direction } : {}),
            capturedAtUtc: row.ts_captured,
          });
        }
      } catch (err) {
        void err;
      }
    }
  }

  const propSeeds: NbaPlayerPropSeed[] = [];
  if (options.includePlayerProps !== false && maxTeamsForProps > 0 && maxPlayersPerTeam > 0) {
    const activeTeams = new Map<
      number,
      { providerTeamId: number; teamSlug: string; teamName: string }
    >();
    for (const ev of upcomingEvents) {
      if (ev.homeProviderTeamId > 0 && !activeTeams.has(ev.homeProviderTeamId)) {
        activeTeams.set(ev.homeProviderTeamId, {
          providerTeamId: ev.homeProviderTeamId,
          teamSlug: teamSlugOf(ev.homeTeamId),
          teamName: ev.homeTeamName,
        });
      }
      if (ev.awayProviderTeamId > 0 && !activeTeams.has(ev.awayProviderTeamId)) {
        activeTeams.set(ev.awayProviderTeamId, {
          providerTeamId: ev.awayProviderTeamId,
          teamSlug: teamSlugOf(ev.awayTeamId),
          teamName: ev.awayTeamName,
        });
      }
    }

    for (const team of [...activeTeams.values()].slice(0, maxTeamsForProps)) {
      let roster: NormalizedNbaRosterPlayer[] = [];
      try {
        roster = await fetchBzzoiroNbaTeamPlayers(client, team.providerTeamId);
      } catch (err) {
        void err;
        continue;
      }

      let processedForTeam = 0;
      for (const player of roster) {
        if (processedForTeam >= maxPlayersPerTeam) break;
        const pregameStatus = injuryStatusByTeamPlayer.get(
          `${team.teamSlug}|${player.name.toLowerCase()}`,
        );
        const effectiveAvailability = pregameStatus ?? player.availabilityStatus;
        if (mapNbaInjuryStatus(effectiveAvailability) === "out") continue;

        processedForTeam += 1;
        try {
          const games = await fetchBzzoiroNbaPlayerGames(client, player.providerPlayerId);
          const seeds = buildGuardedNbaPlayerPropSeeds({
            player: player.name,
            teamSlug: team.teamSlug,
            teamName: team.teamName,
            position: player.position,
            games,
            minMinutes,
            availabilityStatus: effectiveAvailability,
          });
          propSeeds.push(...seeds);
        } catch (err) {
          void err;
        }
      }
    }
  }

  return {
    standings,
    standingsOk,
    pregameByGameId,
    marketLines,
    propSeeds,
  };
}
