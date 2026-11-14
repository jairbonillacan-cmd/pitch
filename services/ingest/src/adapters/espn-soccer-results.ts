/**
 * Resultados, estado y hora real de las ligas europeas desde el scoreboard público de ESPN
 * (sin clave ni cuota). Es el respaldo cuando no hay `FOOTBALL_DATA_API_KEY`: openfootball
 * publica el calendario pero tarda días en cargar los marcadores, y sin marcadores la
 * jornada pasada se quedaba como «por jugar» (P0-02 de la auditoría 2026-11-13).
 *
 * Los eventos se convierten al formato de football-data.org y se fusionan con
 * `mergeFootballDataIntoSeason`, que ya empareja por jornada y por parecido de nombres,
 * recalcula la jornada activa y las tasas por equipo. Solo se descargan los días del
 * calendario de ESPN entre `backDays` atrás (21 por defecto; lo anterior ya lo tiene openfootball) y `horizonDays` adelante; los días cerrados se
 * guardan en caché para siempre.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { GameDTO } from "@pitchlab/contracts";
import { nameSimilarity } from "./football-data-merge.js";
import { resolveSafeEspnCachePath } from "./espn-liga-mx-schedule.js";
import type { NormalizedOpenFootballSeason } from "./openfootball.js";

export const ESPN_SOCCER_SLUGS = {
  "premier-league": "eng.1",
  laliga: "esp.1",
  bundesliga: "ger.1",
  "serie-a": "ita.1",
  "ligue-1": "fra.1",
} as const;

export type EspnSoccerLeague = keyof typeof ESPN_SOCCER_SLUGS;

const SAFE_DAY_KEY_RE = /^\d{8}$/;

const EventSchema = z.object({
  id: z.string().regex(/^\d{1,20}$/),
  date: z.string().min(10),
  status: z.object({ type: z.object({ name: z.string() }) }),
  competitions: z
    .array(
      z.object({
        competitors: z
          .array(
            z.object({
              homeAway: z.enum(["home", "away"]),
              score: z.string().optional(),
              team: z.object({ displayName: z.string(), shortDisplayName: z.string().optional() }),
            }),
          )
          .length(2),
      }),
    )
    .min(1),
});
export type EspnSoccerEvent = z.infer<typeof EventSchema>;

const ScoreboardSchema = z.object({
  leagues: z.array(z.object({ calendar: z.array(z.string()).optional() })).optional(),
  events: z.array(z.unknown()).optional(),
});

export type FetchJson = (url: string) => Promise<unknown>;

const defaultFetchJson: FetchJson = async (url) => {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN respondió ${res.status} para ${url}`);
  return res.json();
};

const dayKey = (iso: string) => iso.slice(0, 10).replaceAll("-", "");

function parseEvents(payload: unknown): EspnSoccerEvent[] {
  const out: EspnSoccerEvent[] = [];
  for (const raw of ScoreboardSchema.parse(payload).events ?? []) {
    const ev = EventSchema.safeParse(raw);
    if (ev.success) out.push(ev.data);
  }
  return out;
}

/** Partidos de ESPN de una liga en la ventana [referencia − backDays, referencia + horizonDays]. */
export async function fetchEspnSoccerEvents(options: {
  league: EspnSoccerLeague;
  cacheDir: string;
  referenceDate: string;
  backDays?: number;
  horizonDays?: number;
  fetchJson?: FetchJson;
}): Promise<EspnSoccerEvent[]> {
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const slug = ESPN_SOCCER_SLUGS[options.league];
  const base = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard`;
  const refMs = Date.parse(`${options.referenceDate}T12:00:00Z`);
  if (!Number.isFinite(refMs)) throw new Error(`Fecha de referencia inválida: ${options.referenceDate}`);
  const fromDay = dayKey(new Date(refMs - (options.backDays ?? 21) * 86_400_000).toISOString());
  const toDay = dayKey(new Date(refMs + (options.horizonDays ?? 21) * 86_400_000).toISOString());
  const todayKey = dayKey(options.referenceDate);

  const root = ScoreboardSchema.parse(await fetchJson(base));
  const days = [...new Set((root.leagues?.[0]?.calendar ?? []).map(dayKey))]
    .filter((d) => SAFE_DAY_KEY_RE.test(d) && d >= fromDay && d <= toDay)
    .sort();
  const cacheRoot = resolveSafeEspnCachePath(options.cacheDir, join("espn-soccer", slug));
  mkdirSync(cacheRoot, { recursive: true });

  const byId = new Map<string, EspnSoccerEvent>();
  for (const day of days) {
    const file = resolveSafeEspnCachePath(cacheRoot, `${day}.json`);
    const closed = Number(todayKey) - Number(day) > 1;
    let payload: unknown;
    if (closed && existsSync(file)) {
      payload = JSON.parse(readFileSync(file, "utf8"));
    } else {
      payload = await fetchJson(`${base}?dates=${day}`);
      writeFileSync(file, JSON.stringify(payload), "utf8");
    }
    for (const ev of parseEvents(payload)) byId.set(ev.id, ev);
  }
  return [...byId.values()];
}

function statusOf(name: string): string {
  if (name === "STATUS_FULL_TIME" || name === "STATUS_FINAL" || name === "STATUS_FINAL_AET" || name === "STATUS_FINAL_PEN") {
    return "FINISHED";
  }
  if (name === "STATUS_POSTPONED") return "POSTPONED";
  if (name === "STATUS_CANCELED" || name === "STATUS_ABANDONED") return "CANCELLED";
  if (name === "STATUS_IN_PROGRESS" || name === "STATUS_HALFTIME" || name === "STATUS_FIRST_HALF" || name === "STATUS_SECOND_HALF") {
    return "IN_PLAY";
  }
  return "SCHEDULED";
}

function sideScore(game: GameDTO["home"], name: string, short?: string): number {
  return Math.max(
    nameSimilarity(game.name, name),
    nameSimilarity(game.shortName, name),
    short ? nameSimilarity(game.name, short) : 0,
  );
}

/**
 * Convierte eventos de ESPN al formato de football-data.org. ESPN no trae la jornada, así
 * que se toma de nuestro calendario: el partido con los mismos equipos y fecha a ±4 días.
 * Lo que no empareja se descarta (no inventa jornadas).
 */
export function espnEventsToFootballData(
  events: readonly EspnSoccerEvent[],
  season: NormalizedOpenFootballSeason,
): { matches: unknown[] } {
  const matches: unknown[] = [];
  for (const ev of events) {
    const comp = ev.competitions[0]!;
    const home = comp.competitors.find((c) => c.homeAway === "home")!;
    const away = comp.competitors.find((c) => c.homeAway === "away")!;
    const evMs = Date.parse(ev.date);
    let best: { week: number; score: number } | null = null;
    for (const g of season.allGames) {
      if (Math.abs(Date.parse(g.startTime) - evMs) > 4 * 86_400_000) continue;
      const h = sideScore(g.home, home.team.displayName, home.team.shortDisplayName);
      const a = sideScore(g.away, away.team.displayName, away.team.shortDisplayName);
      if (h === 0 || a === 0) continue;
      if (!best || h + a > best.score) best = { week: g.week ?? 0, score: h + a };
    }
    if (!best || best.score < 1) continue;
    const status = statusOf(ev.status.type.name);
    const num = (s?: string) => (s !== undefined && /^\d+$/.test(s) ? Number(s) : null);
    matches.push({
      id: Number(ev.id),
      utcDate: ev.date,
      status,
      matchday: best.week,
      homeTeam: { name: home.team.displayName, shortName: home.team.shortDisplayName ?? null },
      awayTeam: { name: away.team.displayName, shortName: away.team.shortDisplayName ?? null },
      score: {
        fullTime: status === "FINISHED" ? { home: num(home.score), away: num(away.score) } : { home: null, away: null },
      },
    });
  }
  return { matches };
}
