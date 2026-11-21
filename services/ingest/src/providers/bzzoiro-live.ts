/**
 * Adaptador en vivo de Bzzoiro (API v2) para el Match Center (EN-VIVO-1).
 *
 * Funciones puras: convierten las respuestas de `/events/live/`, `/events/{id}/`,
 * `/events/{id}/stats/` y `/events/{id}/incidents/` al contrato `@pitchlab/contracts` (`live.ts`),
 * emparejan cada evento del proveedor con NUESTRO `gameId` y detectan los momentos del partido
 * (inicio, gol, medio tiempo, final) comparando dos lecturas.
 *
 * Nada aquí hace red: la ruta de Next.js decide cuándo leer (un solo lector en servidor, caché
 * compartida y cuota), y las pruebas usan respuestas guardadas.
 *
 * Licencia: se muestran resultados derivados; el JSON crudo no se reenvía al navegador.
 */
import type {
  LiveAveragePosition,
  LiveCommentaryItem,
  LiveIncident,
  LiveMatchDetail,
  LiveMomentumPoint,
  LivePhase,
  LivePlayerStatRow,
  LiveScore,
  LiveScoreboardEntry,
  LiveShot,
  LiveTeamStats,
  LiveXgPoint,
} from "@pitchlab/contracts";
import { BZZOIRO_LEAGUES, type BzTeamStatsRaw } from "./bzzoiro.js";
import { slugifyTeamName } from "../team-slug.js";
import { teamSimilarity } from "./link.js";

export const BZZOIRO_ATTRIBUTION = "Datos en vivo · PitchLab";

// ---------- Formas de la API (tolerantes: solo lo que usamos) ----------

export interface BzLiveEvent {
  id: number;
  league_id?: number | null;
  league?: { id?: number | null; name?: string | null } | null;
  home_team_id?: number | null;
  away_team_id?: number | null;
  home_team?: string | { id?: number; name?: string } | null;
  away_team?: string | { id?: number; name?: string } | null;
  event_date?: string | null;
  status?: string | null;
  period?: string | null;
  current_minute?: number | string | null;
  minute?: number | string | null;
  injury_time?: number | null;
  home_score?: number | null;
  away_score?: number | null;
  home_score_ht?: number | null;
  away_score_ht?: number | null;
  extra_time_score?: { home?: number | null; away?: number | null } | null;
  penalty_shootout?: { home?: number | null; away?: number | null } | null;
  home_red_cards?: number | null;
  away_red_cards?: number | null;
  referee?: string | { name?: string | null } | null;
  referee_name?: string | null;
}

export interface BzLiveIncident {
  type?: string | null;
  incident_type?: string | null;
  incident_class?: string | null;
  card_type?: string | null;
  class?: string | null;
  minute?: number | string | null;
  added_time?: number | null;
  period_second?: number | null;
  is_home?: boolean | null;
  team?: "home" | "away" | string | null;
  player?: string | { name?: string | null } | null;
  player_name?: string | null;
  player_in?: string | { name?: string | null } | null;
  player_out?: string | { name?: string | null } | null;
  assist?: string | { name?: string | null } | null;
  home_score?: number | null;
  away_score?: number | null;
  text?: string | null;
  reason?: string | null;
  decision?: string | null;
  rescinded?: boolean | null;
  goal_type?: string | null;
  is_live?: boolean | null;
  length?: number | null;
  own_goal?: boolean | null;
  is_own_goal?: boolean | null;
  from_penalty?: boolean | null;
  is_penalty?: boolean | null;
}

export interface BzShotRaw {
  home?: boolean | null;
  is_home?: boolean | null;
  side?: string | null;
  team?: string | { name?: string | null } | null;
  min?: number | string | null;
  minute?: number | string | null;
  time?: number | string | null;
  added_time?: number | string | null;
  type?: string | null;
  outcome?: string | null;
  shot_type?: string | null;
  result?: string | null;
  xg?: number | string | null;
  expected_goals?: number | string | null;
  xG?: number | string | null;
  pos?: { x?: number | string | null; y?: number | string | null; z?: number | string | null } | null;
  position?: { x?: number | string | null; y?: number | string | null } | null;
  coordinates?: { x?: number | string | null; y?: number | string | null } | null;
  x?: number | string | null;
  y?: number | string | null;
  player?: string | { id?: number | null; name?: string | null; short_name?: string | null } | null;
  player_name?: string | null;
  playerName?: string | null;
  shooter?: string | { name?: string | null } | null;
  player_id?: number | null;
  body_part?: string | null;
  bodyPart?: string | null;
  part?: string | null;
}

export interface BzAveragePositionRaw {
  id?: number | null;
  player_id?: number | null;
  external_id?: string | number | null;
  player?:
    | string
    | {
        id?: number | null;
        name?: string | null;
        short_name?: string | null;
        jersey_number?: number | null;
        shirt_number?: number | null;
        position?: string | null;
      }
    | null;
  player_name?: string | null;
  name?: string | null;
  is_home?: boolean | null;
  home?: boolean | null;
  side?: string | null;
  team?: string | { name?: string | null } | null;
  jersey_number?: number | string | null;
  shirt_number?: number | string | null;
  number?: number | string | null;
  jersey?: number | string | null;
  position?: string | null;
  average_x?: number | string | null;
  average_y?: number | string | null;
  avg_x?: number | string | null;
  avg_y?: number | string | null;
  x?: number | string | null;
  y?: number | string | null;
  pos?: { x?: number | string | null; y?: number | string | null } | null;
  average_position?: { x?: number | string | null; y?: number | string | null } | null;
  touches?: number | string | null;
  ball_touches?: number | string | null;
  points_count?: number | string | null;
  rating?: number | string | null;
  match_rating?: number | string | null;
  photo_url?: string | null;
  image_url?: string | null;
}

export interface BzLiveStats {
  event_id?: number;
  xg_estimated?: boolean | null;
  stats?: { home?: BzTeamStatsRaw | null; away?: BzTeamStatsRaw | null } | null;
  momentum?: { m?: number; v?: number }[] | null;
  xg_per_minute?:
    | {
        m?: number;
        minute?: number;
        xg_home?: number;
        xg_away?: number;
        cum_home?: number;
        cum_away?: number;
        estimated?: boolean;
      }[]
    | null;
  shotmap?: BzShotRaw[] | null;
  shots?: BzShotRaw[] | null;
  average_positions?:
    | BzList<BzAveragePositionRaw>
    | { home?: BzAveragePositionRaw[]; away?: BzAveragePositionRaw[] }
    | null;
  averagePositions?:
    | BzList<BzAveragePositionRaw>
    | { home?: BzAveragePositionRaw[]; away?: BzAveragePositionRaw[] }
    | null;
  positions?:
    | BzList<BzAveragePositionRaw>
    | { home?: BzAveragePositionRaw[]; away?: BzAveragePositionRaw[] }
    | null;
}

/** `/events/live/` responde `{ count, events }`; `/events/` responde `{ results }`; incidentes `{ incidents }`. */
export type BzList<T> = { results?: T[]; events?: T[]; incidents?: T[] } | T[];

export function list<T>(raw: BzList<T> | null | undefined): T[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.events ?? raw.results ?? raw.incidents ?? [];
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export interface ParsedFootballMinute {
  readonly minute: number;
  readonly addedTime: number | null;
}

/**
 * Parsea minutos de fútbol numéricos o en texto (`"67'"`, `"45+2'"`, `"90+4"`, `"45 + 2"`, `84`)
 * devolviendo `{ minute, addedTime }`. Rechaza negativos, vacíos o no numéricos.
 */
export function parseFootballMinute(raw: unknown): ParsedFootballMinute | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return null;
    return { minute: raw, addedTime: null };
  }
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/[′’`']/g, "").trim();
  if (!cleaned) return null;

  const plusMatch = /^(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)$/.exec(cleaned);
  if (plusMatch?.[1] && plusMatch[2]) {
    const base = Number(plusMatch[1]);
    const extra = Number(plusMatch[2]);
    if (!Number.isFinite(base) || !Number.isFinite(extra) || base < 0 || extra < 0) return null;
    return { minute: base, addedTime: extra > 0 ? Math.round(extra) : null };
  }

  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const base = Number(cleaned);
  if (!Number.isFinite(base) || base < 0) return null;
  return { minute: base, addedTime: null };
}

const URL_FRAGMENT_RE = /https?:\/\/\S+|www\.\S+/gi;

/** Limpia cadenas destinadas a cliente: descarta URLs o hotlinks externos (`FD-16`). */
export function sanitizeClientText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(URL_FRAGMENT_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function nameOf(value: unknown): string | null {
  if (typeof value === "string") return sanitizeClientText(value);
  if (value && typeof value === "object") {
    const rec = value as { name?: unknown; short_name?: unknown };
    if (typeof rec.name === "string") {
      const cleaned = sanitizeClientText(rec.name);
      if (cleaned) return cleaned;
    }
    if (typeof rec.short_name === "string") {
      const cleaned = sanitizeClientText(rec.short_name);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

// ---------- Fase y reloj ----------

/**
 * Bzzoiro v2 documenta `upcoming | live | finished | cancelled | postponed | unresolved` y el
 * detalle del tiempo en `period`; algunas filas traen los nombres de origen
 * (`inprogress`, `halftime`, `1st_half`…). Se aceptan ambos.
 */
export function phaseFrom(status: string | null | undefined, period: string | null | undefined): LivePhase {
  const s = (status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const p = (period ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["finished", "ended", "ft", "aet", "ap", "after_penalties", "after_extra_time"].includes(s)) return "final";
  if (s === "postponed" || s === "delayed" || s === "suspended" || s === "interrupted") return "postponed";
  if (s === "cancelled" || s === "canceled" || s === "abandoned") return "cancelled";
  if (s === "unresolved") return "unknown";
  if (["upcoming", "notstarted", "not_started", "scheduled", "ns", ""].includes(s)) return "scheduled";
  if (p === "halftime" || p === "ht" || p === "half_time" || s === "halftime") return "halftime";
  if (p.includes("penalt") || s === "penalties") return "penalties";
  if (["live", "inprogress", "in_progress", "1st_half", "2nd_half", "extratime", "extra_time", "1h", "2h", "et"].includes(s)) {
    return "live";
  }
  return "live";
}

export function clockFrom(minute: number | null, injury: number | null, phase: LivePhase): string | null {
  if (phase === "halftime") return "MT";
  if (phase === "penalties") return "Pen";
  if (phase !== "live" || minute === null) return null;
  const m = Math.max(1, Math.floor(minute));
  // Tiempo agregado: el proveedor puede mandar 47 en el primer tiempo o 45 + 2.
  if (injury && injury > 0) return `${m}+${Math.floor(injury)}`;
  return String(m);
}

function score(home: unknown, away: unknown): LiveScore | null {
  const h = num(home);
  const a = num(away);
  return h === null || a === null ? null : { home: h, away: a };
}

const LEAGUE_BY_BZ_ID = new Map<number, string>(
  Object.entries(BZZOIRO_LEAGUES).flatMap(([league, ids]) => ids.map((id) => [id, league] as const)),
);

export function leagueForBzzoiro(id: number | null | undefined): string | null {
  return typeof id === "number" ? (LEAGUE_BY_BZ_ID.get(id) ?? null) : null;
}

export function bzLeagueId(e: BzLiveEvent): number | null {
  return num(e.league_id) ?? num(e.league?.id);
}

/** Convierte un evento del proveedor a una fila del marcador con NUESTRO id. */
export function toScoreboardEntry(e: BzLiveEvent, gameId: string, league: string, kickoffUtc: string): LiveScoreboardEntry {
  const phase = phaseFrom(e.status, e.period);
  const parsedMin = parseFootballMinute(e.current_minute) ?? parseFootballMinute(e.minute);
  const minute = parsedMin?.minute ?? null;
  const explicitInjury = num(e.injury_time);
  const injury =
    explicitInjury !== null && explicitInjury > 0 ? explicitInjury : (parsedMin?.addedTime ?? null);
  const ft = score(e.home_score, e.away_score);
  // `home_score` es solo tiempo regular; el tiempo extra suma aparte.
  const et = e.extra_time_score ? score(e.extra_time_score.home, e.extra_time_score.away) : null;
  const total = ft && et ? { home: ft.home + et.home, away: ft.away + et.away } : ft;
  const refereeName =
    nameOf(e.referee) ?? (typeof e.referee_name === "string" ? e.referee_name.trim() || null : null);
  return {
    gameId,
    league,
    phase,
    clock: clockFrom(minute, injury, phase),
    minute: phase === "live" ? minute : null,
    score: phase === "scheduled" ? null : (total ?? (phase === "live" || phase === "halftime" ? { home: 0, away: 0 } : null)),
    htScore: score(e.home_score_ht, e.away_score_ht),
    redCards:
      num(e.home_red_cards) !== null || num(e.away_red_cards) !== null
        ? { home: num(e.home_red_cards) ?? 0, away: num(e.away_red_cards) ?? 0 }
        : null,
    ...(refereeName ? { referee: refereeName } : {}),
    // La hora de inicio es la nuestra (snapshot), no la del proveedor.
    kickoffUtc,
  };
}

// ---------- Emparejar con nuestros partidos ----------

export interface LinkCandidate {
  gameId: string;
  league: string;
  kickoffUtc: string;
  homeName: string;
  awayName: string;
}

export interface EventLink {
  gameId: string;
  providerEventId: string;
  method: "kickoff+teams";
}

function teamName(v: BzLiveEvent["home_team"]): string {
  return nameOf(v) ?? "";
}

const MAX_KICKOFF_GAP_MS = 3 * 3_600_000;

/**
 * Empareja eventos del proveedor con partidos propios por liga, hora de inicio (±3 h) y parecido
 * de nombres. Solo acepta un candidato claro: sin coincidencia única, no hay enlace (mejor no
 * mostrar marcador que mostrar el de otro partido).
 */
export function linkLiveEvents(events: readonly BzLiveEvent[], candidates: readonly LinkCandidate[]): EventLink[] {
  const links: EventLink[] = [];
  const usedGames = new Set<string>();
  for (const e of events) {
    const league = leagueForBzzoiro(bzLeagueId(e));
    const home = teamName(e.home_team);
    const away = teamName(e.away_team);
    if (!home || !away) continue;
    const kickoff = e.event_date ? Date.parse(e.event_date) : Number.NaN;
    const scored = candidates
      .filter((c) => !usedGames.has(c.gameId) && (league === null || c.league === league))
      .filter((c) => !Number.isFinite(kickoff) || Math.abs(Date.parse(c.kickoffUtc) - kickoff) <= MAX_KICKOFF_GAP_MS)
      .map((c) => {
        // `teamSimilarity` compara el nombre del proveedor contra un slug del corpus.
        const sh = teamSimilarity(home, slugifyTeamName(c.homeName));
        const sa = teamSimilarity(away, slugifyTeamName(c.awayName));
        return { c, sh, sa, total: sh + sa };
      })
      // Al menos un nombre casi igual y el otro con algo en común, o ambos parecidos.
      .filter((x) => (Math.max(x.sh, x.sa) >= 0.85 && Math.min(x.sh, x.sa) > 0) || (x.sh >= 0.5 && x.sa >= 0.5))
      .sort((a, b) => b.total - a.total);
    const best = scored[0];
    if (!best) continue;
    const runnerUp = scored[1];
    if (runnerUp && runnerUp.total >= best.total - 0.15) continue; // ambiguo
    usedGames.add(best.c.gameId);
    links.push({ gameId: best.c.gameId, providerEventId: String(e.id), method: "kickoff+teams" });
  }
  return links;
}

// ---------- Incidentes, estadísticas y momentum ----------

function incidentKind(raw: BzLiveIncident): LiveIncident["kind"] | null {
  const type = (raw.type ?? raw.incident_type ?? "").toLowerCase();
  const cls = (raw.incident_class ?? raw.card_type ?? raw.class ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  if (type === "goal") {
    const goalType = (raw.goal_type ?? "").toLowerCase().replace(/[\s_-]+/g, "");
    if (raw.own_goal || raw.is_own_goal || cls.includes("own") || goalType.includes("own")) return "own_goal";
    if (raw.from_penalty || raw.is_penalty || cls.includes("penalty") || goalType.includes("penalty")) {
      return "penalty_goal";
    }
    return "goal";
  }
  if (type === "penalty_missed" || type === "penaltymissed") return "penalty_missed";
  if (type === "card") {
    if (raw.rescinded) return null;
    if (cls.includes("yellowred") || cls.includes("secondyellow")) return "second_yellow";
    if (cls.includes("red")) return "red";
    return "yellow";
  }
  if (type === "substitution") return "sub";
  if (type === "vardecision" || type === "var_decision" || type === "var") return "var";
  // `is_live: true` marca el periodo en curso («Second half»), no un corte del partido.
  if (type === "period") return raw.is_live ? null : "period";
  return null;
}

function sideOf(raw: BzLiveIncident): LiveIncident["side"] {
  if (typeof raw.is_home === "boolean") return raw.is_home ? "home" : "away";
  if (raw.team === "home" || raw.team === "away") return raw.team;
  return null;
}

function periodNote(raw: BzLiveIncident): string | null {
  const text = (raw.text ?? "").trim().toUpperCase();
  if (text === "HT") return "Medio tiempo";
  if (text === "FT") return "Final";
  if (text === "AET") return "Final tras tiempo extra";
  if (text === "AP" || text.includes("PEN")) return "Final tras penales";
  if (text === "ET") return "Fin del tiempo regular";
  return null;
}

const VAR_DECISIONS_ES: Record<string, string> = {
  penaltyawarded: "VAR: penal concedido",
  penaltynotawarded: "VAR: no hay penal",
  goalawarded: "VAR: gol válido",
  goalnotawarded: "VAR: gol anulado",
  redcard: "VAR: tarjeta roja",
  noredcard: "VAR: se retira la roja",
  cardupgrade: "VAR: cambia la tarjeta",
};

function varNote(raw: BzLiveIncident): string {
  const key = (raw.decision ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return VAR_DECISIONS_ES[key] ?? "Revisión del VAR";
}

/** Línea de tiempo ordenada del partido (más antiguo primero). */
export function parseIncidents(raw: BzList<BzLiveIncident> | null): LiveIncident[] {
  const out: LiveIncident[] = [];
  list<BzLiveIncident>(raw).forEach((r, index) => {
    const kind = incidentKind(r);
    if (!kind) return;
    const parsedMin = parseFootballMinute(r.minute);
    const minute = parsedMin?.minute ?? null;
    const explicitAdded = num(r.added_time);
    const added =
      explicitAdded !== null && explicitAdded > 0
        ? Math.round(explicitAdded)
        : (parsedMin?.addedTime ?? null);
    const isSub = kind === "sub";
    // Escala unificada `minute * 100 + addedTime` (45+7 -> 4507 antes del corte HT 4599 y del 46' -> 4600).
    const clampedAdded = added !== null ? Math.min(Math.max(added, 0), 98) : 0;
    const order =
      minute !== null
        ? Math.round(minute) * 100 + (kind === "period" ? 99 : clampedAdded)
        : 1_000_000 + index;
    out.push({
      order,
      kind,
      side: kind === "period" ? null : sideOf(r),
      minute,
      addedTime: added && added > 0 ? added : null,
      player: isSub ? (nameOf(r.player_in) ?? nameOf(r.player)) : (nameOf(r.player) ?? nameOf(r.player_name)),
      secondary: isSub ? nameOf(r.player_out) : nameOf(r.assist),
      score: kind === "goal" || kind === "own_goal" || kind === "penalty_goal" ? score(r.home_score, r.away_score) : null,
      note:
        kind === "period"
          ? periodNote(r)
          : kind === "var"
            ? varNote(r)
            : kind === "penalty_missed"
              ? r.reason === "saved"
                ? "Penal atajado"
                : r.reason === "post"
                  ? "Penal al poste"
                  : "Penal fallado"
              : null,
    });
  });
  return out.sort((a, b) => a.order - b.order);
}

function ratio(raw: BzTeamStatsRaw | null | undefined, key: string): number | null {
  const value = raw?.[key];
  if (typeof value === "number") return num(value);
  if (value && typeof value === "object") {
    if ("value" in value) return num((value as { value?: number }).value);
    if ("actual" in value) return num((value as { actual?: number }).actual);
  }
  return null;
}

export function parseLiveTeamStats(raw: BzTeamStatsRaw | null | undefined): LiveTeamStats {
  return {
    xg: ratio(raw, "xg") ?? ratio(raw, "expected_goals"),
    shots: ratio(raw, "total_shots"),
    shotsOnTarget: ratio(raw, "shots_on_target"),
    corners: ratio(raw, "corner_kicks"),
    possessionPct: ratio(raw, "ball_possession"),
    fouls: ratio(raw, "fouls"),
    yellowCards: ratio(raw, "yellow_cards"),
    redCards: ratio(raw, "red_cards"),
    offsides: ratio(raw, "offsides"),
    bigChances: ratio(raw, "big_chances"),
    goalsPrevented: ratio(raw, "goals_prevented"),
    touchesInBox: ratio(raw, "touches_in_penalty_area") ?? ratio(raw, "touches_in_box"),
    passAccuracyPct: ratio(raw, "accurate_passes_pct") ?? ratio(raw, "pass_accuracy"),
  };
}

export interface BzLiveCommentaryRaw {
  id?: string | number | null;
  minute?: number | string | null;
  added_time?: number | null;
  text?: string | null;
  commentary?: string | null;
  is_important?: boolean | null;
  is_home?: boolean | null;
  team?: string | null;
  period_second?: number | null;
}

export interface BzLivePlayerStatRaw {
  id?: number | null;
  player_id?: number | null;
  external_id?: string | number | null;
  player?:
    | string
    | {
        id?: number | null;
        name?: string | null;
        short_name?: string | null;
        shirt_number?: number | null;
        jersey_number?: number | null;
      }
    | null;
  player_name?: string | null;
  is_home?: boolean | null;
  home?: boolean | null;
  side?: string | null;
  team?: string | { name?: string | null } | null;
  position?: string | null;
  shirt_number?: number | string | null;
  jersey_number?: number | string | null;
  number?: number | string | null;
  minutes_played?: number | null;
  minutes?: number | null;
  rating?: number | null;
  goals?: number | null;
  assists?: number | null;
  total_shots?: number | null;
  shots?: number | null;
  shots_on_target?: number | null;
  key_passes?: number | null;
  xg?: number | null;
  expected_goals?: number | null;
  xa?: number | null;
  expected_assists?: number | null;
  tackles?: number | null;
  saves?: number | null;
  touches?: number | null;
  ball_touches?: number | null;
  average_x?: number | string | null;
  average_y?: number | string | null;
  avg_x?: number | string | null;
  avg_y?: number | string | null;
  average_position?: { x?: number | string | null; y?: number | string | null } | null;
  pos?: { x?: number | string | null; y?: number | string | null } | null;
  photo_url?: string | null;
  image_url?: string | null;
}

export type BzPlayerStatsPayload =
  | BzList<BzLivePlayerStatRaw>
  | { home?: BzLivePlayerStatRaw[]; away?: BzLivePlayerStatRaw[] };

export interface BzBroadcastRaw {
  channel?: string | null;
  name?: string | null;
  broadcaster?: string | null;
  country_code?: string | null;
  url?: string | null;
}

/** Convierte comentarios de `/events/{id}/commentary/?since=` manteniendo orden cronológico. */
export function parseCommentary(raw: BzList<BzLiveCommentaryRaw> | null): LiveCommentaryItem[] {
  const out: LiveCommentaryItem[] = [];
  list<BzLiveCommentaryRaw>(raw).forEach((r, idx) => {
    const text = sanitizeClientText(r.text ?? r.commentary);
    if (!text) return;
    const parsedMin = parseFootballMinute(r.minute);
    const minute = parsedMin?.minute ?? null;
    const explicitAdded = num(r.added_time);
    const added =
      explicitAdded !== null && explicitAdded > 0
        ? Math.round(explicitAdded)
        : (parsedMin?.addedTime ?? null);
    const clampedAdded = added !== null ? Math.min(Math.max(added, 0), 98) : 0;
    const order = minute !== null ? Math.round(minute) * 100 + clampedAdded : 1_000_000 + idx;
    const side =
      typeof r.is_home === "boolean"
        ? r.is_home
          ? "home"
          : "away"
        : r.team === "home" || r.team === "away"
          ? r.team
          : null;
    out.push({
      id: r.id != null ? String(r.id) : `c-${order}-${idx}`,
      order,
      minute,
      addedTime: added && added > 0 ? added : null,
      text,
      ...(r.is_important === true ? { isImportant: true } : {}),
      ...(side ? { side } : {}),
    });
  });
  return out.sort((a, b) => a.order - b.order);
}

/** Fusiona comentarios incrementales de `?since=` sin duplicar entradas existentes. */
export function mergeCommentary(
  prev: readonly LiveCommentaryItem[],
  incoming: readonly LiveCommentaryItem[],
): LiveCommentaryItem[] {
  const map = new Map<string, LiveCommentaryItem>();
  for (const item of prev) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()].sort((a, b) => a.order - b.order);
}

function flattenTaggedPlayerStats(
  raw: BzPlayerStatsPayload | null | undefined,
): Array<{ raw: BzLivePlayerStatRaw; forcedSide?: "home" | "away" }> {
  if (!raw) return [];
  const tagged: Array<{ raw: BzLivePlayerStatRaw; forcedSide?: "home" | "away" }> = [];
  if (typeof raw === "object" && !Array.isArray(raw) && ("home" in raw || "away" in raw)) {
    const grouped = raw as { home?: BzLivePlayerStatRaw[]; away?: BzLivePlayerStatRaw[] };
    for (const r of grouped.home ?? []) tagged.push({ raw: r, forcedSide: "home" });
    for (const r of grouped.away ?? []) tagged.push({ raw: r, forcedSide: "away" });
  } else {
    for (const r of list<BzLivePlayerStatRaw>(raw as BzList<BzLivePlayerStatRaw>)) {
      tagged.push({ raw: r });
    }
  }
  return tagged;
}

function resolveSideFromFlags(
  item: {
    is_home?: boolean | null;
    home?: boolean | null;
    side?: string | null;
    team?: string | { name?: string | null } | null;
  },
  forcedSide?: "home" | "away",
): "home" | "away" | null {
  if (forcedSide) return forcedSide;
  if (typeof item.is_home === "boolean") return item.is_home ? "home" : "away";
  if (typeof item.home === "boolean") return item.home ? "home" : "away";
  const sideStr = (item.side ?? (typeof item.team === "string" ? item.team : "") ?? "").trim().toLowerCase();
  if (sideStr === "home" || sideStr === "local" || sideStr === "1") return "home";
  if (sideStr === "away" || sideStr === "visita" || sideStr === "visitante" || sideStr === "2") return "away";
  return null;
}

/** Convierte actuaciones individuales de `/events/{id}/player-stats/`. */
export function parsePlayerStats(
  raw: BzPlayerStatsPayload | null,
): LivePlayerStatRow[] {
  const tagged = flattenTaggedPlayerStats(raw);
  const rows: LivePlayerStatRow[] = [];
  for (const { raw: r, forcedSide } of tagged) {
    const player = nameOf(r.player) ?? sanitizeClientText(r.player_name);
    if (!player) continue;
    const side = resolveSideFromFlags(r, forcedSide) ?? "home";
    rows.push({
      player,
      side,
      position: sanitizeClientText(r.position),
      minutes: num(r.minutes_played) ?? num(r.minutes),
      rating: num(r.rating),
      goals: num(r.goals) ?? 0,
      assists: num(r.assists) ?? 0,
      shots: num(r.total_shots) ?? num(r.shots) ?? 0,
      shotsOnTarget: num(r.shots_on_target) ?? 0,
      keyPasses: num(r.key_passes) ?? 0,
      xg: num(r.xg) ?? num(r.expected_goals),
      xa: num(r.xa) ?? num(r.expected_assists),
      tackles: num(r.tackles) ?? 0,
      saves: num(r.saves) ?? 0,
    });
  }
  return rows.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.goals ?? 0) - (a.goals ?? 0));
}

/** Extrae canales únicos de `/events/{id}/broadcasts/?country_code=MX` (sin URLs externas ni duplicados). */
export function parseBroadcastsMx(raw: BzList<BzBroadcastRaw> | null): string[] {
  const seenLower = new Set<string>();
  const out: string[] = [];
  for (const r of list<BzBroadcastRaw>(raw)) {
    const cc = (r.country_code ?? "").trim().toUpperCase();
    if (cc && cc !== "MX") continue;
    const name = sanitizeClientText(r.channel ?? r.broadcaster ?? r.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seenLower.has(key)) {
      seenLower.add(key);
      out.push(name.slice(0, 80));
    }
  }
  return out.slice(0, 8);
}

// ---------- Shotmap normalizado, xG por disparo/minuto y Posiciones Medias (`FD-16`) ----------

export type NormalizedShotOutcome = "goal" | "saved" | "blocked" | "miss" | "post";
export type ShotBodyPart = "right_foot" | "left_foot" | "head" | "other";

export interface NormalizedShot {
  readonly x: number;
  readonly y: number;
  readonly minute: number;
  readonly addedTime?: number;
  readonly xg: number;
  readonly outcome: NormalizedShotOutcome;
  readonly side: "home" | "away";
  readonly playerName: string;
  readonly bodyPart?: ShotBodyPart;
}

export interface NormalizedXgTimelinePoint {
  readonly minute: number;
  readonly xgHome: number;
  readonly xgAway: number;
  readonly cumHome: number;
  readonly cumAway: number;
}

export interface NormalizedShotmapSummary {
  readonly shots: readonly NormalizedShot[];
  readonly xgHome: number;
  readonly xgAway: number;
  readonly xgEstimated: boolean | null;
  readonly shotsHome: number;
  readonly shotsAway: number;
  readonly xgTimeline: readonly NormalizedXgTimelinePoint[];
}

export interface NormalizedAveragePosition {
  readonly x: number;
  readonly y: number;
  readonly playerName: string;
  readonly jerseyNumber: number | null;
  readonly position: string;
  readonly touches: number;
  readonly rating?: number;
}

export interface NormalizedTeamAveragePositions {
  readonly home: readonly NormalizedAveragePosition[];
  readonly away: readonly NormalizedAveragePosition[];
}

export interface BzzoiroMatchVisualTelemetry {
  readonly shotmap: NormalizedShotmapSummary;
  readonly averagePositions: NormalizedTeamAveragePositions;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function clampCoord(v: number, scaleTo100: boolean): number {
  const scaled = scaleTo100 ? v * 100 : v;
  return round2(Math.max(0, Math.min(100, scaled)));
}

function detectUnitCoordScale(pairs: readonly { x: number; y: number }[]): boolean {
  if (pairs.length === 0) return false;
  let maxAbs = 0;
  let anyFractional = false;
  for (const p of pairs) {
    const ax = Math.abs(p.x);
    const ay = Math.abs(p.y);
    if (ax > maxAbs) maxAbs = ax;
    if (ay > maxAbs) maxAbs = ay;
    if (
      (ax > 0 && ax < 1.15 && !Number.isInteger(p.x)) ||
      (ay > 0 && ay < 1.15 && !Number.isInteger(p.y))
    ) {
      anyFractional = true;
    }
  }
  return maxAbs <= 1.15 && anyFractional;
}

function isGoalOriginShotmapAxis(xs: readonly number[]): boolean {
  if (xs.length === 0) return false;
  const sorted = xs.slice().sort((a, b) => a - b);
  const maxX = sorted[sorted.length - 1];
  if (maxX !== undefined && maxX <= 50) return true;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] ?? 50)
      : ((sorted[mid - 1] ?? 50) + (sorted[mid] ?? 50)) / 2;
  return median < 50;
}

export function normalizeShotmapAxisX(xs: readonly number[]): number[] {
  if (!isGoalOriginShotmapAxis(xs)) {
    return xs.slice();
  }
  return xs.map((x) => round2(Math.max(0, Math.min(100, 100 - x))));
}

/** Normaliza resultado de disparo Bzzoiro a `goal | saved | blocked | miss | post`. */
export function normalizeShotOutcome(raw: unknown): NormalizedShotOutcome | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!s) return null;
  if (s === "goal" || s === "own_goal" || s === "penalty_goal" || s === "scored") return "goal";
  if (s === "save" || s === "saved" || s === "attempt_saved" || s === "on_target") return "saved";
  if (s === "block" || s === "blocked" || s === "blocked_shot") return "blocked";
  if (s === "post" || s === "woodwork" || s === "hit_woodwork" || s === "crossbar") return "post";
  if (s === "miss" || s === "missed" || s === "off_target" || s === "wide" || s === "high" || s === "wayward") {
    return "miss";
  }
  return null;
}

function toLegacyLiveShotOutcome(outcome: NormalizedShotOutcome): LiveShot["outcome"] {
  if (outcome === "saved") return "save";
  if (outcome === "blocked") return "block";
  return outcome;
}

/** Normaliza parte del cuerpo del disparo (opcional). */
export function normalizeShotBodyPart(raw: unknown): ShotBodyPart | undefined {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!s) return undefined;
  if (s === "right_foot" || s === "right" || s === "pie_derecho" || s === "derecho") return "right_foot";
  if (s === "left_foot" || s === "left" || s === "pie_izquierdo" || s === "izquierdo") return "left_foot";
  if (s === "head" || s === "header" || s === "cabeza") return "head";
  if (s === "other" || s === "chest" || s === "body" || s === "otro") return "other";
  return undefined;
}

function extractPlayerLookup(playerStatsRaw?: BzPlayerStatsPayload | null): {
  nameByInternalId: Map<number, string>;
  metaBySideName: Map<
    string,
    { jerseyNumber: number | null; position: string | null; touches: number | null; rating: number | null }
  >;
  metaByInternalId: Map<
    number,
    {
      playerName: string;
      side: "home" | "away";
      jerseyNumber: number | null;
      position: string | null;
      touches: number | null;
      rating: number | null;
    }
  >;
} {
  const nameByInternalId = new Map<number, string>();
  const metaBySideName = new Map<
    string,
    { jerseyNumber: number | null; position: string | null; touches: number | null; rating: number | null }
  >();
  const metaByInternalId = new Map<
    number,
    {
      playerName: string;
      side: "home" | "away";
      jerseyNumber: number | null;
      position: string | null;
      touches: number | null;
      rating: number | null;
    }
  >();

  for (const { raw: r, forcedSide } of flattenTaggedPlayerStats(playerStatsRaw)) {
    const playerName = nameOf(r.player) ?? sanitizeClientText(r.player_name);
    if (!playerName) continue;
    const side = resolveSideFromFlags(r, forcedSide) ?? "home";
    const playerObj = r.player && typeof r.player === "object" ? r.player : null;
    const rawId = num(r.player_id ?? playerObj?.id ?? r.id);
    const rawJersey = num(r.jersey_number ?? r.shirt_number ?? r.number ?? playerObj?.jersey_number ?? playerObj?.shirt_number);
    const jerseyNumber =
      rawJersey !== null && Number.isInteger(rawJersey) && rawJersey >= 1 && rawJersey <= 99 ? rawJersey : null;
    const position = sanitizeClientText(r.position);
    const rawTouches = num(r.touches ?? r.ball_touches);
    const touches = rawTouches !== null && rawTouches >= 0 ? Math.round(rawTouches) : null;
    const rawRating = num(r.rating);
    const rating = rawRating !== null && rawRating >= 0 && rawRating <= 10 ? round2(rawRating) : null;

    metaBySideName.set(`${side}|${playerName.toLowerCase()}`, { jerseyNumber, position, touches, rating });
    if (rawId !== null && Number.isInteger(rawId) && rawId > 0) {
      nameByInternalId.set(rawId, playerName);
      metaByInternalId.set(rawId, { playerName, side, jerseyNumber, position, touches, rating });
    }
  }

  return { nameByInternalId, metaBySideName, metaByInternalId };
}

/**
 * Extrae y normaliza shotmap + xG por disparo y por minuto desde `/events/{id}/stats/` y
 * `/events/{id}/player-stats/` (o feed en vivo). Tolerante a faltantes y libre de IDs/URLs (`FD-16`).
 */
export function parseBzzoiroShotmap(
  statsRaw: BzLiveStats | null | undefined,
  playerStatsRaw?: BzPlayerStatsPayload | null,
): NormalizedShotmapSummary {
  const lookup = extractPlayerLookup(playerStatsRaw);
  const rawShots = statsRaw?.shotmap ?? statsRaw?.shots ?? [];

  const preliminary: Array<{
    rawX: number;
    rawY: number;
    minute: number;
    addedTime?: number;
    xg: number;
    outcome: NormalizedShotOutcome;
    side: "home" | "away";
    playerName: string;
    bodyPart?: ShotBodyPart;
  }> = [];

  for (const s of rawShots ?? []) {
    if (!s || typeof s !== "object") continue;
    const side = resolveSideFromFlags(s);
    const outcome = normalizeShotOutcome(s.type ?? s.outcome ?? s.shot_type ?? s.result);
    const parsedMin = parseFootballMinute(s.min ?? s.minute ?? s.time);
    const minuteRaw = parsedMin?.minute ?? null;
    const rawX = num(s.pos?.x ?? s.position?.x ?? s.coordinates?.x ?? s.x);
    const rawY = num(s.pos?.y ?? s.position?.y ?? s.coordinates?.y ?? s.y);
    if (!side || !outcome || minuteRaw === null || minuteRaw < 0 || rawX === null || rawY === null) {
      continue;
    }

    const playerObj = s.player && typeof s.player === "object" ? s.player : null;
    const internalPlayerId = num(s.player_id ?? playerObj?.id);
    const resolvedPlayerName =
      nameOf(s.player) ??
      sanitizeClientText(s.player_name ?? s.playerName) ??
      nameOf(s.shooter) ??
      (internalPlayerId !== null ? lookup.nameByInternalId.get(internalPlayerId) ?? null : null) ??
      (side === "home" ? "Jugador local" : "Jugador visitante");

    const xgRaw = num(s.xg ?? s.expected_goals ?? s.xG);
    const xg = xgRaw !== null && xgRaw >= 0 && xgRaw <= 1.2 ? round3(xgRaw) : 0;
    const addedRaw = num(s.added_time);
    const addedCandidate =
      addedRaw !== null && addedRaw > 0
        ? Math.round(addedRaw)
        : (parsedMin?.addedTime ?? undefined);
    const addedTime = addedCandidate !== undefined && addedCandidate > 0 ? addedCandidate : undefined;
    const bodyPart = normalizeShotBodyPart(s.body_part ?? s.bodyPart ?? s.part);

    preliminary.push({
      rawX,
      rawY,
      minute: Math.max(0, Math.min(130, Math.round(minuteRaw))),
      ...(addedTime !== undefined ? { addedTime } : {}),
      xg,
      outcome,
      side,
      playerName: resolvedPlayerName.slice(0, 120),
      ...(bodyPart ? { bodyPart } : {}),
    });
  }

  const unitScale = detectUnitCoordScale(preliminary.map((p) => ({ x: p.rawX, y: p.rawY })));
  const normalizedXs = normalizeShotmapAxisX(preliminary.map((p) => clampCoord(p.rawX, unitScale)));
  const shots: NormalizedShot[] = preliminary
    .map((p, idx) => ({
      x: normalizedXs[idx] ?? clampCoord(p.rawX, unitScale),
      y: clampCoord(p.rawY, unitScale),
      minute: p.minute,
      ...(p.addedTime !== undefined ? { addedTime: p.addedTime } : {}),
      xg: p.xg,
      outcome: p.outcome,
      side: p.side,
      playerName: p.playerName,
      ...(p.bodyPart ? { bodyPart: p.bodyPart } : {}),
    }))
    .sort(
      (a, b) =>
        a.minute * 100 + Math.min(a.addedTime ?? 0, 98) - (b.minute * 100 + Math.min(b.addedTime ?? 0, 98)) ||
        (a.side === b.side ? 0 : a.side === "home" ? -1 : 1),
    );

  // Construye línea temporal de xG por minuto desde `xg_per_minute` o derivada desde `shots`
  let xgTimeline: NormalizedXgTimelinePoint[] = [];
  const rawTimeline = statsRaw?.xg_per_minute ?? [];
  if (rawTimeline.length > 0) {
    const sortedRaw = rawTimeline
      .map((pt) => ({
        minute: parseFootballMinute(pt.m ?? pt.minute)?.minute ?? null,
        xgHome: num(pt.xg_home),
        xgAway: num(pt.xg_away),
        cumHome: num(pt.cum_home),
        cumAway: num(pt.cum_away),
      }))
      .filter((pt): pt is { minute: number; xgHome: number | null; xgAway: number | null; cumHome: number | null; cumAway: number | null } => pt.minute !== null && pt.minute >= 0)
      .sort((a, b) => a.minute - b.minute);

    let runningHome = 0;
    let runningAway = 0;
    xgTimeline = sortedRaw.map((pt) => {
      const nextCumHome =
        pt.cumHome !== null ? Math.max(0, pt.cumHome) : Math.max(0, runningHome + Math.max(0, pt.xgHome ?? 0));
      const nextCumAway =
        pt.cumAway !== null ? Math.max(0, pt.cumAway) : Math.max(0, runningAway + Math.max(0, pt.xgAway ?? 0));
      const incHome = pt.xgHome !== null ? Math.max(0, pt.xgHome) : Math.max(0, nextCumHome - runningHome);
      const incAway = pt.xgAway !== null ? Math.max(0, pt.xgAway) : Math.max(0, nextCumAway - runningAway);
      runningHome = nextCumHome;
      runningAway = nextCumAway;
      return {
        minute: Math.round(pt.minute),
        xgHome: round3(incHome),
        xgAway: round3(incAway),
        cumHome: round3(nextCumHome),
        cumAway: round3(nextCumAway),
      };
    });
  } else if (shots.length > 0) {
    const byMin = new Map<number, { home: number; away: number }>();
    for (const sh of shots) {
      const bucket = byMin.get(sh.minute) ?? { home: 0, away: 0 };
      if (sh.side === "home") bucket.home += sh.xg;
      else bucket.away += sh.xg;
      byMin.set(sh.minute, bucket);
    }
    let cumHome = 0;
    let cumAway = 0;
    xgTimeline = [...byMin.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([minute, inc]) => {
        cumHome += inc.home;
        cumAway += inc.away;
        return {
          minute,
          xgHome: round3(inc.home),
          xgAway: round3(inc.away),
          cumHome: round3(cumHome),
          cumAway: round3(cumAway),
        };
      });
  }

  const statHomeXg = ratio(statsRaw?.stats?.home, "xg") ?? ratio(statsRaw?.stats?.home, "expected_goals");
  const statAwayXg = ratio(statsRaw?.stats?.away, "xg") ?? ratio(statsRaw?.stats?.away, "expected_goals");
  const timelineLast = xgTimeline.at(-1);
  const sumShotsHome = shots.filter((s) => s.side === "home").reduce((acc, s) => acc + s.xg, 0);
  const sumShotsAway = shots.filter((s) => s.side === "away").reduce((acc, s) => acc + s.xg, 0);

  let playerSumHome = 0;
  let playerSumAway = 0;
  let hasPlayerXg = false;
  for (const row of parsePlayerStats(playerStatsRaw ?? null)) {
    if (typeof row.xg === "number" && row.xg >= 0) {
      hasPlayerXg = true;
      if (row.side === "home") playerSumHome += row.xg;
      else playerSumAway += row.xg;
    }
  }

  const xgHome = round3(
    statHomeXg ?? timelineLast?.cumHome ?? (shots.length > 0 ? sumShotsHome : hasPlayerXg ? playerSumHome : 0),
  );
  const xgAway = round3(
    statAwayXg ?? timelineLast?.cumAway ?? (shots.length > 0 ? sumShotsAway : hasPlayerXg ? playerSumAway : 0),
  );

  const shotsHome =
    ratio(statsRaw?.stats?.home, "total_shots") ?? shots.filter((s) => s.side === "home").length;
  const shotsAway =
    ratio(statsRaw?.stats?.away, "total_shots") ?? shots.filter((s) => s.side === "away").length;

  return {
    shots,
    xgHome,
    xgAway,
    xgEstimated: typeof statsRaw?.xg_estimated === "boolean" ? statsRaw.xg_estimated : null,
    shotsHome: Math.max(0, Math.round(shotsHome)),
    shotsAway: Math.max(0, Math.round(shotsAway)),
    xgTimeline,
  };
}

function flattenTaggedAvgPositions(
  raw:
    | BzList<BzAveragePositionRaw>
    | { home?: BzAveragePositionRaw[]; away?: BzAveragePositionRaw[] }
    | null
    | undefined,
): Array<{ raw: BzAveragePositionRaw; forcedSide?: "home" | "away" }> {
  if (!raw) return [];
  const tagged: Array<{ raw: BzAveragePositionRaw; forcedSide?: "home" | "away" }> = [];
  if (typeof raw === "object" && !Array.isArray(raw) && ("home" in raw || "away" in raw)) {
    const grouped = raw as { home?: BzAveragePositionRaw[]; away?: BzAveragePositionRaw[] };
    for (const item of grouped.home ?? []) tagged.push({ raw: item, forcedSide: "home" });
    for (const item of grouped.away ?? []) tagged.push({ raw: item, forcedSide: "away" });
  } else {
    for (const item of list<BzAveragePositionRaw>(raw as BzList<BzAveragePositionRaw>)) {
      tagged.push({ raw: item });
    }
  }
  return tagged;
}

/**
 * Extrae posiciones medias normalizadas (0..100) por equipo desde `/events/{id}/stats/` y/o
 * `/events/{id}/player-stats/`, enriqueciendo `rating`, `touches`, `jerseyNumber` y `position`
 * sin exponer `externalId` ni URLs de proveedor (`FD-16`).
 */
export function parseBzzoiroAveragePositions(
  statsRaw: BzLiveStats | null | undefined,
  playerStatsRaw?: BzPlayerStatsPayload | null,
): NormalizedTeamAveragePositions {
  const lookup = extractPlayerLookup(playerStatsRaw);
  const rawPositionsContainer =
    statsRaw?.average_positions ?? statsRaw?.averagePositions ?? statsRaw?.positions ?? null;

  const candidates: Array<{
    side: "home" | "away";
    rawX: number;
    rawY: number;
    playerName: string;
    jerseyNumber: number | null;
    position: string;
    touches: number;
    rating?: number;
  }> = [];

  const seenKey = new Set<string>();

  const pushCandidate = (entry: {
    side: "home" | "away";
    rawX: number;
    rawY: number;
    playerName: string;
    jerseyNumber: number | null;
    position: string | null;
    touches: number | null;
    rating: number | null;
  }) => {
    const dedup = `${entry.side}|${entry.playerName.toLowerCase()}`;
    if (seenKey.has(dedup)) return;
    seenKey.add(dedup);
    candidates.push({
      side: entry.side,
      rawX: entry.rawX,
      rawY: entry.rawY,
      playerName: entry.playerName.slice(0, 120),
      jerseyNumber: entry.jerseyNumber,
      position: (entry.position ?? "N/D").slice(0, 24),
      touches: entry.touches !== null && entry.touches >= 0 ? Math.round(entry.touches) : 0,
      ...(entry.rating !== null && entry.rating >= 0 && entry.rating <= 10
        ? { rating: round2(entry.rating) }
        : {}),
    });
  };

  for (const { raw: item, forcedSide } of flattenTaggedAvgPositions(rawPositionsContainer)) {
    if (!item || typeof item !== "object") continue;
    const rawX = num(item.average_x ?? item.avg_x ?? item.average_position?.x ?? item.pos?.x ?? item.x);
    const rawY = num(item.average_y ?? item.avg_y ?? item.average_position?.y ?? item.pos?.y ?? item.y);
    if (rawX === null || rawY === null) continue;

    const playerObj = item.player && typeof item.player === "object" ? item.player : null;
    const internalId = num(item.player_id ?? playerObj?.id ?? item.id);
    const idMeta = internalId !== null ? lookup.metaByInternalId.get(internalId) : undefined;
    const playerName =
      nameOf(item.player) ?? sanitizeClientText(item.player_name ?? item.name) ?? idMeta?.playerName ?? null;
    if (!playerName) continue;

    const side = resolveSideFromFlags(item, forcedSide) ?? idMeta?.side ?? "home";
    const nameMeta = lookup.metaBySideName.get(`${side}|${playerName.toLowerCase()}`);

    const rawJersey = num(
      item.jersey_number ??
        item.shirt_number ??
        item.number ??
        item.jersey ??
        playerObj?.jersey_number ??
        playerObj?.shirt_number,
    );
    const jerseyNumber =
      rawJersey !== null && Number.isInteger(rawJersey) && rawJersey >= 1 && rawJersey <= 99
        ? rawJersey
        : (idMeta?.jerseyNumber ?? nameMeta?.jerseyNumber ?? null);
    const position =
      sanitizeClientText(item.position ?? playerObj?.position) ?? idMeta?.position ?? nameMeta?.position ?? null;
    const touches =
      num(item.touches ?? item.ball_touches ?? item.points_count) ?? idMeta?.touches ?? nameMeta?.touches ?? null;
    const rating = num(item.rating ?? item.match_rating) ?? idMeta?.rating ?? nameMeta?.rating ?? null;

    pushCandidate({ side, rawX, rawY, playerName, jerseyNumber, position, touches, rating });
  }

  // Fallback o complemento desde `/events/{id}/player-stats/` si traen coordenadas medias
  for (const { raw: ps, forcedSide } of flattenTaggedPlayerStats(playerStatsRaw)) {
    const rawX = num(ps.average_x ?? ps.avg_x ?? ps.average_position?.x ?? ps.pos?.x);
    const rawY = num(ps.average_y ?? ps.avg_y ?? ps.average_position?.y ?? ps.pos?.y);
    if (rawX === null || rawY === null) continue;
    const playerName = nameOf(ps.player) ?? sanitizeClientText(ps.player_name);
    if (!playerName) continue;
    const side = resolveSideFromFlags(ps, forcedSide) ?? "home";
    const playerObj = ps.player && typeof ps.player === "object" ? ps.player : null;
    const rawJersey = num(
      ps.jersey_number ?? ps.shirt_number ?? ps.number ?? playerObj?.jersey_number ?? playerObj?.shirt_number,
    );
    const jerseyNumber =
      rawJersey !== null && Number.isInteger(rawJersey) && rawJersey >= 1 && rawJersey <= 99 ? rawJersey : null;
    pushCandidate({
      side,
      rawX,
      rawY,
      playerName,
      jerseyNumber,
      position: sanitizeClientText(ps.position),
      touches: num(ps.touches ?? ps.ball_touches),
      rating: num(ps.rating),
    });
  }

  const unitScale = detectUnitCoordScale(candidates.map((c) => ({ x: c.rawX, y: c.rawY })));
  const finalizeSide = (side: "home" | "away"): NormalizedAveragePosition[] =>
    candidates
      .filter((c) => c.side === side)
      .map((c) => ({
        x: clampCoord(c.rawX, unitScale),
        y: clampCoord(c.rawY, unitScale),
        playerName: c.playerName,
        jerseyNumber: c.jerseyNumber,
        position: c.position,
        touches: c.touches,
        ...(c.rating !== undefined ? { rating: c.rating } : {}),
      }))
      .sort(
        (a, b) =>
          b.touches - a.touches ||
          (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999) ||
          a.playerName.localeCompare(b.playerName, "es-MX"),
      );

  return {
    home: finalizeSide("home"),
    away: finalizeSide("away"),
  };
}

/** Combina shotmap + xG + posiciones medias en un paquete listo para visualización sin IDs crudos. */
export function extractBzzoiroMatchTelemetry(
  statsRaw: BzLiveStats | null | undefined,
  playerStatsRaw?: BzPlayerStatsPayload | null,
): BzzoiroMatchVisualTelemetry {
  return {
    shotmap: parseBzzoiroShotmap(statsRaw, playerStatsRaw),
    averagePositions: parseBzzoiroAveragePositions(statsRaw, playerStatsRaw),
  };
}

export function normalizedShotToLiveShot(shot: NormalizedShot): LiveShot {
  const cleanPlayer = sanitizeClientText(shot.playerName);
  return {
    minute: shot.minute,
    ...(shot.addedTime !== undefined ? { addedTime: shot.addedTime } : {}),
    side: shot.side,
    outcome: toLegacyLiveShotOutcome(shot.outcome),
    xg: Number.isFinite(shot.xg) ? shot.xg : null,
    x: Number.isFinite(shot.x) ? shot.x : null,
    y: Number.isFinite(shot.y) ? shot.y : null,
    ...(cleanPlayer ? { player: cleanPlayer } : {}),
    ...(shot.bodyPart ? { bodyPart: shot.bodyPart } : {}),
  };
}

export function normalizedAvgPositionsToLive(
  pos: NormalizedTeamAveragePositions,
): LiveAveragePosition[] {
  const mapSide = (
    side: "home" | "away",
    entries: readonly NormalizedAveragePosition[],
  ): LiveAveragePosition[] => {
    const out: LiveAveragePosition[] = [];
    for (const entry of entries) {
      const cleanName = sanitizeClientText(entry.playerName);
      if (!cleanName) continue;
      const cleanPosition = sanitizeClientText(entry.position);
      out.push({
        side,
        name: cleanName,
        number: entry.jerseyNumber,
        position: cleanPosition,
        x: entry.x,
        y: entry.y,
        touches: entry.touches,
        ...(entry.rating !== undefined ? { rating: entry.rating } : {}),
      });
    }
    return out;
  };
  return [...mapSide("home", pos.home), ...mapSide("away", pos.away)];
}

export function parseLiveStats(raw: BzLiveStats | null): Pick<
  LiveMatchDetail,
  "stats" | "xgEstimated" | "momentum" | "xgTimeline" | "shots"
> {
  if (!raw) return { stats: null, xgEstimated: null, momentum: [], xgTimeline: [], shots: [] };
  const momentum: LiveMomentumPoint[] = (raw.momentum ?? [])
    .map((p) => ({ minute: parseFootballMinute(p.m)?.minute ?? null, value: num(p.v) }))
    .filter((p): p is LiveMomentumPoint => p.minute !== null && p.value !== null)
    .map((p) => ({ minute: p.minute, value: Math.max(-100, Math.min(100, p.value)) }))
    .sort((a, b) => a.minute - b.minute);
  const xgTimeline: LiveXgPoint[] = (raw.xg_per_minute ?? [])
    .map((p) => ({
      minute: parseFootballMinute(p.m ?? p.minute)?.minute ?? null,
      home: num(p.cum_home),
      away: num(p.cum_away),
    }))
    .filter((p): p is LiveXgPoint => p.minute !== null && p.home !== null && p.away !== null)
    .sort((a, b) => a.minute - b.minute);
  const preliminaryShots: Array<{
    order: number;
    minute: number;
    side: "home" | "away";
    outcome: LiveShot["outcome"];
    xg: number | null;
    rawX: number | null;
    rawY: number | null;
  }> = [];
  for (const s of raw.shotmap ?? raw.shots ?? []) {
    const parsedMin = parseFootballMinute(s.min ?? s.minute ?? s.time);
    const side = resolveSideFromFlags(s);
    const normOutcome = normalizeShotOutcome(s.type ?? s.outcome ?? s.shot_type ?? s.result);
    if (!parsedMin || !side || !normOutcome) continue;
    const explicitAdded = num(s.added_time);
    const added =
      explicitAdded !== null && explicitAdded > 0
        ? Math.round(explicitAdded)
        : (parsedMin.addedTime ?? 0);
    const minute = Math.max(0, Math.min(130, Math.round(parsedMin.minute)));
    const order = minute * 100 + Math.min(Math.max(added, 0), 98);
    const rawX = num(s.pos?.x ?? s.position?.x ?? s.coordinates?.x ?? s.x);
    const rawY = num(s.pos?.y ?? s.position?.y ?? s.coordinates?.y ?? s.y);
    preliminaryShots.push({
      order,
      minute,
      side,
      outcome: toLegacyLiveShotOutcome(normOutcome),
      xg: num(s.xg ?? s.expected_goals ?? s.xG),
      rawX,
      rawY,
    });
  }
  const unitScale = detectUnitCoordScale(
    preliminaryShots
      .filter((p): p is typeof p & { rawX: number; rawY: number } => p.rawX !== null && p.rawY !== null)
      .map((p) => ({ x: p.rawX, y: p.rawY })),
  );
  const orderedShots = preliminaryShots.slice().sort((a, b) => a.order - b.order);
  const scaledXs = orderedShots.map((p) => (p.rawX !== null ? clampCoord(p.rawX, unitScale) : null));
  const normalizedValidXs = normalizeShotmapAxisX(
    scaledXs.filter((x): x is number => x !== null),
  );
  let validXIndex = 0;
  const shots: LiveShot[] = orderedShots.map((p, idx) => {
    const scaledX = scaledXs[idx] ?? null;
    const x = scaledX !== null ? (normalizedValidXs[validXIndex++] ?? scaledX) : null;
    return {
      minute: p.minute,
      side: p.side,
      outcome: p.outcome,
      xg: p.xg,
      x,
      y: p.rawY !== null ? clampCoord(p.rawY, unitScale) : null,
    };
  });
  const home = raw.stats?.home;
  const away = raw.stats?.away;
  return {
    stats: home || away ? { home: parseLiveTeamStats(home), away: parseLiveTeamStats(away) } : null,
    xgEstimated: typeof raw.xg_estimated === "boolean" ? raw.xg_estimated : null,
    momentum,
    xgTimeline,
    shots,
  };
}

// ---------- Momentos del partido ----------

export interface LiveMoment {
  gameId: string;
  kind: "kickoff" | "goal" | "halftime" | "final";
  side: "home" | "away" | null;
  minute: number | null;
  homeScore: number;
  awayScore: number;
}

/**
 * Compara la lectura anterior con la nueva y devuelve lo que pasó entre ambas. Sin lectura previa
 * solo se registra el estado actual (inicio o final), nunca goles que no vimos ocurrir uno a uno:
 * el aviso de gol lleva el marcador al que llevó, así que un 2–0 visto de golpe genera ambos.
 */
export function detectMoments(prev: LiveScoreboardEntry | undefined, next: LiveScoreboardEntry): LiveMoment[] {
  const moments: LiveMoment[] = [];
  const s = next.score ?? { home: 0, away: 0 };
  const base = { gameId: next.gameId, minute: next.minute };
  // Primera vez que vemos el partido (arranque en frío):
  // - si ya terminó, registrar solo el final (sin goles retroactivos);
  // - si ya está iniciado (`live`/`halftime`/`penalties`) o programado, inicializar estado sin spam de kickoff/goles viejos.
  if (!prev) {
    if (next.phase === "final") {
      return [{ ...base, kind: "final", side: null, minute: 90, homeScore: s.home, awayScore: s.away }];
    }
    return [];
  }
  const wasPlaying =
    prev.phase === "live" || prev.phase === "halftime" || prev.phase === "penalties" || prev.phase === "final";
  const playing = next.phase === "live" || next.phase === "halftime" || next.phase === "penalties" || next.phase === "final";

  if (playing && !wasPlaying) {
    moments.push({ ...base, kind: "kickoff", side: null, minute: 1, homeScore: 0, awayScore: 0 });
  }
  const before = prev.score ?? { home: 0, away: 0 };
  // Un gol por cada tanto nuevo, con el marcador intermedio (2–0 visto de golpe: 1–0 y 2–0).
  for (let h = before.home + 1; h <= s.home; h++) {
    moments.push({ ...base, kind: "goal", side: "home", homeScore: h, awayScore: Math.min(before.away, s.away) });
  }
  for (let a = before.away + 1; a <= s.away; a++) {
    moments.push({ ...base, kind: "goal", side: "away", homeScore: s.home, awayScore: a });
  }
  if (next.phase === "halftime" && prev?.phase !== "halftime") {
    moments.push({ ...base, kind: "halftime", side: null, minute: 45, homeScore: s.home, awayScore: s.away });
  }
  if (next.phase === "final" && prev?.phase !== "final") {
    moments.push({ ...base, kind: "final", side: null, minute: 90, homeScore: s.home, awayScore: s.away });
  }
  return moments;
}

// ---------- Cadencia ----------

/**
 * Segundos para la siguiente consulta del navegador a NUESTRA ruta. `null` = no volver a
 * preguntar (todo terminó o nada empieza pronto): cero intervalos activos.
 */
export function nextPollSeconds(entries: readonly LiveScoreboardEntry[], now: number): number | null {
  let soonest: number | null = null;
  for (const e of entries) {
    if (e.phase === "live" || e.phase === "penalties") return 15;
    if (e.phase === "halftime") soonest = Math.min(soonest ?? 60, 60);
    if (e.phase === "scheduled" || e.phase === "unknown") {
      const until = Date.parse(e.kickoffUtc) - now;
      if (until <= 15 * 60_000 && until > -3 * 3_600_000) soonest = Math.min(soonest ?? 30, 30);
      else if (until > 0 && until <= 3 * 3_600_000) soonest = Math.min(soonest ?? 300, 300);
    }
  }
  return soonest;
}
