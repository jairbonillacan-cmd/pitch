import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GameDTO, LeagueSnapshot } from "@pitchlab/contracts";
import {
  extractNflSeasonRows,
  fetchNflverseCsv,
  normalizeNflverseSchedule,
} from "./adapters/nflverse.js";
import { loadRootEnvFiles } from "./env.js";
import { loadLeagueHistory, loadPriorMatches } from "./prior-season.js";
import {
  fetchOpenFootballBundesliga,
  fetchOpenFootballLaliga,
  fetchOpenFootballLigue1,
  fetchOpenFootballPl,
  fetchOpenFootballSerieA,
  normalizeOpenFootballBundesliga,
  normalizeOpenFootballLaliga,
  normalizeOpenFootballLigue1,
  normalizeOpenFootballPremierLeague,
  normalizeOpenFootballSerieA,
  type NormalizedOpenFootballSeason,
} from "./adapters/openfootball.js";
import {
  FOOTBALL_DATA_COMPETITIONS,
  fetchFootballDataCompetition,
  fetchFootballDataPl,
  normalizeFootballDataPremierLeague,
} from "./adapters/football-data.js";
import { mergeFootballDataIntoSeason } from "./adapters/football-data-merge.js";
import { fetchEspnLigaMxSeason, normalizeEspnLigaMx } from "./adapters/espn-liga-mx-schedule.js";
import { espnEventsToFootballData, fetchEspnSoccerEvents } from "./adapters/espn-soccer-results.js";
import { collectAndWriteLeagueInjuries } from "./adapters/injuries.js";
import { evaluatePreparedLineupsSlot } from "./adapters/lineups.js";
import {
  evaluateAndReportDataHealth,
  LEAGUE_DISPLAY_LABELS,
  type RuntimeIncidentInput,
} from "./health/health-monitor.js";
import type { CanonicalLeague } from "./mappings.js";
import { ACTIVE_APP_LEAGUES } from "./odds/cadence-scheduler.js";
import {
  buildFootballSnapshot,
  buildNflSnapshot,
  loadPreviousSnapshot,
  writeSnapshotFiles,
} from "./pipeline.js";
import {
  parseStrictIsoMs,
  validateLeagueSnapshotCandidate,
} from "./validation/snapshot-validator.js";

/**
 * Respaldo sin clave: resultados de ESPN fusionados como si vinieran de football-data.org.
 * Sin esto, la jornada pasada se quedaba «por jugar» hasta que openfootball cargara marcadores.
 */
async function withEspnResults(
  league: keyof typeof FOOTBALL_DATA_COMPETITIONS,
  season: NormalizedOpenFootballSeason,
  referenceDate: string,
  cacheDir: string,
): Promise<{ season: NormalizedOpenFootballSeason; source: string }> {
  try {
    const events = await fetchEspnSoccerEvents({ league, cacheDir, referenceDate });
    const merged = mergeFootballDataIntoSeason(season, espnEventsToFootballData(events, season), { referenceDate });
    console.log(
      `[snapshot] ${league}: ${merged.report.matched} partidos emparejados con ESPN, ${merged.report.updatedResults} resultados nuevos; jornada activa ${merged.season.activeMatchday}`,
    );
    return { season: merged.season, source: "openfootball+espn" };
  } catch (err) {
    console.warn(
      `[snapshot] ${league}: ESPN no disponible (${err instanceof Error ? err.message : String(err)}); se usa solo openfootball.`,
    );
    return { season, source: "openfootball" };
  }
}

/**
 * Resultados al día para una liga de openfootball: si hay clave de football-data.org se
 * completan marcadores, estados y horas reales; si falla, se sigue con openfootball.
 */
async function withFootballData(
  league: keyof typeof FOOTBALL_DATA_COMPETITIONS,
  season: NormalizedOpenFootballSeason,
  referenceDate: string,
  cacheDir: string,
): Promise<{ season: NormalizedOpenFootballSeason; source: string }> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  if (!apiKey) return withEspnResults(league, season, referenceDate, cacheDir);
  try {
    const raw = await fetchFootballDataCompetition({
      apiKey,
      code: FOOTBALL_DATA_COMPETITIONS[league],
      cacheFilePath: resolve(cacheDir, `football-data-${FOOTBALL_DATA_COMPETITIONS[league].toLowerCase()}.json`),
    });
    const merged = mergeFootballDataIntoSeason(season, raw, { referenceDate });
    console.log(
      `[snapshot] ${league}: ${merged.report.matched} partidos emparejados con football-data.org, ${merged.report.unmatched} sin emparejar, ${merged.report.updatedResults} resultados nuevos`,
    );
    return { season: merged.season, source: "openfootball+football-data" };
  } catch (err) {
    console.warn(
      `[snapshot] ${league}: football-data.org no disponible (${err instanceof Error ? err.message : String(err)}); se intenta ESPN.`,
    );
    return withEspnResults(league, season, referenceDate, cacheDir);
  }
}

/**
 * Si la jornada activa aún no tiene partidos finalizados (p. ej. tras cerrarse la jornada del fin
 * de semana), incluye los resultados de la jornada inmediata anterior para que la sección
 * «Resultados» de la liga seleccionada muestre siempre los marcadores más recientes al día de hoy.
 */
function withRecentFinishedRound(
  activeRoundGames: readonly GameDTO[],
  allGames: readonly GameDTO[],
): GameDTO[] {
  if (activeRoundGames.some((g) => g.status === "final")) {
    return [...activeRoundGames];
  }
  const activeWeek = activeRoundGames[0]?.week ?? 0;
  const finishedWeeks = [
    ...new Set(
      allGames
        .filter((g) => g.status === "final" && (g.week ?? 0) < activeWeek)
        .map((g) => g.week ?? 0),
    ),
  ].sort((a, b) => b - a);
  const lastFinishedWeek = finishedWeeks[0];
  if (!lastFinishedWeek) return [...activeRoundGames];
  const recentFinished = allGames
    .filter((g) => g.week === lastFinishedWeek && g.status === "final")
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  return [...recentFinished, ...activeRoundGames];
}

type IngestModeToken = "all" | "schedule" | "injuries" | "lineups";

function parseIngestCliArgs(argv: readonly string[]): {
  runSchedule: boolean;
  runInjuries: boolean;
  runLineups: boolean;
  matchdayOnly: boolean;
} {
  let rawMode = process.env.SNAPSHOT_MODE?.trim() || "all";
  let matchdayOnly = process.env.SNAPSHOT_MATCHDAY_ONLY === "1";

  for (const arg of argv) {
    if (arg === "--matchday-only") {
      matchdayOnly = true;
    } else if (arg.startsWith("--mode=")) {
      rawMode = arg.slice("--mode=".length).trim() || "all";
    }
  }

  const tokens = new Set(
    rawMode
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean) as IngestModeToken[],
  );
  const isAll = tokens.has("all") || tokens.size === 0;

  return {
    runSchedule: isAll || tokens.has("schedule"),
    runInjuries: isAll || tokens.has("injuries"),
    runLineups: isAll || tokens.has("lineups"),
    matchdayOnly,
  };
}

function isLeagueActiveInMatchdayWindow(
  snapshotsRoot: string,
  league: CanonicalLeague,
  nowMs: number,
): boolean {
  const latestPath = resolve(snapshotsRoot, league, "latest.json");
  if (!existsSync(latestPath)) return true;
  try {
    const snap = JSON.parse(readFileSync(latestPath, "utf8")) as LeagueSnapshot;
    const updatedMs = parseStrictIsoMs(snap.updatedAt, { requireTimezone: true });
    if (updatedMs === null || nowMs - updatedMs > 24 * 3_600_000) return true;

    const windowStart = nowMs - 24 * 3_600_000;
    const windowEnd = nowMs + 36 * 3_600_000;
    return snap.games.some((g) => {
      const startMs = parseStrictIsoMs(g.startTime);
      if (startMs === null) return false;
      if (g.status !== "final" && startMs < nowMs) return true;
      return startMs >= windowStart && startMs <= windowEnd;
    });
  } catch (err) {
    void err;
    return true;
  }
}

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..");
const SNAPSHOTS_ROOT = resolve(ROOT_DIR, "data", "snapshots");
const CACHE_DIR = resolve(import.meta.dirname, "..", ".cache");

async function publishValidatedLeagueSnapshot(params: {
  league: CanonicalLeague;
  leagueLabel: string;
  dateStr: string;
  nowMs: number;
  previousSnapshot: LeagueSnapshot | null | undefined;
  buildCandidate: () => Promise<LeagueSnapshot>;
  runtimeIncidents: RuntimeIncidentInput[];
}): Promise<boolean> {
  try {
    const candidate = await params.buildCandidate();
    const validation = validateLeagueSnapshotCandidate(candidate, params.previousSnapshot, {
      nowMs: params.nowMs,
    });
    if (!validation.ok) {
      const reason = validation.issues
        .slice(0, 3)
        .map((i) => `${i.code}: ${i.message}`)
        .join(" | ");
      console.error(
        `[snapshot] ${params.leagueLabel}: rechazado por validación Parte 3; se conserva el snapshot anterior (${reason}).`,
      );
      params.runtimeIncidents.push({
        incidentKey: `validation::calendario::${params.league}`,
        kind: "validation_rejected",
        severity: "critical",
        targetLabel: `${params.leagueLabel} · Calendario y resultados`,
        league: params.league,
        dataType: "calendario",
        workflowId: "pre-mvp-snapshot",
        message: reason,
      });
      return false;
    }

    const files = writeSnapshotFiles(SNAPSHOTS_ROOT, validation.value!, params.dateStr);
    console.log(
      `[snapshot] ${params.leagueLabel} (${validation.value!.periodLabel}): ${validation.value!.games.length} partidos -> ${files.latestPath}`,
    );
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[snapshot] ${params.leagueLabel}: falla de fuente (${msg}); se conserva el snapshot anterior.`,
    );
    params.runtimeIncidents.push({
      incidentKey: `source::pre-mvp-snapshot::${params.league}`,
      kind: "source_failure",
      severity: "critical",
      targetLabel: `${params.leagueLabel} · Calendario y resultados`,
      league: params.league,
      dataType: "calendario",
      workflowId: "pre-mvp-snapshot",
      message: msg,
    });
    return false;
  }
}

async function main() {
  const startedAt = performance.now();
  loadRootEnvFiles(ROOT_DIR);
  const { runSchedule, runInjuries, runLineups, matchdayOnly } = parseIngestCliArgs(
    process.argv.slice(2),
  );

  const now = new Date();
  const dateStr = (process.env.SNAPSHOT_DATE ?? now.toISOString().slice(0, 10)).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`SNAPSHOT_DATE inválida (${dateStr}); se esperaba formato AAAA-MM-DD.`);
  }
  const updatedAt = process.env.SNAPSHOT_TIMESTAMP ?? now.toISOString();
  const nowMs = parseStrictIsoMs(updatedAt, { requireTimezone: true }) ?? now.getTime();
  const modelVersion: "v1" | "v2" = process.env.MODEL_VERSION === "v1" ? "v1" : "v2";

  const targetLeagues = matchdayOnly
    ? ACTIVE_APP_LEAGUES.filter((lg) => isLeagueActiveInMatchdayWindow(SNAPSHOTS_ROOT, lg, nowMs))
    : [...ACTIVE_APP_LEAGUES];
  const targetSet = new Set<CanonicalLeague>(targetLeagues);

  console.log(
    `[snapshot] fecha=${dateStr} (${updatedAt}) · modelo=${modelVersion} · schedule=${runSchedule} · bajas=${runInjuries} · alineaciones=${runLineups} (apagadas) · ligas=${targetLeagues.length}/${ACTIVE_APP_LEAGUES.length}`,
  );

  const runtimeIncidents: RuntimeIncidentInput[] = [];
  let scheduleSuccesses = 0;
  let scheduleAttempts = 0;

  if (runSchedule) {
    // 1. NFL (nflverse CC-BY 4.0)
    if (targetSet.has("nfl")) {
      scheduleAttempts += 1;
      const prevNfl = loadPreviousSnapshot(SNAPSHOTS_ROOT, "nfl");
      const ok = await publishValidatedLeagueSnapshot({
        league: "nfl",
        leagueLabel: "NFL",
        dateStr,
        nowMs,
        previousSnapshot: prevNfl,
        runtimeIncidents,
        buildCandidate: async () => {
          const nflCsv = await fetchNflverseCsv();
          const normNfl = normalizeNflverseSchedule(nflCsv, {
            season: 2026,
            referenceDate: dateStr,
          });
          // La temporada anterior en NFL empeoró el backtest (0.6515 vs 0.6468): apagada por defecto.
          const priorNfl =
            process.env.MODEL_NFL_PRIOR === "1" ? extractNflSeasonRows(nflCsv, 2025) : [];
          return buildNflSnapshot({
            seasonId: normNfl.seasonId,
            seasonLabel: normNfl.seasonLabel,
            periodLabel: normNfl.periodLabel,
            games: normNfl.activeWeekGames,
            teamRateInputs: normNfl.teamRateInputs,
            updatedAt,
            previousSnapshot: prevNfl,
            seasonGames: normNfl.allGames,
            priorRows: priorNfl,
            history: loadLeagueHistory("nfl", dateStr),
            modelVersion,
          });
        },
      });
      if (ok) scheduleSuccesses += 1;
    }

    // 2. Premier League (football-data.org si existe FOOTBALL_DATA_API_KEY, si no openfootball CC0 + ESPN)
    if (targetSet.has("premier-league")) {
      scheduleAttempts += 1;
      const prevPl = loadPreviousSnapshot(SNAPSHOTS_ROOT, "premier-league");
      const ok = await publishValidatedLeagueSnapshot({
        league: "premier-league",
        leagueLabel: "Premier League",
        dateStr,
        nowMs,
        previousSnapshot: prevPl,
        runtimeIncidents,
        buildCandidate: async () => {
          const footballDataKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
          const normPl = footballDataKey
            ? normalizeFootballDataPremierLeague(
                await fetchFootballDataPl({
                  apiKey: footballDataKey,
                  cacheFilePath: resolve(CACHE_DIR, "football-data-pl.json"),
                }),
                { referenceDate: dateStr },
              )
            : (
                await withEspnResults(
                  "premier-league",
                  normalizeOpenFootballPremierLeague(await fetchOpenFootballPl(), {
                    referenceDate: dateStr,
                  }),
                  dateStr,
                  CACHE_DIR,
                )
              ).season;
          const priorPl = loadPriorMatches("premier-league", dateStr);
          return buildFootballSnapshot({
            league: "premier-league",
            leagueName: "Premier League",
            seasonId: normPl.seasonId,
            seasonLabel: normPl.seasonLabel,
            periodLabel: normPl.periodLabel,
            games: withRecentFinishedRound(normPl.activeRoundGames, normPl.allGames),
            teamRateInputs: normPl.teamRateInputs,
            updatedAt,
            source: footballDataKey ? "football-data" : "openfootball+espn",
            previousSnapshot: prevPl,
            seasonGames: normPl.allGames,
            priorMatches: priorPl,
            history: loadLeagueHistory("premier-league", dateStr),
            modelVersion,
          });
        },
      });
      if (ok) scheduleSuccesses += 1;
    }

    // 3. LaLiga (openfootball CC0 + football-data/ESPN)
    if (targetSet.has("laliga")) {
      scheduleAttempts += 1;
      const prevLl = loadPreviousSnapshot(SNAPSHOTS_ROOT, "laliga");
      const ok = await publishValidatedLeagueSnapshot({
        league: "laliga",
        leagueLabel: "LaLiga",
        dateStr,
        nowMs,
        previousSnapshot: prevLl,
        runtimeIncidents,
        buildCandidate: async () => {
          const { season: normLl, source: sourceLl } = await withFootballData(
            "laliga",
            normalizeOpenFootballLaliga(await fetchOpenFootballLaliga(), {
              referenceDate: dateStr,
            }),
            dateStr,
            CACHE_DIR,
          );
          const priorLl = loadPriorMatches("laliga", dateStr);
          return buildFootballSnapshot({
            league: "laliga",
            leagueName: "LaLiga",
            seasonId: normLl.seasonId,
            seasonLabel: normLl.seasonLabel,
            periodLabel: normLl.periodLabel,
            games: withRecentFinishedRound(normLl.activeRoundGames, normLl.allGames),
            teamRateInputs: normLl.teamRateInputs,
            updatedAt,
            source: sourceLl,
            previousSnapshot: prevLl,
            seasonGames: normLl.allGames,
            priorMatches: priorLl,
            history: loadLeagueHistory("laliga", dateStr),
            modelVersion,
          });
        },
      });
      if (ok) scheduleSuccesses += 1;
    }

    // 4. Bundesliga, Serie A y Ligue 1 (openfootball CC0 + football-data/ESPN)
    const extraLeagues = [
      {
        league: "bundesliga" as const,
        name: "Bundesliga",
        fetchSeason: fetchOpenFootballBundesliga,
        normalize: normalizeOpenFootballBundesliga,
      },
      {
        league: "serie-a" as const,
        name: "Serie A",
        fetchSeason: fetchOpenFootballSerieA,
        normalize: normalizeOpenFootballSerieA,
      },
      {
        league: "ligue-1" as const,
        name: "Ligue 1",
        fetchSeason: fetchOpenFootballLigue1,
        normalize: normalizeOpenFootballLigue1,
      },
    ];

    for (const entry of extraLeagues) {
      if (!targetSet.has(entry.league)) continue;
      scheduleAttempts += 1;
      const previous = loadPreviousSnapshot(SNAPSHOTS_ROOT, entry.league);
      const ok = await publishValidatedLeagueSnapshot({
        league: entry.league,
        leagueLabel: entry.name,
        dateStr,
        nowMs,
        previousSnapshot: previous,
        runtimeIncidents,
        buildCandidate: async () => {
          const { season: normalized, source: entrySource } = await withFootballData(
            entry.league,
            entry.normalize(await entry.fetchSeason(), { referenceDate: dateStr }),
            dateStr,
            CACHE_DIR,
          );
          return buildFootballSnapshot({
            league: entry.league,
            leagueName: entry.name,
            seasonId: normalized.seasonId,
            seasonLabel: normalized.seasonLabel,
            periodLabel: normalized.periodLabel,
            games: withRecentFinishedRound(normalized.activeRoundGames, normalized.allGames),
            teamRateInputs: normalized.teamRateInputs,
            updatedAt,
            source: entrySource,
            previousSnapshot: previous,
            seasonGames: normalized.allGames,
            priorMatches: loadPriorMatches(entry.league, dateStr),
            history: loadLeagueHistory(entry.league, dateStr),
            modelVersion,
          });
        },
      });
      if (ok) scheduleSuccesses += 1;
    }

    // 5. Liga MX: calendario y resultados de la temporada actual desde ESPN (sin clave).
    if (targetSet.has("liga-mx")) {
      scheduleAttempts += 1;
      const prevMx = loadPreviousSnapshot(SNAPSHOTS_ROOT, "liga-mx");
      const ok = await publishValidatedLeagueSnapshot({
        league: "liga-mx",
        leagueLabel: "Liga MX",
        dateStr,
        nowMs,
        previousSnapshot: prevMx,
        runtimeIncidents,
        buildCandidate: async () => {
          const espnSeason = await fetchEspnLigaMxSeason({
            cacheDir: CACHE_DIR,
            referenceDate: dateStr,
          });
          const normMx = normalizeEspnLigaMx(espnSeason, { referenceDate: dateStr });
          const priorMx = loadPriorMatches("liga-mx", dateStr);
          return buildFootballSnapshot({
            league: "liga-mx",
            leagueName: "Liga MX",
            seasonId: normMx.seasonId,
            seasonLabel: normMx.seasonLabel,
            periodLabel: normMx.periodLabel,
            games: normMx.activeRoundGames,
            teamRateInputs: normMx.teamRateInputs,
            updatedAt,
            source: "espn",
            previousSnapshot: prevMx,
            seasonGames: normMx.allGames,
            priorMatches: priorMx,
            history: loadLeagueHistory("liga-mx", dateStr),
            modelVersion,
          });
        },
      });
      if (ok) scheduleSuccesses += 1;
    }
  }

  // Parte 2 · Bajas y lesiones (fuentes públicas permitidas; si no hay parte público, queda vacío honesto)
  if (runInjuries) {
    for (const league of targetLeagues) {
      const label = LEAGUE_DISPLAY_LABELS[league] ?? league;
      const injRes = await collectAndWriteLeagueInjuries({
        snapshotsRoot: SNAPSHOTS_ROOT,
        league,
        observedAtIso: updatedAt,
      });
      if (!injRes.ok) {
        console.warn(
          `[bajas] ${label}: se conserva injuries.json anterior (${injRes.errorMessage ?? "falla desconocida"}).`,
        );
        runtimeIncidents.push({
          incidentKey:
            injRes.issues.length > 0
              ? `validation::bajas::${league}`
              : `source::bajas::${league}`,
          kind: injRes.issues.length > 0 ? "validation_rejected" : "source_failure",
          severity: "warning",
          targetLabel: `${label} · Bajas y lesiones`,
          league,
          dataType: "bajas",
          workflowId: "pre-mvp-snapshot",
          message: injRes.errorMessage ?? "Error al actualizar bajas.",
        });
      } else {
        console.log(
          `[bajas] ${label}: ${injRes.entriesCount} bajas/dudas (${injRes.coverageStatus} · ${injRes.source})`,
        );
      }
    }
  }

  // Parte 2 · Alineaciones confirmadas (ranura preparada pero APAGADA hasta verificar fuente oficial)
  if (runLineups) {
    const slotChecks = targetLeagues.map((lg) => evaluatePreparedLineupsSlot(lg, updatedAt));
    console.log(
      `[alineaciones] Ranura verificada en ${slotChecks.length} ligas · enabled=${slotChecks[0]?.enabled ?? false} (apagada sin red).`,
    );
  }

  const durationMs = performance.now() - startedAt;
  const clearScopes: Array<"schedule" | "injuries"> = [];
  if (runSchedule && !matchdayOnly) clearScopes.push("schedule");
  if (runInjuries && !matchdayOnly) clearScopes.push("injuries");

  const allScheduleFailed =
    runSchedule && scheduleAttempts > 0 && scheduleSuccesses === 0;
  const wfStatus = allScheduleFailed
    ? "failed"
    : runtimeIncidents.length > 0
      ? "degraded"
      : "ok";

  const health = await evaluateAndReportDataHealth({
    rootDir: ROOT_DIR,
    nowIso: updatedAt,
    clearTransientScopes: clearScopes,
    runtimeIncidents,
    workflowUpdate: {
      workflowId: "pre-mvp-snapshot",
      status: wfStatus,
      runAtUtc: updatedAt,
      durationMs,
      errorMessage: runtimeIncidents[0]?.message ?? null,
    },
  });

  console.log(
    `[snapshot] Salud de datos=${health.report.overallStatus} · incidencias=${health.report.activeIncidents.length} · correo enviado=${health.emailSent} · duración=${Math.round(durationMs)} ms`,
  );

  if (allScheduleFailed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[snapshot] Error fatal:", err);
  process.exit(1);
});
