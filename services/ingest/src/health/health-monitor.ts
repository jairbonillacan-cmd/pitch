/**
 * Parte 4 · Monitor central de «Salud de datos» y alertas deduplicadas por correo (Resend).
 *
 * - Calcula frescura por liga y tipo de dato (`calendario`, `bajas`, `momios`, `alineaciones`)
 *   contra `DATA_FRESHNESS_THRESHOLDS_HOURS`.
 * - Registra el estado de cada workflow (`odds-refresh` y `pre-mvp-snapshot`) y su último error.
 * - Persiste `data/health/data-health.json` (leído por la Consola del fundador) y
 *   `data/health/alerts-state.json` (libro mayor de incidencias abiertas para no repetir el mismo
 *   correo en cada corrida mientras la falla siga activa).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  AlertLedgerStateSchema,
  DATA_FRESHNESS_THRESHOLDS_HOURS,
  DataHealthReportSchema,
  asLeagueId,
  computeDataAgeHours,
  evaluateFreshnessStatus,
  formatOddsCaptureEs,
  type AlertLedgerState,
  type DataHealthCellStatus,
  type DataHealthDataType,
  type DataHealthErrorInfo,
  type DataHealthIncident,
  type DataHealthReport,
  type DataHealthWorkflowStatus,
  type DataIncidentKind,
  type DataWorkflowId,
  type DataWorkflowRunState,
  type LeagueDataHealthRow,
  type LeagueDataTypeCell,
  type LeagueInjuriesFile,
  type LeagueSnapshot,
} from "@pitchlab/contracts";
import { renderEmail, supportEmail, type DataHealthAlertProps } from "@pitchlab/emails";
import type { CanonicalLeague } from "../mappings.js";
import { ACTIVE_APP_LEAGUES } from "../odds/cadence-scheduler.js";
import {
  extractRowMatchMeta,
  loadQuotesLatestLedger,
} from "../odds/regenerate-live-snapshot.js";
import { parseStrictIsoMs, type LiveMatchdaySnapshotPayload } from "../validation/snapshot-validator.js";

export const LEAGUE_DISPLAY_LABELS: Readonly<Record<string, string>> = {
  nfl: "NFL",
  "premier-league": "Premier League",
  laliga: "LaLiga",
  bundesliga: "Bundesliga",
  "serie-a": "Serie A",
  "ligue-1": "Ligue 1",
  "liga-mx": "Liga MX",
};

const APP_LEAGUE_TO_V3: Readonly<Record<string, string>> = {
  nfl: "nfl",
  "premier-league": "epl",
  laliga: "laliga",
  bundesliga: "bundesliga",
  "serie-a": "serie-a",
  "ligue-1": "ligue-1",
  "liga-mx": "liga-mx",
};

export interface RuntimeIncidentInput {
  readonly incidentKey: string;
  readonly kind: DataIncidentKind;
  readonly severity: "warning" | "critical";
  readonly targetLabel: string;
  readonly league?: CanonicalLeague;
  readonly dataType?: DataHealthDataType;
  readonly workflowId?: DataWorkflowId;
  readonly message: string;
}

export interface WorkflowTelemetryUpdate {
  readonly workflowId: DataWorkflowId;
  readonly status: DataWorkflowRunState;
  readonly runAtUtc: string;
  readonly durationMs: number;
  readonly errorMessage?: string | null;
  readonly errorSource?: string;
}

export interface AlertEmailPayload {
  readonly to: readonly string[];
  readonly from: string;
  readonly replyTo: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly idempotencyKey: string;
}

export type SendAlertEmailFn = (payload: AlertEmailPayload) => Promise<{ sent: boolean; id?: string | null }>;

function writeJsonAtomicPreservingEol(filePath: string, payload: unknown): void {
  let eol = "\n";
  if (existsSync(filePath)) {
    try {
      const head = readFileSync(filePath, "utf8").slice(0, 2048);
      if (head.includes("\r\n")) eol = "\r\n";
    } catch (err) {
      void err;
    }
  }
  mkdirSync(dirname(filePath), { recursive: true });
  const serialized = `${JSON.stringify(payload, null, 2)}\n`.replace(/\r?\n/g, eol);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, serialized, "utf8");
  renameSync(tmpPath, filePath);
}

export function parseAdminRecipientEmails(rawEnv: string | undefined): string[] {
  if (!rawEnv) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of rawEnv.split(/[,;\s]+/)) {
    const clean = token.trim();
    if (!clean || !clean.includes("@")) continue;
    const lower = clean.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(clean);
  }
  return out;
}

export function loadExistingHealthReport(healthReportPath: string): DataHealthReport | null {
  if (!existsSync(healthReportPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(healthReportPath, "utf8")) as unknown;
    const parsed = DataHealthReportSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch (err) {
    void err;
    return null;
  }
}

export function loadExistingAlertLedger(ledgerPath: string): AlertLedgerState {
  if (existsSync(ledgerPath)) {
    try {
      const raw = JSON.parse(readFileSync(ledgerPath, "utf8")) as unknown;
      const parsed = AlertLedgerStateSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch (err) {
      void err;
    }
  }
  return {
    schemaVersion: 1,
    updatedAtUtc: new Date().toISOString(),
    openIncidents: {},
  };
}

function defaultWorkflowEntry(workflowId: DataWorkflowId): DataHealthWorkflowStatus {
  if (workflowId === "odds-refresh") {
    return {
      workflowId: "odds-refresh",
      label: "Momios automáticos",
      workflowFile: ".github/workflows/odds-refresh.yml",
      status: "ok",
      lastRunAtUtc: null,
      lastSuccessAtUtc: null,
      durationMs: null,
      cadenceLabel: "Multi-régimen: cada 90–120 min en jornada y pre-partido · 3×/día entre semana",
      lastError: null,
    };
  }
  return {
    workflowId: "pre-mvp-snapshot",
    label: "Calendario, resultados y bajas",
    workflowFile: ".github/workflows/pre-mvp-snapshot.yml",
    status: "ok",
    lastRunAtUtc: null,
    lastSuccessAtUtc: null,
    durationMs: null,
    cadenceLabel: "Diario 11:00 UTC + cortes previos en días de partido",
    lastError: null,
  };
}

function hasOverdueUnfinishedMatch(snapshot: LeagueSnapshot, nowMs: number): boolean {
  const fourHoursAgo = nowMs - 4 * 3_600_000;
  return snapshot.games.some((g) => {
    if (g.status === "final") return false;
    const startMs = parseStrictIsoMs(g.startTime);
    return startMs !== null && startMs < fourHoursAgo;
  });
}

function incidentKindLabelEs(kind: DataIncidentKind): string {
  if (kind === "workflow_failure") return "Falla de workflow";
  if (kind === "source_failure") return "Falla de fuente";
  if (kind === "validation_rejected") return "Validación rechazada";
  return "Datos desactualizados";
}

export function createResendAlertSender(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl: typeof fetch = fetch,
): SendAlertEmailFn {
  return async (payload: AlertEmailPayload) => {
    const apiKey = env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return { sent: false, id: null };
    }
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "Idempotency-Key": payload.idempotencyKey,
      },
      body: JSON.stringify({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        reply_to: payload.replyTo,
        tags: [{ name: "category", value: "data-health-alert" }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend respondió HTTP ${res.status} al enviar alerta de Salud de datos.`);
    }
    const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
    return { sent: true, id: typeof body?.id === "string" ? body.id : null };
  };
}

export interface EvaluateDataHealthOptions {
  readonly rootDir: string;
  readonly nowIso?: string;
  readonly leagues?: readonly CanonicalLeague[];
  readonly workflowUpdate?: WorkflowTelemetryUpdate;
  readonly runtimeIncidents?: readonly RuntimeIncidentInput[];
  /** Qué prefijos de incidencias transitorias pueden limpiarse en esta corrida si ya no fallaron. */
  readonly clearTransientScopes?: readonly ("odds" | "schedule" | "injuries")[];
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly sendEmailFn?: SendAlertEmailFn;
  readonly persistFiles?: boolean;
}

export interface EvaluateDataHealthResult {
  readonly report: DataHealthReport;
  readonly ledger: AlertLedgerState;
  readonly newlyNotifiedIncidents: readonly DataHealthIncident[];
  readonly emailSent: boolean;
}

/**
 * Inspecciona el estado real en disco de las 7 ligas activas, reconcilia incidencias contra el
 * ledger de alertas (`alerts-state.json`) y envía correo por Resend solo cuando aparece una
 * incidencia nueva aún no notificada.
 */
export async function evaluateAndReportDataHealth(
  options: EvaluateDataHealthOptions,
): Promise<EvaluateDataHealthResult> {
  const env = options.env ?? process.env;
  const nowIso = options.nowIso ?? new Date().toISOString();
  const nowMs = parseStrictIsoMs(nowIso, { requireTimezone: true }) ?? Date.now();
  const leagues = options.leagues ?? ACTIVE_APP_LEAGUES;

  const snapshotsRoot = resolve(options.rootDir, "data", "snapshots");
  const quotesLatestPath = resolve(options.rootDir, "data", "odds_timeseries", "quotes_latest.json");
  const liveSnapshotPath = resolve(
    options.rootDir,
    "packages",
    "spacetime",
    "data",
    "live_matchday_v3_snapshot.json",
  );
  const healthReportPath = resolve(options.rootDir, "data", "health", "data-health.json");
  const alertLedgerPath = resolve(options.rootDir, "data", "health", "alerts-state.json");

  const prevReport = loadExistingHealthReport(healthReportPath);
  const prevLedger = loadExistingAlertLedger(alertLedgerPath);

  const quotesLedger = loadQuotesLatestLedger(quotesLatestPath);
  let liveSnapshot: LiveMatchdaySnapshotPayload | null = null;
  if (existsSync(liveSnapshotPath)) {
    try {
      liveSnapshot = JSON.parse(readFileSync(liveSnapshotPath, "utf8")) as LiveMatchdaySnapshotPayload;
    } catch (err) {
      void err;
    }
  }

  // Indexar última cuota por liga (tanto de quotes_latest.json como de outlooks publicados)
  const latestOddsByLeague = new Map<
    CanonicalLeague,
    { capturedAtUtc: string; capturedMs: number; count: number; books: Set<string> }
  >();

  for (const tick of quotesLedger?.ticks ?? []) {
    const meta = extractRowMatchMeta(tick);
    if (!meta) continue;
    const capMs = parseStrictIsoMs(tick.ts_captured, { requireTimezone: true });
    if (capMs === null) continue;
    const entry = latestOddsByLeague.get(meta.appLeague) ?? {
      capturedAtUtc: tick.ts_captured,
      capturedMs: capMs,
      count: 0,
      books: new Set<string>(),
    };
    entry.count += 1;
    entry.books.add(tick.book);
    if (capMs > entry.capturedMs) {
      entry.capturedMs = capMs;
      entry.capturedAtUtc = tick.ts_captured;
    }
    latestOddsByLeague.set(meta.appLeague, entry);
  }

  for (const outlook of liveSnapshot?.outlooks ?? []) {
    const v3Lg = String(outlook.league ?? "").toLowerCase();
    const appLg = (Object.entries(APP_LEAGUE_TO_V3).find(([, v]) => v === v3Lg)?.[0] ??
      null) as CanonicalLeague | null;
    if (!appLg) continue;
    for (const mkt of outlook.markets) {
      if (!mkt.market) continue;
      const capMs = parseStrictIsoMs(mkt.market.tsCaptured, { requireTimezone: true });
      if (capMs === null) continue;
      const entry = latestOddsByLeague.get(appLg) ?? {
        capturedAtUtc: mkt.market.tsCaptured,
        capturedMs: capMs,
        count: 0,
        books: new Set<string>(),
      };
      entry.count += 1;
      entry.books.add(mkt.market.book);
      if (capMs > entry.capturedMs) {
        entry.capturedMs = capMs;
        entry.capturedAtUtc = mkt.market.tsCaptured;
      }
      latestOddsByLeague.set(appLg, entry);
    }
  }

  const hasOddsApiCredentials = Boolean(
    env.THE_ODDS_API_KEY?.trim() ||
      (env.BETFAIR_APP_KEY?.trim() && env.BETFAIR_SESSION_TOKEN?.trim()),
  );

  // Mapa de errores transitorios reportados en esta corrida
  const runtimeIncidents = options.runtimeIncidents ?? [];
  const runtimeByCell = new Map<string, RuntimeIncidentInput>();
  for (const inc of runtimeIncidents) {
    if (inc.league && inc.dataType) {
      runtimeByCell.set(`${inc.league}::${inc.dataType}`, inc);
    }
  }

  // Conservar incidencias transitorias previas de ámbitos que NO corrieron en esta ejecución
  const clearedScopes = new Set(options.clearTransientScopes ?? []);
  const candidateIncidents = new Map<string, RuntimeIncidentInput>();

  for (const [key, prevInc] of Object.entries(prevLedger.openIncidents)) {
    if (prevInc.kind === "stale_data") continue;
    const isOddsInc =
      prevInc.dataType === "momios" || prevInc.workflowId === "odds-refresh";
    const isScheduleInc = prevInc.dataType === "calendario";
    const isInjuriesInc = prevInc.dataType === "bajas";

    if (isOddsInc && clearedScopes.has("odds")) continue;
    if (isScheduleInc && clearedScopes.has("schedule")) continue;
    if (isInjuriesInc && clearedScopes.has("injuries")) continue;
    if (
      options.workflowUpdate &&
      prevInc.workflowId === options.workflowUpdate.workflowId &&
      prevInc.kind === "workflow_failure"
    ) {
      continue;
    }

    candidateIncidents.set(key, {
      incidentKey: prevInc.incidentKey,
      kind: prevInc.kind,
      severity: prevInc.severity,
      targetLabel: prevInc.targetLabel,
      league: prevInc.league as CanonicalLeague | undefined,
      dataType: prevInc.dataType,
      workflowId: prevInc.workflowId,
      message: prevInc.message,
    });
  }

  for (const inc of runtimeIncidents) {
    candidateIncidents.set(inc.incidentKey, inc);
  }

  if (options.workflowUpdate && options.workflowUpdate.status === "failed") {
    const wfId = options.workflowUpdate.workflowId;
    const wfLabel =
      wfId === "odds-refresh" ? "Workflow Momios automáticos" : "Workflow Calendario y bajas";
    candidateIncidents.set(`workflow::${wfId}`, {
      incidentKey: `workflow::${wfId}`,
      kind: "workflow_failure",
      severity: "critical",
      targetLabel: wfLabel,
      workflowId: wfId,
      message: options.workflowUpdate.errorMessage ?? "Ejecución fallida del workflow.",
    });
  }

  const leagueRows: LeagueDataHealthRow[] = [];

  for (const league of leagues) {
    const leagueLabel = LEAGUE_DISPLAY_LABELS[league] ?? league;

    // 1. Calendario y resultados
    const latestPath = resolve(snapshotsRoot, league, "latest.json");
    let snap: LeagueSnapshot | null = null;
    if (existsSync(latestPath)) {
      try {
        snap = JSON.parse(readFileSync(latestPath, "utf8")) as LeagueSnapshot;
      } catch (err) {
        void err;
      }
    }
    const calRuntimeErr =
      runtimeByCell.get(`${league}::calendario`) ??
      ([...candidateIncidents.values()].find(
        (i) => i.league === league && i.dataType === "calendario",
      ) ?? null);
    const calUpdated = snap?.updatedAt ?? null;
    const calAge = computeDataAgeHours(calUpdated, nowMs);
    const overdueMatchday = snap ? hasOverdueUnfinishedMatch(snap, nowMs) : false;
    const calMaxHours = overdueMatchday
      ? DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.matchdayPendingResultHours
      : DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.staleHours;
    const calWarnHours = overdueMatchday
      ? Math.min(8, calMaxHours)
      : DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.warningHours;

    const calStatus = evaluateFreshnessStatus({
      ageHours: calAge,
      warningHours: calWarnHours,
      staleHours: calMaxHours,
      hasError: Boolean(calRuntimeErr),
    });

    if (calStatus === "stale") {
      const key = `stale::calendario::${league}`;
      candidateIncidents.set(key, {
        incidentKey: key,
        kind: "stale_data",
        severity: "critical",
        targetLabel: `${leagueLabel} · Calendario y resultados`,
        league,
        dataType: "calendario",
        message:
          calAge === null
            ? `No existe snapshot válido de calendario para ${leagueLabel}.`
            : overdueMatchday
              ? `Partidos ya jugados siguen sin marcador final tras ${calAge} h (umbral jornada: ${calMaxHours} h).`
              : `Última actualización hace ${calAge} h (supera el máximo de ${calMaxHours} h).`,
      });
    }

    const calErrorInfo: DataHealthErrorInfo | null = calRuntimeErr
      ? {
          message: calRuntimeErr.message,
          failingSinceUtc:
            prevLedger.openIncidents[calRuntimeErr.incidentKey]?.failingSinceUtc ?? nowIso,
          source: snap?.source,
        }
      : null;

    const calendarioCell: LeagueDataTypeCell = {
      dataType: "calendario",
      status: calStatus,
      updatedAtUtc: calUpdated,
      ageHours: calAge,
      maxHours: calMaxHours,
      sourceLabel: snap?.source ?? "sin fuente",
      recordsCount: snap?.games.length ?? 0,
      ...(snap?.periodLabel ? { note: snap.periodLabel } : {}),
      lastError: calErrorInfo,
    };

    // 2. Bajas y lesiones
    const injuriesPath = resolve(snapshotsRoot, league, "injuries.json");
    let injuriesFile: LeagueInjuriesFile | null = null;
    if (existsSync(injuriesPath)) {
      try {
        injuriesFile = JSON.parse(readFileSync(injuriesPath, "utf8")) as LeagueInjuriesFile;
      } catch (err) {
        void err;
      }
    }
    const injRuntimeErr =
      runtimeByCell.get(`${league}::bajas`) ??
      ([...candidateIncidents.values()].find(
        (i) => i.league === league && i.dataType === "bajas",
      ) ?? null);
    const injUpdated = injuriesFile?.observedAt ?? null;
    const injAge = computeDataAgeHours(injUpdated, nowMs);
    const injMaxHours = DATA_FRESHNESS_THRESHOLDS_HOURS.bajas.staleHours;
    const injStatus = evaluateFreshnessStatus({
      ageHours: injAge,
      warningHours: DATA_FRESHNESS_THRESHOLDS_HOURS.bajas.warningHours,
      staleHours: injMaxHours,
      hasError: Boolean(injRuntimeErr),
    });

    if (injStatus === "stale") {
      const key = `stale::bajas::${league}`;
      candidateIncidents.set(key, {
        incidentKey: key,
        kind: "stale_data",
        severity: "warning",
        targetLabel: `${leagueLabel} · Bajas y lesiones`,
        league,
        dataType: "bajas",
        message:
          injAge === null
            ? `Aún no se ha generado archivo de bajas para ${leagueLabel}.`
            : `Reporte de bajas con ${injAge} h de antigüedad (máximo ${injMaxHours} h).`,
      });
    }

    const bajasCell: LeagueDataTypeCell = {
      dataType: "bajas",
      status: injStatus,
      updatedAtUtc: injUpdated,
      ageHours: injAge,
      maxHours: injMaxHours,
      sourceLabel: injuriesFile?.source ?? "pendiente",
      recordsCount: injuriesFile?.entries.length ?? 0,
      note:
        injuriesFile?.coverageStatus === "no_public_feed"
          ? "Sin bajas públicas reportadas"
          : injuriesFile
            ? `${injuriesFile.entries.length} jugadores reportados`
            : "Sin corte registrado",
      lastError: injRuntimeErr
        ? {
            message: injRuntimeErr.message,
            failingSinceUtc:
              prevLedger.openIncidents[injRuntimeErr.incidentKey]?.failingSinceUtc ?? nowIso,
            source: injuriesFile?.source,
          }
        : null,
    };

    // 3. Momios
    const leagueOdds = latestOddsByLeague.get(league) ?? null;
    const oddsRuntimeErr =
      runtimeByCell.get(`${league}::momios`) ??
      ([...candidateIncidents.values()].find(
        (i) => i.league === league && i.dataType === "momios",
      ) ?? null);
    const fallbackOddsUpdated =
      liveSnapshot?.outlooks_meta?.generated_at_utc ?? liveSnapshot?.generated_at ?? null;
    const oddsUpdated = leagueOdds?.capturedAtUtc ?? fallbackOddsUpdated;
    const oddsAge = computeDataAgeHours(oddsUpdated, nowMs);
    const oddsMaxHours = DATA_FRESHNESS_THRESHOLDS_HOURS.momios.staleHours;
    const upcomingInLeague =
      snap?.games.filter((g) => g.status !== "final").length ?? 0;

    let oddsStatus: DataHealthCellStatus;
    if (oddsRuntimeErr) {
      oddsStatus = "error";
    } else if (leagueOdds !== null) {
      oddsStatus = evaluateFreshnessStatus({
        ageHours: oddsAge,
        warningHours: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.warningHours,
        staleHours: oddsMaxHours,
      });
    } else if (!hasOddsApiCredentials && oddsAge !== null && oddsAge <= oddsMaxHours) {
      oddsStatus = "pending_source";
    } else if (upcomingInLeague === 0 && oddsAge !== null && oddsAge <= oddsMaxHours) {
      oddsStatus = "ok";
    } else {
      oddsStatus = evaluateFreshnessStatus({
        ageHours: oddsAge,
        warningHours: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.warningHours,
        staleHours: oddsMaxHours,
      });
    }

    if (oddsStatus === "stale" && upcomingInLeague > 0) {
      const key = `stale::momios::${league}`;
      candidateIncidents.set(key, {
        incidentKey: key,
        kind: "stale_data",
        severity:
          oddsAge !== null && oddsAge >= DATA_FRESHNESS_THRESHOLDS_HOURS.momios.appHardExpireHours
            ? "critical"
            : "warning",
        targetLabel: `${leagueLabel} · Momios`,
        league,
        dataType: "momios",
        message:
          leagueOdds === null
            ? `Sin cuotas capturadas recientes para ${leagueLabel} (corte base hace ${oddsAge ?? "?"} h; límite ${oddsMaxHours} h).`
            : `Última cuota de ${leagueLabel} capturada hace ${oddsAge} h (límite alerta ${oddsMaxHours} h; caduca en app a las 72 h).`,
      });
    }

    const booksList = leagueOdds ? [...leagueOdds.books].slice(0, 2).join(", ") : "";
    const momiosCell: LeagueDataTypeCell = {
      dataType: "momios",
      status: oddsStatus,
      updatedAtUtc: oddsUpdated,
      ageHours: oddsAge,
      maxHours: oddsMaxHours,
      sourceLabel: booksList || (hasOddsApiCredentials ? "The Odds API / Betfair" : "Sin clave activa"),
      recordsCount: leagueOdds?.count ?? 0,
      note:
        leagueOdds !== null
          ? `${leagueOdds.count} cuotas vigentes (< 72 h)`
          : hasOddsApiCredentials
            ? "Sin cuotas en ventana actual"
            : "Configura THE_ODDS_API_KEY o BETFAIR_*",
      lastError: oddsRuntimeErr
        ? {
            message: oddsRuntimeErr.message,
            failingSinceUtc:
              prevLedger.openIncidents[oddsRuntimeErr.incidentKey]?.failingSinceUtc ?? nowIso,
          }
        : null,
    };

    // 4. Alineaciones confirmadas (preparadas pero APAGADAS)
    const alineacionesCell: LeagueDataTypeCell = {
      dataType: "alineaciones",
      status: "disabled",
      updatedAtUtc: null,
      ageHours: null,
      maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.alineaciones.staleHours,
      sourceLabel: "Apagado (sin fuente verificada)",
      recordsCount: 0,
      note: "Ranura preparada · apagada hasta verificar fuente oficial",
      lastError: null,
    };

    leagueRows.push({
      league: asLeagueId(league),
      leagueLabel,
      cells: {
        calendario: calendarioCell,
        bajas: bajasCell,
        momios: momiosCell,
        alineaciones: alineacionesCell,
      },
    });
  }

  // Reconciliar ledger de incidencias abiertas (deduplicación estricta)
  const nextOpenIncidents: Record<string, DataHealthIncident> = {};
  const toNotifyIncidents: DataHealthIncident[] = [];

  for (const [key, cand] of candidateIncidents.entries()) {
    const existing = prevLedger.openIncidents[key];
    const incident: DataHealthIncident = {
      incidentKey: key,
      kind: cand.kind,
      severity: cand.severity,
      targetLabel: cand.targetLabel,
      ...(cand.league ? { league: asLeagueId(cand.league) } : {}),
      ...(cand.dataType ? { dataType: cand.dataType } : {}),
      ...(cand.workflowId ? { workflowId: cand.workflowId } : {}),
      message: cand.message,
      failingSinceUtc: existing ? existing.failingSinceUtc : nowIso,
      lastSeenAtUtc: nowIso,
      emailedAtUtc: existing ? existing.emailedAtUtc : null,
      occurrences: existing ? existing.occurrences + 1 : 1,
    };
    nextOpenIncidents[key] = incident;
    if (incident.emailedAtUtc === null) {
      toNotifyIncidents.push(incident);
    }
  }

  // Enviar correo al fundador por Resend únicamente si hay incidencias nuevas sin notificar
  const adminRecipients = parseAdminRecipientEmails(env.PITCHLAB_ADMIN_EMAILS);
  const fromAddress = env.EMAIL_FROM?.trim() || "PitchLab <avisos@pitchlab.app>";
  let emailSent = false;
  let newlyNotifiedIncidents: DataHealthIncident[] = [];

  if (toNotifyIncidents.length > 0 && adminRecipients.length > 0) {
    const sender = options.sendEmailFn ?? createResendAlertSender(env);
    const highestSeverity: "warning" | "critical" = toNotifyIncidents.some(
      (i) => i.severity === "critical",
    )
      ? "critical"
      : "warning";

    const firstTarget = toNotifyIncidents[0]!;
    const summaryLabel =
      toNotifyIncidents.length === 1
        ? `${firstTarget.targetLabel}: ${incidentKindLabelEs(firstTarget.kind).toLowerCase()}`
        : `${toNotifyIncidents.length} fuentes o ligas requieren revisión`;

    const emailProps: DataHealthAlertProps = {
      summaryLabel,
      detectedAtLabel: formatOddsCaptureEs(nowIso) ?? nowIso,
      severity: highestSeverity,
      incidents: toNotifyIncidents.map((inc) => ({
        targetLabel: inc.targetLabel,
        kindLabel: incidentKindLabelEs(inc.kind),
        message: inc.message,
        failingSinceLabel: formatOddsCaptureEs(inc.failingSinceUtc) ?? inc.failingSinceUtc,
      })),
    };

    const rendered = await renderEmail("data-health-alert", emailProps);
    const idempotencyKey = `data-health-${toNotifyIncidents
      .map((i) => `${i.incidentKey}@${i.failingSinceUtc}`)
      .sort()
      .join("|")}`.slice(0, 240);

    try {
      const sendResult = await sender({
        to: adminRecipients,
        from: fromAddress,
        replyTo: supportEmail(),
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey,
      });
      if (sendResult.sent) {
        emailSent = true;
        newlyNotifiedIncidents = toNotifyIncidents.map((inc) => {
          const updated: DataHealthIncident = { ...inc, emailedAtUtc: nowIso };
          nextOpenIncidents[inc.incidentKey] = updated;
          return updated;
        });
      }
    } catch (err) {
      console.warn(
        `[salud-datos] No se pudo enviar correo de alerta por Resend: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Construir estado de los dos workflows
  const prevWfMap = new Map(
    (prevReport?.workflows ?? []).map((wf) => [wf.workflowId, wf]),
  );

  const buildWorkflowStatus = (workflowId: DataWorkflowId): DataHealthWorkflowStatus => {
    const base = prevWfMap.get(workflowId) ?? defaultWorkflowEntry(workflowId);
    if (options.workflowUpdate && options.workflowUpdate.workflowId === workflowId) {
      const upd = options.workflowUpdate;
      const isSuccess = upd.status === "ok" || upd.status === "pending_credentials";
      return {
        ...base,
        status: upd.status,
        lastRunAtUtc: upd.runAtUtc,
        lastSuccessAtUtc: isSuccess ? upd.runAtUtc : base.lastSuccessAtUtc,
        durationMs: Math.round(upd.durationMs),
        lastError: upd.errorMessage
          ? {
              message: upd.errorMessage,
              failingSinceUtc:
                nextOpenIncidents[`workflow::${workflowId}`]?.failingSinceUtc ?? upd.runAtUtc,
              ...(upd.errorSource ? { source: upd.errorSource } : {}),
            }
          : null,
      };
    }

    // Si no hubo update explícito en esta corrida, inferir estado inicial cuando nunca ha corrido
    if (base.lastRunAtUtc === null) {
      if (workflowId === "odds-refresh") {
        const refTs =
          quotesLedger?.updated_at_utc ??
          liveSnapshot?.outlooks_meta?.generated_at_utc ??
          liveSnapshot?.generated_at ??
          null;
        return {
          ...base,
          status: hasOddsApiCredentials ? "ok" : "pending_credentials",
          lastRunAtUtc: refTs,
          lastSuccessAtUtc: refTs,
        };
      }
      const newestSnapTs =
        leagueRows
          .map((r) => r.cells.calendario.updatedAtUtc)
          .filter((v): v is string => Boolean(v))
          .sort()
          .at(-1) ?? null;
      return {
        ...base,
        status: "ok",
        lastRunAtUtc: newestSnapTs,
        lastSuccessAtUtc: newestSnapTs,
      };
    }

    return base;
  };

  const workflows: DataHealthWorkflowStatus[] = [
    buildWorkflowStatus("odds-refresh"),
    buildWorkflowStatus("pre-mvp-snapshot"),
  ];

  const activeIncidents = Object.values(nextOpenIncidents).sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return a.failingSinceUtc.localeCompare(b.failingSinceUtc);
  });

  const hasCritical =
    activeIncidents.some((i) => i.severity === "critical") ||
    workflows.some((w) => w.status === "failed");
  const hasDegraded =
    activeIncidents.length > 0 ||
    workflows.some((w) => w.status === "degraded") ||
    leagueRows.some((r) =>
      Object.values(r.cells).some((c) => c.status === "warning" || c.status === "stale" || c.status === "error"),
    );

  const report: DataHealthReport = {
    schemaVersion: 1,
    generatedAtUtc: nowIso,
    overallStatus: hasCritical ? "critical" : hasDegraded ? "degraded" : "ok",
    thresholdsHours: {
      calendario: DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.staleHours,
      calendarioMatchday: DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.matchdayPendingResultHours,
      bajas: DATA_FRESHNESS_THRESHOLDS_HOURS.bajas.staleHours,
      momios: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.staleHours,
      momiosHardExpire: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.appHardExpireHours,
      alineaciones: DATA_FRESHNESS_THRESHOLDS_HOURS.alineaciones.staleHours,
    },
    workflows,
    leagues: leagueRows,
    activeIncidents,
  };

  const ledger: AlertLedgerState = {
    schemaVersion: 1,
    updatedAtUtc: nowIso,
    openIncidents: nextOpenIncidents,
  };

  if (options.persistFiles !== false) {
    writeJsonAtomicPreservingEol(healthReportPath, report);
    writeJsonAtomicPreservingEol(alertLedgerPath, ledger);
  }

  return {
    report,
    ledger,
    newlyNotifiedIncidents,
    emailSent,
  };
}
