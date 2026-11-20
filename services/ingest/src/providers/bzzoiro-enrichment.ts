/**
 * Enriquecimiento prepartido y benchmark silencioso desde Bzzoiro Sports Data (`/api/v2/`).
 *
 * Funciones puras y fetchers opcionales para:
 *  - `/teams/{id}/squad/` -> bajas nominales con tipo de lesión y regreso estimado (`TeamInjuryEntry`).
 *  - `/events/{id}/lineups/` -> alineaciones confirmadas o proyectadas con nivel de confianza.
 *  - `/events/{id}/` + `/events/{id}/broadcasts/?country_code=MX` -> clima, estado del campo,
 *    árbitro, distancia de viaje, clásico local y canales de TV en México.
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
  type TeamInjuryEntry,
} from "@pitchlab/contracts";
import { resolveCanonicalTeam, type TeamLeague } from "../mappings.js";
import {
  type BzEvent,
  type BzLineupPlayer,
  type BzLineupsResponse,
  type BzPage,
  type BzUnavailable,
} from "./bzzoiro.js";
import { parseBroadcastsMx, type BzBroadcastRaw, type BzList } from "./bzzoiro-live.js";
import type { ProviderClient } from "./http.js";

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

const PITCH_CONDITION_ES: Readonly<Record<number, string>> = {
  1: "Óptimo",
  2: "Bueno",
  3: "Regular",
  4: "Pesado / Húmedo",
  5: "Dañado",
};

/**
 * Extrae contexto del partido desde `/events/{id}/` y `/events/{id}/broadcasts/?country_code=MX`.
 */
export function parseBzzoiroMatchContext(
  event: (BzEvent & { referee?: string | { name?: string | null } | null; referee_name?: string | null }) | null,
  broadcastsRaw: BzList<BzBroadcastRaw> | null = null,
): MatchPreGameContext | null {
  if (!event && !broadcastsRaw) return null;
  const referee =
    typeof event?.referee === "string"
      ? event.referee.trim() || undefined
      : event?.referee && typeof event.referee === "object"
        ? event.referee.name?.trim() || undefined
        : event?.referee_name?.trim() || undefined;

  const weatherDesc = event?.weather?.description?.trim();
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
