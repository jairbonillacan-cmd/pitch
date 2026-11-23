/**
 * Adaptador de selecciones nacionales y competencias internacionales (API pública ESPN).
 * Construye temporadas normalizadas con nombres oficiales en español (`es-MX`), historial
 * internacional compartido (`data/history/international.jsonl`) y caché diaria determinista.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  asGameId,
  asLeagueId,
  asSeasonId,
  findNationalTeamDef,
  parseStrictFiniteNumber,
  type GameDTO,
  type NationalCompetitionId,
  type Team,
} from "@pitchlab/contracts";
import type { FootballTeamRateInput } from "@pitchlab/engines-reference";
import type { EloMatch } from "@pitchlab/models";
import { resolveCanonicalTeam } from "../mappings.js";
import { resolveSafeEspnCachePath } from "./espn-liga-mx-schedule.js";

const SAFE_DAY_RE = /^\d{8}$/;

export interface NationalCompetitionSpec {
  readonly league: NationalCompetitionId;
  readonly leagueName: string;
  readonly espnSlugs: readonly string[];
  readonly bzzoiroLeagueIds?: readonly number[];
  readonly seasonId: string;
  readonly seasonLabel: string;
  readonly defaultPeriod: string;
  readonly mode: "active_window" | "cycle_archive";
  readonly neutralByDefault: boolean;
  readonly maxSnapshotGames: number;
  readonly fixedRanges?: ReadonlyArray<readonly [startYmd: string, endYmd: string]>;
}

export const NATIONAL_COMPETITION_SPECS: readonly NationalCompetitionSpec[] = [
  {
    league: "uefa-nations",
    leagueName: "UEFA Nations League",
    espnSlugs: ["uefa.nations"],
    bzzoiroLeagueIds: [64],
    seasonId: "uefa-nations-2026-27",
    seasonLabel: "2026/27",
    defaultPeriod: "Fase de ligas",
    mode: "active_window",
    neutralByDefault: false,
    maxSnapshotGames: 48,
    fixedRanges: [
      ["20240905", "20241120"],
      ["20260923", "20261001"],
      ["20261006", "20261015"],
      ["20261111", "20261124"],
    ],
  },
  {
    league: "concacaf-nations",
    leagueName: "Concacaf Nations League",
    espnSlugs: ["concacaf.nations.league"],
    bzzoiroLeagueIds: [65],
    seasonId: "concacaf-nations-2026-27",
    seasonLabel: "2026/27",
    defaultPeriod: "Fase de grupos y cuartos",
    mode: "active_window",
    neutralByDefault: false,
    maxSnapshotGames: 48,
    fixedRanges: [
      ["20240904", "20241120"],
      ["20260901", "20260910"],
      ["20261006", "20261016"],
      ["20261111", "20261124"],
    ],
  },
  {
    league: "amistosos",
    leagueName: "Amistosos FIFA",
    espnSlugs: ["fifa.friendly"],
    bzzoiroLeagueIds: [31],
    seasonId: "amistosos-2026",
    seasonLabel: "2026",
    defaultPeriod: "Fecha FIFA",
    mode: "active_window",
    neutralByDefault: false,
    maxSnapshotGames: 60,
  },
  {
    league: "copa-del-mundo",
    leagueName: "Copa del Mundo FIFA",
    espnSlugs: ["fifa.world"],
    bzzoiroLeagueIds: [27],
    seasonId: "copa-del-mundo-2026",
    seasonLabel: "2026",
    defaultPeriod: "Torneo 2026",
    mode: "cycle_archive",
    neutralByDefault: true,
    maxSnapshotGames: 48,
    fixedRanges: [["20260611", "20260720"]],
  },
  {
    league: "eliminatorias",
    leagueName: "Eliminatorias Mundialistas",
    espnSlugs: [
      "fifa.worldq.uefa",
      "fifa.worldq.concacaf",
      "fifa.worldq.conmebol",
      "fifa.worldq.afc",
      "fifa.worldq.caf",
      "fifa.worldq.ofc",
    ],
    bzzoiroLeagueIds: [58, 59, 60, 61, 62, 63],
    seasonId: "eliminatorias-2025-26",
    seasonLabel: "2025–26",
    defaultPeriod: "Clasificación FIFA",
    mode: "cycle_archive",
    neutralByDefault: false,
    maxSnapshotGames: 48,
    fixedRanges: [
      ["20251112", "20251120"],
      ["20260325", "20260401"],
    ],
  },
  {
    league: "copa-america",
    leagueName: "Copa América",
    espnSlugs: ["conmebol.america"],
    bzzoiroLeagueIds: [67],
    seasonId: "copa-america-2024",
    seasonLabel: "2024",
    defaultPeriod: "Edición 2024",
    mode: "cycle_archive",
    neutralByDefault: true,
    maxSnapshotGames: 32,
    fixedRanges: [["20240620", "20240715"]],
  },
  {
    league: "eurocopa",
    leagueName: "Eurocopa UEFA",
    espnSlugs: ["uefa.euro"],
    bzzoiroLeagueIds: [66],
    seasonId: "eurocopa-2024",
    seasonLabel: "2024",
    defaultPeriod: "Edición 2024",
    mode: "cycle_archive",
    neutralByDefault: true,
    maxSnapshotGames: 36,
    fixedRanges: [["20240614", "20240715"]],
  },
  {
    league: "copa-oro",
    leagueName: "Copa Oro Concacaf",
    espnSlugs: ["concacaf.gold"],
    bzzoiroLeagueIds: [69],
    seasonId: "copa-oro-2025",
    seasonLabel: "2025",
    defaultPeriod: "Edición 2025",
    mode: "cycle_archive",
    neutralByDefault: true,
    maxSnapshotGames: 31,
    fixedRanges: [["20250614", "20250707"]],
  },
  {
    league: "copa-africana",
    leagueName: "Copa Africana de Naciones",
    espnSlugs: ["caf.nations", "caf.nations_qual"],
    bzzoiroLeagueIds: [30],
    seasonId: "copa-africana-2025",
    seasonLabel: "2025–26",
    defaultPeriod: "Edición 2025–26",
    mode: "cycle_archive",
    neutralByDefault: true,
    maxSnapshotGames: 48,
  },
  {
    league: "copa-asiatica",
    leagueName: "Copa Asiática AFC",
    espnSlugs: ["afc.asian.cup", "afc.cupq"],
    bzzoiroLeagueIds: [68],
    seasonId: "copa-asiatica-2026-27",
    seasonLabel: "2026/27",
    defaultPeriod: "Clasificación y Fase Final",
    mode: "cycle_archive",
    neutralByDefault: true,
    maxSnapshotGames: 48,
  },
];

const EventSchema = z.object({
  id: z.string().regex(/^\d{1,20}$/),
  date: z.string().min(10),
  season: z
    .object({
      slug: z.string().optional(),
      displayName: z.string().optional(),
    })
    .optional(),
  status: z.object({
    type: z.object({
      name: z.string(),
      completed: z.boolean().optional(),
    }),
  }),
  competitions: z
    .array(
      z.object({
        neutralSite: z.boolean().optional(),
        venue: z
          .object({
            fullName: z.string().optional(),
            address: z.object({ city: z.string().optional(), country: z.string().optional() }).optional(),
          })
          .optional(),
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
type EspnRawEvent = z.infer<typeof EventSchema>;

const ScoreboardSchema = z.object({
  leagues: z
    .array(
      z.object({
        calendar: z.array(z.unknown()).optional(),
      }),
    )
    .optional(),
  events: z.array(z.unknown()).optional(),
});

const TeamsListSchema = z.object({
  sports: z
    .array(
      z.object({
        leagues: z
          .array(
            z.object({
              teams: z
                .array(
                  z.object({
                    team: z.object({
                      displayName: z.string(),
                    }),
                  }),
                )
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

export type JsonFetcher = (url: string) => Promise<unknown>;

const defaultFetchJson: JsonFetcher = async (url) => {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en ${url}`);
  }
  return res.json();
};

function expandDateRange(startYmd: string, endYmd: string): string[] {
  const parseYmd = (s: string) =>
    Date.UTC(
      Number.parseInt(s.slice(0, 4), 10),
      Number.parseInt(s.slice(4, 6), 10) - 1,
      Number.parseInt(s.slice(6, 8), 10),
    );
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  const days: string[] = [];
  for (let t = start; t <= end; t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10).replaceAll("-", ""));
  }
  return days;
}

async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runWorker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => runWorker()));
}

async function fetchCachedEspnJson(params: {
  cacheFile: string;
  url: string;
  closed: boolean;
  fetchJson: JsonFetcher;
}): Promise<unknown> {
  if (params.closed && existsSync(params.cacheFile)) {
    return JSON.parse(readFileSync(params.cacheFile, "utf8"));
  }
  const payload = await params.fetchJson(params.url);
  writeFileSync(params.cacheFile, JSON.stringify(payload), "utf8");
  return payload;
}

function isSeniorTeam(rawName: string): boolean {
  return !/\b(?:U-?\d+|Sub-?\d+|Olympic|Olympics)\b/i.test(rawName);
}

function translateStageLabelEs(rawSlug: string | undefined, fallback: string): string {
  if (!rawSlug) return fallback;
  const s = rawSlug.toLowerCase();
  if (s === "final" || s.includes("final-match")) return "Final";
  if (s.includes("semifinal")) return "Semifinales";
  if (s.includes("quarterfinal")) return "Cuartos de final";
  if (s.includes("3rd-place") || s.includes("third-place")) return "Tercer lugar";
  if (s.includes("round-of-16") || s.includes("rd-of-16")) return "Octavos de final";
  if (s.includes("round-of-32")) return "Dieciseisavos";
  if (s.includes("relegation")) return "Promoción";
  if (s.includes("play-in") || s.includes("playoff")) return "Repechaje";
  if (s.includes("league-phase")) return "Fase de ligas";
  if (s.includes("group")) return "Fase de grupos";
  return fallback;
}

export interface NormalizedNationalSeason {
  league: NationalCompetitionId;
  leagueName: string;
  seasonId: string;
  seasonLabel: string;
  periodLabel: string;
  activeGames: GameDTO[];
  allGames: GameDTO[];
  teamRateInputs: FootballTeamRateInput[];
}

export interface BzzoiroNationalSource {
  readonly baseUrl: string;
  readonly headers: Readonly<Record<string, string>>;
}

interface BzNationalEventRaw {
  id: number;
  event_date: string;
  status: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  round_name?: string | null;
  stage?: string | null;
  stage_name?: string | null;
  group_name?: string | null;
  is_neutral_ground?: boolean | null;
  head_to_head?: {
    recent_matches?: Array<{
      event_id?: number;
      home_score?: number;
      away_score?: number;
    }>;
  } | null;
}

const MAX_ACTIVE_FUTURE_MS = 385 * 86_400_000;
const MAX_ACTIVE_ARCHIVE_MS = 1040 * 86_400_000;

async function fetchBzzoiroCompetitionPayload(params: {
  bzzoiro: BzzoiroNationalSource;
  bzLeagueId: number;
  cacheDir: string;
  todayKey: string;
}): Promise<{ teams: string[]; events: BzNationalEventRaw[] }> {
  const bzCache = resolveSafeEspnCachePath(params.cacheDir, join("bzzoiro-national", String(params.bzLeagueId)));
  mkdirSync(bzCache, { recursive: true });

  const requestBz = async (pathAndQuery: string) => {
    const res = await fetch(`${params.bzzoiro.baseUrl}${pathAndQuery}`, {
      headers: params.bzzoiro.headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} en ${pathAndQuery}`);
    }
    return res.json();
  };

  let teams: string[] = [];
  const teamsFile = resolveSafeEspnCachePath(bzCache, "teams.json");
  try {
    const rawTeams = existsSync(teamsFile)
      ? (JSON.parse(readFileSync(teamsFile, "utf8")) as { results?: Array<{ name?: string }> })
      : ((await requestBz(`/teams/?league=${params.bzLeagueId}&limit=250`)) as {
          results?: Array<{ name?: string }>;
        });
    if (!existsSync(teamsFile)) {
      writeFileSync(teamsFile, JSON.stringify(rawTeams), "utf8");
    }
    teams = (rawTeams.results ?? [])
      .map((t) => (typeof t.name === "string" ? t.name.trim() : ""))
      .filter(Boolean);
  } catch (err) {
    console.warn(`[national][bzzoiro] teams ${params.bzLeagueId}:`, err instanceof Error ? err.message : String(err));
  }

  const events: BzNationalEventRaw[] = [];
  const eventsFile = resolveSafeEspnCachePath(bzCache, `events-${params.todayKey}.json`);
  try {
    if (existsSync(eventsFile)) {
      const cached = JSON.parse(readFileSync(eventsFile, "utf8")) as BzNationalEventRaw[];
      if (Array.isArray(cached)) return { teams, events: cached };
    }
    let nextUrl: string | null = `/events/?league=${params.bzLeagueId}&date_from=2022-01-01&limit=100`;
    let page = 0;
    while (nextUrl && page < 5) {
      page += 1;
      const payload = (await requestBz(nextUrl)) as {
        next?: string | null;
        results?: BzNationalEventRaw[];
      };
      if (Array.isArray(payload.results)) {
        events.push(...payload.results);
      }
      if (payload.next) {
        const parsedNext = new URL(payload.next);
        nextUrl = `${parsedNext.pathname.replace(/^\/api\/v2/, "")}${parsedNext.search}`;
      } else {
        nextUrl = null;
      }
    }
    writeFileSync(eventsFile, JSON.stringify(events), "utf8");
  } catch (err) {
    console.warn(`[national][bzzoiro] events ${params.bzLeagueId}:`, err instanceof Error ? err.message : String(err));
  }

  return { teams, events };
}

function translateBzRoundEs(ev: BzNationalEventRaw, fallback: string): string {
  const stage = (ev.stage ?? ev.stage_name ?? ev.round_name ?? "").toLowerCase();
  if (stage.includes("final") && !stage.includes("semi") && !stage.includes("quarter")) return "Final";
  if (stage.includes("semifinal") || stage.includes("semi-final")) return "Semifinales";
  if (stage.includes("quarter")) return "Cuartos de final";
  if (stage.includes("3rd") || stage.includes("third")) return "Tercer lugar";
  if (stage.includes("16")) return "Octavos de final";
  if (ev.group_name && ev.group_name.trim()) return ev.group_name.trim();
  if (stage.includes("group")) return "Fase de grupos";
  if (stage.includes("qualification")) return "Eliminatoria";
  return fallback;
}

export async function fetchNationalCompetition(options: {
  spec: NationalCompetitionSpec;
  cacheDir: string;
  referenceDate: string;
  fetchJson?: JsonFetcher;
  bzzoiro?: BzzoiroNationalSource | null;
}): Promise<NormalizedNationalSeason> {
  const { spec, cacheDir, referenceDate } = options;
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const todayKey = referenceDate.replaceAll("-", "");
  const refMs = Date.parse(`${referenceDate}T12:00:00Z`);
  const observedAt = new Date(refMs).toISOString();

  const teamRoster = new Map<string, Team>();
  const eventsById = new Map<string, { event: EspnRawEvent; sourceSlug: string }>();

  for (const espnSlug of spec.espnSlugs) {
    const slugCache = resolveSafeEspnCachePath(cacheDir, join("espn-national", espnSlug));
    mkdirSync(slugCache, { recursive: true });

    // 1. Catálogo oficial de selecciones participantes
    const teamsCache = resolveSafeEspnCachePath(slugCache, "teams.json");
    try {
      const teamsPayload = await fetchCachedEspnJson({
        cacheFile: teamsCache,
        url: `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnSlug}/teams?limit=300`,
        closed: existsSync(teamsCache),
        fetchJson,
      });
      const parsedTeams = TeamsListSchema.safeParse(teamsPayload);
      if (parsedTeams.success) {
        for (const item of parsedTeams.data.sports?.[0]?.leagues?.[0]?.teams ?? []) {
          const rawName = item.team.displayName.trim();
          if (!isSeniorTeam(rawName)) continue;
          const canonical = resolveCanonicalTeam(spec.league, rawName);
          if (!teamRoster.has(canonical.id)) {
            teamRoster.set(canonical.id, canonical);
          }
        }
      }
    } catch (err) {
      console.warn(`[national] ${espnSlug} teams:`, err instanceof Error ? err.message : String(err));
    }

    // 2. Días con partidos a consultar
    const daySet = new Set<string>();
    if (spec.fixedRanges) {
      for (const [start, end] of spec.fixedRanges) {
        for (const d of expandDateRange(start, end)) {
          if (SAFE_DAY_RE.test(d)) daySet.add(d);
        }
      }
    } else {
      try {
        const rootPayload = await fetchJson(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnSlug}/scoreboard`,
        );
        const parsedRoot = ScoreboardSchema.safeParse(rootPayload);
        const maxWindowDay = new Date(refMs + 21 * 86_400_000)
          .toISOString()
          .slice(0, 10)
          .replaceAll("-", "");
        if (parsedRoot.success) {
          for (const item of parsedRoot.data.leagues?.[0]?.calendar ?? []) {
            if (typeof item === "string") {
              const key = item.slice(0, 10).replaceAll("-", "");
              if (SAFE_DAY_RE.test(key) && key <= maxWindowDay) {
                daySet.add(key);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[national] ${espnSlug} scoreboard:`, err instanceof Error ? err.message : String(err));
      }
    }

    const days = [...daySet].sort();
    await runPool(days, 8, async (day) => {
      const dayFile = resolveSafeEspnCachePath(slugCache, `${day}.json`);
      const closed = day < todayKey && Number.parseInt(todayKey, 10) - Number.parseInt(day, 10) > 1;
      try {
        const payload = await fetchCachedEspnJson({
          cacheFile: dayFile,
          url: `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnSlug}/scoreboard?dates=${day}`,
          closed,
          fetchJson,
        });
        const parsed = ScoreboardSchema.safeParse(payload);
        if (!parsed.success) return;
        for (const rawEv of parsed.data.events ?? []) {
          const ev = EventSchema.safeParse(rawEv);
          if (!ev.success) continue;
          if (!eventsById.has(ev.data.id)) {
            eventsById.set(ev.data.id, { event: ev.data, sourceSlug: espnSlug });
          }
        }
      } catch (err) {
        console.warn(`[national] ${espnSlug} ${day}:`, err instanceof Error ? err.message : String(err));
      }
    });
  }

  // 3. Normalizar eventos a GameDTO
  const allGames: GameDTO[] = [];
  const seenMatchKeys = new Set<string>();
  const stats = new Map<string, { gf: number; ga: number; gp: number }>();
  const bumpStats = (teamId: string, gf: number, ga: number) => {
    const prev = stats.get(teamId) ?? { gf: 0, ga: 0, gp: 0 };
    prev.gf += gf;
    prev.ga += ga;
    prev.gp += 1;
    stats.set(teamId, prev);
  };

  const orderedEvents = [...eventsById.values()].sort((a, b) =>
    a.event.date.localeCompare(b.event.date),
  );
  const scheduledTeamDays = new Set<string>();

  for (const { event } of orderedEvents) {
    const comp = event.competitions[0]!;
    const homeComp = comp.competitors.find((c) => c.homeAway === "home");
    const awayComp = comp.competitors.find((c) => c.homeAway === "away");
    if (!homeComp || !awayComp) continue;
    if (!isSeniorTeam(homeComp.team.displayName) || !isSeniorTeam(awayComp.team.displayName)) {
      continue;
    }

    const home = resolveCanonicalTeam(spec.league, homeComp.team.displayName);
    const away = resolveCanonicalTeam(spec.league, awayComp.team.displayName);
    if (home.id === away.id) continue;
    if (!teamRoster.has(home.id)) teamRoster.set(home.id, home);
    if (!teamRoster.has(away.id)) teamRoster.set(away.id, away);

    const statusName = event.status.type.name;
    const isFinal =
      statusName === "STATUS_FULL_TIME" ||
      statusName === "STATUS_FINAL" ||
      statusName === "STATUS_FINAL_AET" ||
      statusName === "STATUS_FINAL_PEN" ||
      event.status.type.completed === true;
    const isCanceled = statusName === "STATUS_CANCELED" || statusName === "STATUS_ABANDONED";
    const isPostponed = statusName === "STATUS_POSTPONED";
    if (isCanceled || isPostponed) continue;

    const hs = parseStrictFiniteNumber(homeComp.score) ?? Number.NaN;
    const as = parseStrictFiniteNumber(awayComp.score) ?? Number.NaN;
    const hasScore = isFinal && Number.isFinite(hs) && Number.isFinite(as) && hs >= 0 && as >= 0;

    const startMs = Date.parse(event.date);
    if (!Number.isFinite(startMs)) continue;
    // Evita publicar partidos pasados sin marcador final que activarían alertas de atraso.
    if (!hasScore && startMs < refMs - 4 * 3_600_000) continue;
    if (!hasScore && startMs > refMs + MAX_ACTIVE_FUTURE_MS) continue;

    const dayKey = new Date(startMs).toISOString().slice(0, 10);
    if (!hasScore) {
      const hk = `${home.id}::${dayKey}`;
      const ak = `${away.id}::${dayKey}`;
      if (scheduledTeamDays.has(hk) || scheduledTeamDays.has(ak)) continue;
      scheduledTeamDays.add(hk);
      scheduledTeamDays.add(ak);
    }

    if (hasScore) {
      bumpStats(home.id, hs, as);
      bumpStats(away.id, as, hs);
    }

    const homeSlug = home.id.split(".")[1]!;
    const awaySlug = away.id.split(".")[1]!;
    seenMatchKeys.add(`${dayKey}|${homeSlug}|${awaySlug}`);
    const stadium = comp.venue?.fullName?.trim();
    const city = comp.venue?.address?.city?.trim();
    const venueParts = stadium
      ? city && city.toLowerCase() !== stadium.toLowerCase()
        ? [stadium, city]
        : [stadium]
      : city
        ? [city]
        : [];
    const round = translateStageLabelEs(event.season?.slug, spec.defaultPeriod);

    allGames.push({
      id: asGameId(`${spec.league}-${dayKey}-${homeSlug}-${awaySlug}-${event.id}`),
      league: asLeagueId(spec.league),
      season: asSeasonId(spec.seasonId),
      round,
      startTime: event.date,
      status: hasScore ? "final" : "scheduled",
      home,
      away,
      venue: venueParts.length > 0 ? venueParts.join(" · ") : "Sede oficial",
      neutralSite: comp.neutralSite ?? spec.neutralByDefault,
      ...(hasScore
        ? { result: { home: hs, away: as, observedAt, source: "espn" } }
        : {}),
    });
  }

  // 3b. Enriquecer selecciones y partidos desde Bzzoiro API v2 (solo cuando hay clave configurada)
  if (options.bzzoiro && spec.bzzoiroLeagueIds && spec.bzzoiroLeagueIds.length > 0) {
    for (const bzLeagueId of spec.bzzoiroLeagueIds) {
      const bz = await fetchBzzoiroCompetitionPayload({
        bzzoiro: options.bzzoiro,
        bzLeagueId,
        cacheDir,
        todayKey,
      });

      for (const teamName of bz.teams) {
        if (!isSeniorTeam(teamName) || !findNationalTeamDef(teamName)) continue;
        const canonical = resolveCanonicalTeam(spec.league, teamName);
        if (!teamRoster.has(canonical.id)) {
          teamRoster.set(canonical.id, canonical);
        }
      }

      const sortedBz = bz.events.slice().sort((a, b) => a.event_date.localeCompare(b.event_date));
      for (const ev of sortedBz) {
        if (!isSeniorTeam(ev.home_team) || !isSeniorTeam(ev.away_team)) continue;
        if (!findNationalTeamDef(ev.home_team) || !findNationalTeamDef(ev.away_team)) continue;

        const home = resolveCanonicalTeam(spec.league, ev.home_team);
        const away = resolveCanonicalTeam(spec.league, ev.away_team);
        if (home.id === away.id) continue;
        if (!teamRoster.has(home.id)) teamRoster.set(home.id, home);
        if (!teamRoster.has(away.id)) teamRoster.set(away.id, away);

        const startMs = Date.parse(ev.event_date);
        if (!Number.isFinite(startMs)) continue;
        const dayKey = new Date(startMs).toISOString().slice(0, 10);
        const homeSlug = home.id.split(".")[1]!;
        const awaySlug = away.id.split(".")[1]!;
        const pairKey = `${dayKey}|${homeSlug}|${awaySlug}`;
        if (seenMatchKeys.has(pairKey)) continue;

        const statusLow = (ev.status ?? "").toLowerCase();
        const isFinal = statusLow === "finished" || statusLow === "ended" || statusLow === "ft";
        const isScheduled = statusLow === "notstarted" || statusLow === "scheduled";
        if (!isFinal && !isScheduled) continue;

        let hs = typeof ev.home_score === "number" ? ev.home_score : NaN;
        let as = typeof ev.away_score === "number" ? ev.away_score : NaN;
        if (isFinal && (!(hs >= 0) || !(as >= 0))) {
          const fallbackMatch = ev.head_to_head?.recent_matches?.find(
            (m) =>
              m.event_id === ev.id &&
              typeof m.home_score === "number" &&
              m.home_score >= 0 &&
              typeof m.away_score === "number" &&
              m.away_score >= 0,
          );
          if (fallbackMatch) {
            hs = fallbackMatch.home_score!;
            as = fallbackMatch.away_score!;
          }
        }
        const hasScore = isFinal && Number.isInteger(hs) && Number.isInteger(as) && hs >= 0 && as >= 0;

        if (!hasScore) {
          if (startMs < refMs - 4 * 3_600_000 || startMs > refMs + MAX_ACTIVE_FUTURE_MS) continue;
          const hk = `${home.id}::${dayKey}`;
          const ak = `${away.id}::${dayKey}`;
          if (scheduledTeamDays.has(hk) || scheduledTeamDays.has(ak)) continue;
          scheduledTeamDays.add(hk);
          scheduledTeamDays.add(ak);
        } else {
          bumpStats(home.id, hs, as);
          bumpStats(away.id, as, hs);
        }

        seenMatchKeys.add(pairKey);
        const round = translateBzRoundEs(ev, spec.defaultPeriod);
        allGames.push({
          id: asGameId(`${spec.league}-${dayKey}-${homeSlug}-${awaySlug}-bz${ev.id}`),
          league: asLeagueId(spec.league),
          season: asSeasonId(spec.seasonId),
          round,
          startTime: new Date(startMs).toISOString(),
          status: hasScore ? "final" : "scheduled",
          home,
          away,
          venue: "Sede oficial",
          neutralSite: ev.is_neutral_ground ?? spec.neutralByDefault,
          ...(hasScore
            ? { result: { home: hs, away: as, observedAt, source: "bzzoiro" } }
            : {}),
        });
      }
    }
    allGames.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  // 4. Ventana visible para la UI (respetando cotas del validador de ciclo/futuro)
  const snapshotEligible = allGames.filter((g) => {
    const ms = Date.parse(g.startTime);
    if (!Number.isFinite(ms)) return false;
    if (g.status === "final") {
      return ms <= refMs + 6 * 3_600_000 && refMs - ms <= MAX_ACTIVE_ARCHIVE_MS;
    }
    return ms >= refMs - 4 * 3_600_000 && ms - refMs <= MAX_ACTIVE_FUTURE_MS;
  });

  let activeGames: GameDTO[];
  if (spec.mode === "active_window") {
    const winStart = refMs - 8 * 86_400_000;
    const winEnd = refMs + 16 * 86_400_000;
    const inWindow = snapshotEligible.filter((g) => {
      const ms = Date.parse(g.startTime);
      return ms >= winStart && ms <= winEnd;
    });
    const scheduled = snapshotEligible.filter((g) => g.status === "scheduled");
    if (inWindow.length > 0 || scheduled.length > 0) {
      const chosen = new Map<string, GameDTO>();
      for (const g of scheduled) chosen.set(g.id, g);
      for (const g of inWindow) chosen.set(g.id, g);
      activeGames = [...chosen.values()]
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .slice(0, spec.maxSnapshotGames);
    } else {
      activeGames = snapshotEligible.slice(-Math.min(snapshotEligible.length, 32));
    }
  } else {
    const scheduled = snapshotEligible.filter((g) => g.status === "scheduled");
    const finals = snapshotEligible.filter((g) => g.status === "final");
    const keepFinals = Math.max(0, spec.maxSnapshotGames - scheduled.length);
    activeGames = [...finals.slice(-keepFinals), ...scheduled]
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(-spec.maxSnapshotGames);
  }

  const teamRateInputs: FootballTeamRateInput[] = [...teamRoster.values()].map((t) => {
    const s = stats.get(t.id) ?? { gf: 0, ga: 0, gp: 0 };
    return {
      teamId: t.id,
      name: t.name,
      shortName: t.shortName,
      code: t.code,
      goalsFor: s.gf,
      goalsAgainst: s.ga,
      gamesPlayed: s.gp,
    };
  });

  const periodLabel =
    spec.mode === "active_window" && activeGames.some((g) => g.status === "scheduled")
      ? spec.defaultPeriod
      : activeGames[activeGames.length - 1]?.round ?? allGames[allGames.length - 1]?.round ?? spec.defaultPeriod;

  return {
    league: spec.league,
    leagueName: spec.leagueName,
    seasonId: spec.seasonId,
    seasonLabel: spec.seasonLabel,
    periodLabel,
    activeGames,
    allGames,
    teamRateInputs,
  };
}

export interface InternationalHistoryRow {
  id: string;
  season: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  neutralSite: boolean;
  stage?: string | null;
}

export function writeInternationalHistoryFile(
  historyFilePath: string,
  seasons: readonly NormalizedNationalSeason[],
): InternationalHistoryRow[] {
  const dedupe = new Map<string, InternationalHistoryRow>();

  if (existsSync(historyFilePath)) {
    try {
      const existingLines = readFileSync(historyFilePath, "utf8").split(/\r?\n/);
      for (const line of existingLines) {
        if (!line.trim()) continue;
        const row = JSON.parse(line) as InternationalHistoryRow;
        if (
          row &&
          typeof row.date === "string" &&
          typeof row.homeTeam === "string" &&
          typeof row.awayTeam === "string" &&
          typeof row.homeScore === "number" &&
          row.homeScore >= 0 &&
          typeof row.awayScore === "number" &&
          row.awayScore >= 0
        ) {
          const key = `${row.date}|${row.homeTeam}|${row.awayTeam}`;
          if (!dedupe.has(key)) dedupe.set(key, row);
        }
      }
    } catch (err) {
      console.warn("[national] aviso leyendo international.jsonl previo:", err);
    }
  }

  for (const season of seasons) {
    for (const g of season.allGames) {
      if (g.status !== "final" || !g.result) continue;
      if (g.result.home < 0 || g.result.away < 0) continue;
      const date = g.startTime.slice(0, 10);
      const homeSlug = g.home.id.split(".")[1]!;
      const awaySlug = g.away.id.split(".")[1]!;
      const key = `${date}|${homeSlug}|${awaySlug}`;
      dedupe.set(key, {
        id: g.id,
        season: season.seasonLabel,
        date,
        homeTeam: homeSlug,
        awayTeam: awaySlug,
        homeScore: g.result.home,
        awayScore: g.result.away,
        neutralSite: g.neutralSite,
        stage: `${season.leagueName}${g.round ? ` · ${g.round}` : ""}`,
      });
    }
  }
  const sorted = [...dedupe.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  const content = sorted.map((row) => JSON.stringify(row)).join("\n") + "\n";
  writeFileSync(historyFilePath, content, "utf8");
  return sorted;
}

export function historyRowsForCompetition(
  historyRows: readonly InternationalHistoryRow[],
  league: NationalCompetitionId,
): EloMatch[] {
  return historyRows.map((row) => ({
    date: row.date,
    season: row.season,
    home: `${league}.${row.homeTeam}`,
    away: `${league}.${row.awayTeam}`,
    homeGoals: row.homeScore,
    awayGoals: row.awayScore,
    neutralSite: row.neutralSite,
  }));
}

export function priorFootballRowsForCompetition(
  historyRows: readonly InternationalHistoryRow[],
  league: NationalCompetitionId,
): Array<{ date: string; home: string; away: string; homeGoals: number; awayGoals: number }> {
  return historyRows.map((row) => ({
    date: row.date,
    home: `${league}.${row.homeTeam}`,
    away: `${league}.${row.awayTeam}`,
    homeGoals: row.homeScore,
    awayGoals: row.awayScore,
  }));
}

export function enrichTeamRatesFromHistory(
  teamRateInputs: readonly FootballTeamRateInput[],
  historyRows: readonly InternationalHistoryRow[],
  _league: NationalCompetitionId,
): FootballTeamRateInput[] {
  const recentRows = historyRows.filter((r) => r.date >= "2024-01-01");
  const agg = new Map<string, { gf: number; ga: number; gp: number }>();
  for (const r of recentRows) {
    const h = agg.get(r.homeTeam) ?? { gf: 0, ga: 0, gp: 0 };
    h.gf += r.homeScore;
    h.ga += r.awayScore;
    h.gp += 1;
    agg.set(r.homeTeam, h);

    const a = agg.get(r.awayTeam) ?? { gf: 0, ga: 0, gp: 0 };
    a.gf += r.awayScore;
    a.ga += r.homeScore;
    a.gp += 1;
    agg.set(r.awayTeam, a);
  }

  return teamRateInputs.map((input) => {
    const slug = input.teamId.split(".")[1] ?? input.teamId;
    const hist = agg.get(slug);
    if (!hist || input.gamesPlayed >= hist.gp) {
      return input;
    }
    return {
      ...input,
      goalsFor: hist.gf,
      goalsAgainst: hist.ga,
      gamesPlayed: hist.gp,
    };
  });
}
