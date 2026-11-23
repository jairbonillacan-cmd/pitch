"use client";

import React, { useId, useMemo, useState } from "react";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreFilterBar,
  SofascoreKpiStrip,
  SofascoreTable,
  SofascoreTabs,
  type SofascoreKpiItem,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { useAbortableJson } from "../hooks";
import { useOptionalPlatformCore } from "../platform-provider";

export type AdminSecurityAbuseKind =
  | "rate_limit"
  | "scraping_velocity"
  | "session_revoked"
  | "csrf_rejected"
  | "idor_attempt";

export type AdminSecurityAbuseSeverity = "low" | "medium" | "high" | "critical";

export interface AdminSecurityAbuseEventItem {
  readonly id: string;
  readonly kind: AdminSecurityAbuseKind;
  readonly severity: AdminSecurityAbuseSeverity;
  readonly route: string;
  readonly ipHashPrefix: string;
  readonly userRef: string | null;
  readonly summaryDetail: string;
  readonly createdAtIso: string;
}

export interface AdminSecurityAbuseSummary {
  readonly total24h: number;
  readonly critical24h: number;
  readonly high24h: number;
  readonly revocations24h: number;
  readonly scraping24h: number;
  readonly rateLimit24h: number;
  readonly csrf24h: number;
  readonly idor24h: number;
}

export interface AdminSecurityAbuseResponse {
  readonly generatedAtIso: string;
  readonly windowHours: number;
  readonly summary: AdminSecurityAbuseSummary;
  readonly events: readonly AdminSecurityAbuseEventItem[];
}

export interface AdminSecurityAbuseSectionProps {
  readonly storyData?: AdminSecurityAbuseResponse | null;
  readonly enableLiveFetch?: boolean;
}

type KindFilter = "all" | AdminSecurityAbuseKind;
type SeverityFilter = "all" | AdminSecurityAbuseSeverity;

const KIND_META: Readonly<
  Record<AdminSecurityAbuseKind, { label: string; tone: "brand" | "warning" | "danger" | "info" }>
> = {
  scraping_velocity: { label: "Scraping velocity", tone: "warning" },
  session_revoked: { label: "Sesión revocada", tone: "danger" },
  rate_limit: { label: "Rate limit", tone: "info" },
  csrf_rejected: { label: "CSRF rechazado", tone: "warning" },
  idor_attempt: { label: "Intento IDOR", tone: "danger" },
};

const SEVERITY_META: Readonly<
  Record<AdminSecurityAbuseSeverity, { label: string; tone: "danger" | "warning" | "info" | "brand" }>
> = {
  critical: { label: "Crítica", tone: "danger" },
  high: { label: "Alta", tone: "danger" },
  medium: { label: "Media", tone: "warning" },
  low: { label: "Baja", tone: "info" },
};

const KIND_TAB_ITEMS: readonly SofascoreTabItem[] = [
  { id: "all", label: "Todos" },
  { id: "scraping_velocity", label: "Scraping" },
  { id: "session_revoked", label: "Revocaciones" },
  { id: "rate_limit", label: "Rate limit" },
  { id: "csrf_rejected", label: "CSRF" },
  { id: "idor_attempt", label: "IDOR" },
];

const DATE_TIME_FMT = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Mexico_City",
});

function formatEventTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return DATE_TIME_FMT.format(new Date(ms)).replace(/\./g, "");
}

function isKindFilter(value: string): value is KindFilter {
  return (
    value === "all" ||
    value === "rate_limit" ||
    value === "scraping_velocity" ||
    value === "session_revoked" ||
    value === "csrf_rejected" ||
    value === "idor_attempt"
  );
}

function isSeverityFilter(value: string): value is SeverityFilter {
  return (
    value === "all" ||
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low"
  );
}

function buildSecurityAbuseUrl(kind: KindFilter, severity: SeverityFilter): string {
  const params = new URLSearchParams({ limit: "40" });
  if (kind !== "all") params.set("kind", kind);
  if (severity !== "all") params.set("severity", severity);
  return `/api/admin/security-abuse?${params.toString()}`;
}

export function AdminSecurityAbuseSection({
  storyData = null,
  enableLiveFetch = true,
}: AdminSecurityAbuseSectionProps): React.JSX.Element {
  const core = useOptionalPlatformCore();
  const hasAccountSessionAuth = core?.hasAccountSessionAuth ?? false;
  const viewerRole = core?.viewerRole ?? "visitor";
  const accountsEnabled = core?.accountsEnabled ?? false;
  const severitySelectId = useId();
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const canFetchLive = Boolean(
    enableLiveFetch && hasAccountSessionAuth && viewerRole === "admin" && !storyData,
  );
  const requestUrl = canFetchLive ? buildSecurityAbuseUrl(kindFilter, severityFilter) : null;

  const { data: liveData, loading, error, reload } = useAbortableJson<AdminSecurityAbuseResponse>(
    requestUrl,
    { enabled: canFetchLive },
  );

  const activeData = storyData ?? liveData;
  const isPreviewMode = !storyData && !canFetchLive;

  const filteredEvents = useMemo(() => {
    const base = activeData?.events ?? [];
    const q = searchQuery.trim().toLowerCase();
    return base.filter((item) => {
      if (storyData && kindFilter !== "all" && item.kind !== kindFilter) {
        return false;
      }
      if (storyData && severityFilter !== "all" && item.severity !== severityFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.route.toLowerCase().includes(q) ||
        item.ipHashPrefix.toLowerCase().includes(q) ||
        (item.userRef ?? "").toLowerCase().includes(q) ||
        item.summaryDetail.toLowerCase().includes(q)
      );
    });
  }, [activeData?.events, kindFilter, searchQuery, severityFilter, storyData]);

  const kpiItems = useMemo<readonly SofascoreKpiItem[]>(() => {
    if (!activeData) {
      return [
        {
          id: "events-24h",
          label: "Eventos (24 h)",
          value: "0",
          delta: isPreviewMode ? "Vista previa" : "Sin datos",
        },
        {
          id: "critical-high",
          label: "Críticos / Altos",
          value: "0",
          tone: "default",
        },
        {
          id: "revocations",
          label: "Sesiones revocadas",
          value: "0",
          delta: "Umbral 75",
        },
        {
          id: "scraping-rl",
          label: "Scraping + Rate limit",
          value: "0",
          delta: "Umbral 35 / 50",
        },
      ];
    }

    const s = activeData.summary;
    const criticalAndHigh = s.critical24h + s.high24h;
    return [
      {
        id: "events-24h",
        label: `Eventos (${activeData.windowHours} h)`,
        value: s.total24h.toLocaleString("es-MX"),
        delta: `${s.csrf24h} CSRF · ${s.idor24h} IDOR`,
        tone: s.total24h > 0 ? "brand" : "default",
      },
      {
        id: "critical-high",
        label: "Críticos / Altos",
        value: criticalAndHigh.toLocaleString("es-MX"),
        delta: `${s.critical24h} crít. · ${s.high24h} altos`,
        tone: criticalAndHigh > 0 ? "negative" : "positive",
      },
      {
        id: "revocations",
        label: "Sesiones revocadas",
        value: s.revocations24h.toLocaleString("es-MX"),
        delta: "Corte automático ≥ 75",
        tone: s.revocations24h > 0 ? "negative" : "positive",
      },
      {
        id: "scraping-rl",
        label: "Scraping + Rate limit",
        value: (s.scraping24h + s.rateLimit24h).toLocaleString("es-MX"),
        delta: `${s.scraping24h} vel. · ${s.rateLimit24h} RL`,
        tone: s.scraping24h > 0 ? "brand" : "default",
      },
    ];
  }, [activeData, isPreviewMode]);

  const columns = useMemo<readonly SofascoreTableColumn<AdminSecurityAbuseEventItem>[]>(
    () => [
      {
        key: "kind",
        header: "Evento",
        sticky: true,
        render: (row) => {
          const meta = KIND_META[row.kind];
          return (
            <span className="pl-ta-badge" data-tone={meta.tone}>
              {meta.label}
            </span>
          );
        },
      },
      {
        key: "severity",
        header: "Severidad",
        render: (row) => {
          const meta = SEVERITY_META[row.severity];
          return (
            <span className="pl-ta-badge" data-tone={meta.tone}>
              {meta.label}
            </span>
          );
        },
      },
      {
        key: "route",
        header: "Ruta",
        render: (row) => <code className="pl-ta-code-text">{row.route}</code>,
      },
      {
        key: "subject",
        header: "Sujeto (hash)",
        numeric: false,
        render: (row) => (
          <span className="pl-ta-code-text num">
            {row.ipHashPrefix}
            {row.userRef ? ` · ${row.userRef}` : ""}
          </span>
        ),
      },
      {
        key: "detail",
        header: "Detalle saneado",
        render: (row) => <span className="num">{row.summaryDetail}</span>,
      },
      {
        key: "createdAt",
        header: "Hora CDMX",
        align: "end",
        numeric: true,
        render: (row) => (
          <time dateTime={row.createdAtIso} className="num">
            {formatEventTimestamp(row.createdAtIso)}
          </time>
        ),
      },
    ],
    [],
  );

  return (
    <SofascoreCard
      title="Telemetría de seguridad y anti-scraping"
      meta={
        <span className="pl-ta-badge" data-tone={isPreviewMode ? "info" : "success"}>
          <MaestroIcon name="shield" size={12} />
          <span>{isPreviewMode ? "Vista previa sin BD" : "security_abuse_events · ≤ 40"}</span>
        </span>
      }
    >
      <div className="pl-ta-stack" data-admin-security-abuse-panel="">
        <SofascoreKpiStrip items={kpiItems} />

        <div className="pl-ta-guard-grid" aria-label="Defensas activas de borde HTTP">
          <div className="pl-ta-guard-tile">
            <span className="pl-ta-guard-title">Scraping velocity (5 min)</span>
            <p className="pl-ta-guard-desc num">
              35 recursos: registro · 50 recursos: HTTP 429 · 75 recursos: revocación inmediata + HTTP 403.
            </p>
          </div>
          <div className="pl-ta-guard-tile">
            <span className="pl-ta-guard-title">Rate limit distribuido</span>
            <p className="pl-ta-guard-desc">
              Cubetas PostgreSQL UNLOGGED con política fail-closed en rutas de sesión, mutaciones y admin.
            </p>
          </div>
          <div className="pl-ta-guard-tile">
            <span className="pl-ta-guard-title">Integridad y trazabilidad</span>
            <p className="pl-ta-guard-desc">
              Validación Origin/CSRF, anti-IDOR, watermark X-PitchLab-Trace y respuestas private, no-store.
            </p>
          </div>
        </div>

        <SofascoreFilterBar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Filtrar por ruta, hash IP o cubeta…"
          resultCount={filteredEvents.length}
          trailing={
            canFetchLive ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={loading}
                onClick={reload}
              >
                <MaestroIcon name="activity" size={14} />
                <span>{loading ? "Actualizando…" : "Actualizar"}</span>
              </Button>
            ) : undefined
          }
        >
          <SofascoreTabs
            items={KIND_TAB_ITEMS}
            value={kindFilter}
            onChange={(next) => {
              if (isKindFilter(next)) setKindFilter(next);
            }}
            variant="segmented"
            ariaLabel="Filtrar eventos por tipo de abuso"
          />

          <div>
            <label htmlFor={severitySelectId} className="sr-only">
              Filtrar por severidad
            </label>
            <select
              id={severitySelectId}
              className="pl-ta-select"
              value={severityFilter}
              onChange={(event) => {
                if (isSeverityFilter(event.target.value)) {
                  setSeverityFilter(event.target.value);
                }
              }}
            >
              <option value="all">Severidad: Todas</option>
              <option value="critical">Crítica</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </div>
        </SofascoreFilterBar>

        {error ? (
          <div className="pl-ta-item-card">
            <p className="pl-ta-alert-text" role="alert">
              {error}
            </p>
            {canFetchLive ? (
              <div className="pl-ta-row-start">
                <Button variant="secondary" size="sm" onClick={reload}>
                  Reintentar
                </Button>
              </div>
            ) : null}
          </div>
        ) : isPreviewMode ? (
          <SofascoreEmptyState
            title="Telemetría real disponible con sesión de administrador"
            description={
              accountsEnabled
                ? "Inicia sesión con un correo fundador verificado para consultar eventos reales de security_abuse_events."
                : "En modo vista previa beta no se realizan consultas a /api/admin/security-abuse para evitar errores 401/403. Al conectar PostgreSQL aparecerán aquí los últimos 40 eventos."
            }
          />
        ) : loading && !activeData ? (
          <p className="pl-ta-muted-text">Cargando eventos de seguridad…</p>
        ) : (
          <SofascoreTable
            caption="Últimos eventos registrados en security_abuse_events"
            columns={columns}
            rows={filteredEvents}
            rowKey={(row) => row.id}
            density="compact"
            emptyState={
              <SofascoreEmptyState
                title="Sin eventos de abuso registrados"
                description="No hay incidencias que coincidan con los filtros activos en la ventana actual."
                actionLabel={
                  kindFilter !== "all" || severityFilter !== "all" || searchQuery.length > 0
                    ? "Limpiar filtros"
                    : undefined
                }
                onAction={
                  kindFilter !== "all" || severityFilter !== "all" || searchQuery.length > 0
                    ? () => {
                        setKindFilter("all");
                        setSeverityFilter("all");
                        setSearchQuery("");
                      }
                    : undefined
                }
              />
            }
          />
        )}
      </div>
    </SofascoreCard>
  );
}
