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

async function hydrateNhlStandings(now: Date): Promise<void> {
  const prev = loadPreviousSnapshot(SNAPSHOTS, "nhl");
  if (!prev) {
    console.warn("[standings:nhl] No existe latest.json previo; omitido.");
    return;
  }
  const cfg = readProviderConfigs().nhl_web;
  const res = await fetch(`${cfg.baseUrl}/standings/now`, {
    headers: cfg.headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`NHL Web API respondió HTTP ${res.status}`);
  const payload = (await res.json()) as { standings?: NhlStandingsItem[] };

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
    const form = nhlStreakForm(item);
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
    updatedAt: now.toISOString(),
    standings,
  });

  const validation = validateLeagueSnapshotCandidate(candidate, prev, { nowMs: now.getTime() });
  if (!validation.ok) {
    throw new Error(validation.issues.map((i) => `${i.code}: ${i.message}`).join(" | "));
  }
  const { latestPath } = writeSnapshotFiles(SNAPSHOTS, validation.value ?? candidate, now.toISOString().slice(0, 10));
  console.log(`[standings:nhl] ${standings.length} equipos publicados en ${latestPath}`);
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
  const res = await fetch(
    "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=2027",
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`Standings NBA respondió HTTP ${res.status}`);
  const payload = (await res.json()) as EspnStandingsResponse;

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
      const form: StandingFormToken[] =
        streakRaw && /^[WL](\d+)$/i.test(streakRaw) && Number(streakRaw.slice(1)) >= 5
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
    updatedAt: now.toISOString(),
    standings,
  });
  const validation = validateLeagueSnapshotCandidate(candidate, prev, { nowMs: now.getTime() });
  if (!validation.ok) {
    throw new Error(validation.issues.map((i) => `${i.code}: ${i.message}`).join(" | "));
  }
  const { latestPath } = writeSnapshotFiles(SNAPSHOTS, validation.value ?? candidate, now.toISOString().slice(0, 10));
  console.log(`[standings:nba] ${standings.length} equipos publicados en ${latestPath}`);
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
