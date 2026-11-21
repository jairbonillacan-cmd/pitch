/**
 * EN-VIVO-1 · Lector en vivo único del servidor (Match Center).
 *
 * Principios de aislamiento y eficiencia del lector en vivo:
 * - Ningún navegador habla con el proveedor. Los navegadores leen `/api/live/*`; esa ruta sale de
 *   la caché del CDN (`s-maxage`), luego de la caché compartida en Neon, y solo una instancia a la
 *   vez (arriendo en `live_feed_cache`) consulta a Bzzoiro.
 * - Sin partidos que puedan estar en juego no se consulta al proveedor, y la respuesta le dice al
 *   navegador que no vuelva a preguntar (`nextPollSeconds: null`).
 * - Todo sale con nuestro `gameId`; el id de Bzzoiro vive solo en `provider_match_links`.
 * - Cuota: un tope diario propio y una reserva que deja peticiones a la ingesta (las 7,500 diarias
 *   de Bzzoiro se comparten). Se lee el `RateLimit` que manda Bzzoiro en cada respuesta.
 */
import fs from "node:fs";
import path from "node:path";
import {
  LIVE_CAPABLE_BZZOIRO_LEAGUES,
  canonicalGameHref,
  type LiveAveragePosition,
  type LiveMatchDetail,
  type LiveScoreboard,
  type LiveScoreboardEntry,
  type LiveShotmapSummary,
  type LiveXgPoint,
  isLivePhaseActive,
} from "@pitchlab/contracts";
import {
  claimLiveRefresh,
  getProviderLinks,
  listLiveGameWatchers,
  providerQuotaToday,
  readLiveCache,
  recordLiveMomentsDetailed,
  recordProviderRequest,
  releaseLiveRefresh,
  saveProviderLinks,
  writeLiveCache,
  type Db,
  type LiveMomentInput,
} from "@pitchlab/db";
import { serverDb } from "./session-user";
import { loadLeagueSnapshotEnvelope, PRODUCT_LEAGUES, resolveSnapshotsRoot, type ProductLeague } from "./snapshots";
import { evaluateLiveInPlaySoccerV5 } from "./spacetime-v5";
import { isWebPushConfigured, sendPushToUsers } from "./web-push";
import {
  BZZOIRO_ATTRIBUTION,
  detectMoments,
  extractBzzoiroMatchTelemetry,
  linkLiveEvents,
  list,
  mergeCommentary,
  nextPollSeconds,
  normalizedAvgPositionsToLive,
  normalizedShotToLiveShot,
  parseBroadcastsMx,
  parseCommentary,
  parseIncidents,
  parseLiveStats,
  parsePlayerStats,
  toScoreboardEntry,
  type BzBroadcastRaw,
  type BzList,
  type BzLiveCommentaryRaw,
  type BzLiveEvent,
  type BzLiveIncident,
  type BzLiveStats,
  type BzPlayerStatsPayload,
  type LinkCandidate,
} from "@pitchlab/ingest/providers/bzzoiro-live";
import { readProviderConfigs } from "@pitchlab/ingest/providers/config";

/** Ligas de fútbol con marcador en vivo y su id en Bzzoiro (núcleo + expansión ADR-043). */
export const LIVE_LEAGUES: Readonly<Record<string, readonly number[]>> =
  LIVE_CAPABLE_BZZOIRO_LEAGUES;
export type LiveLeague = string;

const TTL = {
  scoreboard: 20_000,
  /** Lista de partidos de una liga en un día (para enlazar ids): cambia poco. */
  leagueDay: 6 * 3_600_000,
  incidentsLive: 30_000,
  statsLive: 60_000,
  commentaryLive: 30_000,
  playerStatsLive: 60_000,
  broadcasts: 6 * 3_600_000,
  /** Un partido terminado no cambia: se guarda una semana. */
  finished: 7 * 24 * 3_600_000,
  lease: 8_000,
} as const;

const PROVIDER_TIMEOUT_MS = 8_000;
/** Ventana en la que un partido puede estar en juego: de 10 min antes a 3 h después del inicio. */
const LIVE_WINDOW_BEFORE_MS = 10 * 60_000;
const LIVE_WINDOW_AFTER_MS = 3 * 3_600_000;

// ---------- Almacén (Neon o memoria) ----------

export interface LiveStore {
  read<T>(key: string, now: Date): Promise<{ payload: T; fresh: boolean; fetchedAt: Date } | null>;
  claim(key: string, now: Date): Promise<boolean>;
  write(key: string, payload: unknown, now: Date, ttlMs: number): Promise<void>;
  release(key: string): Promise<void>;
  quota(now: Date): Promise<{ requests: number; remaining: number | null }>;
  countRequest(now: Date, remaining: number | null): Promise<void>;
  links(gameIds: readonly string[]): Promise<Map<string, string>>;
  saveLinks(links: readonly { gameId: string; providerEventId: string; method: string }[], now: Date): Promise<void>;
  moments(m: readonly LiveMomentInput[], now: Date): Promise<void>;
}

export function dbLiveStore(db: Db): LiveStore {
  return {
    read: (key, now) => readLiveCache(db, key, now),
    claim: (key, now) => claimLiveRefresh(db, key, now, TTL.lease),
    write: (key, payload, now, ttl) => writeLiveCache(db, key, payload, now, ttl),
    release: (key) => releaseLiveRefresh(db, key),
    quota: (now) => providerQuotaToday(db, "bzzoiro", now),
    countRequest: (now, remaining) => recordProviderRequest(db, "bzzoiro", now, remaining),
    links: (ids) => getProviderLinks(db, "bzzoiro", ids),
    saveLinks: (links, now) => saveProviderLinks(db, "bzzoiro", links, now),
    moments: async (m, now) => {
      const inserted = await recordLiveMomentsDetailed(db, m, now);
      if (inserted.length === 0 || !isWebPushConfigured()) return;
      const watchers = await listLiveGameWatchers(
        db,
        inserted.map((ev) => ev.gameId),
      );
      if (watchers.length === 0) return;
      for (const ev of inserted) {
        const recipients = watchers
          .filter((w) => {
            if (w.gameId !== ev.gameId) return false;
            if (ev.kind === "kickoff") return w.kickoff;
            if (ev.kind === "goal") return w.goals;
            if (ev.kind === "final") return w.final;
            return false;
          })
          .map((w) => w.userId);
        if (recipients.length === 0) continue;
        const cand = findLiveCandidate(ev.gameId);
        const matchName = cand ? `${cand.homeName} vs ${cand.awayName}` : ev.gameId;
        const title =
          ev.kind === "kickoff"
            ? `Arrancó: ${matchName}`
            : ev.kind === "goal"
              ? `Gol en vivo (${ev.homeScore}-${ev.awayScore})`
              : `Final: ${matchName} (${ev.homeScore}-${ev.awayScore})`;
        const body =
          ev.kind === "goal"
            ? `${matchName}${ev.minute != null ? ` · min ${ev.minute}'` : ""}`
            : matchName;
        await sendPushToUsers(db, recipients, "live", {
          title,
          body,
          url: cand
            ? canonicalGameHref(cand.league, {
                id: ev.gameId,
                home: { name: cand.homeName },
                away: { name: cand.awayName },
              })
            : "/app",
          tag: `live-${ev.gameId}-${ev.kind}-${ev.homeScore}-${ev.awayScore}`,
        }).catch(() => undefined);
      }
    },
  };
}

/** Sin base (desarrollo con PIN): misma lógica, guardada en la memoria de la instancia. */
export function memoryLiveStore(): LiveStore {
  const cache = new Map<string, { payload: unknown; fetchedAt: Date; freshUntil: number; lease: number }>();
  const links = new Map<string, string>();
  const quota = { day: "", requests: 0, remaining: null as number | null };
  const day = (now: Date) => now.toISOString().slice(0, 10);
  return {
    async read<T>(key: string, now: Date) {
      const row = cache.get(key);
      if (!row || row.fetchedAt.getTime() === 0) return null;
      return { payload: row.payload as T, fresh: row.freshUntil > now.getTime(), fetchedAt: row.fetchedAt };
    },
    async claim(key, now) {
      const row = cache.get(key) ?? { payload: null, fetchedAt: new Date(0), freshUntil: 0, lease: 0 };
      if (row.lease > now.getTime()) return false;
      cache.set(key, { ...row, lease: now.getTime() + TTL.lease });
      return true;
    },
    async write(key, payload, now, ttl) {
      cache.set(key, { payload, fetchedAt: now, freshUntil: now.getTime() + ttl, lease: 0 });
    },
    async release(key) {
      const row = cache.get(key);
      if (row) cache.set(key, { ...row, lease: 0 });
    },
    async quota(now) {
      return day(now) === quota.day ? { requests: quota.requests, remaining: quota.remaining } : { requests: 0, remaining: null };
    },
    async countRequest(now, remaining) {
      if (quota.day !== day(now)) Object.assign(quota, { day: day(now), requests: 0, remaining: null });
      quota.requests += 1;
      if (remaining !== null) quota.remaining = remaining;
    },
    async links(ids) {
      return new Map(ids.filter((id) => links.has(id)).map((id) => [id, links.get(id)!]));
    },
    async saveLinks(rows) {
      const taken = new Set(links.values());
      for (const r of rows) if (!links.has(r.gameId) && !taken.has(r.providerEventId)) links.set(r.gameId, r.providerEventId);
    },
    async moments() {
      // Sin base no hay socios con cuenta a quienes avisar.
    },
  };
}

let defaultStore: LiveStore | null = null;
function liveStore(): LiveStore {
  if (defaultStore) return defaultStore;
  const db = serverDb();
  defaultStore = db ? dbLiveStore(db) : memoryLiveStore();
  return defaultStore;
}

// ---------- Proveedor ----------

export type LiveFetch = (pathWithQuery: string) => Promise<{ status: number; body: unknown; remaining: number | null }>;

/** `RateLimit: "football";r=7213;t=52800` → 7213. */
export function parseRateLimitRemaining(header: string | null): number | null {
  const match = header?.match(/;\s*r=(\d+)/);
  return match ? Number(match[1]) : null;
}

function bzzoiroFetch(): LiveFetch | null {
  const cfg = readProviderConfigs(process.env).bzzoiro;
  if (!cfg.enabled) return null;
  return async (pathWithQuery) => {
    const res = await fetch(`${cfg.baseUrl}${pathWithQuery}`, {
      headers: cfg.headers,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      cache: "no-store",
    });
    const remaining = parseRateLimitRemaining(res.headers.get("ratelimit"));
    const body = res.ok ? ((await res.json()) as unknown) : null;
    return { status: res.status, body, remaining };
  };
}

export interface LiveBudget {
  /** Tope diario de peticiones del lector en vivo. */
  dailyMax: number;
  /** Peticiones que se dejan siempre a la ingesta (según el `RateLimit` del proveedor). */
  reserve: number;
  /** Omite el tope artificial cuando la cuenta es comercial/ilimitada (`BZZOIRO_UNLIMITED=1`). */
  unlimited?: boolean;
}

function isUnlimitedEnv(): boolean {
  const raw = process.env.BZZOIRO_UNLIMITED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function readBudget(): LiveBudget {
  const unlimited = isUnlimitedEnv();
  const n = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : d);
  return {
    dailyMax: n(process.env.BZZOIRO_LIVE_DAILY_MAX, unlimited ? 0 : 2500),
    reserve: n(process.env.BZZOIRO_LIVE_RESERVE, unlimited ? 0 : 300),
    unlimited,
  };
}

export interface LiveDeps {
  store: LiveStore;
  fetch: LiveFetch | null;
  budget: LiveBudget;
  now: () => Date;
  candidates: (now: Date) => LinkCandidate[];
  /** Activa narración incremental, player-stats y canales TV MX (por defecto en modo ilimitado). */
  includeRich?: boolean;
  log?: (msg: string) => void;
}

function defaultDeps(): LiveDeps {
  return {
    store: liveStore(),
    fetch: bzzoiroFetch(),
    budget: readBudget(),
    now: () => new Date(),
    candidates: todaysCandidates,
    log: (m) => console.warn(`[en-vivo] ${m}`),
  };
}

class QuotaGuardError extends Error {}

async function providerGet<T>(deps: LiveDeps, pathWithQuery: string): Promise<T | null> {
  if (!deps.fetch) throw new QuotaGuardError("Sin clave del feed en vivo");
  const now = deps.now();
  const q = await deps.store.quota(now);
  if (!deps.budget.unlimited && deps.budget.dailyMax > 0 && q.requests >= deps.budget.dailyMax) {
    throw new QuotaGuardError("Tope diario del lector en vivo");
  }
  if (!deps.budget.unlimited && q.remaining !== null && deps.budget.reserve > 0 && q.remaining <= deps.budget.reserve) {
    throw new QuotaGuardError("Reserva de la ingesta");
  }
  const res = await deps.fetch(pathWithQuery);
  await deps.store.countRequest(now, res.remaining);
  if (res.status === 404) return null;
  if (res.status === 429) throw new QuotaGuardError("Feed en vivo pidió esperar (429)");
  if (res.status < 200 || res.status >= 300) throw new Error(`Feed en vivo respondió ${res.status}`);
  return res.body as T;
}

/**
 * Devuelve lo que haya en caché o, si está vencido y esta instancia gana el turno, lo refresca.
 * Ante cualquier falla se sirve lo último conocido (con aviso), nunca se reintenta en bucle.
 */
async function cached<T>(
  deps: LiveDeps,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<{ value: T | null; fetchedAt: Date | null; notice: string | null }> {
  const now = deps.now();
  const hit = await deps.store.read<T>(key, now);
  if (hit?.fresh) return { value: hit.payload, fetchedAt: hit.fetchedAt, notice: null };
  if (!(await deps.store.claim(key, now))) {
    return { value: hit?.payload ?? null, fetchedAt: hit?.fetchedAt ?? null, notice: null };
  }
  try {
    const value = await load();
    await deps.store.write(key, value, now, ttlMs);
    return { value, fetchedAt: now, notice: null };
  } catch (error) {
    await deps.store.release(key);
    const guard = error instanceof QuotaGuardError;
    deps.log?.(`${key}: ${error instanceof Error ? error.message : "error"}`);
    return {
      value: hit?.payload ?? null,
      fetchedAt: hit?.fetchedAt ?? null,
      notice: guard
        ? "Marcador en pausa para cuidar la cuota de datos; vuelve en unos minutos."
        : "La fuente en vivo no respondió; mostramos lo último que vimos.",
    };
  }
}

// ---------- Partidos candidatos (snapshots) ----------

interface SnapshotGame {
  id: string;
  startTime: string;
  status: string;
  home: { name: string };
  away: { name: string };
  result?: { home: number; away: number } | null;
}

const snapshotGamesCache = new Map<string, { mtime: number; games: SnapshotGame[] }>();

function snapshotGames(league: LiveLeague): SnapshotGame[] {
  const file = path.join(resolveSnapshotsRoot(), league, "latest.json");
  let mtime = 0;
  try {
    mtime = fs.statSync(file).mtimeMs;
  } catch {
    return [];
  }
  const hit = snapshotGamesCache.get(league);
  if (hit && hit.mtime === mtime) return hit.games;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { games?: SnapshotGame[] };
    const games = (raw.games ?? []).filter((g) => typeof g.id === "string" && typeof g.startTime === "string");
    snapshotGamesCache.set(league, { mtime, games });
    return games;
  } catch {
    return [];
  }
}

function isoUtc(startTime: string): string {
  // Los snapshots traen «2026-11-14T23:00Z» o «2026-11-20T20:30:00» (sin zona = UTC).
  const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(startTime) ? startTime : `${startTime}Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : startTime;
}

/** Partidos de hoy y de las próximas horas en las ligas con marcador en vivo. */
export function todaysCandidates(now: Date): LinkCandidate[] {
  const from = now.getTime() - 4 * 3_600_000;
  const to = now.getTime() + 20 * 3_600_000;
  const out: LinkCandidate[] = [];
  for (const league of Object.keys(LIVE_LEAGUES) as LiveLeague[]) {
    for (const g of snapshotGames(league)) {
      const kickoffUtc = isoUtc(g.startTime);
      const t = Date.parse(kickoffUtc);
      if (t >= from && t <= to) {
        out.push({ gameId: g.id, league, kickoffUtc, homeName: g.home.name, awayName: g.away.name });
      }
    }
  }
  return out.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
}

export function findLiveCandidate(gameId: string): LinkCandidate | null {
  for (const league of Object.keys(LIVE_LEAGUES) as LiveLeague[]) {
    const g = snapshotGames(league).find((x) => x.id === gameId);
    if (g) return { gameId: g.id, league, kickoffUtc: isoUtc(g.startTime), homeName: g.home.name, awayName: g.away.name };
  }
  return null;
}

function scheduledEntry(c: LinkCandidate): LiveScoreboardEntry {
  return {
    gameId: c.gameId,
    league: c.league,
    phase: "scheduled",
    clock: null,
    minute: null,
    score: null,
    htScore: null,
    redCards: null,
    kickoffUtc: c.kickoffUtc,
  };
}

function inLiveWindow(c: LinkCandidate, now: number): boolean {
  const t = Date.parse(c.kickoffUtc);
  return now >= t - LIVE_WINDOW_BEFORE_MS && now <= t + LIVE_WINDOW_AFTER_MS;
}

// ---------- Marcador del día ----------

interface ScoreboardCache {
  entries: LiveScoreboardEntry[];
}

/**
 * Una sola petición (`/events/live/`) cubre todas las ligas. Los partidos que estaban en juego y
 * ya no aparecen se cierran con una lectura de `/events/{id}/` (una vez por partido).
 */
async function refreshScoreboard(deps: LiveDeps, candidates: LinkCandidate[], prev: ScoreboardCache | null): Promise<ScoreboardCache> {
  const now = deps.now();
  const live = list<BzLiveEvent>(await providerGet<BzList<BzLiveEvent>>(deps, "/events/live/"));
  const known = await deps.store.links(candidates.map((c) => c.gameId));
  const byEvent = new Map([...known].map(([gameId, eventId]) => [eventId, gameId]));
  const unlinked = live.filter((e) => !byEvent.has(String(e.id)));
  const fresh = linkLiveEvents(
    unlinked,
    candidates.filter((c) => !known.has(c.gameId)),
  );
  if (fresh.length > 0) {
    await deps.store.saveLinks(fresh, now);
    for (const l of fresh) byEvent.set(l.providerEventId, l.gameId);
  }

  const prevById = new Map((prev?.entries ?? []).map((e) => [e.gameId, e]));
  const byGame = new Map<string, LiveScoreboardEntry>();
  for (const e of live) {
    const gameId = byEvent.get(String(e.id));
    const c = gameId ? candidates.find((x) => x.gameId === gameId) : undefined;
    if (c) byGame.set(c.gameId, toScoreboardEntry(e, c.gameId, c.league, c.kickoffUtc));
  }

  // Partidos que estaban en juego y salieron de la lista: se leen una vez para el final.
  for (const c of candidates) {
    if (byGame.has(c.gameId)) continue;
    const before = prevById.get(c.gameId);
    if (before && (before.phase === "final" || before.phase === "postponed" || before.phase === "cancelled")) {
      byGame.set(c.gameId, before);
      continue;
    }
    const eventId = known.get(c.gameId) ?? [...byEvent].find(([, g]) => g === c.gameId)?.[0];
    if (before && isLivePhaseActive(before.phase) && eventId) {
      const ev = await providerGet<BzLiveEvent>(deps, `/events/${eventId}/`);
      if (ev) {
        byGame.set(c.gameId, toScoreboardEntry(ev, c.gameId, c.league, c.kickoffUtc));
        continue;
      }
    }
    byGame.set(c.gameId, before ?? scheduledEntry(c));
  }

  const entries = candidates.map((c) => byGame.get(c.gameId)!).filter(Boolean);
  const moments = entries.flatMap((e) => detectMoments(prevById.get(e.gameId), e));
  if (moments.length > 0) await deps.store.moments(moments, now);
  return { entries };
}

export async function getLiveScoreboard(deps: LiveDeps = defaultDeps()): Promise<LiveScoreboard> {
  const now = deps.now();
  const candidates = deps.candidates(now);
  const anyInWindow = candidates.some((c) => inLiveWindow(c, now.getTime()));

  let entries: LiveScoreboardEntry[];
  let sourceFetchedAt: string | null = null;
  let notice: string | null = null;

  const prev = await deps.store.read<ScoreboardCache>("live:scoreboard", now);
  if (!anyInWindow) {
    // Nada puede estar en juego: cero peticiones al proveedor.
    const prevById = new Map((prev?.payload.entries ?? []).map((e) => [e.gameId, e]));
    entries = candidates.map((c) => prevById.get(c.gameId) ?? scheduledEntry(c));
  } else {
    const result = await cached(deps, "live:scoreboard", TTL.scoreboard, () =>
      refreshScoreboard(deps, candidates, prev?.payload ?? null),
    );
    const byId = new Map((result.value?.entries ?? []).map((e) => [e.gameId, e]));
    entries = candidates.map((c) => byId.get(c.gameId) ?? scheduledEntry(c));
    sourceFetchedAt = result.fetchedAt?.toISOString() ?? null;
    notice = deps.fetch ? result.notice : "El marcador en vivo no está configurado en este entorno.";
  }

  const poll = nextPollSeconds(entries, now.getTime());
  return {
    generatedAt: now.toISOString(),
    sourceFetchedAt,
    active: poll !== null,
    nextPollSeconds: poll,
    notice,
    entries,
  };
}

// ---------- Ficha en vivo ----------

async function linkGame(deps: LiveDeps, c: LinkCandidate): Promise<string | null> {
  const known = (await deps.store.links([c.gameId])).get(c.gameId);
  if (known) return known;
  const day = c.kickoffUtc.slice(0, 10);
  const prevDay = new Date(Date.parse(c.kickoffUtc) - 86_400_000).toISOString().slice(0, 10);
  const nextDay = new Date(Date.parse(c.kickoffUtc) + 86_400_000).toISOString().slice(0, 10);
  const ids = LIVE_LEAGUES[c.league as LiveLeague] ?? [];
  const events: BzLiveEvent[] = [];
  for (const leagueId of ids) {
    const key = `live:events:${leagueId}:${day}`;
    const res = await cached(deps, key, TTL.leagueDay, async () =>
      list<BzLiveEvent>(
        await providerGet<BzList<BzLiveEvent>>(
          deps,
          `/events/?league_id=${leagueId}&date_from=${prevDay}&date_to=${nextDay}&limit=100`,
        ),
      ),
    );
    events.push(...(res.value ?? []));
  }
  const [link] = linkLiveEvents(events, [c]);
  if (!link) return null;
  await deps.store.saveLinks([link], deps.now());
  return link.providerEventId;
}

/** La ficha pide más (incidentes y estadísticas): nunca más seguido que cada 20 s. */
function livePoll(entry: LiveScoreboardEntry, now: Date): number | null {
  const poll = nextPollSeconds([entry], now.getTime());
  return poll === null ? null : Math.max(20, poll);
}

export async function getLiveMatchDetail(gameId: string, deps: LiveDeps = defaultDeps()): Promise<LiveMatchDetail | null> {
  const c = findLiveCandidate(gameId) ?? deps.candidates(deps.now()).find((x) => x.gameId === gameId) ?? null;
  if (!c) return null;
  const now = deps.now();
  const base = scheduledEntry(c);
  const empty: LiveMatchDetail = {
    gameId,
    generatedAt: now.toISOString(),
    sourceFetchedAt: null,
    entry: base,
    incidents: [],
    stats: null,
    xgEstimated: null,
    momentum: [],
    xgTimeline: [],
    shots: [],
    nextPollSeconds: null,
    notice: null,
    attribution: BZZOIRO_ATTRIBUTION,
  };

  const kickoff = Date.parse(c.kickoffUtc);
  if (now.getTime() < kickoff - LIVE_WINDOW_BEFORE_MS) {
    // Aún no empieza: nada que leer. El navegador vuelve a preguntar cerca del inicio.
    return { ...empty, nextPollSeconds: nextPollSeconds([base], now.getTime()) };
  }
  if (!deps.fetch) return { ...empty, notice: "El marcador en vivo no está configurado en este entorno." };

  // Estado: del marcador compartido si está en la ventana; si no, del evento (una vez).
  let entry: LiveScoreboardEntry = base;
  let notice: string | null = null;
  let sourceFetchedAt: string | null = null;
  if (inLiveWindow(c, now.getTime())) {
    const board = await getLiveScoreboard(deps);
    entry = board.entries.find((e) => e.gameId === gameId) ?? base;
    notice = board.notice;
    sourceFetchedAt = board.sourceFetchedAt;
  }

  const eventId = await linkGame(deps, c).catch(() => null);
  if (!eventId) {
    return { ...empty, entry, notice: notice ?? "Aún no encontramos este partido en la fuente en vivo." };
  }

  if (entry.phase === "scheduled" && now.getTime() > kickoff + LIVE_WINDOW_AFTER_MS) {
    const ev = await cached(deps, `live:event:${gameId}`, TTL.finished, async () => {
      const raw = await providerGet<BzLiveEvent>(deps, `/events/${eventId}/`);
      return raw ? toScoreboardEntry(raw, gameId, c.league, c.kickoffUtc) : base;
    });
    entry = ev.value ?? base;
    notice = notice ?? ev.notice;
  }

  if (entry.phase === "scheduled") {
    return { ...empty, entry, notice, sourceFetchedAt, nextPollSeconds: nextPollSeconds([entry], now.getTime()) };
  }

  const finished = entry.phase === "final";
  const wantRich = deps.includeRich ?? Boolean(deps.budget.unlimited);
  const commentaryKey = `live:commentary:${gameId}`;
  const [inc, stRaw, comm, pstatsRaw, bcasts] = await Promise.all([
    cached(deps, `live:incidents:${gameId}`, finished ? TTL.finished : TTL.incidentsLive, async () =>
      parseIncidents(await providerGet<BzList<BzLiveIncident>>(deps, `/events/${eventId}/incidents/`)),
    ),
    cached(deps, `live:stats-raw:${gameId}`, finished ? TTL.finished : TTL.statsLive, async () => ({
      raw: await providerGet<BzLiveStats>(deps, `/events/${eventId}/stats/`),
    })),
    wantRich
      ? cached(deps, commentaryKey, finished ? TTL.finished : TTL.commentaryLive, async () => {
          const prev = await deps.store.read<NonNullable<LiveMatchDetail["commentary"]>>(commentaryKey, now);
          const sinceParam =
            prev?.payload?.length && prev.fetchedAt
              ? `?since=${encodeURIComponent(prev.fetchedAt.toISOString())}`
              : "";
          const raw = await providerGet<BzList<BzLiveCommentaryRaw>>(
            deps,
            `/events/${eventId}/commentary/${sinceParam}`,
          );
          return mergeCommentary(prev?.payload ?? [], parseCommentary(raw));
        })
      : Promise.resolve(null),
    wantRich
      ? cached(deps, `live:player-stats-raw:${gameId}`, finished ? TTL.finished : TTL.playerStatsLive, async () => ({
          raw: await providerGet<BzPlayerStatsPayload>(deps, `/events/${eventId}/player-stats/`),
        }))
      : Promise.resolve(null),
    wantRich
      ? cached(deps, `live:broadcasts-mx:${gameId}`, TTL.broadcasts, async () =>
          parseBroadcastsMx(
            await providerGet<BzList<BzBroadcastRaw>>(deps, `/events/${eventId}/broadcasts/?country_code=MX`),
          ),
        )
      : Promise.resolve(null),
  ]);

  const statsRaw = stRaw.value?.raw ?? null;
  const playerStatsRaw = pstatsRaw?.value?.raw ?? null;
  const parsedStats = parseLiveStats(statsRaw);
  const playerStats = playerStatsRaw ? parsePlayerStats(playerStatsRaw) : [];
  const telemetry =
    statsRaw || playerStatsRaw
      ? extractBzzoiroMatchTelemetry(statsRaw, playerStatsRaw)
      : null;
  const telemetryShots = telemetry ? telemetry.shotmap.shots.map(normalizedShotToLiveShot) : [];
  const shots = telemetryShots.length > 0 ? telemetryShots : parsedStats.shots;
  const telemetryXgTimeline: LiveXgPoint[] = telemetry
    ? telemetry.shotmap.xgTimeline.map((pt) => ({
        minute: pt.minute,
        home: pt.cumHome,
        away: pt.cumAway,
      }))
    : [];
  const xgTimeline = telemetryXgTimeline.length > 0 ? telemetryXgTimeline : parsedStats.xgTimeline;
  const shotmapSummary: LiveShotmapSummary | undefined =
    telemetry &&
    (telemetry.shotmap.shots.length > 0 ||
      telemetry.shotmap.xgTimeline.length > 0 ||
      telemetry.shotmap.shotsHome > 0 ||
      telemetry.shotmap.shotsAway > 0 ||
      telemetry.shotmap.xgHome > 0 ||
      telemetry.shotmap.xgAway > 0 ||
      parsedStats.stats !== null)
      ? {
          xgHome: telemetry.shotmap.xgHome,
          xgAway: telemetry.shotmap.xgAway,
          shotsHome: telemetry.shotmap.shotsHome,
          shotsAway: telemetry.shotmap.shotsAway,
        }
      : undefined;
  const averagePositions: LiveAveragePosition[] = telemetry
    ? normalizedAvgPositionsToLive(telemetry.averagePositions)
    : [];

  const incidents = inc.value ?? [];
  let inPlayWinProb: LiveMatchDetail["inPlayWinProb"] = null;
  if (isLivePhaseActive(entry.phase)) {
    const rawClock = entry.clock ?? "";
    const clockMatch = /\d+/.exec(rawClock);
    const minute =
      entry.phase === "halftime"
        ? 45
        : clockMatch
          ? Math.max(0, Math.min(90, Number(clockMatch[0])))
          : 0;
    const redCardsHome = incidents.filter(
      (i) => i.side === "home" && (i.kind === "red" || i.kind === "second_yellow"),
    ).length;
    const redCardsAway = incidents.filter(
      (i) => i.side === "away" && (i.kind === "red" || i.kind === "second_yellow"),
    ).length;
    // Leer goles esperados prepartido reales desde el snapshot cacheado de la liga (respaldo 1.45 / 1.15).
    let pregameMuHome = 1.45;
    let pregameMuAway = 1.15;
    if ((PRODUCT_LEAGUES as readonly string[]).includes(c.league)) {
      const env = loadLeagueSnapshotEnvelope(c.league as ProductLeague);
      const snapGame = env.data?.games.find((g) => g.id === gameId);
      if (snapGame?.projection) {
        if (Number.isFinite(snapGame.projection.home) && snapGame.projection.home > 0.1) {
          pregameMuHome = snapGame.projection.home;
        }
        if (Number.isFinite(snapGame.projection.away) && snapGame.projection.away > 0.1) {
          pregameMuAway = snapGame.projection.away;
        }
      }
    }
    inPlayWinProb = evaluateLiveInPlaySoccerV5({
      pregameMuHome,
      pregameMuAway,
      currentMinute: minute,
      currentHomeGoals: entry.score?.home ?? 0,
      currentAwayGoals: entry.score?.away ?? 0,
      redCardsHome,
      redCardsAway,
    });
  }

  return {
    ...empty,
    entry,
    incidents,
    stats: parsedStats.stats,
    xgEstimated: telemetry?.shotmap.xgEstimated ?? parsedStats.xgEstimated,
    momentum: parsedStats.momentum,
    xgTimeline,
    shots,
    ...(shotmapSummary ? { shotmapSummary } : {}),
    ...(averagePositions.length > 0 ? { averagePositions } : {}),
    ...(comm?.value && comm.value.length > 0 ? { commentary: comm.value } : {}),
    ...(playerStats.length > 0 ? { playerStats } : {}),
    ...(bcasts?.value && bcasts.value.length > 0 ? { broadcastsMx: bcasts.value } : {}),
    ...(inPlayWinProb ? { inPlayWinProb } : {}),
    sourceFetchedAt: sourceFetchedAt ?? inc.fetchedAt?.toISOString() ?? stRaw.fetchedAt?.toISOString() ?? null,
    notice: notice ?? inc.notice ?? stRaw.notice ?? comm?.notice ?? pstatsRaw?.notice ?? bcasts?.notice ?? null,
    nextPollSeconds: finished ? null : livePoll(entry, now),
  };
}

/** `Cache-Control` para el CDN según qué tan vivo esté lo que se sirve. */
export function liveCacheControl(nextPoll: number | null, terminal: boolean): string {
  if (terminal) return "public, s-maxage=3600, stale-while-revalidate=86400";
  if (nextPoll === null) return "public, s-maxage=120, stale-while-revalidate=300";
  if (nextPoll <= 20) return "public, s-maxage=10, stale-while-revalidate=20";
  return "public, s-maxage=30, stale-while-revalidate=60";
}
