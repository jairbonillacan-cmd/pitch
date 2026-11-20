/**
 * `pnpm --filter @pitchlab/ingest snapshot:us-standings [--leagues=nfl,nba,nhl,mlb]`
 *
 * Actualiza:
 *  - `nfl`: calendario, resultados y tabla de posiciones AFC/NFC desde `nflverse` (CC-BY 4.0)
 *  - `nba`: tabla de posiciones Este/Oeste actualizada (preserva pronósticos vigentes)
 *  - `nhl`: tabla de posiciones Este/Oeste desde NHL Web API (preserva pronósticos vigentes)
 *  - `mlb`: calendario 2026 + postemporada + apertura 2027, tasas reales, pronósticos walk-forward,
 *           clasificación AL/NL, historial `season-results.json` y bajas médicas desde MLB Stats API
 */
import { resolve } from "node:path";
import {
  LeagueSnapshotSchema,
  asGameId,
  asLeagueId,
  asSeasonId,
  asTeamId,
  type GameDTO,
  type LeagueSnapshot,
  type StandingFormToken,
  type StandingRow,
} from "@pitchlab/contracts";
import { getBzzoiroTeamEmblemUrl, getOfficialEspnTeamLogoUrl } from "@pitchlab/sports-assets";
import { collectAndWriteLeagueInjuries } from "./adapters/injuries.js";
import { fetchMlbSchedule, fetchMlbStandings } from "./adapters/mlb-statsapi.js";
import { fetchNflverseCsv, normalizeNflverseSchedule } from "./adapters/nflverse.js";
import { loadRootEnvFiles } from "./env.js";
import { loadLeagueHistory } from "./prior-season.js";
import { buildMlbLeagueSnapshot, buildMlbRecentFormMap } from "./mlb-snapshot.js";
import {
  buildNflSnapshot,
  loadPreviousSnapshot,
  writeSeasonResultsFile,
  writeSnapshotFiles,
} from "./pipeline.js";
import { readProviderConfigs } from "./providers/config.js";
import { divisionMetaForTeam, finalizeConferenceStandings } from "./us-divisions.js";
import { validateLeagueSnapshotCandidate } from "./validation/snapshot-validator.js";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SNAPSHOTS = resolve(ROOT, "data", "snapshots");

function normKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveSnapshotTeamByRaw(
  snap: LeagueSnapshot,
  rawName: string,
  rawAbbr?: string,
): { teamId: string; name: string; shortName: string; code: string; logoUrl?: string } | null {
  const abbr = rawAbbr?.trim().toUpperCase();
  const target = normKey(rawName);
  const candidates = Object.values(snap.teamRates);

  const byCode = abbr ? candidates.find((c) => c.code.toUpperCase() === abbr) : undefined;
  if (byCode) return byCode;

  const byExact = candidates.find(
    (c) => normKey(c.name) === target || normKey(c.shortName) === target,
  );
  if (byExact) return byExact;

  // Caso especial comunes (e.g. LA Clippers vs Los Angeles Clippers)
  const lastWord = target.split(" ").at(-1) ?? "";
  if (lastWord.length >= 4) {
    const byNickname = candidates.find((c) => normKey(c.name).endsWith(` ${lastWord}`) || normKey(c.shortName) === lastWord);
    if (byNickname) return byNickname;
  }
  return null;
}

interface NhlStandingsItem {
  conferenceName?: string;
  divisionName?: string;
  teamName?: { default?: string };
  teamAbbrev?: { default?: string };
  gamesPlayed?: number;
  wins?: number;
  losses?: number;
  otLosses?: number;
  points?: number;
  goalFor?: number;
  goalAgainst?: number;
  l10Wins?: number;
  l10Losses?: number;
  l10OtLosses?: number;
  streakCode?: string;
  streakCount?: number;
}

function nhlStreakForm(item: NhlStandingsItem): StandingFormToken[] {
  const code = (item.streakCode ?? "").toUpperCase();
  const count = Number(item.streakCount ?? 0);
  if (count < 5) return [];
  const tok: StandingFormToken = code === "W" ? "W" : "L";
  return Array.from({ length: 5 }, () => tok);
}

interface NhlClubScheduleGame {
  id?: number;
  gameType?: number;
  gameDate?: string;
  startTimeUTC?: string;
  gameState?: string;
  awayTeam?: { abbrev?: string; placeName?: { default?: string }; commonName?: { default?: string }; score?: number };
  homeTeam?: { abbrev?: string; placeName?: { default?: string }; commonName?: { default?: string }; score?: number };
  venue?: { default?: string };
}

async function runPool<T>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

function computeFormFromGames(games: readonly GameDTO[]): Map<string, StandingFormToken[]> {
  const sorted = [...games]
    .filter((g) => g.status === "final" && g.result)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const map = new Map<string, StandingFormToken[]>();
  for (const g of sorted) {
    if (!g.result) continue;
    const hTok: StandingFormToken = g.result.home > g.result.away ? "W" : g.result.home < g.result.away ? "L" : "D";
    const aTok: StandingFormToken = g.result.away > g.result.home ? "W" : g.result.away < g.result.home ? "L" : "D";
    const hList = map.get(g.home.id) ?? [];
    hList.push(hTok);
    map.set(g.home.id, hList.slice(-5));
    const aList = map.get(g.away.id) ?? [];
    aList.push(aTok);
    map.set(g.away.id, aList.slice(-5));
  }
  return map;
}

async function fetchNhlSeasonGames(
  prev: LeagueSnapshot,
  abbrevs: readonly string[],
  observedAtIso: string,
): Promise<GameDTO[]> {
  const cfg = readProviderConfigs().nhl_web;
  const dedup = new Map<string, GameDTO>();
  await runPool(abbrevs, 6, async (abbrev) => {
    try {
      const res = await fetch(`${cfg.baseUrl}/club-schedule-season/${encodeURIComponent(abbrev)}/now`, {
        headers: cfg.headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return;
      const payload = (await res.json()) as { games?: NhlClubScheduleGame[] };
      for (const g of payload.games ?? []) {
        if (g.gameType !== 2) continue;
        const st = (g.gameState ?? "").toUpperCase();
        if (st !== "OFF" && st !== "FINAL") continue;
        const hs = g.homeTeam?.score;
        const as = g.awayTeam?.score;
        if (typeof hs !== "number" || typeof as !== "number") continue;
        const hAbbr = g.homeTeam?.abbrev?.trim();
        const aAbbr = g.awayTeam?.abbrev?.trim();
        const hName = `${g.homeTeam?.placeName?.default ?? ""} ${g.homeTeam?.commonName?.default ?? ""}`.trim();
        const aName = `${g.awayTeam?.placeName?.default ?? ""} ${g.awayTeam?.commonName?.default ?? ""}`.trim();
        const home = resolveSnapshotTeamByRaw(prev, hName, hAbbr);
        const away = resolveSnapshotTeamByRaw(prev, aName, aAbbr);
        if (!home || !away || home.teamId === away.teamId) continue;
        const startIso = g.startTimeUTC ?? (g.gameDate ? `${g.gameDate}T23:00:00Z` : "");
        if (!startIso || Number.isNaN(Date.parse(startIso))) continue;
        const datePart = startIso.slice(0, 10);
        const hSlug = home.teamId.split(".")[1] ?? home.teamId;
        const aSlug = away.teamId.split(".")[1] ?? away.teamId;
        const key = g.id ? `nhl-${datePart}-${aSlug}-${hSlug}` : `nhl-${datePart}-${aSlug}-${hSlug}`;
        if (dedup.has(key)) continue;
        dedup.set(key, {
          id: asGameId(key),
          league: asLeagueId("nhl"),
          season: prev.season,
          round: "Temporada regular",
          startTime: new Date(startIso).toISOString(),
          status: "final",
          home: {
            id: asTeamId(home.teamId),
            league: asLeagueId("nhl"),
            name: home.name,
            shortName: home.shortName,
            code: home.code,
            ...(home.logoUrl ? { logoUrl: home.logoUrl } : {}),
          },
          away: {
            id: asTeamId(away.teamId),
            league: asLeagueId("nhl"),
            name: away.name,
            shortName: away.shortName,
            code: away.code,
            ...(away.logoUrl ? { logoUrl: away.logoUrl } : {}),
          },
          ...(g.venue?.default ? { venue: g.venue.default } : {}),
          neutralSite: false,
          result: {
            home: hs,
            away: as,
            observedAt: observedAtIso,
            source: "nhl_web",
          },
        });
      }
    } catch (err) {
      void err;
    }
  });
  return [...dedup.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

interface EspnTeamSchedulePayload {
  events?: Array<{
    id?: string;
    date?: string;
    seasonType?: { type?: number; name?: string };
    competitions?: Array<{
      venue?: { fullName?: string };
      status?: { type?: { completed?: boolean } };
      competitors?: Array<{
        homeAway?: string;
        score?: { value?: number; displayValue?: string } | string;
        team?: { displayName?: string; abbreviation?: string };
      }>;
    }>;
  }>;
}

async function fetchNbaSeasonGames(
  prev: LeagueSnapshot,
  observedAtIso: string,
): Promise<GameDTO[]> {
  const teamsRes = await fetch(
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=40",
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!teamsRes.ok) return [];
  const teamsPayload = (await teamsRes.json()) as {
    sports?: Array<{ leagues?: Array<{ teams?: Array<{ team?: { id?: string } }> }> }>;
  };
  const teamIds = (teamsPayload.sports?.[0]?.leagues?.[0]?.teams ?? [])
    .map((t) => t.team?.id)
    .filter((id): id is string => Boolean(id));

  const dedup = new Map<string, GameDTO>();
  await runPool(teamIds, 6, async (eid) => {
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${encodeURIComponent(eid)}/schedule?season=2027`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!res.ok) return;
      const payload = (await res.json()) as EspnTeamSchedulePayload;
      for (const ev of payload.events ?? []) {
        if (ev.seasonType?.type === 1) continue; // omitir pretemporada
        const comp = ev.competitions?.[0];
        if (!comp?.status?.type?.completed) continue;
        const hComp = comp.competitors?.find((c) => c.homeAway === "home");
        const aComp = comp.competitors?.find((c) => c.homeAway === "away");
        if (!hComp || !aComp) continue;
        const rawH = typeof hComp.score === "object" ? (hComp.score?.value ?? Number(hComp.score?.displayValue)) : Number(hComp.score);
        const rawA = typeof aComp.score === "object" ? (aComp.score?.value ?? Number(aComp.score?.displayValue)) : Number(aComp.score);
        if (!Number.isFinite(rawH) || !Number.isFinite(rawA)) continue;
        const home = resolveSnapshotTeamByRaw(prev, hComp.team?.displayName ?? "", hComp.team?.abbreviation);
        const away = resolveSnapshotTeamByRaw(prev, aComp.team?.displayName ?? "", aComp.team?.abbreviation);
        if (!home || !away || home.teamId === away.teamId) continue;
        const startIso = ev.date ?? "";
        if (!startIso || Number.isNaN(Date.parse(startIso))) continue;
        const datePart = startIso.slice(0, 10);
        const hSlug = home.teamId.split(".")[1] ?? home.teamId;
        const aSlug = away.teamId.split(".")[1] ?? away.teamId;
        const key = `nba-${datePart}-${aSlug}-${hSlug}`;
        if (dedup.has(key)) continue;
        dedup.set(key, {
          id: asGameId(key),
          league: asLeagueId("nba"),
          season: prev.season,
          round: ev.seasonType?.name === "Postseason" ? "Playoffs" : "Temporada regular",
          startTime: new Date(startIso).toISOString(),
          status: "final",
          home: {
            id: asTeamId(home.teamId),
            league: asLeagueId("nba"),
            name: home.name,
            shortName: home.shortName,
            code: home.code,
            ...(home.logoUrl ? { logoUrl: home.logoUrl } : {}),
          },
          away: {
            id: asTeamId(away.teamId),
            league: asLeagueId("nba"),
            name: away.name,
            shortName: away.shortName,
            code: away.code,
            ...(away.logoUrl ? { logoUrl: away.logoUrl } : {}),
          },
          ...(comp.venue?.fullName ? { venue: comp.venue.fullName } : {}),
          neutralSite: false,
          result: {
            home: Math.round(rawH),
            away: Math.round(rawA),
            observedAt: observedAtIso,
            source: "espn_public",
          },
        });
      }
    } catch (err) {
      void err;
    }
  });
  return [...dedup.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

async function hydrateNhlStandings(now: Date): Promise<void> {
  const prev = loadPreviousSnapshot(SNAPSHOTS, "nhl");
  if (!prev) {
    console.warn("[standings:nhl] No existe latest.json previo; omitido.");
    return;
  }
  const updatedAt = now.toISOString();
  const cfg = readProviderConfigs().nhl_web;
  const res = await fetch(`${cfg.baseUrl}/standings/now`, {
    headers: cfg.headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`NHL Web API respondió HTTP ${res.status}`);
  const payload = (await res.json()) as { standings?: NhlStandingsItem[] };

  const abbrevs = [...new Set(
    (payload.standings ?? [])
      .map((item) => item.teamAbbrev?.default?.trim())
      .filter((a): a is string => Boolean(a)),
  )];
  const seasonGames = await fetchNhlSeasonGames(prev, abbrevs, updatedAt);
  const realFormByTeam = computeFormFromGames(seasonGames);
  if (seasonGames.length > 0) {
    writeSeasonResultsFile(SNAPSHOTS, {
      league: "nhl",
      season: String(prev.season),
      updatedAt,
      games: seasonGames,
    });
  }

  const rows: StandingRow[] = [];
  for (const item of payload.standings ?? []) {
    const name = item.teamName?.default?.trim() ?? "";
    const abbrev = item.teamAbbrev?.default?.trim() ?? "";
    const matched = resolveSnapshotTeamByRaw(prev, name, abbrev);
    if (!matched) continue;

    const slug = matched.teamId.includes(".") ? matched.teamId.split(".").slice(1).join(".") : matched.teamId;
    const meta = divisionMetaForTeam("nhl", slug);
    const won = item.wins ?? 0;
    const lost = item.losses ?? 0;
    const otLosses = item.otLosses ?? 0;
    const played = item.gamesPlayed ?? won + lost + otLosses;
    const points = item.points ?? won * 2 + otLosses;
    const realForm = realFormByTeam.get(matched.teamId) ?? [];
    const form = realForm.length > 0 ? realForm : nhlStreakForm(item);
    const logoUrl = matched.logoUrl ?? getOfficialEspnTeamLogoUrl("nhl", slug) ?? undefined;

    rows.push({
      teamId: matched.teamId,
      name: matched.name,
      shortName: matched.shortName,
      code: matched.code,
      ...(logoUrl ? { logoUrl } : {}),
      played,
      won,
      drawn: 0,
      lost,
      otLosses,
      goalsFor: item.goalFor ?? 0,
      goalsAgainst: item.goalAgainst ?? 0,
      points,
      winPct: played > 0 ? Math.round((won / played) * 1000) / 1000 : 0,
      conference:
        meta?.conference ??
        (item.conferenceName === "Eastern" ? "Este" : item.conferenceName === "Western" ? "Oeste" : undefined),
      division: meta?.division ?? item.divisionName,
      ...(form.length > 0 ? { form } : {}),
    });
  }

  const standings = finalizeConferenceStandings("nhl", rows);
  const candidate = LeagueSnapshotSchema.parse({
    ...prev,
    logoUrl: prev.logoUrl ?? "/brand/official/nhl/nhl.png",
    updatedAt,
    standings,
  });

  const validation = validateLeagueSnapshotCandidate(candidate, prev, { nowMs: now.getTime() });
  if (!validation.ok) {
    throw new Error(validation.issues.map((i) => `${i.code}: ${i.message}`).join(" | "));
  }
  const { latestPath } = writeSnapshotFiles(SNAPSHOTS, validation.value ?? candidate, now.toISOString().slice(0, 10));
  const injRes = await collectAndWriteLeagueInjuries({
    snapshotsRoot: SNAPSHOTS,
    league: "nhl",
    observedAtIso: updatedAt,
  });
  console.log(
    `[standings:nhl] ${standings.length} equipos · ${seasonGames.length} resultados · ${injRes.entriesCount} bajas → ${latestPath}`,
  );
}

interface EspnStandingsResponse {
  children?: Array<{
    name?: string;
    abbreviation?: string;
    standings?: {
      entries?: Array<{
        team?: { displayName?: string; abbreviation?: string };
        stats?: Array<{ name?: string; value?: number; displayValue?: string }>;
      }>;
    };
  }>;
}

function statNum(
  stats: Array<{ name?: string; value?: number; displayValue?: string }> | undefined,
  key: string,
): number | undefined {
  const found = stats?.find((s) => s.name === key);
  return typeof found?.value === "number" && Number.isFinite(found.value) ? found.value : undefined;
}

function statStr(
  stats: Array<{ name?: string; value?: number; displayValue?: string }> | undefined,
  key: string,
): string | undefined {
  const found = stats?.find((s) => s.name === key);
  return typeof found?.displayValue === "string" && found.displayValue.trim() ? found.displayValue.trim() : undefined;
}

async function hydrateNbaStandings(now: Date): Promise<void> {
  const prev = loadPreviousSnapshot(SNAPSHOTS, "nba");
  if (!prev) {
    console.warn("[standings:nba] No existe latest.json previo; omitido.");
    return;
  }
  const updatedAt = now.toISOString();
  const res = await fetch(
    "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=2027",
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`Standings NBA respondió HTTP ${res.status}`);
  const payload = (await res.json()) as EspnStandingsResponse;

  const seasonGames = await fetchNbaSeasonGames(prev, updatedAt);
  const realFormByTeam = computeFormFromGames(seasonGames);
  if (seasonGames.length > 0) {
    writeSeasonResultsFile(SNAPSHOTS, {
      league: "nba",
      season: String(prev.season),
      updatedAt,
      games: seasonGames,
    });
  }

  const rows: StandingRow[] = [];
  for (const child of payload.children ?? []) {
    const conf = child.name?.includes("East") ? "Este" : child.name?.includes("West") ? "Oeste" : child.name;
    for (const entry of child.standings?.entries ?? []) {
      const disp = entry.team?.displayName?.trim() ?? "";
      const abbr = entry.team?.abbreviation?.trim() ?? "";
      const matched = resolveSnapshotTeamByRaw(prev, disp, abbr);
      if (!matched) continue;

      const slug = matched.teamId.includes(".") ? matched.teamId.split(".").slice(1).join(".") : matched.teamId;
      const meta = divisionMetaForTeam("nba", slug);
      const won = Math.round(statNum(entry.stats, "wins") ?? 0);
      const lost = Math.round(statNum(entry.stats, "losses") ?? 0);
      const played = won + lost;
      const pf = Math.round(statNum(entry.stats, "pointsFor") ?? 0);
      const pa = Math.round(statNum(entry.stats, "pointsAgainst") ?? 0);
      const pct = statNum(entry.stats, "winPercent") ?? (played > 0 ? won / played : 0);
      const gb = statStr(entry.stats, "gamesBehind");
      const seedRaw = statNum(entry.stats, "playoffSeed");
      const streakRaw = statStr(entry.stats, "streak");
      const realForm = realFormByTeam.get(matched.teamId) ?? [];
      const form: StandingFormToken[] =
        realForm.length > 0
          ? realForm
          : streakRaw && /^[WL](\d+)$/i.test(streakRaw) && Number(streakRaw.slice(1)) >= 5
            ? Array.from({ length: 5 }, () => (streakRaw[0]!.toUpperCase() === "W" ? "W" : "L"))
            : [];
      const logoUrl = matched.logoUrl ?? getBzzoiroTeamEmblemUrl("nba", slug) ?? undefined;

      rows.push({
        teamId: matched.teamId,
        name: matched.name,
        shortName: matched.shortName,
        code: matched.code,
        ...(logoUrl ? { logoUrl } : {}),
        played,
        won,
        drawn: 0,
        lost,
        goalsFor: pf,
        goalsAgainst: pa,
        points: won * 2,
        winPct: Math.round(pct * 1000) / 1000,
        ...(gb ? { gamesBehind: gb } : {}),
        ...(typeof seedRaw === "number" && seedRaw > 0 ? { seed: Math.round(seedRaw) } : {}),
        conference: meta?.conference ?? conf,
        ...(meta ? { division: meta.division } : {}),
        ...(form.length > 0 ? { form } : {}),
      });
    }
  }

  const standings = finalizeConferenceStandings("nba", rows, { computeGamesBehind: true });
  const candidate = LeagueSnapshotSchema.parse({
    ...prev,
    updatedAt,
    standings,
  });
  const validation = validateLeagueSnapshotCandidate(candidate, prev, { nowMs: now.getTime() });
  if (!validation.ok) {
    throw new Error(validation.issues.map((i) => `${i.code}: ${i.message}`).join(" | "));
  }
  const { latestPath } = writeSnapshotFiles(SNAPSHOTS, validation.value ?? candidate, now.toISOString().slice(0, 10));
  const injRes = await collectAndWriteLeagueInjuries({
    snapshotsRoot: SNAPSHOTS,
    league: "nba",
    observedAtIso: updatedAt,
  });
  console.log(
    `[standings:nba] ${standings.length} equipos · ${seasonGames.length} resultados · ${injRes.entriesCount} bajas → ${latestPath}`,
  );
}

async function updateNflWithStandings(now: Date): Promise<void> {
  const dateStr = now.toISOString().slice(0, 10);
  const updatedAt = now.toISOString();
  const prev = loadPreviousSnapshot(SNAPSHOTS, "nfl");
  const csv = await fetchNflverseCsv();
  const norm = normalizeNflverseSchedule(csv, { season: 2026, referenceDate: dateStr });

  writeSeasonResultsFile(SNAPSHOTS, {
    league: "nfl",
    season: norm.seasonId,
    updatedAt,
    games: norm.allGames,
  });

  const candidate = buildNflSnapshot({
    seasonId: norm.seasonId,
    seasonLabel: norm.seasonLabel,
    periodLabel: norm.periodLabel,
    games: norm.activeWeekGames,
    teamRateInputs: norm.teamRateInputs,
    updatedAt,
    previousSnapshot: prev,
    seasonGames: norm.allGames,
    history: loadLeagueHistory("nfl", dateStr),
    modelVersion: "v2",
  });

  const validation = validateLeagueSnapshotCandidate(candidate, prev, { nowMs: now.getTime() });
  if (!validation.ok) {
    throw new Error(validation.issues.map((i) => `${i.code}: ${i.message}`).join(" | "));
  }
  const { latestPath } = writeSnapshotFiles(SNAPSHOTS, validation.value ?? candidate, dateStr);
  console.log(
    `[standings:nfl] ${candidate.games.length} partidos · ${candidate.standings?.length ?? 0} equipos en tabla → ${latestPath}`,
  );
}

async function buildAndPublishMlb(now: Date): Promise<void> {
  const dateStr = now.toISOString().slice(0, 10);
  const updatedAt = now.toISOString();
  const prev = loadPreviousSnapshot(SNAPSHOTS, "mlb");

  const season2026 = await fetchMlbSchedule({
    season: 2026,
    gameTypes: "R,F,D,L,W",
    seasonTag: "mlb-2026",
    observedAtIso: updatedAt,
  });
  const opening2027 = await fetchMlbSchedule({
    startDate: "2027-03-25",
    endDate: "2027-03-29",
    gameTypes: "R",
    seasonTag: "mlb-2027",
    observedAtIso: updatedAt,
  });

  const formMap = buildMlbRecentFormMap(season2026);
  const standings = await fetchMlbStandings(2026, formMap);
  const { snapshot, allPlayedForResults } = buildMlbLeagueSnapshot({
    seasonYear: 2026,
    seasonGames: season2026,
    upcomingGames: opening2027,
    standings,
    now,
    previousSnapshot: prev,
  });

  const validation = validateLeagueSnapshotCandidate(snapshot, prev, { nowMs: now.getTime() });
  if (!validation.ok) {
    throw new Error(validation.issues.map((i) => `${i.code}: ${i.message}`).join(" | "));
  }

  writeSeasonResultsFile(SNAPSHOTS, {
    league: "mlb",
    season: "mlb-2026",
    updatedAt,
    games: allPlayedForResults,
  });

  const { latestPath } = writeSnapshotFiles(SNAPSHOTS, validation.value ?? snapshot, dateStr);
  const injRes = await collectAndWriteLeagueInjuries({
    snapshotsRoot: SNAPSHOTS,
    league: "mlb",
    observedAtIso: updatedAt,
  });
  console.log(
    `[snapshot:mlb] ${snapshot.games.length} partidos (${Object.keys(snapshot.analyses).length} analizados) · ${snapshot.standings?.length ?? 0} equipos · ${allPlayedForResults.length} resultados 2026 · ${injRes.entriesCount} bajas → ${latestPath}`,
  );
}

async function main(): Promise<void> {
  loadRootEnvFiles(ROOT);
  const arg = process.argv.find((a) => a.startsWith("--leagues="))?.slice(10);
  const selected = new Set(arg ? arg.split(",").map((s) => s.trim()) : ["nfl", "nba", "nhl", "mlb"]);
  const now = new Date();
  let failures = 0;

  for (const league of selected) {
    try {
      if (league === "nfl") await updateNflWithStandings(now);
      else if (league === "nhl") await hydrateNhlStandings(now);
      else if (league === "nba") await hydrateNbaStandings(now);
      else if (league === "mlb") await buildAndPublishMlb(now);
      else throw new Error(`Liga no soportada: ${league}`);
    } catch (err) {
      failures += 1;
      console.error(`[us-standings:${league}] Error:`, err instanceof Error ? err.message : err);
    }
  }

  if (failures > 0) process.exitCode = 1;
}

await main();
