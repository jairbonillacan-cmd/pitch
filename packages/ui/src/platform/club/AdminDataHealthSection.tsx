"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import {
  asLeagueId,
  computeDataAgeHours,
  DATA_FRESHNESS_THRESHOLDS_HOURS,
  formatOddsCaptureEs,
  summarizeDataHealthCells,
  type DataHealthCellStatus,
  type DataHealthReport,
  type DataWorkflowRunState,
  type LeagueDataHealthRow,
  type LeagueDataTypeCell,
} from "@pitchlab/contracts";
import { LeagueBadge } from "../../sports";
import { MaestroIcon, type MaestroIconName } from "../components/MaestroPrimitives";
import type { PlatformDataset } from "../types";

type BadgeTone = "ok" | "warning" | "danger" | "info" | "muted";

const CELL_STATUS_UI: Readonly<
  Record<DataHealthCellStatus, { label: string; icon: MaestroIconName; tone: BadgeTone }>
> = {
  ok: { label: "Al día", icon: "check", tone: "ok" },
  warning: { label: "Por vencer", icon: "activity", tone: "warning" },
  stale: { label: "Vencido", icon: "flame", tone: "danger" },
  error: { label: "Error", icon: "x", tone: "danger" },
  pending_source: { label: "Sin fuente activa", icon: "eye", tone: "info" },
  disabled: { label: "Apagado", icon: "lock", tone: "muted" },
};

const WORKFLOW_STATUS_UI: Readonly<
  Record<DataWorkflowRunState, { label: string; icon: MaestroIconName; tone: BadgeTone }>
> = {
  ok: { label: "En línea", icon: "check", tone: "ok" },
  degraded: { label: "Con avisos", icon: "eye", tone: "warning" },
  failed: { label: "Con error", icon: "x", tone: "danger" },
  pending_credentials: { label: "Esperando clave", icon: "lock", tone: "info" },
};

const OVERALL_UI: Readonly<
  Record<DataHealthReport["overallStatus"], { label: string; pillClass: string; icon: MaestroIconName }>
> = {
  ok: { label: "7 ligas al día", pillClass: "pl-pill pl-pill--success", icon: "check" },
  degraded: { label: "Revisión preventiva", pillClass: "pl-pill pl-pill--warning", icon: "eye" },
  critical: { label: "Atención requerida", pillClass: "pl-pill pl-pill--danger", icon: "flame" },
};

function formatDurationEs(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs)) return "—";
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function buildFallbackReportFromDataset(dataset: PlatformDataset): DataHealthReport {
  const nowMs = Date.now();
  const snapAge = computeDataAgeHours(dataset.generatedAt, nowMs);

  const leagues: LeagueDataHealthRow[] = dataset.leagues.map((lg) => ({
    league: asLeagueId(lg.league),
    leagueLabel: lg.label,
    cells: {
      calendario: {
        dataType: "calendario",
        status:
          snapAge !== null && snapAge <= DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.staleHours
            ? "ok"
            : "stale",
        updatedAtUtc: dataset.generatedAt,
        ageHours: snapAge,
        maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.staleHours,
        sourceLabel: lg.league === "nfl" ? "nflverse" : "espn + openfootball",
        recordsCount: lg.totalGames,
        note: lg.roundLabel,
        lastError: null,
      },
      bajas: {
        dataType: "bajas",
        status: lg.league === "nfl" ? "ok" : "pending_source",
        updatedAtUtc: dataset.generatedAt,
        ageHours: snapAge,
        maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.bajas.staleHours,
        sourceLabel: lg.league === "nfl" ? "nflverse-cc-by-4.0" : "espn-public",
        recordsCount: 0,
        note:
          lg.league === "nfl"
            ? "Reporte oficial semanal"
            : "Sin parte médico público abierto",
        lastError: null,
      },
      momios: {
        dataType: "momios",
        status: "pending_source",
        updatedAtUtc: null,
        ageHours: null,
        maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.staleHours,
        sourceLabel: "the_odds_api / betfair",
        recordsCount: 0,
        note: "Configura THE_ODDS_API_KEY o Betfair en Actions",
        lastError: null,
      },
      alineaciones: {
        dataType: "alineaciones",
        status: "disabled",
        updatedAtUtc: null,
        ageHours: null,
        maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.alineaciones.staleHours,
        sourceLabel: "Apagado (sin fuente verificada)",
        recordsCount: 0,
        note: "Ranura preparada · apagada hasta verificar fuente oficial",
        lastError: null,
      },
    },
  }));

  return {
    schemaVersion: 1,
    generatedAtUtc: dataset.generatedAt,
    overallStatus: "degraded",
    thresholdsHours: {
      calendario: DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.staleHours,
      calendarioMatchday:
        DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.matchdayPendingResultHours,
      bajas: DATA_FRESHNESS_THRESHOLDS_HOURS.bajas.staleHours,
      momios: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.staleHours,
      momiosHardExpire: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.appHardExpireHours,
      alineaciones: DATA_FRESHNESS_THRESHOLDS_HOURS.alineaciones.staleHours,
    },
    workflows: [
      {
        workflowId: "odds-refresh",
        label: "Actualización continua de momios",
        workflowFile: ".github/workflows/odds-refresh.yml",
        status: "pending_credentials",
        lastRunAtUtc: dataset.generatedAt,
        lastSuccessAtUtc: dataset.generatedAt,
        durationMs: 480,
        cadenceLabel:
          "Multi-régimen: cada 90–120 min en jornada y pre-partido · 3×/día entre semana",
        lastError: null,
      },
      {
        workflowId: "pre-mvp-snapshot",
        label: "Calendario, resultados y bajas",
        workflowFile: ".github/workflows/pre-mvp-snapshot.yml",
        status: "ok",
        lastRunAtUtc: dataset.generatedAt,
        lastSuccessAtUtc: dataset.generatedAt,
        durationMs: 1750,
        cadenceLabel: "Diario 11:00 UTC + 4 cortes extra en días de partido",
        lastError: null,
      },
    ],
    leagues,
    activeIncidents: [],
  };
}

function DataTypeCellView({ cell }: { cell: LeagueDataTypeCell }): React.JSX.Element {
  const ui = CELL_STATUS_UI[cell.status];
  return (
    <div className="pl-dh-cell-stack" data-cell-status={cell.status}>
      <span
        className="pl-dh-status-badge"
        data-tone={ui.tone === "muted" ? undefined : ui.tone}
      >
        <MaestroIcon name={ui.icon} size={11} />
        <span>{ui.label}</span>
      </span>

      {cell.status === "disabled" ? (
        <span className="pl-dh-cell-meta">
          {cell.note ?? "Apagado hasta contar con fuente oficial verificada."}
        </span>
      ) : (
        <>
          <span className="pl-dh-cell-primary num">
            {cell.updatedAtUtc ? (
              <time dateTime={cell.updatedAtUtc}>
                {formatOddsCaptureEs(cell.updatedAtUtc)}
              </time>
            ) : (
              "Sin captura"
            )}
          </span>

          <span className="pl-dh-cell-meta num">
            {cell.ageHours !== null && cell.maxHours !== null
              ? `Hace ${cell.ageHours.toFixed(1)} h · máx. ${cell.maxHours} h`
              : cell.maxHours !== null
                ? `Umbral máx. ${cell.maxHours} h`
                : cell.sourceLabel}
          </span>

          <span className="pl-dh-cell-meta num">
            {cell.sourceLabel}
            {cell.recordsCount > 0 ? ` · ${cell.recordsCount} reg.` : ""}
          </span>

          {cell.note ? <span className="pl-dh-cell-meta">{cell.note}</span> : null}
        </>
      )}

      {cell.lastError ? (
        <span className="pl-dh-cell-err num">
          Error desde{" "}
          <time dateTime={cell.lastError.failingSinceUtc}>
            {formatOddsCaptureEs(cell.lastError.failingSinceUtc)}
          </time>
          : {cell.lastError.message}
        </span>
      ) : null}
    </div>
  );
}

export interface AdminDataHealthSectionProps {
  readonly dataset: PlatformDataset;
  readonly initialReport?: DataHealthReport | null;
  readonly storyReport?: DataHealthReport | null;
  readonly enableLiveFetch?: boolean;
}

/**
 * Panel «Salud de datos» de la Consola del Fundador (`/app/admin`):
 * muestra el estado y último error de cada workflow automático (`odds-refresh` y
 * `pre-mvp-snapshot`), incidentes activos con estado de envío por Resend y la matriz
 * de última actualización por liga × tipo de dato (calendario, bajas, momios, alineaciones).
 */
export function AdminDataHealthSection({
  dataset,
  initialReport = null,
  storyReport = null,
  enableLiveFetch = false,
}: AdminDataHealthSectionProps): React.JSX.Element {
  const headingId = useId();
  const captionId = useId();

  const fallbackReport = useMemo(
    () => buildFallbackReportFromDataset(dataset),
    [dataset],
  );

  const [fetchedReport, setFetchedReport] = useState<DataHealthReport | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const report = storyReport ?? fetchedReport ?? initialReport ?? fallbackReport;
  const counts = useMemo(
    () => summarizeDataHealthCells(report.leagues),
    [report.leagues],
  );
  const overall = OVERALL_UI[report.overallStatus];
  const hasCriticalIncident = report.activeIncidents.some(
    (inc) => inc.severity === "critical",
  );

  const handleRefresh = useCallback(async () => {
    if (storyReport || refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch("/api/admin/data-health", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        setRefreshError("No se pudo actualizar el estado de salud de datos.");
        return;
      }
      const next = (await res.json()) as DataHealthReport;
      setFetchedReport(next);
    } catch (err) {
      void err;
      setRefreshError("Error de red al consultar /api/admin/data-health.");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, storyReport]);

  return (
    <section
      className="pl-dh-panel glass-card glass-ring"
      aria-labelledby={headingId}
      data-data-health-panel=""
      data-overall-status={report.overallStatus}
    >
      <header className="pl-dh-header">
        <div className="pl-dh-title-wrap">
          <span className="pl-dh-eyebrow">
            Operación continua · Validación previa y alertas
          </span>
          <h2 id={headingId} className="pl-dh-heading">
            Salud de datos
          </h2>
          <p className="pl-dh-subtitle">
            Última captura verificada por liga y tipo de dato, estado de los workflows de GitHub
            Actions y avisos únicos por Resend sin repetir el mismo incidente.
          </p>
        </div>

        <div className="pl-dh-header-actions">
          <span className={`${overall.pillClass} num`} aria-live="polite">
            <MaestroIcon name={overall.icon} size={13} />
            <span>
              {overall.label} · {counts.okCells} al día
              {counts.staleOrErrorCells > 0
                ? ` · ${counts.staleOrErrorCells} vencidos/error`
                : ""}
            </span>
          </span>

          {enableLiveFetch && !storyReport ? (
            <button
              type="button"
              className="pl-dh-refresh-btn"
              disabled={refreshing}
              onClick={() => void handleRefresh()}
            >
              <MaestroIcon name="activity" size={13} />
              <span>{refreshing ? "Actualizando…" : "Actualizar estado"}</span>
            </button>
          ) : null}
        </div>
      </header>

      {refreshError ? (
        <p className="m-0 text-xs" style={{ color: "var(--pl-danger)" }} role="alert">
          {refreshError}
        </p>
      ) : null}

      {/* Franja de umbrales X por tipo de dato */}
      <ul className="pl-dh-thresholds num" aria-label="Umbrales máximos de frescura por tipo de dato">
        <li className="pl-dh-threshold-chip">
          <span>Calendario y resultados:</span>
          <strong>
            máx. {report.thresholdsHours.calendario} h ({report.thresholdsHours.calendarioMatchday} h en jornada)
          </strong>
        </li>
        <li className="pl-dh-threshold-chip">
          <span>Bajas y lesiones:</span>
          <strong>máx. {report.thresholdsHours.bajas} h</strong>
        </li>
        <li className="pl-dh-threshold-chip">
          <span>Momios:</span>
          <strong>
            alerta {report.thresholdsHours.momios} h · caducan {report.thresholdsHours.momiosHardExpire} h
          </strong>
        </li>
        <li className="pl-dh-threshold-chip">
          <span>Alineaciones:</span>
          <strong>Apagadas (sin fuente verificada)</strong>
        </li>
      </ul>

      {/* Estado y último error de cada workflow */}
      <div className="pl-dh-workflows-wrap">
        <div className="pl-dh-workflows-grid">
          {report.workflows.map((wf) => {
            const wfUi = WORKFLOW_STATUS_UI[wf.status];
            return (
              <article
                key={wf.workflowId}
                className="pl-dh-wf-card"
                data-workflow-card={wf.workflowId}
                data-workflow-status={wf.status}
              >
                <div className="pl-dh-wf-head">
                  <div className="pl-dh-wf-title-block">
                    <h3 className="pl-dh-wf-title">{wf.label}</h3>
                    <span className="pl-dh-wf-file num">{wf.workflowFile}</span>
                  </div>
                  <span className="pl-dh-status-badge" data-tone={wfUi.tone}>
                    <MaestroIcon name={wfUi.icon} size={11} />
                    <span>{wfUi.label}</span>
                  </span>
                </div>

                <p className="pl-dh-wf-cadence">{wf.cadenceLabel}</p>

                <div className="pl-dh-wf-meta num">
                  <span>
                    Última corrida:{" "}
                    <strong>
                      {wf.lastRunAtUtc ? (
                        <time dateTime={wf.lastRunAtUtc}>
                          {formatOddsCaptureEs(wf.lastRunAtUtc)}
                        </time>
                      ) : (
                        "Sin registro"
                      )}
                    </strong>
                  </span>
                  <span>
                    Duración: <strong>{formatDurationEs(wf.durationMs)}</strong>
                  </span>
                </div>

                {wf.lastError ? (
                  <div className="pl-dh-wf-error num" role="status">
                    <strong>Último error:</strong> {wf.lastError.message} · desde{" "}
                    <time dateTime={wf.lastError.failingSinceUtc}>
                      {formatOddsCaptureEs(wf.lastError.failingSinceUtc)}
                    </time>
                  </div>
                ) : (
                  <span className="pl-dh-cell-meta">
                    Sin errores en la última ejecución.
                  </span>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {/* Incidencias activas y control de avisos por Resend */}
      {report.activeIncidents.length > 0 ? (
        <div
          className="pl-dh-incidents"
          data-severity={hasCriticalIncident ? "critical" : "warning"}
          data-active-incidents={report.activeIncidents.length}
        >
          <div className="pl-dh-incidents-head">
            <strong>
              {report.activeIncidents.length}{" "}
              {report.activeIncidents.length === 1
                ? "incidencia activa"
                : "incidencias activas"}
            </strong>
            <span className="pl-dh-cell-meta">
              Resend (PITCHLAB_ADMIN_EMAILS): un solo correo por incidente hasta que se recupere
            </span>
          </div>
          <ul className="pl-dh-incidents-list">
            {report.activeIncidents.slice(0, 8).map((inc) => (
              <li key={inc.incidentKey} className="pl-dh-incident-item num">
                <div>
                  <strong>{inc.targetLabel}:</strong> {inc.message}
                </div>
                <span className="pl-dh-cell-meta">
                  Desde{" "}
                  <time dateTime={inc.failingSinceUtc}>
                    {formatOddsCaptureEs(inc.failingSinceUtc)}
                  </time>
                  {inc.emailedAtUtc ? " · aviso enviado" : " · registrado sin reenviar"}
                  {inc.occurrences > 1 ? ` (${inc.occurrences}×)` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
          Sin incidencias abiertas · Los avisos a <code>PITCHLAB_ADMIN_EMAILS</code> por Resend
          están armados y solo se disparan cuando algo falla o supera su umbral.
        </p>
      )}

      {/* Matriz responsiva por liga y tipo de dato */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby={captionId}
        className="pl-dh-matrix-wrap"
      >
        <table className="pl-dh-table">
          <caption id={captionId} className="sr-only">
            Estado de actualización por liga y tipo de dato (calendario, bajas, momios y alineaciones)
          </caption>
          <thead>
            <tr>
              <th scope="col">Liga</th>
              <th scope="col">Calendario y resultados</th>
              <th scope="col">Bajas y lesiones</th>
              <th scope="col">Momios (&lt; 72 h)</th>
              <th scope="col">Alineación confirmada</th>
            </tr>
          </thead>
          <tbody>
            {report.leagues.map((row) => (
              <tr key={row.league} data-league-health-row={row.league}>
                <th scope="row">
                  <span className="pl-dh-league-cell">
                    <LeagueBadge league={row.league} label={row.leagueLabel} size={18} />
                    <span>{row.leagueLabel}</span>
                  </span>
                </th>
                <td>
                  <DataTypeCellView cell={row.cells.calendario} />
                </td>
                <td>
                  <DataTypeCellView cell={row.cells.bajas} />
                </td>
                <td>
                  <DataTypeCellView cell={row.cells.momios} />
                </td>
                <td>
                  <DataTypeCellView cell={row.cells.alineaciones} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
