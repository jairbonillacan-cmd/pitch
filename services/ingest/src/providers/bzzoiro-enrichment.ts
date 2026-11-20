/**
 * Enriquecimiento prepartido, telemetría táctica y benchmark silencioso desde Bzzoiro Sports Data (`/api/v2/`).
 *
 * Funciones puras y fetchers opcionales para:
 *  - `/teams/{id}/squad/` y `/events/{id}/availability/` -> bajas reales (`injured`, `doubtful`, `suspended`).
 *  - `/events/{id}/lineups/` -> alineaciones `confirmed | probable` con confianza interna (nunca «Confianza N» en UI).
 *  - `/referees/{id}/` -> rigor arbitral bayesiano (amarillas, rojas, faltas por partido y tier).
 *  - `/events/{id}/h2h/` -> historial directo normalizado con tasas de goles, BTTS y Over 2.5.
 *  - `/events/{id}/` + `/events/{id}/broadcasts/?country_code=MX` -> clima, campo, árbitro, viaje, clásico y TV MX.
 *  - `/events/{id}/stats/` + `/events/{id}/player-stats/` -> shotmap/xG y posiciones medias (`FD-16`).
 *  - `/fixtures/changes/` -> detección de reprogramaciones y cambios de horario.
 *  - `/predictions/` -> benchmark silencioso offline para auditar calibración (nunca como input).
 */
import {
  LeagueSnapshotSchema,
  TeamInjuryEntrySchema,
  asGameId,
  asTeamId,
  type GameId,
  type LeagueId,
  type LeagueSnapshot,
  type MatchLineupPlayer,
  type MatchLineupsProjection,
  type MatchPreGameContext,
  type RefereeStats,
  type TeamInjuryEntry,
} from "@pitchlab/contracts";
import { resolveCanonicalTeam, type TeamLeague } from "../mappings.js";
import {
  type BzEvent,
  type BzH2hMatchRaw,
  type BzLineupPlayer,
  type BzLineupsResponse,
  type BzPage,
  type BzRefereeRaw,
  type BzUnavailable,
} from "./bzzoiro.js";
import {
  extractBzzoiroMatchTelemetry,
  parseBroadcastsMx,
  parseBzzoiroAveragePositions,
  parseBzzoiroShotmap,
  sanitizeClientText,
  type BzBroadcastRaw,
  type BzList,
  type BzLiveStats,
  type BzPlayerStatsPayload,
  type BzzoiroMatchVisualTelemetry,
  type NormalizedAveragePosition,
  type NormalizedShot,
  type NormalizedShotOutcome,
  type NormalizedShotmapSummary,
  type NormalizedTeamAveragePositions,
  type NormalizedXgTimelinePoint,
  type ShotBodyPart,
} from "./bzzoiro-live.js";
import type { ProviderClient } from "./http.js";

export {
  extractBzzoiroMatchTelemetry,
  parseBzzoiroAveragePositions,
  parseBzzoiroShotmap,
  type BzzoiroMatchVisualTelemetry,
  type NormalizedAveragePosition,
  type NormalizedShot,
  type NormalizedShotOutcome,
  type NormalizedShotmapSummary,
  type NormalizedTeamAveragePositions,
  type NormalizedXgTimelinePoint,
  type ShotBodyPart,
};

export interface BzSquadMemberRaw {
  id?: number | null;
  name?: string | null;
  full_name?: string | null;
  position?: string | null;
  shirt_number?: number | null;
  availability?: string | null;
  status?: string | null;
  injury_type?: string | null;
  reason?: string | null;
  expected_return?: string | null;
  return_date?: string | null;
}

export interface BzScheduleChangeRaw {
  event_id?: number | null;
  id?: number | null;
  home_team?: string | { name?: string | null } | null;
  away_team?: string | { name?: string | null } | null;
  old_event_date?: string | null;
  previous_date?: string | null;
  new_event_date?: string | null;
  event_date?: string | null;
  status?: string | null;
  reason?: string | null;
}

export interface BzPredictionRaw {
  event_id?: number | null;
  id?: number | null;
  home_team?: string | { name?: string | null } | null;
  away_team?: string | { name?: string | null } | null;
  event_date?: string | null;
  prob_home?: number | null;
  prob_draw?: number | null;
  prob_away?: number | null;
  home_win_prob?: number | null;
  draw_prob?: number | null;
  away_win_prob?: number | null;
  over_25_prob?: number | null;
  btts_prob?: number | null;
}

function normProb(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > 1 && n <= 100) return Math.min(0.999, Math.max(0.001, n / 100));
  if (n <= 1) return Math.min(0.999, Math.max(0.001, n));
  return null;
}

function mapAvailabilityStatus(raw: string | null | undefined): "Baja" | "Duda" | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v || v === "available" || v === "fit" || v === "active") return null;
  if (v === "doubtful" || v === "questionable" || v === "duda") return "Duda";
  if (v === "injured" || v === "suspended" || v === "out" || v === "baja") return "Baja";
  return null;
}

function formatInjuryDetail(
  statusRaw: string | null | undefined,
  injuryTypeRaw: string | null | undefined,
): string {
  const base = (injuryTypeRaw ?? "").trim();
  const st = (statusRaw ?? "").trim().toLowerCase();
  if (base) return base.slice(0, 180);
  if (st.includes("suspend")) return "Suspensión disciplinaria";
  if (st === "doubtful") return "En duda por evaluación médica";
  return "Baja reportada por el club";
}

function normalizeReturnDate(raw: string | null | undefined): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return v.slice(0, 80);
}

/**
 * Convierte `/teams/{id}/squad/` (disponibilidad) a `TeamInjuryEntry[]` validados.
 */
export function parseBzzoiroSquadAvailability(params: {
  league: TeamLeague;
  teamId: string;
  squad: readonly BzSquadMemberRaw[];
  observedAtIso: string;
  gameId?: string;
}): TeamInjuryEntry[] {
  const out: TeamInjuryEntry[] = [];
  const seenPlayers = new Set<string>();

  for (const m of params.squad) {
    const player = (m.name ?? m.full_name ?? "").trim();
    if (!player) continue;
    const statusRaw = m.availability ?? m.status;
    const mapped = mapAvailabilityStatus(statusRaw);
    if (!mapped) continue;
    const key = player.toLowerCase();
    if (seenPlayers.has(key)) continue;
    seenPlayers.add(key);

    const injuryType = (m.injury_type ?? m.reason ?? "").trim() || undefined;
    const returnDate = normalizeReturnDate(m.expected_return ?? m.return_date);
    const parsed = TeamInjuryEntrySchema.safeParse({
      teamId: asTeamId(params.teamId),
      player: player.slice(0, 120),
      ...(m.position?.trim() ? { position: m.position.trim().slice(0, 40) } : {}),
      status: mapped,
      detail: formatInjuryDetail(statusRaw, injuryType),
      ...(injuryType ? { injuryType: injuryType.slice(0, 120) } : {}),
      ...(returnDate ? { returnDate } : {}),
      reportedAt: params.observedAtIso,
      ...(params.gameId ? { gameId: asGameId(params.gameId) } : {}),
    });
    if (parsed.success) out.push(parsed.data);
  }

  return out;
}

function mapLineupPlayers(list: readonly (BzLineupPlayer & { shirt_number?: number | null })[] | undefined): MatchLineupPlayer[] {
  if (!list) return [];
  const out: MatchLineupPlayer[] = [];
  for (const p of list) {
    const name = (p.name ?? "").trim();
    if (!name) continue;
    const numRaw = typeof p.shirt_number === "number" ? p.shirt_number : undefined;
    const number = numRaw !== undefined && Number.isInteger(numRaw) && numRaw >= 1 && numRaw <= 99 ? numRaw : undefined;
    out.push({
      name: name.slice(0, 120),
      ...(number !== undefined ? { number } : {}),
      ...(p.position?.trim() ? { position: p.position.trim().slice(0, 24) } : {}),
    });
  }
  return out;
}

function mapUnavailableToEntries(params: {
  teamId: string;
  list: readonly BzUnavailable[] | undefined;
  observedAtIso: string;
  gameId: GameId;
}): TeamInjuryEntry[] {
  if (!params.list) return [];
  const out: TeamInjuryEntry[] = [];
  for (const item of params.list) {
    const player = (item.name ?? "").trim();
    if (!player) continue;
    const mapped = mapAvailabilityStatus(item.status) ?? "Baja";
    const parsed = TeamInjuryEntrySchema.safeParse({
      teamId: asTeamId(params.teamId),
      player: player.slice(0, 120),
      status: mapped,
      detail: formatInjuryDetail(item.status, item.reason),
      ...(item.reason?.trim() ? { injuryType: item.reason.trim().slice(0, 120) } : {}),
      reportedAt: params.observedAtIso,
      gameId: params.gameId,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * Convierte `/events/{id}/lineups/` (confirmadas o probables con `confidence`) al contrato `MatchLineupsProjection`.
 */
export function parseBzzoiroLineupsToProjection(params: {
  raw: (BzLineupsResponse & { confidence?: number | null }) | null;
  homeTeamId: string;
  awayTeamId: string;
  gameId: string;
  updatedAtIso: string;
}): {
  projection: MatchLineupsProjection | null;
  unavailableHome: TeamInjuryEntry[];
  unavailableAway: TeamInjuryEntry[];
} {
  const { raw } = params;
  if (!raw) {
    return { projection: null, unavailableHome: [], unavailableAway: [] };
  }
  const gid = asGameId(params.gameId);
  const unavailableHome = mapUnavailableToEntries({
    teamId: params.homeTeamId,
    list: raw.unavailable_players?.home,
    observedAtIso: params.updatedAtIso,
    gameId: gid,
  });
  const unavailableAway = mapUnavailableToEntries({
    teamId: params.awayTeamId,
    list: raw.unavailable_players?.away,
    observedAtIso: params.updatedAtIso,
    gameId: gid,
  });

  const stNorm = String(raw.lineup_status ?? "").trim().toLowerCase();
  const status: "confirmed" | "predicted" | null =
    stNorm === "confirmed" ? "confirmed" : stNorm === "predicted" || stNorm === "probable" ? "predicted" : null;

  const homeStarters = mapLineupPlayers(raw.lineups?.home?.players);
  const awayStarters = mapLineupPlayers(raw.lineups?.away?.players);

  if (!status || homeStarters.length < 11 || awayStarters.length < 11) {
    return { projection: null, unavailableHome, unavailableAway };
  }

  const conf = normProb(raw.confidence);
  return {
    projection: {
      status,
      sourceLabel: "Bzzoiro Sports Data",
      updatedAtUtc: params.updatedAtIso,
      ...(conf !== null ? { confidence: conf } : {}),
      home: {
        ...(raw.lineups?.home?.formation?.trim() ? { formation: raw.lineups.home.formation.trim() } : {}),
        starters: homeStarters.slice(0, 11),
      },
      away: {
        ...(raw.lineups?.away?.formation?.trim() ? { formation: raw.lineups.away.formation.trim() } : {}),
        starters: awayStarters.slice(0, 11),
      },
    },
    unavailableHome,
    unavailableAway,
  };
}

// ---------- Alineaciones normalizadas `confirmed | probable` (confianza interna, cero UI «Confianza N») ----------

export type NormalizedLineupStatus = "confirmed" | "probable" | "unavailable";

export interface NormalizedLineupPlayer {
  readonly playerName: string;
  readonly jerseyNumber: number | null;
  readonly position: string | null;
}

export interface NormalizedLineupSnapshot {
  readonly status: NormalizedLineupStatus;
  /** Confianza interna [0..1] para motores y guardias de props (prohibido mostrar «Confianza N» en UI). */
  readonly internalConfidence: number | null;
  readonly updatedAtUtc: string;
  readonly home: {
    readonly formation: string | null;
    readonly starters: readonly NormalizedLineupPlayer[];
  };
  readonly away: {
    readonly formation: string | null;
    readonly starters: readonly NormalizedLineupPlayer[];
  };
}

function mapCleanLineupSide(
  list:
    | readonly (BzLineupPlayer & { shirt_number?: number | null; jersey_number?: number | null; number?: number | null })[]
    | undefined,
): NormalizedLineupPlayer[] {
  if (!list) return [];
  const out: NormalizedLineupPlayer[] = [];
  for (const p of list) {
    const playerName = sanitizeClientText(p.name);
    if (!playerName) continue;
    const rawNum = p.shirt_number ?? p.jersey_number ?? p.number;
    const jerseyNumber =
      typeof rawNum === "number" && Number.isInteger(rawNum) && rawNum >= 1 && rawNum <= 99 ? rawNum : null;
    out.push({
      playerName: playerName.slice(0, 120),
      jerseyNumber,
      position: sanitizeClientText(p.position)?.slice(0, 24) ?? null,
    });
  }
  return out.slice(0, 11);
}

/**
 * Normaliza `/events/{id}/lineups/` en estado `confirmed | probable | unavailable` con
 * `internalConfidence` en [0..1] y sin IDs crudos ni URLs (`FD-16`).
 */
export function parseBzzoiroLineupNormalized(
  raw: (BzLineupsResponse & { confidence?: number | null }) | null | undefined,
  updatedAtIso: string,
): NormalizedLineupSnapshot {
  if (!raw) {
    return {
      status: "unavailable",
      internalConfidence: null,
      updatedAtUtc: updatedAtIso,
      home: { formation: null, starters: [] },
      away: { formation: null, starters: [] },
    };
  }

  const stNorm = String(raw.lineup_status ?? "").trim().toLowerCase();
  const homeStarters = mapCleanLineupSide(raw.lineups?.home?.players);
  const awayStarters = mapCleanLineupSide(raw.lineups?.away?.players);
  const hasFullXI = homeStarters.length >= 11 && awayStarters.length >= 11;

  let status: NormalizedLineupStatus = "unavailable";
  if (hasFullXI && (stNorm === "confirmed" || stNorm === "official")) {
    status = "confirmed";
  } else if (hasFullXI && (stNorm === "predicted" || stNorm === "probable" || stNorm === "expected")) {
    status = "probable";
  }

  const rawConf = normProb(raw.confidence);
  const internalConfidence =
    status === "confirmed" ? (rawConf ?? 1) : status === "probable" ? rawConf : null;

  return {
    status,
    internalConfidence: internalConfidence !== null ? Math.round(internalConfidence * 1000) / 1000 : null,
    updatedAtUtc: updatedAtIso,
    home: {
      formation: sanitizeClientText(raw.lineups?.home?.formation)?.slice(0, 24) ?? null,
      starters: homeStarters,
    },
    away: {
      formation: sanitizeClientText(raw.lineups?.away?.formation)?.slice(0, 24) ?? null,
      starters: awayStarters,
    },
  };
}

// ---------- Rigor arbitral normalizado (bayesiano, sin IDs crudos) ----------

export type RefereeRigorTier = "estricto" | "medio" | "permisivo";

export interface NormalizedRefereeRigor {
  readonly name: string;
  readonly country?: string;
  readonly matches: number;
  readonly avgYellow: number | null;
  readonly avgRed: number | null;
  readonly avgCardsTotal: number | null;
  readonly avgFouls: number | null;
  readonly avgGoals: number | null;
  readonly cardsMultiplier: number;
  readonly foulsMultiplier: number;
  readonly redsMultiplier: number;
  readonly rigorTier: RefereeRigorTier;
}

function finiteNonNeg(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function clampRound3(v: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, v)) * 1000) / 1000;
}

/**
 * Normaliza métricas de `/api/v2/referees/{id}/` (o árbitro embebido) con encogimiento bayesiano
 * hacia la media de liga para evitar picos por muestras pequeñas (`FD-16`).
 */
export function parseBzzoiroRefereeProfile(
  raw: BzRefereeRaw | null | undefined,
  options: {
    leagueAvgYellow?: number;
    leagueAvgRed?: number;
    leagueAvgFouls?: number;
    priorMatches?: number;
  } = {},
): NormalizedRefereeRigor | null {
  if (!raw || typeof raw !== "object") return null;
  const name = sanitizeClientText(raw.name ?? raw.full_name);
  if (!name) return null;

  const matches = Math.max(0, Math.round(finiteNonNeg(raw.matches ?? raw.matches_total ?? raw.games) ?? 0));
  const avgYellowRaw = finiteNonNeg(raw.avg_yellow_per_match ?? raw.yellow_cards_per_game ?? raw.avg_yellow);
  const avgRedRaw = finiteNonNeg(raw.avg_red_per_match ?? raw.red_cards_per_game ?? raw.avg_red);
  const avgFoulsRaw = finiteNonNeg(raw.avg_fouls_per_match ?? raw.fouls_per_game ?? raw.avg_fouls);
  const avgGoalsRaw = finiteNonNeg(raw.avg_goals_per_match ?? raw.avg_goals);

  const yellowTotals = finiteNonNeg(raw.yellow_cards);
  const redTotals = finiteNonNeg(raw.red_cards);
  const foulsTotals = finiteNonNeg(raw.fouls);

  const avgYellow =
    avgYellowRaw !== null
      ? Math.round(avgYellowRaw * 100) / 100
      : matches > 0 && yellowTotals !== null
        ? Math.round((yellowTotals / matches) * 100) / 100
        : null;
  const avgRed =
    avgRedRaw !== null
      ? Math.round(avgRedRaw * 100) / 100
      : matches > 0 && redTotals !== null
        ? Math.round((redTotals / matches) * 100) / 100
        : null;
  const avgFouls =
    avgFoulsRaw !== null
      ? Math.round(avgFoulsRaw * 10) / 10
      : matches > 0 && foulsTotals !== null
        ? Math.round((foulsTotals / matches) * 10) / 10
        : null;
  const avgGoals = avgGoalsRaw !== null ? Math.round(avgGoalsRaw * 100) / 100 : null;
  const avgCardsTotal =
    avgYellow !== null || avgRed !== null ? Math.round(((avgYellow ?? 0) + (avgRed ?? 0)) * 100) / 100 : null;

  const baseYellow = options.leagueAvgYellow ?? 4.2;
  const baseRed = options.leagueAvgRed ?? 0.22;
  const baseFouls = options.leagueAvgFouls ?? 23.5;
  const prior = Math.max(1, options.priorMatches ?? 12);
  const effMatches = matches > 0 ? matches : 6;

  const shrunkYellow =
    avgYellow !== null ? (effMatches * avgYellow + prior * baseYellow) / (effMatches + prior) : baseYellow;
  const shrunkFouls =
    avgFouls !== null ? (effMatches * avgFouls + prior * baseFouls) / (effMatches + prior) : baseFouls;
  const shrunkRed =
    avgRed !== null ? (effMatches * avgRed + prior * baseRed) / (effMatches + prior) : baseRed;

  const cardsMultiplier = clampRound3(shrunkYellow / baseYellow, 0.72, 1.35);
  const foulsMultiplier = clampRound3(shrunkFouls / baseFouls, 0.78, 1.28);
  const redsMultiplier = clampRound3(shrunkRed / baseRed, 0.65, 1.55);
  const rigorTier: RefereeRigorTier =
    cardsMultiplier >= 1.1 ? "estricto" : cardsMultiplier <= 0.9 ? "permisivo" : "medio";
  const country = sanitizeClientText(raw.country ?? raw.nationality)?.slice(0, 80);

  return {
    name: name.slice(0, 120),
    ...(country ? { country } : {}),
    matches,
    avgYellow,
    avgRed,
    avgCardsTotal,
    avgFouls,
    avgGoals,
    cardsMultiplier,
    foulsMultiplier,
    redsMultiplier,
    rigorTier,
  };
}

function toContractRefereeStats(profile: NormalizedRefereeRigor | null): RefereeStats | undefined {
  if (!profile) return undefined;
  const out: RefereeStats = {
    ...(profile.country ? { country: profile.country } : {}),
    ...(profile.matches > 0 ? { matches: profile.matches } : {}),
    ...(profile.avgYellow !== null ? { avgYellow: profile.avgYellow } : {}),
    ...(profile.avgRed !== null ? { avgRed: profile.avgRed } : {}),
    ...(profile.avgFouls !== null ? { avgFouls: profile.avgFouls } : {}),
    ...(profile.avgGoals !== null ? { avgGoals: profile.avgGoals } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

// ---------- Disponibilidad directa del evento (`/events/{id}/availability/`) ----------

export interface BzAvailabilityPlayerRaw {
  id?: number | null;
  player_id?: number | null;
  name?: string | null;
  full_name?: string | null;
  player?: string | { id?: number | null; name?: string | null } | null;
  position?: string | null;
  side?: string | null;
  team?: string | { name?: string | null } | null;
  is_home?: boolean | null;
  availability?: string | null;
  status?: string | null;
  injury_type?: string | null;
  reason?: string | null;
  expected_return?: string | null;
  return_date?: string | null;
  is_starter?: boolean | null;
}

export type BzEventAvailabilityRaw =
  | { home?: BzAvailabilityPlayerRaw[]; away?: BzAvailabilityPlayerRaw[] }
  | { unavailable_players?: { home?: BzAvailabilityPlayerRaw[]; away?: BzAvailabilityPlayerRaw[] } }
  | BzList<BzAvailabilityPlayerRaw>;

export interface NormalizedAvailabilityEntry {
  readonly playerName: string;
  readonly position?: string;
  readonly status: "Baja" | "Duda";
  readonly category: "injured" | "doubtful" | "suspended";
  readonly detail: string;
  readonly injuryType?: string;
  readonly returnDate?: string;
  readonly isStarter?: boolean;
}

export interface NormalizedEventAvailability {
  readonly home: readonly NormalizedAvailabilityEntry[];
  readonly away: readonly NormalizedAvailabilityEntry[];
}

function mapAvailabilityCategory(raw: string | null | undefined): "injured" | "doubtful" | "suspended" | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v || v === "available" || v === "fit" || v === "active") return null;
  if (v.includes("suspend")) return "suspended";
  if (v.includes("doubt") || v.includes("quest") || v === "duda") return "doubtful";
  if (v.includes("injur") || v === "out" || v === "baja" || v === "unavailable") return "injured";
  return null;
}

/**
 * Extrae bajas reales desde `/events/{id}/availability/` (o nodo `unavailable_players`) sin IDs ni URLs (`FD-16`).
 */
export function parseBzzoiroEventAvailability(
  raw: BzEventAvailabilityRaw | null | undefined,
): NormalizedEventAvailability {
  if (!raw) return { home: [], away: [] };
  const tagged: Array<{ item: BzAvailabilityPlayerRaw; forcedSide?: "home" | "away" }> = [];

  if (typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as {
      home?: BzAvailabilityPlayerRaw[];
      away?: BzAvailabilityPlayerRaw[];
      unavailable_players?: { home?: BzAvailabilityPlayerRaw[]; away?: BzAvailabilityPlayerRaw[] };
      results?: BzAvailabilityPlayerRaw[];
      events?: BzAvailabilityPlayerRaw[];
    };
    if (rec.unavailable_players) {
      for (const item of rec.unavailable_players.home ?? []) tagged.push({ item, forcedSide: "home" });
      for (const item of rec.unavailable_players.away ?? []) tagged.push({ item, forcedSide: "away" });
    } else if (rec.home || rec.away) {
      for (const item of rec.home ?? []) tagged.push({ item, forcedSide: "home" });
      for (const item of rec.away ?? []) tagged.push({ item, forcedSide: "away" });
    } else {
      for (const item of rec.results ?? rec.events ?? []) tagged.push({ item });
    }
  } else if (Array.isArray(raw)) {
    for (const item of raw) tagged.push({ item });
  }

  const home: NormalizedAvailabilityEntry[] = [];
  const away: NormalizedAvailabilityEntry[] = [];
  const seen = new Set<string>();

  for (const { item, forcedSide } of tagged) {
    if (!item || typeof item !== "object") continue;
    const rawName =
      typeof item.player === "string"
        ? item.player
        : item.player && typeof item.player === "object"
          ? item.player.name
          : item.name ?? item.full_name;
    const playerName = sanitizeClientText(rawName);
    if (!playerName) continue;

    const statusRaw = item.availability ?? item.status;
    const category = mapAvailabilityCategory(statusRaw);
    if (!category) continue;

    const side: "home" | "away" =
      forcedSide ??
      (typeof item.is_home === "boolean"
        ? item.is_home
          ? "home"
          : "away"
        : item.side === "away" || item.team === "away"
          ? "away"
          : "home");

    const key = `${side}|${playerName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const injuryType = sanitizeClientText(item.injury_type ?? item.reason)?.slice(0, 120);
    const returnDate = normalizeReturnDate(item.expected_return ?? item.return_date);
    const position = sanitizeClientText(item.position)?.slice(0, 40);

    const entry: NormalizedAvailabilityEntry = {
      playerName: playerName.slice(0, 120),
      ...(position ? { position } : {}),
      status: category === "doubtful" ? "Duda" : "Baja",
      category,
      detail: formatInjuryDetail(statusRaw, injuryType),
      ...(injuryType ? { injuryType } : {}),
      ...(returnDate ? { returnDate } : {}),
      ...(typeof item.is_starter === "boolean" ? { isStarter: item.is_starter } : {}),
    };
    if (side === "home") home.push(entry);
    else away.push(entry);
  }

  return { home, away };
}

// ---------- H2H normalizado (`/events/{id}/h2h/`) ----------

export interface NormalizedH2hMatch {
  readonly dateIso: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly competition?: string;
}

export interface NormalizedH2hSummary {
  readonly matches: readonly NormalizedH2hMatch[];
  readonly totalMatches: number;
  readonly homeWins: number;
  readonly draws: number;
  readonly awayWins: number;
  readonly avgTotalGoals: number | null;
  readonly bttsRate: number | null;
  readonly over25Rate: number | null;
}

function normTeamKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function teamMatchesName(candidate: string, reference: string): boolean {
  const c = normTeamKey(candidate);
  const r = normTeamKey(reference);
  if (!c || !r) return false;
  return c === r || c.includes(r) || r.includes(c);
}

/**
 * Normaliza `/events/{id}/h2h/` con conteo real de victorias ajustado por inversión de localía,
 * promedio de goles, BTTS y Over 2.5 — sin IDs ni URLs de proveedor (`FD-16`).
 */
export function parseBzzoiroH2h(
  raw:
    | BzList<BzH2hMatchRaw>
    | { matches?: BzH2hMatchRaw[]; head_to_head?: BzH2hMatchRaw[] }
    | null
    | undefined,
  options: { homeTeamName?: string; awayTeamName?: string; limit?: number } = {},
): NormalizedH2hSummary {
  const listRaw: BzH2hMatchRaw[] = !raw
    ? []
    : Array.isArray(raw)
      ? raw
      : "matches" in raw && Array.isArray(raw.matches)
        ? raw.matches
        : "head_to_head" in raw && Array.isArray(raw.head_to_head)
          ? raw.head_to_head
          : "results" in raw && Array.isArray(raw.results)
            ? raw.results
            : "events" in raw && Array.isArray(raw.events)
              ? raw.events
              : [];

  const dedup = new Set<string>();
  const matches: NormalizedH2hMatch[] = [];

  for (const row of listRaw) {
    if (!row || typeof row !== "object") continue;
    const hName = sanitizeClientText(typeof row.home_team === "string" ? row.home_team : row.home_team?.name);
    const aName = sanitizeClientText(typeof row.away_team === "string" ? row.away_team : row.away_team?.name);
    const hScore = finiteNonNeg(row.home_score);
    const aScore = finiteNonNeg(row.away_score);
    const rawDate = String(row.event_date ?? row.date ?? "").trim();
    if (!hName || !aName || hScore === null || aScore === null || rawDate.length < 10) continue;

    const dateIso = rawDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
    const k = `${dateIso}|${normTeamKey(hName)}|${normTeamKey(aName)}|${hScore}|${aScore}`;
    if (dedup.has(k)) continue;
    dedup.add(k);

    const comp = sanitizeClientText(
      typeof row.league === "string" ? row.league : row.league?.name ?? row.competition,
    )?.slice(0, 80);

    matches.push({
      dateIso,
      homeTeam: hName.slice(0, 100),
      awayTeam: aName.slice(0, 100),
      homeScore: Math.round(hScore),
      awayScore: Math.round(aScore),
      ...(comp ? { competition: comp } : {}),
    });
  }

  matches.sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  const capped = matches.slice(0, Math.max(1, options.limit ?? 10));
  const n = capped.length;

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let goalsSum = 0;
  let bttsHits = 0;
  let over25Hits = 0;

  for (const m of capped) {
    goalsSum += m.homeScore + m.awayScore;
    if (m.homeScore > 0 && m.awayScore > 0) bttsHits += 1;
    if (m.homeScore + m.awayScore > 2.5) over25Hits += 1;

    if (m.homeScore === m.awayScore) {
      draws += 1;
    } else {
      const winnerName = m.homeScore > m.awayScore ? m.homeTeam : m.awayTeam;
      if (options.homeTeamName && options.awayTeamName) {
        if (teamMatchesName(winnerName, options.homeTeamName)) homeWins += 1;
        else if (teamMatchesName(winnerName, options.awayTeamName)) awayWins += 1;
      } else if (m.homeScore > m.awayScore) {
        homeWins += 1;
      } else {
        awayWins += 1;
      }
    }
  }

  return {
    matches: capped,
    totalMatches: n,
    homeWins,
    draws,
    awayWins,
    avgTotalGoals: n > 0 ? Math.round((goalsSum / n) * 100) / 100 : null,
    bttsRate: n > 0 ? Math.round((bttsHits / n) * 1000) / 1000 : null,
    over25Rate: n > 0 ? Math.round((over25Hits / n) * 1000) / 1000 : null,
  };
}

const PITCH_CONDITION_ES: Readonly<Record<number, string>> = {
  1: "Óptimo",
  2: "Bueno",
  3: "Regular",
  4: "Pesado / Húmedo",
  5: "Dañado",
};

/**
 * Extrae contexto del partido desde `/events/{id}/`, `/referees/{id}/` y `/events/{id}/broadcasts/?country_code=MX`.
 */
export function parseBzzoiroMatchContext(
  event: (BzEvent & { referee?: string | BzRefereeRaw | null; referee_name?: string | null }) | null,
  broadcastsRaw: BzList<BzBroadcastRaw> | null = null,
  refereeRaw: BzRefereeRaw | null = null,
): MatchPreGameContext | null {
  if (!event && !broadcastsRaw && !refereeRaw) return null;
  const embeddedRefObj = event?.referee && typeof event.referee === "object" ? event.referee : null;
  const parsedRef = parseBzzoiroRefereeProfile(refereeRaw ?? embeddedRefObj);
  const referee =
    parsedRef?.name ??
    (typeof event?.referee === "string"
      ? sanitizeClientText(event.referee) || undefined
      : sanitizeClientText(event?.referee_name) || undefined);
  const refereeStats = toContractRefereeStats(parsedRef);

  const weatherDesc = sanitizeClientText(event?.weather?.description) || undefined;
  const temp = typeof event?.weather?.temperature_c === "number" ? event.weather.temperature_c : undefined;
  const wind = typeof event?.weather?.wind_speed === "number" ? event.weather.wind_speed : undefined;
  const weather =
    weatherDesc || temp !== undefined || wind !== undefined
      ? {
          ...(weatherDesc ? { description: weatherDesc } : {}),
          ...(temp !== undefined ? { temperatureC: Math.round(temp * 10) / 10 } : {}),
          ...(wind !== undefined ? { windSpeedKmh: Math.round(wind * 10) / 10 } : {}),
        }
      : undefined;

  const pitchCode = typeof event?.pitch_condition === "number" ? event.pitch_condition : null;
  const pitchCondition = pitchCode !== null ? PITCH_CONDITION_ES[pitchCode] : undefined;
  const travelDistanceKm =
    typeof event?.travel_distance_km === "number" && Number.isFinite(event.travel_distance_km) && event.travel_distance_km >= 0
      ? Math.round(event.travel_distance_km)
      : undefined;
  const broadcastsMx = parseBroadcastsMx(broadcastsRaw);

  if (
    !referee &&
    !refereeStats &&
    !weather &&
    !pitchCondition &&
    travelDistanceKm === undefined &&
    event?.is_local_derby !== true &&
    broadcastsMx.length === 0
  ) {
    return null;
  }

  return {
    ...(referee ? { referee } : {}),
    ...(refereeStats ? { refereeStats } : {}),
    ...(weather ? { weather } : {}),
    ...(pitchCondition ? { pitchCondition } : {}),
    ...(travelDistanceKm !== undefined ? { travelDistanceKm } : {}),
    ...(event?.is_local_derby === true ? { isLocalDerby: true } : {}),
    ...(broadcastsMx.length > 0 ? { broadcastsMx } : {}),
  };
}

export interface ParsedScheduleChange {
  providerEventId: number;
  homeTeam: string;
  awayTeam: string;
  previousStartUtc: string | null;
  newStartUtc: string | null;
  status: string;
  reason?: string;
}

/** Interpreta `/api/v2/fixtures/changes/` para alertar reprogramaciones. */
export function parseBzzoiroScheduleChanges(raw: BzList<BzScheduleChangeRaw> | null): ParsedScheduleChange[] {
  const rows = Array.isArray(raw) ? raw : (raw?.results ?? []);
  const out: ParsedScheduleChange[] = [];
  for (const r of rows) {
    const id = Number(r.event_id ?? r.id);
    if (!Number.isFinite(id)) continue;
    const home = typeof r.home_team === "string" ? r.home_team : r.home_team?.name ?? "";
    const away = typeof r.away_team === "string" ? r.away_team : r.away_team?.name ?? "";
    out.push({
      providerEventId: id,
      homeTeam: home.trim(),
      awayTeam: away.trim(),
      previousStartUtc: (r.old_event_date ?? r.previous_date)?.trim() || null,
      newStartUtc: (r.new_event_date ?? r.event_date)?.trim() || null,
      status: String(r.status ?? "changed").trim().toLowerCase(),
      ...(r.reason?.trim() ? { reason: r.reason.trim() } : {}),
    });
  }
  return out;
}

export interface BzzoiroGameEnrichmentBundle {
  readonly lineups?: MatchLineupsProjection;
  readonly matchContext?: MatchPreGameContext;
}

/**
 * Inyecta contexto y alineaciones (sin inventar datos) sobre los análisis del snapshot.
 */
export function applyBzzoiroPreMatchEnrichmentToSnapshot(
  snapshot: LeagueSnapshot,
  byGameId: ReadonlyMap<string, BzzoiroGameEnrichmentBundle>,
): LeagueSnapshot {
  if (byGameId.size === 0) return snapshot;
  const nextAnalyses: LeagueSnapshot["analyses"] = { ...snapshot.analyses };
  let changed = false;

  for (const [gameId, bundle] of byGameId.entries()) {
    const cur = nextAnalyses[gameId];
    if (!cur) continue;
    changed = true;
    nextAnalyses[gameId] = {
      ...cur,
      ...(bundle.lineups ? { lineups: bundle.lineups } : {}),
      ...(bundle.matchContext ? { matchContext: bundle.matchContext } : {}),
    };
  }

  return changed ? LeagueSnapshotSchema.parse({ ...snapshot, analyses: nextAnalyses }) : snapshot;
}

/** Consulta cambios de horario en `/api/v2/fixtures/changes/`. */
export async function fetchBzzoiroScheduleChanges(client: ProviderClient): Promise<ParsedScheduleChange[]> {
  const res = await client.get<BzList<BzScheduleChangeRaw>>("/fixtures/changes/", { cache: false });
  return parseBzzoiroScheduleChanges(res);
}

/** Consulta disponibilidad de un equipo en `/api/v2/teams/{id}/squad/`. */
export async function fetchBzzoiroSquadInjuries(params: {
  client: ProviderClient;
  league: TeamLeague;
  providerTeamId: number;
  teamId: string;
  observedAtIso: string;
  gameId?: string;
}): Promise<TeamInjuryEntry[]> {
  const res = await params.client.get<BzList<BzSquadMemberRaw> | { players?: BzSquadMemberRaw[] }>(
    `/teams/${params.providerTeamId}/squad/`,
    { cache: false },
  );
  const rawList = Array.isArray(res)
    ? res
    : res && "results" in res && Array.isArray(res.results)
      ? res.results
      : res && "players" in res && Array.isArray(res.players)
        ? res.players
        : [];
  return parseBzzoiroSquadAvailability({
    league: params.league,
    teamId: params.teamId,
    squad: rawList,
    observedAtIso: params.observedAtIso,
    gameId: params.gameId,
  });
}

/** Consulta rigor arbitral en `/api/v2/referees/{id}/`. */
export async function fetchBzzoiroRefereeProfile(
  client: ProviderClient,
  providerRefereeId: number,
): Promise<NormalizedRefereeRigor | null> {
  const raw = await client.get<BzRefereeRaw>(`/referees/${providerRefereeId}/`, { cache: true });
  return parseBzzoiroRefereeProfile(raw);
}

/** Consulta alineaciones `confirmed | probable` en `/api/v2/events/{id}/lineups/`. */
export async function fetchBzzoiroEventLineups(
  client: ProviderClient,
  providerEventId: number,
  updatedAtIso: string = new Date().toISOString(),
): Promise<NormalizedLineupSnapshot> {
  const raw = await client.get<BzLineupsResponse & { confidence?: number | null }>(
    `/events/${providerEventId}/lineups/`,
    { cache: false },
  );
  return parseBzzoiroLineupNormalized(raw, updatedAtIso);
}

/** Consulta disponibilidad real en `/api/v2/events/{id}/availability/`. */
export async function fetchBzzoiroEventAvailability(
  client: ProviderClient,
  providerEventId: number,
): Promise<NormalizedEventAvailability> {
  const raw = await client.get<BzEventAvailabilityRaw>(`/events/${providerEventId}/availability/`, {
    cache: false,
  });
  return parseBzzoiroEventAvailability(raw);
}

/** Consulta H2H en `/api/v2/events/{id}/h2h/`. */
export async function fetchBzzoiroEventH2h(
  client: ProviderClient,
  providerEventId: number,
  options?: { homeTeamName?: string; awayTeamName?: string; limit?: number },
): Promise<NormalizedH2hSummary> {
  const raw = await client.get<BzList<BzH2hMatchRaw> | { matches?: BzH2hMatchRaw[] }>(
    `/events/${providerEventId}/h2h/`,
    { cache: true },
  );
  return parseBzzoiroH2h(raw, options);
}

/** Consulta canales de TV en México en `/api/v2/events/{id}/broadcasts/?country_code=MX`. */
export async function fetchBzzoiroEventBroadcastsMx(
  client: ProviderClient,
  providerEventId: number,
): Promise<string[]> {
  const raw = await client.get<BzList<BzBroadcastRaw>>(
    `/events/${providerEventId}/broadcasts/?country_code=MX`,
    { cache: false },
  );
  return parseBroadcastsMx(raw);
}

/** Consulta telemetría visual (shotmap + xG + posiciones medias) desde `/stats/` y `/player-stats/`. */
export async function fetchBzzoiroMatchTelemetry(
  client: ProviderClient,
  providerEventId: number,
  options: { cache?: boolean } = {},
): Promise<BzzoiroMatchVisualTelemetry> {
  const useCache = options.cache ?? false;
  const [statsRaw, playerStatsRaw] = await Promise.all([
    client.get<BzLiveStats>(`/events/${providerEventId}/stats/`, { cache: useCache }),
    client.get<BzPlayerStatsPayload>(`/events/${providerEventId}/player-stats/`, { cache: useCache }),
  ]);
  return extractBzzoiroMatchTelemetry(statsRaw, playerStatsRaw);
}

export interface BzzoiroFullPreMatchBundle {
  readonly context: MatchPreGameContext | null;
  readonly referee: NormalizedRefereeRigor | null;
  readonly lineups: NormalizedLineupSnapshot;
  readonly availability: NormalizedEventAvailability;
  readonly h2h: NormalizedH2hSummary;
  readonly broadcastsMx: readonly string[];
}

/**
 * Orquesta en paralelo toda la inteligencia prepartido Bzzoiro para un evento (`BZZOIRO_UNLIMITED=1`).
 */
export async function fetchBzzoiroFullPreMatchBundle(
  client: ProviderClient,
  params: {
    providerEventId: number;
    homeTeamName?: string;
    awayTeamName?: string;
    updatedAtIso?: string;
  },
): Promise<BzzoiroFullPreMatchBundle> {
  const updatedAtIso = params.updatedAtIso ?? new Date().toISOString();
  const [eventRaw, lineupsRaw, availabilityRaw, h2hRaw, broadcastsRaw] = await Promise.all([
    client.get<BzEvent & { referee?: string | BzRefereeRaw | null; referee_name?: string | null }>(
      `/events/${params.providerEventId}/`,
      { cache: false },
    ),
    client.get<BzLineupsResponse & { confidence?: number | null }>(
      `/events/${params.providerEventId}/lineups/`,
      { cache: false },
    ),
    client.get<BzEventAvailabilityRaw>(`/events/${params.providerEventId}/availability/`, { cache: false }),
    client.get<BzList<BzH2hMatchRaw> | { matches?: BzH2hMatchRaw[] }>(
      `/events/${params.providerEventId}/h2h/`,
      { cache: true },
    ),
    client.get<BzList<BzBroadcastRaw>>(
      `/events/${params.providerEventId}/broadcasts/?country_code=MX`,
      { cache: false },
    ),
  ]);

  const refId = typeof eventRaw?.referee_id === "number" && eventRaw.referee_id > 0 ? eventRaw.referee_id : null;
  const refDetailRaw = refId ? await client.get<BzRefereeRaw>(`/referees/${refId}/`, { cache: true }) : null;
  const embeddedRef = eventRaw?.referee && typeof eventRaw.referee === "object" ? eventRaw.referee : null;
  const referee = parseBzzoiroRefereeProfile(refDetailRaw ?? embeddedRef);

  return {
    context: parseBzzoiroMatchContext(eventRaw, broadcastsRaw, refDetailRaw),
    referee,
    lineups: parseBzzoiroLineupNormalized(lineupsRaw, updatedAtIso),
    availability: parseBzzoiroEventAvailability(availabilityRaw),
    h2h: parseBzzoiroH2h(h2hRaw, {
      homeTeamName: params.homeTeamName ?? eventRaw?.home_team,
      awayTeamName: params.awayTeamName ?? eventRaw?.away_team,
    }),
    broadcastsMx: parseBroadcastsMx(broadcastsRaw),
  };
}

// ---------- Benchmark silencioso contra /predictions/ (nunca input del modelo) ----------

export interface NormalizedBzzoiroPrediction {
  providerEventId: number;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string | null;
  pHome: number;
  pDraw: number;
  pAway: number;
  pOver25: number | null;
  pBtts: number | null;
}

export function parseBzzoiroPredictionRow(raw: BzPredictionRaw): NormalizedBzzoiroPrediction | null {
  const id = Number(raw.event_id ?? raw.id);
  const pH = normProb(raw.prob_home ?? raw.home_win_prob);
  const pD = normProb(raw.prob_draw ?? raw.draw_prob) ?? 0;
  const pA = normProb(raw.prob_away ?? raw.away_win_prob);
  if (!Number.isFinite(id) || pH === null || pA === null) return null;
  const sum = pH + pD + pA;
  if (!(sum > 0)) return null;

  const home = typeof raw.home_team === "string" ? raw.home_team : raw.home_team?.name ?? "";
  const away = typeof raw.away_team === "string" ? raw.away_team : raw.away_team?.name ?? "";
  if (!home.trim() || !away.trim()) return null;

  return {
    providerEventId: id,
    homeTeam: home.trim(),
    awayTeam: away.trim(),
    kickoffUtc: raw.event_date?.trim() || null,
    pHome: pH / sum,
    pDraw: pD / sum,
    pAway: pA / sum,
    pOver25: normProb(raw.over_25_prob),
    pBtts: normProb(raw.btts_prob),
  };
}

export interface BenchmarkSamplePair {
  readonly model1X2: readonly [number, number, number];
  readonly bzzoiro1X2: readonly [number, number, number];
  /** 0 = local, 1 = empate, 2 = visita */
  readonly actualOutcome: 0 | 1 | 2;
}

export interface BenchmarkComparisonSummary {
  readonly nGames: number;
  readonly modelLogLoss: number;
  readonly bzzoiroLogLoss: number;
  readonly logLossDelta: number;
  readonly modelBrier: number;
  readonly bzzoiroBrier: number;
}

function clipProb(p: number): number {
  return Math.min(0.9999, Math.max(0.0001, p));
}

function multiclassBrier(probs: readonly [number, number, number], actual: 0 | 1 | 2): number {
  let sum = 0;
  for (let i = 0; i < 3; i += 1) {
    const target = i === actual ? 1 : 0;
    const d = probs[i]! - target;
    sum += d * d;
  }
  return sum;
}

/** Compara offline nuestro modelo contra `/predictions/` para auditar calibración (solo lectura). */
export function compareModelVsBzzoiroPredictions(
  pairs: readonly BenchmarkSamplePair[],
): BenchmarkComparisonSummary {
  if (pairs.length === 0) {
    return {
      nGames: 0,
      modelLogLoss: 0,
      bzzoiroLogLoss: 0,
      logLossDelta: 0,
      modelBrier: 0,
      bzzoiroBrier: 0,
    };
  }
  let mLl = 0;
  let bLl = 0;
  let mBr = 0;
  let bBr = 0;
  for (const row of pairs) {
    mLl += -Math.log(clipProb(row.model1X2[row.actualOutcome]));
    bLl += -Math.log(clipProb(row.bzzoiro1X2[row.actualOutcome]));
    mBr += multiclassBrier(row.model1X2, row.actualOutcome);
    bBr += multiclassBrier(row.bzzoiro1X2, row.actualOutcome);
  }
  const n = pairs.length;
  const modelLogLoss = Math.round((mLl / n) * 10_000) / 10_000;
  const bzzoiroLogLoss = Math.round((bLl / n) * 10_000) / 10_000;
  return {
    nGames: n,
    modelLogLoss,
    bzzoiroLogLoss,
    logLossDelta: Math.round((modelLogLoss - bzzoiroLogLoss) * 10_000) / 10_000,
    modelBrier: Math.round((mBr / n) * 10_000) / 10_000,
    bzzoiroBrier: Math.round((bBr / n) * 10_000) / 10_000,
  };
}

/** Consulta `/predictions/` (solo auditoría/benchmark histórico). */
export async function fetchBzzoiroFootballPredictions(
  client: ProviderClient,
  leagueId?: number,
): Promise<NormalizedBzzoiroPrediction[]> {
  const path = leagueId ? `/predictions/?league_id=${leagueId}&limit=200` : "/predictions/?limit=200";
  const page = await client.get<BzPage<BzPredictionRaw>>(path, { cache: false });
  return (page?.results ?? [])
    .map(parseBzzoiroPredictionRow)
    .filter((r): r is NormalizedBzzoiroPrediction => r !== null);
}

/** Resuelve `teamId` canónico de PitchLab de forma segura para bajas por equipo. */
export function tryResolveTeamId(league: TeamLeague, teamNameRaw: string): string | null {
  try {
    return resolveCanonicalTeam(league, teamNameRaw).id;
  } catch (err) {
    void err;
    return null;
  }
}

export function normalizeLeagueFromKey(league: LeagueId): TeamLeague | null {
  const s = String(league);
  if (
    s === "liga-mx" ||
    s === "premier-league" ||
    s === "laliga" ||
    s === "bundesliga" ||
    s === "serie-a" ||
    s === "ligue-1"
  ) {
    return s;
  }
  return null;
}
