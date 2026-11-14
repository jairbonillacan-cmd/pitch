/**
 * Parte 1 · Programador multi-régimen de captura de momios.
 *
 * Clasifica cada liga activa según la cercanía al próximo saque inicial en `data/snapshots/<league>/latest.json`
 * y decide si toca consultar las fuentes permitidas en esta corrida según la última captura válida.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LeagueSnapshot } from "@pitchlab/contracts";
import type { OddsSnapshotRow } from "@pitchlab/spacetime";
import type { CanonicalLeague } from "../mappings.js";
import { parseStrictIsoMs } from "../validation/snapshot-validator.js";

const ODDS_LEAGUE_TO_APP: Readonly<Record<string, CanonicalLeague>> = {
  MEX: "liga-mx",
  E0: "premier-league",
  SP1: "laliga",
  D1: "bundesliga",
  I1: "serie-a",
  F1: "ligue-1",
  NFL: "nfl",
  "liga-mx": "liga-mx",
  epl: "premier-league",
  "premier-league": "premier-league",
  laliga: "laliga",
  bundesliga: "bundesliga",
  "serie-a": "serie-a",
  "ligue-1": "ligue-1",
  nfl: "nfl",
};

export const ACTIVE_APP_LEAGUES: readonly CanonicalLeague[] = [
  "nfl",
  "premier-league",
  "laliga",
  "bundesliga",
  "serie-a",
  "ligue-1",
  "liga-mx",
];

export type OddsCadenceRegime =
  | "prekickoff_1h"
  | "prekickoff_4h"
  | "matchday_8h"
  | "matchday_24h"
  | "early_week"
  | "dormant";

export type OddsRefreshWindowMode = "auto" | "all" | "matchday" | "prekickoff";

export interface RegimePolicy {
  readonly regime: Exclude<OddsCadenceRegime, "dormant">;
  /** Techo superior de minutos antes del inicio para pertenecer a este régimen. */
  readonly maxMinutesToKickoff: number;
  /** Intervalo mínimo entre capturas por liga en modo automático (`auto`). */
  readonly minRefreshIntervalMinutes: number;
  readonly descriptionEs: string;
}

export const ODDS_CADENCE_REGIMES: readonly RegimePolicy[] = [
  {
    regime: "prekickoff_1h",
    maxMinutesToKickoff: 75,
    minRefreshIntervalMinutes: 15,
    descriptionEs: "Última hora antes del inicio (alimenta el congelado T-60m)",
  },
  {
    regime: "prekickoff_4h",
    maxMinutesToKickoff: 270,
    minRefreshIntervalMinutes: 55,
    descriptionEs: "Ventana previa de 4.5 h antes del inicio",
  },
  {
    regime: "matchday_8h",
    maxMinutesToKickoff: 540,
    minRefreshIntervalMinutes: 115,
    descriptionEs: "Día de partido (hasta 9 h antes del saque inicial)",
  },
  {
    regime: "matchday_24h",
    maxMinutesToKickoff: 1440,
    minRefreshIntervalMinutes: 240,
    descriptionEs: "Víspera de partido (9 a 24 h antes del saque inicial)",
  },
  {
    regime: "early_week",
    maxMinutesToKickoff: 10_080,
    minRefreshIntervalMinutes: 720,
    descriptionEs: "Apertura semanal (1 a 7 días antes del partido)",
  },
];

export interface UpcomingLeagueMatchInfo {
  readonly gameId: string;
  readonly league: CanonicalLeague;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly kickoffUtc: string;
  readonly kickoffMs: number;
  readonly minutesToKickoff: number;
}

export interface LeagueCadenceDecision {
  readonly league: CanonicalLeague;
  readonly regime: OddsCadenceRegime;
  readonly shouldFetch: boolean;
  readonly reason: string;
  readonly upcomingCount: number;
  readonly nextKickoffUtc: string | null;
  readonly minutesToNextKickoff: number | null;
  readonly lastCapturedAtUtc: string | null;
  readonly minutesSinceLastCapture: number | null;
  readonly minRefreshIntervalMinutes: number | null;
}

export interface CadencePlan {
  readonly evaluatedAtUtc: string;
  readonly windowMode: OddsRefreshWindowMode;
  readonly decisions: readonly LeagueCadenceDecision[];
  readonly leaguesToFetch: readonly CanonicalLeague[];
  readonly upcomingMatches: readonly UpcomingLeagueMatchInfo[];
}

export function classifyMinutesToKickoff(minutesToKickoff: number | null): {
  readonly regime: OddsCadenceRegime;
  readonly minRefreshIntervalMinutes: number | null;
} {
  if (minutesToKickoff === null || !Number.isFinite(minutesToKickoff) || minutesToKickoff < -15) {
    return { regime: "dormant", minRefreshIntervalMinutes: null };
  }
  for (const policy of ODDS_CADENCE_REGIMES) {
    if (minutesToKickoff <= policy.maxMinutesToKickoff) {
      return {
        regime: policy.regime,
        minRefreshIntervalMinutes: policy.minRefreshIntervalMinutes,
      };
    }
  }
  return { regime: "dormant", minRefreshIntervalMinutes: null };
}

export function loadUpcomingMatchesFromSnapshots(
  snapshotsRoot: string,
  nowMs: number = Date.now(),
  leagues: readonly CanonicalLeague[] = ACTIVE_APP_LEAGUES,
): UpcomingLeagueMatchInfo[] {
  const results: UpcomingLeagueMatchInfo[] = [];

  for (const league of leagues) {
    const latestPath = resolve(snapshotsRoot, league, "latest.json");
    if (!existsSync(latestPath)) continue;

    try {
      const raw = JSON.parse(readFileSync(latestPath, "utf8")) as LeagueSnapshot;
      if (!Array.isArray(raw.games)) continue;

      for (const game of raw.games) {
        if (game.status === "final") continue;
        const kickoffMs = parseStrictIsoMs(game.startTime);
        if (kickoffMs === null) continue;
        const minutesToKickoff = (kickoffMs - nowMs) / 60_000;
        if (minutesToKickoff < -15) continue;

        results.push({
          gameId: game.id,
          league,
          homeTeam: game.home.name,
          awayTeam: game.away.name,
          kickoffUtc: new Date(kickoffMs).toISOString(),
          kickoffMs,
          minutesToKickoff,
        });
      }
    } catch (err) {
      void err;
    }
  }

  return results.sort((a, b) => a.kickoffMs - b.kickoffMs);
}

function latestCaptureByLeague(
  existingTicks: readonly OddsSnapshotRow[],
): Map<CanonicalLeague, { iso: string; ms: number }> {
  const map = new Map<CanonicalLeague, { iso: string; ms: number }>();
  for (const tick of existingTicks) {
    const appLeague = ODDS_LEAGUE_TO_APP[tick.league];
    if (!appLeague) continue;
    const ms = parseStrictIsoMs(tick.ts_captured, { requireTimezone: true });
    if (ms === null) continue;
    const prev = map.get(appLeague);
    if (!prev || ms > prev.ms) {
      map.set(appLeague, { iso: tick.ts_captured, ms });
    }
  }
  return map;
}

export function buildOddsCadencePlan(params: {
  readonly snapshotsRoot: string;
  readonly existingTicks?: readonly OddsSnapshotRow[];
  readonly windowMode?: OddsRefreshWindowMode;
  readonly force?: boolean;
  readonly nowMs?: number;
  readonly leagues?: readonly CanonicalLeague[];
}): CadencePlan {
  const nowMs = params.nowMs ?? Date.now();
  const windowMode = params.windowMode ?? "auto";
  const leagues = params.leagues ?? ACTIVE_APP_LEAGUES;
  const upcomingMatches = loadUpcomingMatchesFromSnapshots(params.snapshotsRoot, nowMs, leagues);
  const captureMap = latestCaptureByLeague(params.existingTicks ?? []);

  const decisions: LeagueCadenceDecision[] = [];

  for (const league of leagues) {
    const leagueUpcoming = upcomingMatches.filter((m) => m.league === league);
    const nextMatch = leagueUpcoming[0] ?? null;
    const minutesToNextKickoff = nextMatch ? Math.round(nextMatch.minutesToKickoff) : null;
    const { regime, minRefreshIntervalMinutes } = classifyMinutesToKickoff(
      nextMatch ? nextMatch.minutesToKickoff : null,
    );

    const lastCapture = captureMap.get(league) ?? null;
    const minutesSinceLastCapture =
      lastCapture !== null ? Math.max(0, Math.round((nowMs - lastCapture.ms) / 60_000)) : null;

    let shouldFetch = false;
    let reason = "";

    if (params.force) {
      shouldFetch = true;
      reason = "Captura forzada manualmente (--force).";
    } else if (regime === "dormant" && windowMode !== "all") {
      shouldFetch = false;
      reason =
        leagueUpcoming.length === 0
          ? "Sin partidos programados en el snapshot actual."
          : `Próximo partido a ${minutesToNextKickoff} min (> 7 días).`;
    } else if (windowMode === "all") {
      shouldFetch = leagueUpcoming.length > 0;
      reason = shouldFetch
        ? `Ventana completa ('all') con ${leagueUpcoming.length} partidos próximos.`
        : "Sin partidos próximos por jugar.";
    } else if (windowMode === "prekickoff") {
      const inPrekickoff =
        regime === "prekickoff_1h" || regime === "prekickoff_4h" || regime === "matchday_8h";
      if (!inPrekickoff) {
        shouldFetch = false;
        reason = `Fuera de ventana previa (< 9 h); régimen actual '${regime}'.`;
      } else if (
        minutesSinceLastCapture !== null &&
        minRefreshIntervalMinutes !== null &&
        minutesSinceLastCapture < minRefreshIntervalMinutes
      ) {
        shouldFetch = false;
        reason = `Captura vigente hace ${minutesSinceLastCapture} min (< ${minRefreshIntervalMinutes} min para '${regime}').`;
      } else {
        shouldFetch = true;
        reason = `Partido en ${minutesToNextKickoff} min (régimen '${regime}').`;
      }
    } else if (windowMode === "matchday") {
      const inMatchday =
        regime === "prekickoff_1h" ||
        regime === "prekickoff_4h" ||
        regime === "matchday_8h" ||
        regime === "matchday_24h";
      if (!inMatchday) {
        shouldFetch = false;
        reason = `Sin partidos en las próximas 24 h (régimen '${regime}').`;
      } else if (
        minutesSinceLastCapture !== null &&
        minRefreshIntervalMinutes !== null &&
        minutesSinceLastCapture < minRefreshIntervalMinutes
      ) {
        shouldFetch = false;
        reason = `Captura vigente hace ${minutesSinceLastCapture} min (< ${minRefreshIntervalMinutes} min para '${regime}').`;
      } else {
        shouldFetch = true;
        reason = `Día de partido (${minutesToNextKickoff} min al saque; régimen '${regime}').`;
      }
    } else {
      // windowMode === "auto"
      if (
        minutesSinceLastCapture !== null &&
        minRefreshIntervalMinutes !== null &&
        minutesSinceLastCapture < minRefreshIntervalMinutes
      ) {
        shouldFetch = false;
        reason = `Captura vigente hace ${minutesSinceLastCapture} min (objetivo ${minRefreshIntervalMinutes} min en '${regime}').`;
      } else {
        shouldFetch = true;
        reason =
          lastCapture === null
            ? `Sin captura previa en las últimas 72 h (régimen '${regime}').`
            : `Toca refrescar: última captura hace ${minutesSinceLastCapture} min >= ${minRefreshIntervalMinutes} min ('${regime}').`;
      }
    }

    decisions.push({
      league,
      regime,
      shouldFetch,
      reason,
      upcomingCount: leagueUpcoming.length,
      nextKickoffUtc: nextMatch?.kickoffUtc ?? null,
      minutesToNextKickoff,
      lastCapturedAtUtc: lastCapture?.iso ?? null,
      minutesSinceLastCapture,
      minRefreshIntervalMinutes,
    });
  }

  return {
    evaluatedAtUtc: new Date(nowMs).toISOString(),
    windowMode,
    decisions,
    leaguesToFetch: decisions.filter((d) => d.shouldFetch).map((d) => d.league),
    upcomingMatches,
  };
}
