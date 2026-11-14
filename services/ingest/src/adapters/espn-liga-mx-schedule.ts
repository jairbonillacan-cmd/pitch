/**
 * Calendario y resultados de la temporada actual de Liga MX desde el scoreboard público de
 * ESPN (sin clave ni cuota). Sustituye al relleno con partidos de 2024 que hacía el plan
 * gratis de API-Football, que no cubre temporadas posteriores a 2024.
 *
 * - El calendario (`leagues[0].calendar`) lista los días con partidos de la temporada.
 * - Cada día se descarga una vez; los días ya jugados se guardan en caché para siempre y
 *   los futuros se vuelven a pedir en cada corrida (pueden cambiar horario o resultado).
 * - La jornada se deriva del número de partido de cada equipo: el n-ésimo partido de un
 *   equipo es su jornada n. Después de la jornada 17 es fase final (Liguilla).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { z } from "zod";
import { asGameId, asLeagueId, asSeasonId, type GameDTO } from "@pitchlab/contracts";
import type { FootballTeamRateInput } from "@pitchlab/engines-reference";
import { listAllTeamsForLeague, resolveCanonicalTeam } from "../mappings.js";
import type { NormalizedLigaMxSeason } from "./api-football.js";

export const ESPN_LIGA_MX_SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/scoreboard";
export const LIGA_MX_REGULAR_ROUNDS = 17;

const SAFE_DAY_KEY_RE = /^\d{8}$/;
const SAFE_ESPN_ID_RE = /^\d{1,20}$/;

export function resolveSafeEspnCachePath(rootDir: string, relativePath: string): string {
  if (!relativePath || relativePath.includes("..") || relativePath.includes("\0")) {
    throw new Error(`Ruta de caché ESPN insegura rechazada: ${relativePath}`);
  }
  const resolvedRoot = resolve(rootDir);
  const resolvedTarget = resolve(resolvedRoot, relativePath);
  if (!resolvedTarget.startsWith(resolvedRoot + sep)) {
    throw new Error(`Escape de directorio en caché ESPN bloqueado: ${relativePath}`);
  }
  return resolvedTarget;
}

const EspnEventSchema = z.object({
  id: z.string().regex(SAFE_ESPN_ID_RE),
  date: z.string().min(10),
  status: z.object({ type: z.object({ name: z.string(), completed: z.boolean().optional() }) }),
  competitions: z
    .array(
      z.object({
        venue: z.object({ fullName: z.string().optional() }).optional(),
        competitors: z
          .array(
            z.object({
              homeAway: z.enum(["home", "away"]),
              score: z.string().optional(),
              team: z.object({ displayName: z.string() }),
            }),
          )
          .length(2),
      }),
    )
    .min(1),
});
export type EspnLigaMxEvent = z.infer<typeof EspnEventSchema>;

const ScoreboardSchema = z.object({
  leagues: z
    .array(
      z.object({
        season: z.object({ year: z.number().int(), displayName: z.string().optional() }).optional(),
        calendar: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  events: z.array(z.unknown()).optional(),
});

export type FetchJson = (url: string) => Promise<unknown>;

const defaultFetchJson: FetchJson = async (url) => {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN respondió ${res.status} para ${url}`);
  return res.json();
};

function dayKey(isoDate: string): string {
  return isoDate.slice(0, 10).replaceAll("-", "");
}

function parseEvents(payload: unknown): EspnLigaMxEvent[] {
  const parsed = ScoreboardSchema.parse(payload);
  const out: EspnLigaMxEvent[] = [];
  for (const raw of parsed.events ?? []) {
    const ev = EspnEventSchema.safeParse(raw);
    if (ev.success) out.push(ev.data);
  }
  return out;
}

/** Descarga todos los partidos de la temporada actual hasta `referenceDate + horizonDays`. */
export async function fetchEspnLigaMxSeason(options: {
  cacheDir: string;
  referenceDate: string;
  horizonDays?: number;
  fetchJson?: FetchJson;
}): Promise<{ seasonYear: number; seasonLabel: string; events: EspnLigaMxEvent[] }> {
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const horizon = options.horizonDays ?? 21;
  const limitDay = dayKey(
    new Date(Date.parse(`${options.referenceDate}T12:00:00Z`) + horizon * 86_400_000).toISOString(),
  );
  const todayKey = dayKey(options.referenceDate);

  const root = ScoreboardSchema.parse(await fetchJson(ESPN_LIGA_MX_SCOREBOARD));
  const league = root.leagues?.[0];
  const seasonYear = league?.season?.year ?? Number(options.referenceDate.slice(0, 4));
  if (!Number.isInteger(seasonYear) || seasonYear < 1990 || seasonYear > 2100) {
    throw new Error(`Año de temporada ESPN fuera de rango: ${String(seasonYear)}`);
  }
  if (!SAFE_DAY_KEY_RE.test(todayKey) || !SAFE_DAY_KEY_RE.test(limitDay)) {
    throw new Error(`Fecha de referencia inválida para calendario ESPN: ${options.referenceDate}`);
  }
  const calendar = (league?.calendar ?? [])
    .map(dayKey)
    .filter((d) => SAFE_DAY_KEY_RE.test(d) && d <= limitDay);
  const cacheRoot = resolveSafeEspnCachePath(options.cacheDir, join("espn-liga-mx", String(seasonYear)));
  mkdirSync(cacheRoot, { recursive: true });

  const byId = new Map<string, EspnLigaMxEvent>();
  for (const day of [...new Set(calendar)].sort()) {
    const file = resolveSafeEspnCachePath(cacheRoot, `${day}.json`);
    // Días cerrados (anteriores a ayer) se leen de caché; el resto se refresca.
    const closed = day < todayKey && Number(todayKey) - Number(day) > 1;
    let payload: unknown;
    if (closed && existsSync(file)) {
      payload = JSON.parse(readFileSync(file, "utf8"));
    } else {
      payload = await fetchJson(`${ESPN_LIGA_MX_SCOREBOARD}?dates=${day}`);
      writeFileSync(file, JSON.stringify(payload), "utf8");
    }
    for (const ev of parseEvents(payload)) byId.set(ev.id, ev);
  }

  const label = league?.season?.displayName ?? `${seasonYear}`;
  return {
    seasonYear,
    seasonLabel: label,
    events: [...byId.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Convierte la temporada de ESPN al formato normalizado que usa el snapshot de Liga MX. */
export function normalizeEspnLigaMx(
  season: { seasonYear: number; events: readonly EspnLigaMxEvent[] },
  options: { referenceDate: string; windowBackDays?: number; windowAheadDays?: number },
): NormalizedLigaMxSeason {
  if (season.events.length === 0) {
    throw new Error("ESPN no devolvió partidos de Liga MX para la temporada actual.");
  }
  const seasonId = `liga-mx-${season.seasonYear}-apertura`;
  const seasonLabel = `Apertura ${season.seasonYear}`;
  const refMs = Date.parse(`${options.referenceDate}T12:00:00Z`);
  const observedAt = new Date(refMs).toISOString();
  const gamesPerTeam = new Map<string, number>();

  const allGames: GameDTO[] = [];
  for (const ev of season.events) {
    const comp = ev.competitions[0]!;
    const homeC = comp.competitors.find((c) => c.homeAway === "home")!;
    const awayC = comp.competitors.find((c) => c.homeAway === "away")!;
    const home = resolveCanonicalTeam("liga-mx", homeC.team.displayName);
    const away = resolveCanonicalTeam("liga-mx", awayC.team.displayName);
    const nHome = (gamesPerTeam.get(home.id) ?? 0) + 1;
    const nAway = (gamesPerTeam.get(away.id) ?? 0) + 1;
    gamesPerTeam.set(home.id, nHome);
    gamesPerTeam.set(away.id, nAway);
    const roundNum = Math.max(nHome, nAway);
    const isPlayoff = roundNum > LIGA_MX_REGULAR_ROUNDS;
    const final = ev.status.type.name === "STATUS_FULL_TIME" || ev.status.type.completed === true;
    const hs = Number(homeC.score);
    const as = Number(awayC.score);
    const hasScore = final && Number.isFinite(hs) && Number.isFinite(as);
    const homeSlug = home.id.split(".")[1]!;
    const awaySlug = away.id.split(".")[1]!;

    allGames.push({
      id: asGameId(`mx-${season.seasonYear}-${isPlayoff ? "lg" : `j${roundNum}`}-${homeSlug}-${awaySlug}-${ev.id}`),
      league: asLeagueId("liga-mx"),
      season: asSeasonId(seasonId),
      week: roundNum,
      round: isPlayoff ? "Liguilla" : `Jornada ${roundNum}`,
      startTime: ev.date,
      status: hasScore ? "final" : "scheduled",
      home,
      away,
      venue: comp.venue?.fullName ?? "México",
      neutralSite: false,
      result: hasScore ? { home: hs, away: as, observedAt, source: "espn" } : undefined,
    });
  }

  // Ventana activa: lo último jugado y lo que viene en las próximas semanas.
  const back = (options.windowBackDays ?? 5) * 86_400_000;
  const ahead = (options.windowAheadDays ?? 14) * 86_400_000;
  let activeRoundGames = allGames.filter((g) => {
    const t = Date.parse(g.startTime);
    return t >= refMs - back && t <= refMs + ahead;
  });
  if (activeRoundGames.length === 0) {
    const nextScheduled = allGames.find((g) => g.status === "scheduled");
    activeRoundGames = nextScheduled
      ? allGames.filter((g) => g.week === nextScheduled.week)
      : allGames.slice(-9);
  }
  const upcoming = activeRoundGames.find((g) => g.status === "scheduled") ?? activeRoundGames.at(-1)!;
  const activeRound = upcoming.week ?? LIGA_MX_REGULAR_ROUNDS;
  const periodLabel = activeRound > LIGA_MX_REGULAR_ROUNDS ? "Liguilla" : `Jornada ${activeRound}`;

  // Tasas de goles con la fase regular ya jugada antes de la ventana activa.
  const stats = new Map<string, { gf: number; ga: number; gp: number }>();
  const catalog = listAllTeamsForLeague("liga-mx");
  for (const t of catalog) stats.set(t.id, { gf: 0, ga: 0, gp: 0 });
  for (const g of allGames) {
    if (g.status !== "final" || !g.result || Date.parse(g.startTime) >= refMs) continue;
    const h = stats.get(g.home.id);
    const a = stats.get(g.away.id);
    if (h) {
      h.gf += g.result.home;
      h.ga += g.result.away;
      h.gp += 1;
    }
    if (a) {
      a.gf += g.result.away;
      a.ga += g.result.home;
      a.gp += 1;
    }
  }
  const teamRateInputs: FootballTeamRateInput[] = catalog.map((t) => {
    const st = stats.get(t.id) ?? { gf: 0, ga: 0, gp: 0 };
    return {
      teamId: t.id,
      name: t.name,
      shortName: t.shortName,
      code: t.code,
      goalsFor: st.gf,
      goalsAgainst: st.ga,
      gamesPlayed: st.gp,
    };
  });

  return {
    seasonId,
    seasonLabel,
    activeRound,
    periodLabel,
    allGames,
    activeRoundGames: activeRoundGames.sort((a, b) => a.startTime.localeCompare(b.startTime)),
    teamRateInputs,
  };
}
