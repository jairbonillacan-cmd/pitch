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
  LiveIncident,
  LiveMatchDetail,
  LiveMomentumPoint,
  LivePhase,
  LiveScore,
  LiveScoreboardEntry,
  LiveShot,
  LiveTeamStats,
  LiveXgPoint,
} from "@pitchlab/contracts";
import { BZZOIRO_LEAGUES, type BzTeamStatsRaw } from "./bzzoiro.js";
import { slugifyTeamName } from "../team-slug.js";
import { teamSimilarity } from "./link.js";

export const BZZOIRO_ATTRIBUTION = "Datos en vivo: Bzzoiro Sports Data";

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

export interface BzLiveStats {
  event_id?: number;
  xg_estimated?: boolean | null;
  stats?: { home?: BzTeamStatsRaw | null; away?: BzTeamStatsRaw | null } | null;
  momentum?: { m?: number; v?: number }[] | null;
  xg_per_minute?: { m?: number; cum_home?: number; cum_away?: number }[] | null;
  shotmap?:
    | {
        home?: boolean;
        min?: number;
        type?: string;
        xg?: number | null;
        pos?: { x?: number; y?: number } | null;
      }[]
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

function nameOf(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && "name" in value) {
    const n = (value as { name?: unknown }).name;
    return typeof n === "string" && n.trim() ? n.trim() : null;
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
  const s = (status ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  const p = (period ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (p === "halftime" || p === "ht" || p === "half_time" || s === "halftime") return "halftime";
  if (p.includes("penalt") || s === "penalties") return "penalties";
  if (["finished", "ended", "ft", "aet", "ap", "after_penalties", "after_extra_time"].includes(s)) return "final";
  if (s === "postponed" || s === "delayed" || s === "suspended" || s === "interrupted") return "postponed";
  if (s === "cancelled" || s === "canceled" || s === "abandoned") return "cancelled";
  if (s === "unresolved") return "unknown";
  if (["upcoming", "notstarted", "not_started", "scheduled", "ns", ""].includes(s)) return "scheduled";
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
  const minute = num(e.current_minute) ?? num(e.minute);
  const ft = score(e.home_score, e.away_score);
  // `home_score` es solo tiempo regular; el tiempo extra suma aparte.
  const et = e.extra_time_score ? score(e.extra_time_score.home, e.extra_time_score.away) : null;
  const total = ft && et ? { home: ft.home + et.home, away: ft.away + et.away } : ft;
  return {
    gameId,
    league,
    phase,
    clock: clockFrom(minute, num(e.injury_time), phase),
    minute: phase === "live" ? minute : null,
    score: phase === "scheduled" ? null : (total ?? (phase === "live" || phase === "halftime" ? { home: 0, away: 0 } : null)),
    htScore: score(e.home_score_ht, e.away_score_ht),
    redCards:
      num(e.home_red_cards) !== null || num(e.away_red_cards) !== null
        ? { home: num(e.home_red_cards) ?? 0, away: num(e.away_red_cards) ?? 0 }
        : null,
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
    const minute = num(r.minute);
    const added = num(r.added_time);
    const isSub = kind === "sub";
    // Orden: minuto, luego tiempo agregado (45+7 va antes del medio tiempo y del 46').
    const order =
      num(r.period_second) ??
      (minute !== null ? minute * 100 + Math.min(added ?? 0, 30) + (kind === "period" ? 99 : 0) : index);
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
  };
}

const SHOT_OUTCOMES = new Set(["goal", "save", "miss", "block", "post"]);

export function parseLiveStats(raw: BzLiveStats | null): Pick<
  LiveMatchDetail,
  "stats" | "xgEstimated" | "momentum" | "xgTimeline" | "shots"
> {
  if (!raw) return { stats: null, xgEstimated: null, momentum: [], xgTimeline: [], shots: [] };
  const momentum: LiveMomentumPoint[] = (raw.momentum ?? [])
    .map((p) => ({ minute: num(p.m), value: num(p.v) }))
    .filter((p): p is LiveMomentumPoint => p.minute !== null && p.value !== null)
    .map((p) => ({ minute: p.minute, value: Math.max(-100, Math.min(100, p.value)) }))
    .sort((a, b) => a.minute - b.minute);
  const xgTimeline: LiveXgPoint[] = (raw.xg_per_minute ?? [])
    .map((p) => ({ minute: num(p.m), home: num(p.cum_home), away: num(p.cum_away) }))
    .filter((p): p is LiveXgPoint => p.minute !== null && p.home !== null && p.away !== null)
    .sort((a, b) => a.minute - b.minute);
  const shots: LiveShot[] = (raw.shotmap ?? [])
    .filter((s) => typeof s.min === "number" && typeof s.home === "boolean" && SHOT_OUTCOMES.has(String(s.type)))
    .map((s) => ({
      minute: s.min as number,
      side: s.home ? ("home" as const) : ("away" as const),
      outcome: s.type as LiveShot["outcome"],
      xg: num(s.xg),
      x: num(s.pos?.x),
      y: num(s.pos?.y),
    }));
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
  // Primera vez que vemos un partido ya terminado: solo el final (no avisar goles viejos).
  if (!prev && next.phase === "final") {
    return [{ ...base, kind: "final", side: null, minute: 90, homeScore: s.home, awayScore: s.away }];
  }
  const wasPlaying = prev ? prev.phase !== "scheduled" : false;
  const playing = next.phase === "live" || next.phase === "halftime" || next.phase === "penalties" || next.phase === "final";

  if (playing && !wasPlaying) {
    moments.push({ ...base, kind: "kickoff", side: null, minute: 1, homeScore: 0, awayScore: 0 });
  }
  const before = prev?.score ?? { home: 0, away: 0 };
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
