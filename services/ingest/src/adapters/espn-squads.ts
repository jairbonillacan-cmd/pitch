/**
 * Adaptador de plantillas y estadísticas de jugadores de fútbol (API pública ESPN).
 * Normaliza plantillas completas por equipo, métricas de temporada y picks individuales
 * (`computePlayerApplicablePicks`), guardándolas en `data/snapshots/<league>/squads.json`.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  LeagueIdSchema,
  LeagueSquadsFileSchema,
  asTeamId,
  computePlayerApplicablePicks,
  findNationalTeamDef,
  isNationalCompetition,
  slugifyPlayerName,
  type LeagueSnapshot,
  type LeagueSquadsFile,
  type PlayerPositionGroup,
  type SquadPlayerEntry,
  type SquadPlayerStats,
  type TeamSquadEntry,
} from "@pitchlab/contracts";
import { resolveCanonicalTeam, type TeamLeague } from "../mappings.js";
import { resolveSafeEspnCachePath } from "./espn-liga-mx-schedule.js";

export const SOCCER_SQUAD_LEAGUES: Readonly<Record<string, readonly string[]>> = {
  "liga-mx": ["mex.1"],
  "premier-league": ["eng.1"],
  laliga: ["esp.1"],
  bundesliga: ["ger.1"],
  "serie-a": ["ita.1"],
  "ligue-1": ["fra.1"],
  "copa-del-mundo": ["fifa.world"],
  "uefa-nations": ["uefa.nations"],
  "concacaf-nations": ["concacaf.nations.league"],
  "copa-america": ["conmebol.america"],
  eurocopa: ["uefa.euro"],
  "copa-oro": ["concacaf.gold"],
  "copa-africana": ["caf.nations"],
  "copa-asiatica": ["afc.asian.cup"],
};

interface EspnTeamsListPayload {
  sports?: Array<{
    leagues?: Array<{
      teams?: Array<{
        team?: {
          id?: string;
          displayName?: string;
        };
      }>;
    }>;
  }>;
}

interface EspnRosterPayload {
  coach?: Array<{
    firstName?: string;
    lastName?: string;
  }>;
  athletes?: Array<{
    id?: string;
    fullName?: string;
    displayName?: string;
    shortName?: string;
    jersey?: string;
    age?: number;
    height?: number;
    weight?: number;
    citizenship?: string;
    citizenshipCountry?: {
      abbreviation?: string;
    };
    position?: {
      name?: string;
      abbreviation?: string;
    };
    statistics?: {
      splits?: {
        categories?: Array<{
          stats?: Array<{
            name?: string;
            value?: number;
          }>;
        }>;
      };
    };
  }>;
}

const COUNTRY_NAME_ES: Readonly<Record<string, string>> = {
  England: "Inglaterra",
  Spain: "España",
  France: "Francia",
  Germany: "Alemania",
  Italy: "Italia",
  Mexico: "México",
  Brazil: "Brasil",
  Argentina: "Argentina",
  Portugal: "Portugal",
  Netherlands: "Países Bajos",
  "United States": "Estados Unidos",
  USA: "Estados Unidos",
  Colombia: "Colombia",
  Uruguay: "Uruguay",
  Chile: "Chile",
  Ecuador: "Ecuador",
  Peru: "Perú",
  Paraguay: "Paraguay",
  Venezuela: "Venezuela",
  Belgium: "Bélgica",
  Switzerland: "Suiza",
  Croatia: "Croacia",
  Denmark: "Dinamarca",
  Norway: "Noruega",
  Sweden: "Suecia",
  Poland: "Polonia",
  Scotland: "Escocia",
  Wales: "Gales",
  Ireland: "Irlanda",
  Morocco: "Marruecos",
  Senegal: "Senegal",
  Nigeria: "Nigeria",
  Egypt: "Egipto",
  Japan: "Japón",
  "South Korea": "Corea del Sur",
  Australia: "Australia",
  Canada: "Canadá",
  "Costa Rica": "Costa Rica",
  Panama: "Panamá",
  Honduras: "Honduras",
  Jamaica: "Jamaica",
};

function translateNationalityEs(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (COUNTRY_NAME_ES[trimmed]) return COUNTRY_NAME_ES[trimmed]!;
  const national = findNationalTeamDef(trimmed);
  return national?.nameEs ?? trimmed;
}

function mapPositionGroup(abbr?: string, name?: string): {
  group: PlayerPositionGroup;
  label: string;
} {
  const a = (abbr ?? "").trim().toUpperCase();
  const n = (name ?? "").trim().toLowerCase();
  if (a === "G" || a === "GK" || n.includes("goalkeeper")) {
    return { group: "GK", label: "Portero" };
  }
  if (a === "D" || a === "DEF" || n.includes("defender")) {
    return { group: "DEF", label: "Defensa" };
  }
  if (a === "M" || a === "MID" || n.includes("midfield")) {
    return { group: "MID", label: "Mediocampista" };
  }
  if (a === "F" || a === "FWD" || n.includes("forward") || n.includes("striker")) {
    return { group: "FWD", label: "Delantero" };
  }
  return { group: "MID", label: "Mediocampista" };
}

function extractPlayerStats(athlete: NonNullable<EspnRosterPayload["athletes"]>[number]): SquadPlayerStats {
  const byName = new Map<string, number>();
  for (const cat of athlete.statistics?.splits?.categories ?? []) {
    for (const s of cat.stats ?? []) {
      if (s.name && typeof s.value === "number" && Number.isFinite(s.value)) {
        byName.set(s.name, Math.max(0, Math.round(s.value)));
      }
    }
  }
  const get = (key: string) => byName.get(key) ?? 0;

  return {
    appearances: get("appearances"),
    subIns: get("subIns"),
    goals: get("totalGoals"),
    assists: get("goalAssists"),
    shots: get("totalShots"),
    shotsOnTarget: get("shotsOnTarget"),
    foulsCommitted: get("foulsCommitted"),
    foulsSuffered: get("foulsSuffered"),
    yellowCards: get("yellowCards"),
    redCards: get("redCards"),
    offsides: get("offsides"),
    saves: get("saves"),
    shotsFaced: get("shotsFaced"),
    goalsConceded: get("goalsConceded"),
  };
}

const POSITION_ORDER: Readonly<Record<PlayerPositionGroup, number>> = {
  GK: 0,
  DEF: 1,
  MID: 2,
  FWD: 3,
};

async function fetchCachedJson(url: string, cacheFile: string): Promise<unknown | null> {
  if (existsSync(cacheFile)) {
    try {
      return JSON.parse(readFileSync(cacheFile, "utf8"));
    } catch {
      // Cache dañado se re-descarga
    }
  }
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const payload = await res.json();
  writeFileSync(cacheFile, JSON.stringify(payload), "utf8");
  return payload;
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

export async function ingestLeagueSquads(options: {
  league: string;
  snapshot: LeagueSnapshot;
  cacheDir: string;
  dateStr: string;
}): Promise<LeagueSquadsFile | null> {
  const { league, snapshot, cacheDir, dateStr } = options;
  const espnSlugs = SOCCER_SQUAD_LEAGUES[league];
  if (!espnSlugs || espnSlugs.length === 0) return null;

  const teamTargetById = new Map<string, { id: string; slug: string; name: string; attackMult: number }>();
  const allRates = Object.values(snapshot.teamRates);
  const meanAdjFor =
    allRates.length > 0
      ? allRates.reduce((sum, r) => sum + (r.adjustedFor || 1.3), 0) / allRates.length
      : 1.3;

  const addTeamRef = (id: string, name: string) => {
    const slug = id.includes(".") ? id.split(".").slice(1).join(".") : id;
    if (!teamTargetById.has(id)) {
      const rate = snapshot.teamRates[id];
      const attackMult =
        rate && meanAdjFor > 0
          ? Math.min(1.22, Math.max(0.82, rate.adjustedFor / meanAdjFor))
          : 1;
      teamTargetById.set(id, { id, slug, name, attackMult });
    }
  };

  for (const row of snapshot.standings ?? []) addTeamRef(row.teamId, row.name);
  for (const g of snapshot.games) {
    addTeamRef(g.home.id, g.home.name);
    addTeamRef(g.away.id, g.away.name);
  }
  for (const r of allRates) addTeamRef(r.teamId, r.name);

  if (teamTargetById.size === 0) return null;

  const leagueMeanCap = isNationalCompetition(league) ? 48 : 40;
  const espnTeamsToFetch: Array<{
    espnSlug: string;
    espnTeamId: string;
    canonical: { id: string; slug: string; name: string; attackMult: number };
  }> = [];
  const seenCanonicalIds = new Set<string>();

  for (const espnSlug of espnSlugs) {
    const slugCache = resolveSafeEspnCachePath(cacheDir, join("espn-squads", espnSlug));
    mkdirSync(slugCache, { recursive: true });
    const listFile = resolveSafeEspnCachePath(slugCache, `teams-${dateStr}.json`);
    const listPayload = (await fetchCachedJson(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnSlug}/teams?limit=300`,
      listFile,
    )) as EspnTeamsListPayload | null;
    if (!listPayload) continue;

    for (const entry of listPayload.sports?.[0]?.leagues?.[0]?.teams ?? []) {
      const espnTeamId = entry.team?.id?.trim();
      const rawName = entry.team?.displayName?.trim();
      if (!espnTeamId || !rawName || !/^\d{1,12}$/.test(espnTeamId)) continue;

      let resolvedId: string;
      try {
        resolvedId = resolveCanonicalTeam(league as TeamLeague, rawName).id;
      } catch (err) {
        void err;
        continue;
      }

      const target = teamTargetById.get(resolvedId);
      if (!target || seenCanonicalIds.has(target.id)) continue;
      seenCanonicalIds.add(target.id);
      espnTeamsToFetch.push({ espnSlug, espnTeamId, canonical: target });
      if (espnTeamsToFetch.length >= leagueMeanCap) break;
    }
  }

  const teamEntries: TeamSquadEntry[] = [];
  const observedAt = new Date().toISOString();

  await runPool(espnTeamsToFetch, 8, async (item) => {
    const slugCache = resolveSafeEspnCachePath(cacheDir, join("espn-squads", item.espnSlug));
    const rosterFile = resolveSafeEspnCachePath(slugCache, `roster-${item.espnTeamId}-${dateStr}.json`);
    const roster = (await fetchCachedJson(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${item.espnSlug}/teams/${item.espnTeamId}/roster`,
      rosterFile,
    )) as EspnRosterPayload | null;
    if (!roster || !Array.isArray(roster.athletes) || roster.athletes.length === 0) return;

    const latestCoach = roster.coach?.[0];
    const coachName =
      latestCoach && (latestCoach.firstName || latestCoach.lastName)
        ? `${latestCoach.firstName ?? ""} ${latestCoach.lastName ?? ""}`.trim()
        : null;

    const seenSlugs = new Set<string>();
    const players: SquadPlayerEntry[] = [];

    for (const athlete of roster.athletes) {
      const rawName = (athlete.fullName ?? athlete.displayName ?? "").trim();
      if (!rawName) continue;
      const pid = (athlete.id ?? rawName).trim();
      let pSlug = slugifyPlayerName(rawName);
      if (seenSlugs.has(pSlug)) pSlug = `${pSlug}-${pid.slice(-4)}`;
      seenSlugs.add(pSlug);

      const pos = mapPositionGroup(athlete.position?.abbreviation, athlete.position?.name);
      const stats = extractPlayerStats(athlete);
      const heightCm =
        typeof athlete.height === "number" && athlete.height > 30 && athlete.height < 96
          ? Math.round(athlete.height * 2.54)
          : null;
      const weightKg =
        typeof athlete.weight === "number" && athlete.weight > 70 && athlete.weight < 350
          ? Math.round(athlete.weight * 0.453592)
          : null;

      const basePlayer = {
        id: pid,
        slug: pSlug,
        name: rawName,
        shortName: (athlete.shortName ?? rawName).trim(),
        jersey: athlete.jersey?.trim() || null,
        positionGroup: pos.group,
        positionLabel: pos.label,
        age:
          typeof athlete.age === "number" && athlete.age >= 15 && athlete.age <= 50
            ? Math.round(athlete.age)
            : null,
        heightCm,
        weightKg,
        nationality: translateNationalityEs(athlete.citizenship),
        nationalityCode: athlete.citizenshipCountry?.abbreviation?.trim() || null,
        stats,
      };

      const candidatePicks = computePlayerApplicablePicks(basePlayer, {
        attackMultiplier: item.canonical.attackMult,
      });

      players.push({
        ...basePlayer,
        candidatePicks,
      });
    }

    if (players.length === 0) return;

    players.sort((a, b) => {
      if (b.stats.appearances !== a.stats.appearances) {
        return b.stats.appearances - a.stats.appearances;
      }
      const contribA = a.stats.goals + a.stats.assists;
      const contribB = b.stats.goals + b.stats.assists;
      if (contribB !== contribA) return contribB - contribA;
      return POSITION_ORDER[a.positionGroup] - POSITION_ORDER[b.positionGroup];
    });

    teamEntries.push({
      teamId: asTeamId(item.canonical.id),
      teamSlug: item.canonical.slug,
      teamName: item.canonical.name,
      coachName,
      updatedAt: observedAt,
      players,
    });
  });

  if (teamEntries.length === 0) return null;

  teamEntries.sort((a, b) => a.teamName.localeCompare(b.teamName, "es-MX"));

  return LeagueSquadsFileSchema.parse({
    schemaVersion: 1,
    league: LeagueIdSchema.parse(league),
    seasonLabel: snapshot.seasonLabel,
    observedAt,
    teams: teamEntries,
  });
}

export function writeLeagueSquadsFile(
  snapshotsRoot: string,
  squadsFile: LeagueSquadsFile,
): string {
  const leagueDir = join(snapshotsRoot, squadsFile.league);
  mkdirSync(leagueDir, { recursive: true });
  const dest = join(leagueDir, "squads.json");
  const tmp = join(leagueDir, `squads.json.tmp.${process.pid}`);
  writeFileSync(tmp, JSON.stringify(squadsFile, null, 2) + "\n", "utf8");
  renameSync(tmp, dest);
  return dest;
}
