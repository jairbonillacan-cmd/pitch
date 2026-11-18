/**
 * Hidrata `data/snapshots/<league>/season-results.json` y la racha `form` (últimos 5)
 * en `data/snapshots/<league>/latest.json` usando los marcadores reales del scoreboard
 * público de ESPN para la temporada vigente (sin tocar el corpus canónico `data/history`).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { LeagueSnapshotSchema, type GameDTO, type LeagueSnapshot } from "@pitchlab/contracts";
import {
  fetchEspnLigaMxSeason,
  normalizeEspnLigaMx,
} from "./adapters/espn-liga-mx-schedule.js";
import {
  ESPN_SOCCER_SLUGS,
  fetchEspnSoccerEvents,
  type EspnSoccerLeague,
} from "./adapters/espn-soccer-results.js";
import { nameSimilarity } from "./adapters/football-data-merge.js";
import { resolveCanonicalTeam } from "./mappings.js";
import { writeSeasonResultsFile, type SeasonResultEntry } from "./pipeline.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..");
const SNAPSHOTS_ROOT = resolve(ROOT_DIR, "data", "snapshots");
const CACHE_DIR = resolve(ROOT_DIR, ".cache");

type FormToken = "W" | "D" | "L";

function applyFormToSnapshot(
  snapshot: LeagueSnapshot,
  entries: readonly SeasonResultEntry[],
): { updated: LeagueSnapshot; covered: number; total: number } {
  if (!snapshot.standings || snapshot.standings.length === 0) {
    return { updated: snapshot, covered: 0, total: 0 };
  }

  const cutoffMs = Date.parse(snapshot.updatedAt) || Date.now();
  const cutoffEndDayMs = cutoffMs + 36 * 3_600_000;
  const formByTeam = new Map<string, FormToken[]>();
  for (const row of snapshot.standings) {
    formByTeam.set(row.teamId, []);
  }

  const sorted = [...entries]
    .filter((m) => {
      const ms = Date.parse(m.startTime);
      return Number.isFinite(ms) ? ms <= cutoffEndDayMs : true;
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  for (const m of sorted) {
    const hForm = formByTeam.get(m.homeTeam);
    const aForm = formByTeam.get(m.awayTeam);
    const hTok: FormToken = m.homeScore > m.awayScore ? "W" : m.homeScore < m.awayScore ? "L" : "D";
    const aTok: FormToken = m.awayScore > m.homeScore ? "W" : m.awayScore < m.homeScore ? "L" : "D";
    if (hForm) hForm.push(hTok);
    if (aForm) aForm.push(aTok);
  }

  let covered = 0;
  const standings = snapshot.standings.map((row) => {
    const form = (formByTeam.get(row.teamId) ?? []).slice(-5);
    if (form.length > 0) covered += 1;
    return form.length > 0 ? { ...row, form } : row;
  });

  const updated = LeagueSnapshotSchema.parse({
    ...snapshot,
    standings,
  });

  return { updated, covered, total: standings.length };
}

function loadHistoryCurrentSeason(league: string, season: string): SeasonResultEntry[] {
  const histName = league === "laliga" ? "la-liga.jsonl" : `${league}.jsonl`;
  const histPath = resolve(ROOT_DIR, "data", "history", histName);
  if (!existsSync(histPath)) return [];
  const raw = readFileSync(histPath, "utf8").trim().split(/\r?\n/).slice(-900);
  const out: SeasonResultEntry[] = [];
  for (const line of raw) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as {
      id?: string;
      date?: string;
      season?: string;
      period?: number;
      stage?: string | null;
      homeTeam?: string;
      awayTeam?: string;
      homeScore?: number;
      awayScore?: number;
      neutralSite?: boolean;
    };
    if (!row.date || typeof row.homeScore !== "number" || typeof row.awayScore !== "number") continue;
    const matchesSeason = row.season === season || row.date >= "2026-07-01";
    if (!matchesSeason || !row.homeTeam || !row.awayTeam) continue;
    const normTeam = (t: string) =>
      t.startsWith("la-liga.") ? `laliga.${t.slice("la-liga.".length)}` : t;
    out.push({
      id: row.id ?? `${league}:${row.date}:${row.homeTeam}:${row.awayTeam}`,
      date: row.date,
      startTime: `${row.date}T12:00:00Z`,
      round: row.stage ?? (typeof row.period === "number" ? `Jornada ${row.period}` : null),
      homeTeam: normTeam(row.homeTeam),
      awayTeam: normTeam(row.awayTeam),
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      neutralSite: Boolean(row.neutralSite),
    });
  }
  return out;
}

async function hydrateLigaMx(): Promise<void> {
  const latestPath = resolve(SNAPSHOTS_ROOT, "liga-mx", "latest.json");
  const snapshot = LeagueSnapshotSchema.parse(JSON.parse(readFileSync(latestPath, "utf8")));
  const referenceDate = snapshot.updatedAt.slice(0, 10);

  const espnSeason = await fetchEspnLigaMxSeason({
    cacheDir: CACHE_DIR,
    referenceDate,
    horizonDays: 3,
  });
  const norm = normalizeEspnLigaMx(espnSeason, { referenceDate });

  const cutoffMs = Date.parse(snapshot.updatedAt) + 12 * 3_600_000;
  const finalGames: GameDTO[] = norm.allGames.filter(
    (g) => g.status === "final" && g.result && Date.parse(g.startTime) <= cutoffMs,
  );

  writeSeasonResultsFile(SNAPSHOTS_ROOT, {
    league: "liga-mx",
    season: String(snapshot.season),
    updatedAt: snapshot.updatedAt,
    games: finalGames,
  });

  const entries: SeasonResultEntry[] = finalGames.map((g) => ({
    id: String(g.id),
    date: g.startTime.slice(0, 10),
    startTime: g.startTime,
    round: g.round ?? null,
    homeTeam: String(g.home.id),
    awayTeam: String(g.away.id),
    homeScore: g.result!.home,
    awayScore: g.result!.away,
    neutralSite: Boolean(g.neutralSite),
  }));

  const { updated, covered, total } = applyFormToSnapshot(snapshot, entries);
  writeFileSync(latestPath, JSON.stringify(updated, null, 2) + "\n", "utf8");
  console.log(
    `[season-form] liga-mx: ${entries.length} partidos cerrados, forma en ${covered}/${total} clubes.`,
  );
}

function normalizeTokens(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveStandingTeamId(
  league: EspnSoccerLeague,
  snapshot: LeagueSnapshot,
  displayName: string,
  shortName?: string,
): string | null {
  const standings = snapshot.standings ?? [];
  const validIds = new Set(standings.map((r) => r.teamId));

  try {
    const canonical = resolveCanonicalTeam(league, displayName);
    const cid = String(canonical.id);
    if (validIds.has(cid)) return cid;
  } catch (err) {
    // Equipos recién ascendidos o variantes de nombre en ESPN: emparejar contra `snapshot.standings`
    void err;
  }

  const candNames = [displayName, shortName].filter((v): v is string => Boolean(v));
  try {
    const canonical = resolveCanonicalTeam(league, displayName);
    candNames.push(canonical.name, canonical.shortName, canonical.id.split(".")[1] ?? "");
  } catch (err) {
    void err;
  }

  let best: { teamId: string; score: number } | null = null;
  for (const row of standings) {
    const rowSlug = row.teamId.split(".")[1]?.replace(/-/g, " ") ?? "";
    const rowNorms = [row.name, row.shortName, rowSlug].map(normalizeTokens);
    let score = 0;
    for (const cand of candNames) {
      const cNorm = normalizeTokens(cand);
      if (!cNorm) continue;
      for (const rNorm of rowNorms) {
        if (rNorm === cNorm) score = Math.max(score, 1.0);
        else if (rNorm.includes(cNorm) || cNorm.includes(rNorm)) score = Math.max(score, 0.85);
      }
      score = Math.max(
        score,
        nameSimilarity(row.name, cand),
        nameSimilarity(row.shortName, cand),
        nameSimilarity(rowSlug, cand),
      );
    }
    if (score >= 0.4 && (!best || score > best.score)) {
      best = { teamId: row.teamId, score };
    }
  }
  return best?.teamId ?? null;
}

async function hydrateEuropeanLeague(league: EspnSoccerLeague): Promise<void> {
  const latestPath = resolve(SNAPSHOTS_ROOT, league, "latest.json");
  const snapshot = LeagueSnapshotSchema.parse(JSON.parse(readFileSync(latestPath, "utf8")));
  const referenceDate = snapshot.updatedAt.slice(0, 10);
  const cutoffMs = Date.parse(snapshot.updatedAt) + 12 * 3_600_000;

  const events = await fetchEspnSoccerEvents({
    league,
    cacheDir: CACHE_DIR,
    referenceDate,
    backDays: 95,
    horizonDays: 2,
  });

  const deduped = new Map<string, SeasonResultEntry>();
  for (const h of loadHistoryCurrentSeason(league, String(snapshot.season))) {
    const hSlug = h.homeTeam.split(".")[1]?.replace(/-/g, " ") ?? h.homeTeam;
    const aSlug = h.awayTeam.split(".")[1]?.replace(/-/g, " ") ?? h.awayTeam;
    const hId = resolveStandingTeamId(league, snapshot, hSlug) ?? h.homeTeam;
    const aId = resolveStandingTeamId(league, snapshot, aSlug) ?? h.awayTeam;
    deduped.set(`${h.date}|${hId}|${aId}`, {
      ...h,
      homeTeam: hId,
      awayTeam: aId,
    });
  }

  for (const ev of events) {
    const statusName = ev.status.type.name;
    const isFinal =
      statusName === "STATUS_FULL_TIME" ||
      statusName === "STATUS_FINAL" ||
      statusName === "STATUS_FINAL_AET" ||
      statusName === "STATUS_FINAL_PEN";
    if (!isFinal) continue;
    const evMs = Date.parse(ev.date);
    if (Number.isFinite(evMs) && evMs > cutoffMs) continue;

    const comp = ev.competitions[0]!;
    const homeC = comp.competitors.find((c) => c.homeAway === "home")!;
    const awayC = comp.competitors.find((c) => c.homeAway === "away")!;
    const hs = Number(homeC.score);
    const as = Number(awayC.score);
    if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;

    const homeId = resolveStandingTeamId(
      league,
      snapshot,
      homeC.team.displayName,
      homeC.team.shortDisplayName,
    );
    const awayId = resolveStandingTeamId(
      league,
      snapshot,
      awayC.team.displayName,
      awayC.team.shortDisplayName,
    );
    if (!homeId || !awayId) continue;
    const date = ev.date.slice(0, 10);
    deduped.set(`${date}|${homeId}|${awayId}`, {
      id: `${league}-espn-${ev.id}`,
      date,
      startTime: ev.date,
      round: null,
      homeTeam: homeId,
      awayTeam: awayId,
      homeScore: hs,
      awayScore: as,
      neutralSite: false,
    });
  }

  for (const g of snapshot.games) {
    if (g.status !== "final" || !g.result) continue;
    const date = g.startTime.slice(0, 10);
    deduped.set(`${date}|${g.home.id}|${g.away.id}`, {
      id: String(g.id),
      date,
      startTime: g.startTime,
      round: g.round ?? null,
      homeTeam: String(g.home.id),
      awayTeam: String(g.away.id),
      homeScore: g.result.home,
      awayScore: g.result.away,
      neutralSite: Boolean(g.neutralSite),
    });
  }

  const matches = [...deduped.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const outPath = resolve(SNAPSHOTS_ROOT, league, "season-results.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        league,
        season: String(snapshot.season),
        updatedAt: snapshot.updatedAt,
        matches,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const { updated, covered, total } = applyFormToSnapshot(snapshot, matches);
  writeFileSync(latestPath, JSON.stringify(updated, null, 2) + "\n", "utf8");
  console.log(
    `[season-form] ${league}: ${matches.length} partidos cerrados, forma en ${covered}/${total} clubes.`,
  );
}

async function main(): Promise<void> {
  await hydrateLigaMx();
  for (const league of Object.keys(ESPN_SOCCER_SLUGS) as EspnSoccerLeague[]) {
    await hydrateEuropeanLeague(league);
  }
}

main().catch((err) => {
  console.error("[season-form] Error:", err);
  process.exit(1);
});
