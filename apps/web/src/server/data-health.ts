import fs from "node:fs";
import path from "node:path";
import {
  asLeagueId,
  computeDataAgeHours,
  DATA_FRESHNESS_THRESHOLDS_HOURS,
  DataHealthReportSchema,
  evaluateFreshnessStatus,
  getLeagueCapability,
  isLeagueHealthyForUi,
  isTier1League,
  LeagueInjuriesFileSchema,
  LeagueSnapshotSchema,
  LINEUPS_COLLECTION_ENABLED,
  summarizeDataHealthCells,
  type DataHealthReport,
  type DataHealthWorkflowStatus,
  type LeagueDataHealthRow,
  type LeagueDataTypeCell,
  type LeagueTier,
  type UiVisibilityPolicy,
} from "@pitchlab/contracts";
import {
  LEAGUE_LABELS,
  PRODUCT_LEAGUES,
  resolveSnapshotsRoot,
  type ProductLeague,
} from "./snapshots";

const V3_LIVE_SNAPSHOT_LEAGUES = new Set<ProductLeague>([
  "liga-mx",
  "premier-league",
  "laliga",
  "bundesliga",
  "serie-a",
  "ligue-1",
  "nfl",
]);

const APP_LEAGUE_TO_V3: Record<ProductLeague, string> = Object.fromEntries(
  PRODUCT_LEAGUES.map((lg) => [lg, lg === "premier-league" ? "epl" : lg]),
) as Record<ProductLeague, string>;

export interface LeagueUiVisibilityEntry {
  readonly league: ProductLeague;
  readonly tier: LeagueTier;
  readonly policy: UiVisibilityPolicy;
  readonly visibleInUi: boolean;
  readonly calendarioStatus: LeagueDataTypeCell["status"];
  readonly ageHours: number | null;
  readonly maxFreshnessHours: number;
}

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

function resolveTierCalendarioThresholds(
  leagueKey: ProductLeague,
  hasOverdueUnfinished: boolean,
): { readonly warningHours: number; readonly staleHours: number } {
  const capability = getLeagueCapability(leagueKey);
  const tierStaleHours = Math.max(
    DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.staleHours,
    capability.minFreshnessHours,
  );
  if (hasOverdueUnfinished) {
    const matchdayMax = isTier1League(leagueKey)
      ? DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.matchdayPendingResultHours
      : Math.min(
          tierStaleHours,
          DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.matchdayPendingResultHours * 2,
        );
    const matchdayWarn = isTier1League(leagueKey)
      ? Math.max(6, matchdayMax - 3)
      : Math.max(6, matchdayMax - 6);
    return { warningHours: matchdayWarn, staleHours: matchdayMax };
  }
  const tierWarnHours = isTier1League(leagueKey)
    ? Math.min(
        DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.warningHours,
        Math.max(6, tierStaleHours - 6),
      )
    : Math.max(
        DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.warningHours,
        Math.round(tierStaleHours * 0.75),
      );
  return { warningHours: tierWarnHours, staleHours: tierStaleHours };
}

function resolveTierMomiosThresholds(
  leagueKey: ProductLeague,
): { readonly warningHours: number; readonly staleHours: number } {
  const capability = getLeagueCapability(leagueKey);
  if (isTier1League(leagueKey)) {
    return {
      warningHours: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.warningHours,
      staleHours: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.staleHours,
    };
  }
  const staleHours = Math.max(
    DATA_FRESHNESS_THRESHOLDS_HOURS.momios.staleHours,
    capability.minFreshnessHours,
  );
  return {
    warningHours: Math.max(
      DATA_FRESHNESS_THRESHOLDS_HOURS.momios.warningHours,
      Math.round(staleHours * 0.6),
    ),
    staleHours,
  };
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
        sourceLabel: tick.book ?? "Flujo de mercado PitchLab",
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
    const capability = getLeagueCapability(leagueKey);
    const prevRow = persistedByLeague.get(leagueKey);
    const isV3SnapshotLeague = V3_LIVE_SNAPSHOT_LEAGUES.has(leagueKey);

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
      const { warningHours, staleHours } = resolveTierCalendarioThresholds(
        leagueKey,
        hasOverdueUnfinished,
      );
      const ageHours = computeDataAgeHours(snap.updatedAt, nowMs);
      const prevErr = prevRow?.cells.calendario.lastError ?? null;
      calendarioCell = {
        dataType: "calendario",
        status: evaluateFreshnessStatus({
          ageHours,
          warningHours,
          staleHours,
          hasError: Boolean(prevErr),
        }),
        updatedAtUtc: snap.updatedAt,
        ageHours,
        maxHours: staleHours,
        sourceLabel: snap.source || capability.providers.schedule,
        recordsCount: snap.games.length,
        ...(hasOverdueUnfinished
          ? { note: "Partidos iniciados hace >4 h pendientes de marcador final" }
          : {}),
        lastError: prevErr,
      };
    } else {
      const { staleHours } = resolveTierCalendarioThresholds(leagueKey, false);
      calendarioCell = {
        dataType: "calendario",
        status: "error",
        updatedAtUtc: null,
        ageHours: null,
        maxHours: staleHours,
        sourceLabel: "sin archivo válido",
        recordsCount: 0,
        lastError: prevRow?.cells.calendario.lastError ?? {
          message: "No se pudo leer latest.json",
          failingSinceUtc: new Date(nowMs).toISOString(),
        },
      };
    }

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
    } else if (!isV3SnapshotLeague) {
      bajasCell = {
        dataType: "bajas",
        status: prevRow?.cells.bajas.lastError ? "error" : "pending_source",
        updatedAtUtc: null,
        ageHours: null,
        maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.bajas.staleHours,
        sourceLabel: "solo snapshot (latest.json)",
        recordsCount: 0,
        note: isTier1League(leagueKey)
          ? "Liga cubierta por snapshot (latest.json); sin pipeline separado de bajas todavía."
          : "Liga Tier 2 cubierta por snapshot; módulo de bajas oculto hasta contar con fuente.",
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

    const v3League = APP_LEAGUE_TO_V3[leagueKey];
    const oddsEntry = latestOddsByV3.get(v3League);
    const prevOddsErr = prevRow?.cells.momios.lastError ?? null;
    const momiosThresholds = resolveTierMomiosThresholds(leagueKey);
    let momiosCell: LeagueDataTypeCell;
    if (oddsEntry) {
      const ageHours = computeDataAgeHours(oddsEntry.updatedAtUtc, nowMs);
      momiosCell = {
        dataType: "momios",
        status: evaluateFreshnessStatus({
          ageHours,
          warningHours: momiosThresholds.warningHours,
          staleHours: momiosThresholds.staleHours,
          hasError: Boolean(prevOddsErr),
        }),
        updatedAtUtc: oddsEntry.updatedAtUtc,
        ageHours,
        maxHours: momiosThresholds.staleHours,
        sourceLabel: oddsEntry.sourceLabel,
        recordsCount: oddsEntry.count,
        lastError: prevOddsErr,
      };
    } else if (!capability.hasOddsIngest) {
      momiosCell = {
        dataType: "momios",
        status: prevOddsErr ? "error" : "pending_source",
        updatedAtUtc: null,
        ageHours: null,
        maxHours: momiosThresholds.staleHours,
        sourceLabel: "sin ingesta de momios",
        recordsCount: 0,
        note: "Competencia sin ingesta de momios configurada en su contrato de capacidades.",
        lastError: prevOddsErr,
      };
    } else if (!isV3SnapshotLeague) {
      momiosCell = {
        dataType: "momios",
        status: prevOddsErr ? "error" : "pending_source",
        updatedAtUtc: null,
        ageHours: null,
        maxHours: momiosThresholds.staleHours,
        sourceLabel: "solo snapshot (latest.json)",
        recordsCount: 0,
        note: isTier1League(leagueKey)
          ? "Liga Tier 1 esperando captura reciente de momios en el pipeline."
          : "Liga Tier 2 cubierta por snapshot; módulo de momios oculto hasta captura fresca.",
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
          : fallbackAge !== null && fallbackAge > momiosThresholds.staleHours
            ? "stale"
            : "pending_source",
        updatedAtUtc: fallbackOddsTs,
        ageHours: fallbackAge,
        maxHours: momiosThresholds.staleHours,
        sourceLabel: "Flujo de mercado PitchLab",
        recordsCount: 0,
        note: "Sin captura legal < 72 h activa",
        lastError: prevOddsErr,
      };
    }

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

    const row: LeagueDataHealthRow = {
      league,
      leagueLabel,
      cells: {
        calendario: calendarioCell,
        bajas: bajasCell,
        momios: momiosCell,
        alineaciones: alineacionesCell,
      },
    };

    if (
      capability.uiVisibilityPolicy === "only_when_healthy" &&
      !isLeagueHealthyForUi(leagueKey, row) &&
      !row.cells.calendario.note
    ) {
      return {
        ...row,
        cells: {
          ...row.cells,
          calendario: {
            ...row.cells.calendario,
            note: "Oculta en UI (Tier 2 incompleta o vencida)",
          },
        },
      };
    }

    return row;
  });

  const workflows = persisted?.workflows?.length ? persisted.workflows : defaultWorkflows();
  const activeIncidents = persisted?.activeIncidents ?? [];
  const tier1Counts = summarizeDataHealthCells(
    leagues.filter((row) => isTier1League(row.league)),
  );
  const allCounts = summarizeDataHealthCells(leagues);
  const hasFailedWorkflow = workflows.some((w) => w.status === "failed");
  const hasCriticalIncident = activeIncidents.some((i) => i.severity === "critical");

  const overallStatus: DataHealthReport["overallStatus"] =
    tier1Counts.staleOrErrorCells > 0 || hasFailedWorkflow || hasCriticalIncident
      ? "critical"
      : allCounts.staleOrErrorCells > 0 ||
          allCounts.warningCells > 0 ||
          activeIncidents.length > 0
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

export function evaluateLeagueUiVisibility(
  report: DataHealthReport,
): Readonly<Record<ProductLeague, LeagueUiVisibilityEntry>> {
  const rowsByLeague = new Map<string, LeagueDataHealthRow>(
    report.leagues.map((row) => [row.league, row]),
  );
  const entries = PRODUCT_LEAGUES.map((leagueKey): [ProductLeague, LeagueUiVisibilityEntry] => {
    const capability = getLeagueCapability(leagueKey);
    const row = rowsByLeague.get(leagueKey) ?? null;
    const visibleInUi = isLeagueHealthyForUi(leagueKey, row);
    return [
      leagueKey,
      {
        league: leagueKey,
        tier: capability.tier,
        policy: capability.uiVisibilityPolicy,
        visibleInUi,
        calendarioStatus: row?.cells.calendario.status ?? "error",
        ageHours: row?.cells.calendario.ageHours ?? null,
        maxFreshnessHours: capability.minFreshnessHours,
      },
    ];
  });
  return Object.fromEntries(entries) as Record<ProductLeague, LeagueUiVisibilityEntry>;
}

export function loadServerLeagueUiVisibility(
  nowMs: number = Date.now(),
): Readonly<Record<ProductLeague, LeagueUiVisibilityEntry>> {
  return evaluateLeagueUiVisibility(loadServerDataHealthReport(nowMs));
}

export function listUiVisibleLeagues(nowMs: number = Date.now()): readonly ProductLeague[] {
  const visibility = loadServerLeagueUiVisibility(nowMs);
  return PRODUCT_LEAGUES.filter((leagueKey) => visibility[leagueKey].visibleInUi);
}
