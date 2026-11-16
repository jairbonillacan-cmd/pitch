import fs from "node:fs";
import path from "node:path";
import {
  asLeagueId,
  computeDataAgeHours,
  DATA_FRESHNESS_THRESHOLDS_HOURS,
  DataHealthReportSchema,
  evaluateFreshnessStatus,
  LeagueInjuriesFileSchema,
  LeagueSnapshotSchema,
  LINEUPS_COLLECTION_ENABLED,
  summarizeDataHealthCells,
  type DataHealthReport,
  type DataHealthWorkflowStatus,
  type LeagueDataHealthRow,
  type LeagueDataTypeCell,
} from "@pitchlab/contracts";
import { PRODUCT_LEAGUES, resolveSnapshotsRoot, type ProductLeague } from "./snapshots";

const LEAGUE_LABELS: Record<ProductLeague, string> = {
  "liga-mx": "Liga MX",
  "premier-league": "Premier League",
  laliga: "LaLiga",
  bundesliga: "Bundesliga",
  "serie-a": "Serie A",
  "ligue-1": "Ligue 1",
  nfl: "NFL",
  nba: "NBA",
  nhl: "NHL",
};

const SNAPSHOT_ONLY_LEAGUES = new Set<ProductLeague>(["nba", "nhl"]);

const APP_LEAGUE_TO_V3: Record<ProductLeague, string> = {
  nfl: "nfl",
  "premier-league": "epl",
  laliga: "laliga",
  bundesliga: "bundesliga",
  "serie-a": "serie-a",
  "ligue-1": "ligue-1",
  "liga-mx": "liga-mx",
  nba: "nba",
  nhl: "nhl",
};

function resolveRepoRoot(): string {
  const snapshotsRoot = resolveSnapshotsRoot();
  return path.resolve(snapshotsRoot, "../..");
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch (err) {
    void err;
    return null;
  }
}

interface QuotesLatestFile {
  updated_at_utc?: string;
  ticks?: Array<{
    event_id?: string;
    book?: string;
    source_id?: string;
    ts_captured?: string;
  }>;
}

interface LiveOutlookMini {
  league?: string;
  markets?: Array<{
    market?: {
      book?: string;
      tsCaptured?: string;
    } | null;
  }>;
}

interface LiveSnapshotMini {
  generated_at?: string;
  outlooks_meta?: {
    generated_at_utc?: string;
  };
  outlooks?: LiveOutlookMini[];
}

function defaultWorkflows(): DataHealthWorkflowStatus[] {
  return [
    {
      workflowId: "odds-refresh",
      label: "Actualización continua de momios",
      workflowFile: ".github/workflows/odds-refresh.yml",
      status: "pending_credentials",
      lastRunAtUtc: null,
      lastSuccessAtUtc: null,
      durationMs: null,
      cadenceLabel: "Cada 3–6 h entre semana · cada 30–60 min en previas de partido",
      lastError: null,
    },
    {
      workflowId: "pre-mvp-snapshot",
      label: "Calendario, resultados y bajas",
      workflowFile: ".github/workflows/pre-mvp-snapshot.yml",
      status: "ok",
      lastRunAtUtc: null,
      lastSuccessAtUtc: null,
      durationMs: null,
      cadenceLabel: "Diario 11:00 UTC + 4 cortes extra en días de partido",
      lastError: null,
    },
  ];
}

/**
 * Construye el reporte en vivo de «Salud de datos» para la Consola del Fundador:
 * fusiona el último estado persistido de workflows/incidentes (`data/health/data-health.json`)
 * con la antigüedad real al instante (`nowMs`) de cada liga y tipo de dato.
 */
export function loadServerDataHealthReport(nowMs: number = Date.now()): DataHealthReport {
  const repoRoot = resolveRepoRoot();
  const snapshotsRoot = path.join(repoRoot, "data", "snapshots");
  const persistedPath = path.join(repoRoot, "data", "health", "data-health.json");
  const quotesPath = path.join(repoRoot, "data", "odds_timeseries", "quotes_latest.json");
  const liveSnapPath = path.join(
    repoRoot,
    "packages",
    "spacetime",
    "data",
    "live_matchday_v3_snapshot.json",
  );

  const persistedRaw = readJsonIfExists<unknown>(persistedPath);
  const persistedParsed = persistedRaw ? DataHealthReportSchema.safeParse(persistedRaw) : null;
  const persisted = persistedParsed?.success ? persistedParsed.data : null;

  const persistedByLeague = new Map<string, LeagueDataHealthRow>(
    (persisted?.leagues ?? []).map((row) => [row.league, row]),
  );

  const quotesFile = readJsonIfExists<QuotesLatestFile>(quotesPath);
  const liveSnap = readJsonIfExists<LiveSnapshotMini>(liveSnapPath);

  const latestOddsByV3 = new Map<
    string,
    { updatedAtUtc: string; sourceLabel: string; count: number }
  >();

  for (const tick of quotesFile?.ticks ?? []) {
    if (!tick.event_id || !tick.ts_captured) continue;
    const parts = tick.event_id.split(":");
    const rawLeague = (parts[1] ?? "").toLowerCase();
    const v3League = (APP_LEAGUE_TO_V3 as Record<string, string>)[rawLeague] ?? rawLeague;
    if (!v3League) continue;
    const prev = latestOddsByV3.get(v3League);
    const nextCount = (prev?.count ?? 0) + 1;
    if (!prev || Date.parse(tick.ts_captured) > Date.parse(prev.updatedAtUtc)) {
      latestOddsByV3.set(v3League, {
        updatedAtUtc: tick.ts_captured,
        sourceLabel: tick.book ?? tick.source_id ?? "the_odds_api",
        count: nextCount,
      });
    } else {
      latestOddsByV3.set(v3League, { ...prev, count: nextCount });
    }
  }

  for (const outlook of liveSnap?.outlooks ?? []) {
    if (!outlook.league) continue;
    for (const m of outlook.markets ?? []) {
      const mkt = m.market;
      if (!mkt?.tsCaptured) continue;
      const prev = latestOddsByV3.get(outlook.league);
      const nextCount = (prev?.count ?? 0) + 1;
      if (!prev || Date.parse(mkt.tsCaptured) > Date.parse(prev.updatedAtUtc)) {
        latestOddsByV3.set(outlook.league, {
          updatedAtUtc: mkt.tsCaptured,
          sourceLabel: mkt.book ?? "pinnacle",
          count: nextCount,
        });
      } else {
        latestOddsByV3.set(outlook.league, { ...prev, count: nextCount });
      }
    }
  }

  const leagues: LeagueDataHealthRow[] = PRODUCT_LEAGUES.map((leagueKey) => {
    const league = asLeagueId(leagueKey);
    const leagueLabel = LEAGUE_LABELS[leagueKey];
    const prevRow = persistedByLeague.get(leagueKey);

    // 1. Calendario y resultados
    const latestFile = path.join(snapshotsRoot, leagueKey, "latest.json");
    const snapRaw = readJsonIfExists<unknown>(latestFile);
    const snapParsed = snapRaw ? LeagueSnapshotSchema.safeParse(snapRaw) : null;
    let calendarioCell: LeagueDataTypeCell;
    if (snapParsed?.success) {
      const snap = snapParsed.data;
      const hasOverdueUnfinished = snap.games.some((g) => {
        if (g.status === "final") return false;
        const ko = Date.parse(g.startTime);
        return Number.isFinite(ko) && nowMs - ko > 4 * 3_600_000;
      });
      const maxHours = hasOverdueUnfinished
        ? DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.matchdayPendingResultHours
        : DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.staleHours;
      const warnHours = hasOverdueUnfinished
        ? Math.max(6, maxHours - 3)
        : DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.warningHours;
      const ageHours = computeDataAgeHours(snap.updatedAt, nowMs);
      const prevErr = prevRow?.cells.calendario.lastError ?? null;
      calendarioCell = {
        dataType: "calendario",
        status: evaluateFreshnessStatus({
          ageHours,
          warningHours: warnHours,
          staleHours: maxHours,
          hasError: Boolean(prevErr),
        }),
        updatedAtUtc: snap.updatedAt,
        ageHours,
        maxHours,
        sourceLabel: snap.source || "espn",
        recordsCount: snap.games.length,
        ...(hasOverdueUnfinished
          ? { note: "Partidos iniciados hace >4 h pendientes de marcador final" }
          : {}),
        lastError: prevErr,
      };
    } else {
      calendarioCell = {
        dataType: "calendario",
        status: "error",
        updatedAtUtc: null,
        ageHours: null,
        maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.staleHours,
        sourceLabel: "sin archivo válido",
        recordsCount: 0,
        lastError: prevRow?.cells.calendario.lastError ?? {
          message: "No se pudo leer latest.json",
          failingSinceUtc: new Date(nowMs).toISOString(),
        },
      };
    }

    // 2. Bajas y lesiones
    const injuriesFile = path.join(snapshotsRoot, leagueKey, "injuries.json");
    const injRaw = readJsonIfExists<unknown>(injuriesFile);
    const injParsed = injRaw ? LeagueInjuriesFileSchema.safeParse(injRaw) : null;
    let bajasCell: LeagueDataTypeCell;
    if (injParsed?.success) {
      const inj = injParsed.data;
      const ageHours = computeDataAgeHours(inj.observedAt, nowMs);
      const prevErr = prevRow?.cells.bajas.lastError ?? null;
      const noPublicFeed = inj.coverageStatus === "no_public_feed";
      bajasCell = {
        dataType: "bajas",
        status: evaluateFreshnessStatus({
          ageHours,
          warningHours: DATA_FRESHNESS_THRESHOLDS_HOURS.bajas.warningHours,
          staleHours: DATA_FRESHNESS_THRESHOLDS_HOURS.bajas.staleHours,
          pendingSource:
            noPublicFeed &&
            (ageHours ?? 0) <= DATA_FRESHNESS_THRESHOLDS_HOURS.bajas.staleHours,
          hasError: Boolean(prevErr),
        }),
        updatedAtUtc: inj.observedAt,
        ageHours,
        maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.bajas.staleHours,
        sourceLabel: inj.source,
        recordsCount: inj.entries.length,
        ...(noPublicFeed
          ? { note: "Sin parte médico público abierto; la ficha lo informa sin inventar." }
          : {}),
        lastError: prevErr,
      };
    } else if (SNAPSHOT_ONLY_LEAGUES.has(leagueKey)) {
      bajasCell = {
        dataType: "bajas",
        status: prevRow?.cells.bajas.lastError ? "error" : "pending_source",
        updatedAtUtc: null,
        ageHours: null,
        maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.bajas.staleHours,
        sourceLabel: "solo snapshot (latest.json)",
        recordsCount: 0,
        note: "Liga cubierta por snapshot (latest.json); sin pipeline separado de bajas todavía.",
        lastError: prevRow?.cells.bajas.lastError ?? null,
      };
    } else {
      bajasCell = {
        dataType: "bajas",
        status: "pending_source",
        updatedAtUtc: null,
        ageHours: null,
        maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.bajas.staleHours,
        sourceLabel: "pendiente de primera corrida",
        recordsCount: 0,
        note: "Sin archivo injuries.json generado todavía.",
        lastError: prevRow?.cells.bajas.lastError ?? null,
      };
    }

    // 3. Momios
    const v3League = APP_LEAGUE_TO_V3[leagueKey];
    const oddsEntry = latestOddsByV3.get(v3League);
    const prevOddsErr = prevRow?.cells.momios.lastError ?? null;
    let momiosCell: LeagueDataTypeCell;
    if (oddsEntry) {
      const ageHours = computeDataAgeHours(oddsEntry.updatedAtUtc, nowMs);
      momiosCell = {
        dataType: "momios",
        status: evaluateFreshnessStatus({
          ageHours,
          warningHours: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.warningHours,
          staleHours: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.staleHours,
          hasError: Boolean(prevOddsErr),
        }),
        updatedAtUtc: oddsEntry.updatedAtUtc,
        ageHours,
        maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.staleHours,
        sourceLabel: oddsEntry.sourceLabel,
        recordsCount: oddsEntry.count,
        lastError: prevOddsErr,
      };
    } else if (SNAPSHOT_ONLY_LEAGUES.has(leagueKey)) {
      momiosCell = {
        dataType: "momios",
        status: prevOddsErr ? "error" : "pending_source",
        updatedAtUtc: null,
        ageHours: null,
        maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.staleHours,
        sourceLabel: "solo snapshot (latest.json)",
        recordsCount: 0,
        note: "Liga cubierta por snapshot (latest.json); aún sin captura de momios en LIVE_LEAGUES.",
        lastError: prevOddsErr,
      };
    } else {
      const fallbackOddsTs =
        liveSnap?.outlooks_meta?.generated_at_utc ?? liveSnap?.generated_at ?? null;
      const fallbackAge = computeDataAgeHours(fallbackOddsTs, nowMs);
      momiosCell = {
        dataType: "momios",
        status: prevOddsErr
          ? "error"
          : fallbackAge !== null &&
              fallbackAge > DATA_FRESHNESS_THRESHOLDS_HOURS.momios.staleHours
            ? "stale"
            : "pending_source",
        updatedAtUtc: fallbackOddsTs,
        ageHours: fallbackAge,
        maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.staleHours,
        sourceLabel: "bzzoiro / the_odds_api / betfair",
        recordsCount: 0,
        note: "Sin captura legal < 72 h activa (configura THE_ODDS_API_KEY o Betfair en Actions).",
        lastError: prevOddsErr,
      };
    }

    // 4. Alineaciones (preparada pero APAGADA)
    const alineacionesCell: LeagueDataTypeCell = {
      dataType: "alineaciones",
      status: LINEUPS_COLLECTION_ENABLED ? "pending_source" : "disabled",
      updatedAtUtc: null,
      ageHours: null,
      maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.alineaciones.staleHours,
      sourceLabel: "Apagado (sin fuente verificada)",
      recordsCount: 0,
      note: "Ranura lista; permanecerá apagada hasta contar con una fuente oficial verificada.",
      lastError: null,
    };

    return {
      league,
      leagueLabel,
      cells: {
        calendario: calendarioCell,
        bajas: bajasCell,
        momios: momiosCell,
        alineaciones: alineacionesCell,
      },
    };
  });

  const workflows = persisted?.workflows?.length ? persisted.workflows : defaultWorkflows();
  const activeIncidents = persisted?.activeIncidents ?? [];
  const counts = summarizeDataHealthCells(leagues);
  const hasFailedWorkflow = workflows.some((w) => w.status === "failed");
  const hasCriticalIncident = activeIncidents.some((i) => i.severity === "critical");

  const overallStatus: DataHealthReport["overallStatus"] =
    counts.staleOrErrorCells > 0 || hasFailedWorkflow || hasCriticalIncident
      ? "critical"
      : counts.warningCells > 0 || activeIncidents.length > 0
        ? "degraded"
        : "ok";

  return {
    schemaVersion: 1,
    generatedAtUtc: new Date(nowMs).toISOString(),
    overallStatus,
    thresholdsHours: {
      calendario: DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.staleHours,
      calendarioMatchday:
        DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.matchdayPendingResultHours,
      bajas: DATA_FRESHNESS_THRESHOLDS_HOURS.bajas.staleHours,
      momios: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.staleHours,
      momiosHardExpire: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.appHardExpireHours,
      alineaciones: DATA_FRESHNESS_THRESHOLDS_HOURS.alineaciones.staleHours,
    },
    workflows,
    leagues,
    activeIncidents,
  };
}
