/**
 * Adaptador para MLB Stats API (`statsapi.mlb.com/api`).
 *
 * Descarga:
 *  - Equipos activos (`sportId=1`)
 *  - Tabla oficial por divisiones y ligas (`/v1/standings?leagueId=103,104`)
 *  - Calendario y resultados de temporada regular y postemporada (`/v1/schedule`)
 *
 * Respeta las reglas del proyecto (`PLAN_MOTORES_Y_FUENTES_2026_11.md` §4):
 *  - Solo escudos locales propios (`/brand/sports/mlb/r1/svg/<slug>.svg`), cero URLs a `mlbstatic.com`.
 *  - Identificadores canónicos propios (`mlb.<slug>`), nunca ids crudos del proveedor como llave.
 */
import {
  asGameId,
  asLeagueId,
  asSeasonId,
  type GameDTO,
  type StandingFormToken,
  type StandingRow,
  type Team,
} from "@pitchlab/contracts";
import { getEmblemPath, getOfficialEspnTeamLogoUrl } from "@pitchlab/sports-assets";
import { resolveCanonicalTeam, UnmappedTeamError } from "../mappings.js";
import { readProviderConfigs } from "../providers/config.js";
import { divisionMetaForTeam, finalizeConferenceStandings } from "../us-divisions.js";

export interface MlbFetchedGame {
  dto: GameDTO;
  gameType: string;
  homeStarterName?: string;
  awayStarterName?: string;
  seriesDescription?: string;
}

interface RawMlbScheduleTeam {
  score?: number;
  team?: { id?: number; name?: string };
  probablePitcher?: { fullName?: string };
}

interface RawMlbScheduleGame {
  gamePk?: number;
  gameType?: string;
  gameDate?: string;
  officialDate?: string;
  status?: {
    abstractGameCode?: string;
    abstractGameState?: string;
    detailedState?: string;
  };
  teams?: {
    home?: RawMlbScheduleTeam;
    away?: RawMlbScheduleTeam;
  };
  venue?: { name?: string };
  seriesDescription?: string;
  gameNumber?: number;
}

interface RawMlbSchedulePayload {
  dates?: Array<{
    date?: string;
    games?: RawMlbScheduleGame[];
  }>;
}

interface RawMlbStandingsPayload {
  records?: Array<{
    league?: { id?: number; name?: string };
    division?: { id?: number; name?: string };
    teamRecords?: Array<{
      team?: { id?: number; name?: string };
      wins?: number;
      losses?: number;
      gamesPlayed?: number;
      runsScored?: number;
      runsAllowed?: number;
      winningPercentage?: string;
      gamesBack?: string;
      divisionRank?: string;
      leagueRank?: string;
    }>;
  }>;
}

function roundLabelForGame(gameType: string, seriesDescription?: string): string {
  const desc = (seriesDescription ?? "").toLowerCase();
  if (gameType === "W" || desc.includes("world series")) return "Serie Mundial";
  if (gameType === "L" || desc.includes("championship")) return "Serie de Campeonato";
  if (gameType === "D" || desc.includes("division")) return "Serie Divisional";
  if (gameType === "F" || desc.includes("wild card")) return "Comodines";
  return "Temporada regular";
}

function mapMlbStatus(raw?: RawMlbScheduleGame["status"]): GameDTO["status"] {
  const code = (raw?.abstractGameCode ?? "").toUpperCase();
  const detailed = (raw?.detailedState ?? "").toLowerCase();
  if (detailed.includes("postponed")) return "postponed";
  if (detailed.includes("cancel")) return "canceled";
  if (code === "F" || raw?.abstractGameState === "Final") return "final";
  if (code === "L" || raw?.abstractGameState === "Live") return "in_progress";
  return "scheduled";
}

function withMlbLocalLogo(team: Team): Team {
  const slug = team.id.includes(".") ? team.id.split(".").slice(1).join(".") : team.id;
  return {
    ...team,
    logoUrl: getOfficialEspnTeamLogoUrl("mlb", slug) ?? getEmblemPath("mlb", slug),
  };
}

function tryResolveMlbTeam(rawName: string | undefined): Team | null {
  if (!rawName?.trim()) return null;
  try {
    return withMlbLocalLogo(resolveCanonicalTeam("mlb", rawName));
  } catch (err) {
    if (err instanceof UnmappedTeamError) return null;
    throw err;
  }
}

async function fetchMlbJson<T>(pathAndQuery: string): Promise<T> {
  const cfg = readProviderConfigs().mlb_statsapi;
  if (!cfg.enabled) {
    throw new Error("MLB Stats API está deshabilitada por MLB_STATSAPI_ENABLED=0.");
  }
  const url = `${cfg.baseUrl}${pathAndQuery}`;
  const res = await fetch(url, {
    headers: cfg.headers,
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`MLB Stats API respondió HTTP ${res.status} en ${pathAndQuery}`);
  }
  return (await res.json()) as T;
}

/** Descarga juegos oficiales de MLB (`R` regular y `F,D,L,W` postemporada). */
export async function fetchMlbSchedule(params: {
  season?: number;
  startDate?: string;
  endDate?: string;
  gameTypes?: string;
  seasonTag?: string;
  observedAtIso: string;
}): Promise<MlbFetchedGame[]> {
  const gameTypes = params.gameTypes ?? "R,F,D,L,W";
  const query = new URLSearchParams({
    sportId: "1",
    gameTypes,
    hydrate: "probablePitcher,venue,team",
  });
  if (params.season) query.set("season", String(params.season));
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);

  const payload = await fetchMlbJson<RawMlbSchedulePayload>(`/v1/schedule?${query.toString()}`);
  const seasonId = asSeasonId(params.seasonTag ?? `mlb-${params.season ?? 2026}`);
  const out: MlbFetchedGame[] = [];
  const seenKeys = new Set<string>();

  for (const dateBucket of payload.dates ?? []) {
    for (const g of dateBucket.games ?? []) {
      const home = tryResolveMlbTeam(g.teams?.home?.team?.name);
      const away = tryResolveMlbTeam(g.teams?.away?.team?.name);
      if (!home || !away || home.id === away.id) continue;

      const gameIso = g.gameDate?.trim();
      const parsedMs = gameIso ? Date.parse(gameIso) : Number.NaN;
      if (!Number.isFinite(parsedMs)) continue;

      const status = mapMlbStatus(g.status);
      if (status === "postponed" || status === "canceled") continue;

      const utcDate = new Date(parsedMs).toISOString().slice(0, 10);
      const homeSlug = home.id.split(".")[1]!;
      const awaySlug = away.id.split(".")[1]!;
      const baseKey = `mlb-${utcDate}-${awaySlug}-${homeSlug}`.toLowerCase();
      const gameSuffix = seenKeys.has(baseKey) ? `-g${g.gameNumber ?? 2}` : "";
      const idKey = `${baseKey}${gameSuffix}`;
      if (seenKeys.has(idKey)) continue;
      seenKeys.add(idKey);
      seenKeys.add(baseKey);

      const hScore = g.teams?.home?.score;
      const aScore = g.teams?.away?.score;
      const hasResult =
        status === "final" &&
        typeof hScore === "number" &&
        Number.isFinite(hScore) &&
        typeof aScore === "number" &&
        Number.isFinite(aScore);

      const dto: GameDTO = {
        id: asGameId(idKey),
        league: asLeagueId("mlb"),
        season: seasonId,
        round: roundLabelForGame(g.gameType ?? "R", g.seriesDescription),
        startTime: new Date(parsedMs).toISOString(),
        status: hasResult ? "final" : status === "final" ? "scheduled" : status,
        home,
        away,
        ...(g.venue?.name ? { venue: g.venue.name } : {}),
        neutralSite: false,
        ...(hasResult
          ? {
              result: {
                home: hScore,
                away: aScore,
                observedAt: params.observedAtIso,
                source: "mlb_statsapi",
              },
            }
          : {}),
      };

      out.push({
        dto,
        gameType: g.gameType ?? "R",
        homeStarterName: g.teams?.home?.probablePitcher?.fullName?.trim() || undefined,
        awayStarterName: g.teams?.away?.probablePitcher?.fullName?.trim() || undefined,
        seriesDescription: g.seriesDescription,
      });
    }
  }

  return out.sort((a, b) => a.dto.startTime.localeCompare(b.dto.startTime));
}

/**
 * Descarga clasificación oficial MLB (Liga Americana + Liga Nacional) e integra racha reciente
 * desde el calendario cronológico disputado.
 */
export async function fetchMlbStandings(
  season: number,
  recentFormByTeam: ReadonlyMap<string, StandingFormToken[]>,
): Promise<StandingRow[]> {
  const payload = await fetchMlbJson<RawMlbStandingsPayload>(
    `/v1/standings?leagueId=103,104&season=${season}&hydrate=team,division,league`,
  );

  const rows: StandingRow[] = [];
  for (const record of payload.records ?? []) {
    const rawLeagueName = record.league?.name ?? "";
    const conference = rawLeagueName.includes("American")
      ? "Liga Americana"
      : rawLeagueName.includes("National")
        ? "Liga Nacional"
        : undefined;

    for (const tr of record.teamRecords ?? []) {
      const team = tryResolveMlbTeam(tr.team?.name);
      if (!team) continue;
      const slug = team.id.split(".")[1]!;
      const meta = divisionMetaForTeam("mlb", slug);
      const won = tr.wins ?? 0;
      const lost = tr.losses ?? 0;
      const played = tr.gamesPlayed ?? won + lost;
      const runsScored = tr.runsScored ?? 0;
      const runsAllowed = tr.runsAllowed ?? 0;
      const rawPct = tr.winningPercentage ? Number(tr.winningPercentage) : played > 0 ? won / played : 0;
      const winPct = Number.isFinite(rawPct) ? Math.round(rawPct * 1000) / 1000 : 0;
      const gb = tr.gamesBack?.trim() || "-";
      const form = (recentFormByTeam.get(team.id) ?? []).slice(-5);

      rows.push({
        teamId: team.id,
        name: team.name,
        shortName: team.shortName,
        code: team.code,
        logoUrl: team.logoUrl,
        played,
        won,
        drawn: 0,
        lost,
        goalsFor: runsScored,
        goalsAgainst: runsAllowed,
        points: won * 2,
        conference: meta?.conference ?? conference,
        division: meta?.division ?? record.division?.name,
        winPct,
        gamesBehind: gb,
        ...(form.length > 0 ? { form } : {}),
      });
    }
  }

  return finalizeConferenceStandings("mlb", rows, { computeGamesBehind: true });
}
