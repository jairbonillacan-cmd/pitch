"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { Switch } from "@heroui/react";
import type { DataHealthReport } from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreKpiStrip,
  SofascoreTable,
  SofascoreTabs,
  type SofascoreKpiItem,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { ExampleNotice, MaestroIcon } from "../components/MaestroPrimitives";
import { ConfirmActionDialog } from "../components/PlatformOverlays";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { useAbortableJson } from "../hooks";
import {
  usePlatformActions,
  usePlatformCore,
  useSocialState,
} from "../platform-provider";
import {
  SPACETIME_ENGINES,
  SPACETIME_METRICS_HEADLINE,
  TIPSTER_CREATORS,
} from "../spacetime-catalog";
import type { SocialReportReason } from "../types";
import { AdminDataHealthSection } from "./AdminDataHealthSection";
import {
  AdminPaymentsCouponsSection,
  type AdminPaymentsStoryOverride,
} from "./AdminPaymentsCouponsSection";
import {
  AdminSecurityAbuseSection,
  type AdminSecurityAbuseResponse,
} from "./AdminSecurityAbuseSection";
import { SOCIAL_REPORT_REASON_OPTIONS } from "./community-ui";

export type AdminMainTabKey = "health" | "security" | "payments" | "members";

interface ModerationQueueItem {
  targetType: "post" | "comment";
  targetId: string;
  postId: string;
  body: string;
  isHiddenByModeration: boolean;
  authorUserId: string;
  authorHandle: string;
  authorName: string;
  authorPaused: boolean;
  reportCount: number;
  reasons: SocialReportReason[];
  latestReportAt: string;
}

interface ModerationHiddenItem {
  targetType: "post" | "comment";
  targetId: string;
  postId: string;
  body: string;
  authorUserId: string;
  authorHandle: string;
  authorName: string;
  authorPaused: boolean;
  createdAt: string;
}

interface PausedSocialMember {
  userId: string;
  handle: string | null;
  displayName: string;
  email: string;
}

export interface ModerationPanelResponse {
  pendingQueue: ModerationQueueItem[];
  hiddenItems: ModerationHiddenItem[];
  pausedMembers: PausedSocialMember[];
}

const REASON_LABEL_MAP = new Map<SocialReportReason, string>(
  SOCIAL_REPORT_REASON_OPTIONS.map((opt) => [opt.value, opt.label]),
);

const EMPTY_MODERATION: ModerationPanelResponse = {
  pendingQueue: [],
  hiddenItems: [],
  pausedMembers: [],
};

interface AdminOverviewData {
  members: number;
  activeSubscriptions: number;
  freeTrialsGranted: number;
  referralsRewarded: number;
  commissionsPayableCentavos: number;
  moderationBlocks: number;
}

interface AdminTipsterRow {
  code: string;
  handle: string;
  name: string;
  freeDays: number;
  commissionPct: number;
  activeReferrals: number;
  pendingCommissionCentavos: number;
}

export interface AdminFunnelStageSummary {
  stage: string;
  order: number;
  label: string;
  count30d: number;
  conversionFromPrevPct: number | null;
  conversionFromLandingPct: number | null;
}

export interface AdminFunnelSummary {
  windowDays: number;
  generatedAtIso: string;
  stages: AdminFunnelStageSummary[];
}

const DEMO_FUNNEL_SUMMARY: AdminFunnelSummary = {
  windowDays: 30,
  generatedAtIso: "2026-11-15T00:00:00.000Z",
  stages: [
    {
      stage: "landing",
      order: 1,
      label: "Visita a landing",
      count30d: 420,
      conversionFromPrevPct: null,
      conversionFromLandingPct: 100,
    },
    {
      stage: "signup_step1",
      order: 2,
      label: "Inicio paso 1 (cuenta)",
      count30d: 168,
      conversionFromPrevPct: 40,
      conversionFromLandingPct: 40,
    },
    {
      stage: "signup_step2",
      order: 3,
      label: "Completa paso 2 (perfil)",
      count30d: 126,
      conversionFromPrevPct: 75,
      conversionFromLandingPct: 30,
    },
    {
      stage: "first_sealed_pick",
      order: 4,
      label: "Primer pick sellado",
      count30d: 88,
      conversionFromPrevPct: 69.8,
      conversionFromLandingPct: 21,
    },
    {
      stage: "spei_transfer",
      order: 5,
      label: "Solicitud SPEI",
      count30d: 31,
      conversionFromPrevPct: 35.2,
      conversionFromLandingPct: 7.4,
    },
    {
      stage: "coupon_redeemed",
      order: 6,
      label: "Cupón canjeado",
      count30d: 26,
      conversionFromPrevPct: 83.9,
      conversionFromLandingPct: 6.2,
    },
  ],
};

interface AdminOverviewResponse {
  overview: AdminOverviewData;
  tipsters: AdminTipsterRow[];
  month1NoCardMode: boolean;
  funnel?: AdminFunnelSummary;
}

interface AdminPromoRow {
  code: string;
  handle: string;
  name: string;
  freeDays: number;
  commissionPct: number;
  activeReferrals: number;
  monthlyMxn: number;
}

interface PendingAdminConfirm {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly tone: "danger" | "brand";
  readonly onConfirm: () => void;
}

function toPromoRow(t: AdminTipsterRow): AdminPromoRow {
  return {
    code: t.code,
    handle: t.handle,
    name: t.name,
    freeDays: t.freeDays,
    commissionPct: t.commissionPct,
    activeReferrals: t.activeReferrals,
    monthlyMxn: Math.round(t.pendingCommissionCentavos / 100),
  };
}

function isAdminMainTabKey(value: string): value is AdminMainTabKey {
  return (
    value === "health" ||
    value === "security" ||
    value === "payments" ||
    value === "members"
  );
}

export function FounderAdminClubView({
  storyModeration,
  storyFunnel = null,
  initialDataHealth = null,
  storyDataHealth = null,
  showDataHealth = true,
  initialTab = "health",
  storySecurityAbuse = null,
  storyPaymentsOverride,
}: {
  storyModeration?: ModerationPanelResponse;
  storyFunnel?: AdminFunnelSummary | null;
  initialDataHealth?: DataHealthReport | null;
  storyDataHealth?: DataHealthReport | null;
  showDataHealth?: boolean;
  initialTab?: AdminMainTabKey;
  storySecurityAbuse?: AdminSecurityAbuseResponse | null;
  storyPaymentsOverride?: AdminPaymentsStoryOverride;
} = {}): React.JSX.Element {
  const {
    dataset,
    month1NoCardMode,
    referralPaidFriends,
    accountsEnabled,
    hasAccountSessionAuth,
    viewerRole,
  } = usePlatformCore();
  const { setMonth1NoCardMode, pushToast } = usePlatformActions();
  const { blockedSpamAttempts } = useSocialState();
  const isVerifiedAdminSession = hasAccountSessionAuth && viewerRole === "admin";

  const funnelHeadingId = useId();
  const modHeadingId = useId();
  const [activeTab, setActiveTab] = useState<AdminMainTabKey>(initialTab);
  const [newCreatorCode, setNewCreatorCode] = useState<string>("");
  const [newCreatorHandle, setNewCreatorHandle] = useState<string>("");
  const [newCreatorEmail, setNewCreatorEmail] = useState<string>("");
  const [localPromoRows, setLocalPromoRows] = useState<AdminPromoRow[] | null>(null);
  const [localModeration, setLocalModeration] = useState<ModerationPanelResponse | null>(null);
  const [moderationBlockDelta, setModerationBlockDelta] = useState<number>(0);
  const [moderationBusyKey, setModerationBusyKey] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingAdminConfirm | null>(null);

  const overviewReq = useAbortableJson<AdminOverviewResponse>("/api/admin/overview?limit=40", {
    enabled: isVerifiedAdminSession,
  });

  const moderationReq = useAbortableJson<ModerationPanelResponse>(
    "/api/admin/moderation?limit=40",
    {
      enabled: isVerifiedAdminSession && !storyModeration && activeTab === "members",
    },
  );

  const serverOverview = overviewReq.data?.overview ?? null;
  const serverFunnel = overviewReq.data?.funnel ?? null;

  const moderation: ModerationPanelResponse =
    storyModeration ?? localModeration ?? moderationReq.data ?? EMPTY_MODERATION;

  const defaultDemoPromoRows = useMemo<AdminPromoRow[]>(
    () =>
      accountsEnabled
        ? []
        : TIPSTER_CREATORS.map((c) => ({
            code: c.promoCode,
            handle: c.handle,
            name: c.name,
            freeDays: c.freeDays,
            commissionPct: c.commissionPct,
            activeReferrals: c.activeReferrals,
            monthlyMxn: c.monthlyCommissionMxn,
          })),
    [accountsEnabled],
  );

  const promoRows = useMemo<AdminPromoRow[]>(() => {
    if (localPromoRows) return localPromoRows;
    if (overviewReq.data?.tipsters) return overviewReq.data.tipsters.map(toPromoRow);
    return defaultDemoPromoRows;
  }, [defaultDemoPromoRows, localPromoRows, overviewReq.data?.tipsters]);

  const runModerationAction = useCallback(
    async (
      busyId: string,
      payload: {
        action: "hide" | "restore" | "dismiss" | "pause_user" | "unpause_user";
        targetType?: "post" | "comment";
        targetId?: string;
        targetUserId?: string;
      },
      successMsg: string,
    ) => {
      if (!isVerifiedAdminSession || moderationBusyKey) {
        if (!isVerifiedAdminSession) {
          pushToast(`${successMsg} (vista previa)`, "success");
        }
        return;
      }
      setModerationBusyKey(busyId);
      try {
        const res = await fetch("/api/admin/moderation", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => null)) as
          | (ModerationPanelResponse & { ok?: boolean; error?: string })
          | null;
        if (!res.ok || !json?.ok) {
          pushToast(json?.error ?? "No se pudo aplicar la acción.", "danger");
          return;
        }
        setLocalModeration({
          pendingQueue: json.pendingQueue ?? [],
          hiddenItems: json.hiddenItems ?? [],
          pausedMembers: json.pausedMembers ?? [],
        });
        setModerationBlockDelta((prev) => prev + 1);
        pushToast(successMsg, "success");
      } catch (err) {
        void err;
        pushToast("No se pudo conectar para aplicar la acción.", "danger");
      } finally {
        setModerationBusyKey(null);
      }
    },
    [isVerifiedAdminSession, moderationBusyKey, pushToast],
  );

  const dataCutLabel = useMemo(() => {
    const t = Date.parse(dataset.generatedAt);
    return Number.isFinite(t)
      ? `datos al ${new Date(t).toLocaleString("es-MX", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "America/Mexico_City",
        })}`
      : "datos del último corte";
  }, [dataset.generatedAt]);

  const totalActiveReferrals = useMemo(
    () =>
      serverOverview
        ? serverOverview.referralsRewarded + promoRows.reduce((acc, r) => acc + r.activeReferrals, 0)
        : promoRows.reduce((acc, r) => acc + r.activeReferrals, 0) + referralPaidFriends,
    [promoRows, referralPaidFriends, serverOverview],
  );

  const spamBlocked =
    (serverOverview ? serverOverview.moderationBlocks : blockedSpamAttempts) + moderationBlockDelta;

  const topKpis = useMemo<readonly SofascoreKpiItem[]>(
    () => [
      {
        id: "watermark",
        label: "Sesiones con watermark",
        value: "100 %",
        delta: "X-PitchLab-Trace",
        tone: "positive",
      },
      {
        id: "spam-blocks",
        label: "Bloqueos moderación",
        value: spamBlocked.toLocaleString("es-MX"),
        delta: "Anti-spam activo",
        tone: spamBlocked > 0 ? "brand" : "default",
      },
      {
        id: "referrals",
        label: "Referidos activos",
        value: totalActiveReferrals.toLocaleString("es-MX"),
        delta: "Tipsters + Doble vía",
        tone: "brand",
      },
      {
        id: "slate",
        label: "Partidos en cartelera",
        value: dataset.games.length.toLocaleString("es-MX"),
        delta: `${dataset.leagues.length} ligas`,
      },
    ],
    [dataset.games.length, dataset.leagues.length, spamBlocked, totalActiveReferrals],
  );

  const mainTabs = useMemo<readonly SofascoreTabItem[]>(
    () => [
      { id: "health", label: "Salud de datos & Ligas" },
      { id: "security", label: "Seguridad & Anti-Scraping" },
      { id: "payments", label: "Pagos & Cupones" },
      {
        id: "members",
        label: "Socios & Moderación",
        count: moderation.pendingQueue.length > 0 ? moderation.pendingQueue.length : undefined,
      },
    ],
    [moderation.pendingQueue.length],
  );

  const handleEmitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = newCreatorCode.trim().toUpperCase();
    const cleanHandle = newCreatorHandle.trim().replace(/^@/, "").toLowerCase() || "creador_pl";
    if (!cleanCode) return;
    if (isVerifiedAdminSession) {
      void (async () => {
        const res = await fetch("/api/admin/tipsters", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: newCreatorEmail,
            handle: cleanHandle,
            displayName: `@${cleanHandle}`,
            promoCode: cleanCode,
            specialty: "",
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          tipsters?: AdminTipsterRow[];
          error?: string;
        };
        if (res.ok && json.tipsters) {
          setLocalPromoRows(json.tipsters.map(toPromoRow));
          pushToast(`Código ${cleanCode} emitido para @${cleanHandle}.`, "success");
          setNewCreatorCode("");
          setNewCreatorHandle("");
          setNewCreatorEmail("");
        } else {
          pushToast(json.error ?? "No se pudo emitir el código.", "warning");
        }
      })();
      return;
    }
    if (promoRows.some((r) => r.code === cleanCode)) {
      pushToast(`El código ${cleanCode} ya está registrado.`, "warning");
      return;
    }
    setLocalPromoRows([
      ...promoRows,
      {
        code: cleanCode,
        handle: cleanHandle,
        name: `@${cleanHandle}`,
        freeDays: 5,
        commissionPct: 25,
        activeReferrals: 0,
        monthlyMxn: 0,
      },
    ]);
    pushToast(
      `Código ${cleanCode} emitido para @${cleanHandle} (5 días gratis · 25 % comisión).`,
      "success",
    );
    setNewCreatorCode("");
  };

  const promoColumns = useMemo<readonly SofascoreTableColumn<AdminPromoRow>[]>(
    () => [
      {
        key: "code",
        header: "Código",
        sticky: true,
        render: (row) => (
          <strong className="num" style={{ color: "var(--pl-brand)" }}>
            {row.code}
          </strong>
        ),
      },
      {
        key: "holder",
        header: "Titular",
        render: (row) => (
          <span>
            {row.name} (@{row.handle})
          </span>
        ),
      },
      {
        key: "trial",
        header: "Beneficio prueba",
        numeric: true,
        render: (row) => `${row.freeDays} días gratis`,
      },
      {
        key: "commission",
        header: "Comisión",
        numeric: true,
        render: (row) => `${row.commissionPct} % recurrente`,
      },
      {
        key: "referrals",
        header: "Referidos activos",
        align: "end",
        numeric: true,
        render: (row) => <strong>{row.activeReferrals}</strong>,
      },
      {
        key: "payout",
        header: "Pago mensual",
        align: "end",
        numeric: true,
        render: (row) => (
          <strong style={{ color: "var(--pl-success)" }}>
            ${row.monthlyMxn.toLocaleString("es-MX")} MXN
          </strong>
        ),
      },
    ],
    [],
  );

  const engineColumns = useMemo<
    readonly SofascoreTableColumn<(typeof SPACETIME_ENGINES)[number]>[]
  >(
    () => [
      {
        key: "name",
        header: "Motor",
        sticky: true,
        render: (eng) => (
          <strong style={{ color: eng.colorVar }}>{eng.name}</strong>
        ),
      },
      {
        key: "domain",
        header: "Pilar y dominio",
        render: (eng) => `${eng.pillar} · ${eng.domain}`,
      },
      {
        key: "cadence",
        header: "Cadencia",
        render: (eng) => eng.retrainCadence,
      },
      {
        key: "status",
        header: "Estado",
        align: "end",
        render: () => (
          <span className="pl-ta-badge" data-tone="success">
            En línea
          </span>
        ),
      },
    ],
    [],
  );

  const activeFunnel =
    storyFunnel ?? serverFunnel ?? (!accountsEnabled ? DEMO_FUNNEL_SUMMARY : null);
  const funnelStages = activeFunnel?.stages ?? [];
  const maxFunnelSessions = Math.max(1, ...funnelStages.map((s) => s.count30d));
  const isDemoFunnel = !storyFunnel && !serverFunnel && !accountsEnabled;

  const requestPolicySwitch = (nextValue: boolean) => {
    setPendingConfirm({
      title: nextValue
        ? "Cambiar a Mes 1 (Sin tarjeta)"
        : "Cambiar a Mes 2+ (Verificación $0.00 MXN)",
      description: nextValue
        ? "Los nuevos socios podrán activar la prueba sin registrar tarjeta bancaria."
        : "Los nuevos socios deberán pasar verificación bancaria de $0.00 MXN antes de iniciar prueba.",
      confirmLabel: "Aplicar política",
      tone: "brand",
      onConfirm: () => setMonth1NoCardMode(nextValue),
    });
  };

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/admin">
        <div className="pl-ta-page">
          {!accountsEnabled ? (
            <ExampleNotice>
              Consola en modo demostración: sin cuentas activas, los códigos, referidos y
              comisiones son de ejemplo y no se guardan. Con la base de datos conectada muestra
              cifras reales.
            </ExampleNotice>
          ) : null}

          <header className="pl-ta-header">
            <div className="pl-ta-header-copy">
              <span className="pl-ta-eyebrow">
                Consola Operativa Founder · Configuración y auditoría
              </span>
              <h1 className="pl-ta-title">Consola del fundador</h1>
              <p className="pl-ta-subtitle">
                Operación segmentada en 4 áreas: salud de ingesta, seguridad anti-scraping, pagos
                SPEI/cupones y moderación de socios.
              </p>
            </div>
            <div className="pl-ta-header-actions">
              <span className="pl-ta-badge num" data-tone="success">
                <MaestroIcon name="activity" size={13} />
                <span>5 motores Spacetime en línea</span>
              </span>
            </div>
          </header>

          <SofascoreKpiStrip items={topKpis} />

          <SofascoreTabs
            items={mainTabs}
            value={activeTab}
            onChange={(next) => {
              if (isAdminMainTabKey(next)) setActiveTab(next);
            }}
            variant="underline"
            ariaLabel="Secciones de la Consola del fundador"
          />

          {activeTab === "health" ? (
            <div
              className="pl-ta-tab-panel"
              role="tabpanel"
              aria-label="Salud de datos y ligas"
            >
              {showDataHealth ? (
                <AdminDataHealthSection
                  dataset={dataset}
                  initialReport={initialDataHealth}
                  storyReport={storyDataHealth}
                  enableLiveFetch={isVerifiedAdminSession && !storyDataHealth}
                />
              ) : null}

              <SofascoreCard
                id={funnelHeadingId}
                title={`Embudo propio de conversión · ${activeFunnel?.windowDays ?? 30} días`}
                meta={
                  <span
                    className="pl-ta-badge"
                    data-tone={isDemoFunnel ? "warning" : "info"}
                  >
                    {isDemoFunnel ? "Ejemplo beta" : "Consentimiento propio"}
                  </span>
                }
              >
                <div className="pl-ta-stack">
                  <p className="pl-ta-muted-text">
                    {isDemoFunnel
                      ? "Cifras ilustrativas sin cuentas activas · sin trackers externos."
                      : "Mide exclusivamente sesiones que aceptaron analítica anónima (analyticsConsent)."}
                  </p>

                  {funnelStages.length === 0 ? (
                    <SofascoreEmptyState
                      title="Sin sesiones consentidas en los últimos 30 días"
                      description="Las métricas de embudo aparecerán aquí conforme existan sesiones con analyticsConsent."
                    />
                  ) : (
                    <div
                      className="pl-sf-table-wrap is-compact"
                      tabIndex={0}
                      role="region"
                      aria-label="Tabla de embudo propio de conversión"
                    >
                      <table className="pl-sf-table">
                        <caption className="sr-only">
                          Conversión por etapa del embudo en los últimos {activeFunnel?.windowDays ?? 30} días
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col" className="pl-sf-th is-sticky-col">
                              Etapa
                            </th>
                            <th scope="col" className="pl-sf-th is-end num">
                              Sesiones
                            </th>
                            <th scope="col" className="pl-sf-th">
                              Volumen relativo
                            </th>
                            <th scope="col" className="pl-sf-th is-end num">
                              Paso previo
                            </th>
                            <th scope="col" className="pl-sf-th is-end num">
                              Vs. landing
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {funnelStages.map((stage) => {
                            const widthPct =
                              stage.count30d > 0
                                ? Math.max(4, Math.round((stage.count30d / maxFunnelSessions) * 100))
                                : 0;
                            const isSuccessStage =
                              stage.stage === "coupon_redeemed" || stage.stage === "spei_transfer";
                            return (
                              <tr key={stage.stage} className="pl-sf-tr">
                                <th scope="row" className="pl-sf-td is-sticky-col">
                                  <span className="num" style={{ color: "var(--pl-text-muted)", marginInlineEnd: 6 }}>
                                    {stage.order}.
                                  </span>
                                  {stage.label}
                                </th>
                                <td className="pl-sf-td is-end num">
                                  <strong>{stage.count30d.toLocaleString("es-MX")}</strong>
                                </td>
                                <td className="pl-sf-td">
                                  <div className="pl-ta-funnel-bar-track" aria-hidden="true">
                                    <div
                                      className="pl-ta-funnel-bar-fill"
                                      data-tone={isSuccessStage ? "success" : undefined}
                                      style={{ width: `${widthPct}%` }}
                                    />
                                  </div>
                                </td>
                                <td className="pl-sf-td is-end num">
                                  {stage.conversionFromPrevPct !== null
                                    ? `${stage.conversionFromPrevPct.toFixed(1)} %`
                                    : "—"}
                                </td>
                                <td
                                  className="pl-sf-td is-end num"
                                  style={{
                                    color:
                                      stage.conversionFromLandingPct !== null
                                        ? "var(--pl-success)"
                                        : "var(--pl-text-muted)",
                                    fontWeight: 700,
                                  }}
                                >
                                  {stage.conversionFromLandingPct !== null
                                    ? `${stage.conversionFromLandingPct.toFixed(1)} %`
                                    : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </SofascoreCard>

              <SofascoreCard
                title="Motores Spacetime Suite · Telemetría"
                meta={
                  <span className="num">
                    {SPACETIME_METRICS_HEADLINE.historicalMatches} hist. · {dataCutLabel}
                  </span>
                }
              >
                <SofascoreTable
                  caption="Estado de los 5 motores Spacetime Suite"
                  columns={engineColumns}
                  rows={SPACETIME_ENGINES}
                  rowKey={(eng) => eng.key}
                  density="compact"
                />
              </SofascoreCard>
            </div>
          ) : null}

          {activeTab === "security" ? (
            <div
              className="pl-ta-tab-panel"
              role="tabpanel"
              aria-label="Seguridad y anti-scraping"
            >
              <AdminSecurityAbuseSection
                storyData={storySecurityAbuse}
                enableLiveFetch={!storySecurityAbuse}
              />

              <SofascoreCard
                title="Política de prueba gratis y anti-abuso"
                meta={
                  <span
                    className="pl-ta-badge"
                    data-tone={month1NoCardMode ? "success" : "brand"}
                  >
                    {month1NoCardMode ? "Mes 1: Sin tarjeta" : "Mes 2+: Tarjeta $0 MXN"}
                  </span>
                }
              >
                <div className="pl-ta-row">
                  <div className="pl-ta-header-copy">
                    <strong style={{ fontSize: "0.875rem" }}>
                      {month1NoCardMode
                        ? "Mes 1 Lanzamiento · Sin pedir tarjeta ($0 OAuth)"
                        : "Mes 2+ · Verificación bancaria $0.00 MXN"}
                    </strong>
                    <p className="pl-ta-muted-text">
                      Escudo anti-abuso activo: normalización de alias Gmail, bloqueo de dominios
                      desechables, anti-bot configurable por entorno y huella por dispositivo.
                    </p>
                  </div>
                  <div className="pl-ta-switch-wrap">
                    <Switch
                      isSelected={month1NoCardMode}
                      onChange={(nextVal) => requestPolicySwitch(nextVal)}
                    >
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <Switch.Content>
                        <span style={{ fontSize: "0.8125rem", fontWeight: 700 }}>
                          {month1NoCardMode ? "Mes 1: Sin tarjeta" : "Mes 2: Tarjeta $0 MXN"}
                        </span>
                      </Switch.Content>
                    </Switch>
                  </div>
                </div>
              </SofascoreCard>

              <AdminPaymentsCouponsSection
                allowedTabs={["audit"]}
                embedded
                storyOverride={storyPaymentsOverride}
              />
            </div>
          ) : null}

          {activeTab === "payments" ? (
            <div
              className="pl-ta-tab-panel"
              role="tabpanel"
              aria-label="Pagos y cupones"
            >
              <AdminPaymentsCouponsSection
                allowedTabs={["transfers", "coupons", "payouts"]}
                embedded
                storyOverride={storyPaymentsOverride}
              />
            </div>
          ) : null}

          {activeTab === "members" ? (
            <div
              className="pl-ta-tab-panel"
              role="tabpanel"
              aria-label="Socios y moderación"
            >
              <AdminPaymentsCouponsSection
                allowedTabs={["members", "inbox"]}
                embedded
                storyOverride={storyPaymentsOverride}
              />

              <SofascoreCard
                id={modHeadingId}
                title="Moderación de Comunidad"
                meta={
                  <span className="pl-ta-badge num" data-tone={moderation.pendingQueue.length > 0 ? "warning" : "info"}>
                    <MaestroIcon name="flag" size={13} />
                    <span>
                      {moderation.pendingQueue.length}{" "}
                      {moderation.pendingQueue.length === 1 ? "pendiente" : "pendientes"}
                    </span>
                  </span>
                }
              >
                <div className="pl-ta-stack">
                  <p className="pl-ta-muted-text">
                    Cola de reportes pendientes en Comunidad. Con 3 reportes distintos el contenido
                    se oculta automáticamente mientras lo revisas.
                  </p>

                  {moderationReq.loading ? (
                    <p className="pl-ta-muted-text">Cargando cola de moderación…</p>
                  ) : moderationReq.error ? (
                    <div className="pl-ta-item-card">
                      <p className="pl-ta-alert-text" role="alert">
                        {moderationReq.error}
                      </p>
                      <div className="pl-ta-row-start">
                        <Button variant="secondary" size="sm" onClick={moderationReq.reload}>
                          Reintentar
                        </Button>
                      </div>
                    </div>
                  ) : moderation.pendingQueue.length === 0 ? (
                    <SofascoreEmptyState
                      title="Sin reportes pendientes"
                      description={
                        accountsEnabled
                          ? "Cuando un socio reporte una publicación o comentario aparecerá aquí para tu revisión."
                          : "Activa las cuentas con base de datos para recibir reportes reales de Comunidad."
                      }
                    />
                  ) : (
                    <div className="pl-ta-stack">
                      {moderation.pendingQueue.map((item) => {
                        const key = `${item.targetType}:${item.targetId}`;
                        const busy = moderationBusyKey !== null;
                        const kindLabel =
                          item.targetType === "post" ? "publicación" : "comentario";
                        return (
                          <article key={key} className="pl-ta-item-card">
                            <div className="pl-ta-row">
                              <div className="pl-ta-row-start">
                                <span className="pl-ta-badge">
                                  {item.targetType === "post" ? "Publicación" : "Comentario"}
                                </span>
                                <strong>{item.authorName}</strong>
                                <span className="pl-ta-muted-text num">@{item.authorHandle}</span>
                                {item.authorPaused ? (
                                  <span className="pl-ta-badge" data-tone="warning">
                                    Socio en pausa
                                  </span>
                                ) : null}
                              </div>
                              <div className="pl-ta-row-start num">
                                <span className="pl-ta-badge" data-tone="warning">
                                  {item.reportCount}{" "}
                                  {item.reportCount === 1 ? "reporte" : "reportes"}
                                </span>
                                <span
                                  className="pl-ta-badge"
                                  data-tone={item.isHiddenByModeration ? "danger" : "info"}
                                >
                                  {item.isHiddenByModeration ? "Oculto en revisión" : "Visible"}
                                </span>
                              </div>
                            </div>

                            <blockquote className="pl-ta-quote">{item.body}</blockquote>

                            <div className="pl-ta-row-start" aria-label="Motivos reportados">
                              <span className="pl-ta-muted-text">Motivos:</span>
                              {item.reasons.map((r) => (
                                <span key={r} className="pl-ta-badge">
                                  {REASON_LABEL_MAP.get(r) ?? r}
                                </span>
                              ))}
                            </div>

                            <div className="pl-ta-row-start">
                              <Button
                                variant="secondary"
                                tone="danger"
                                size="sm"
                                disabled={busy}
                                aria-label={`Ocultar ${kindLabel} de @${item.authorHandle}`}
                                onClick={() =>
                                  setPendingConfirm({
                                    title: `Ocultar ${kindLabel} de @${item.authorHandle}`,
                                    description:
                                      "El contenido dejará de ser visible en Comunidad y se notificará al autor.",
                                    confirmLabel: "Ocultar contenido",
                                    tone: "danger",
                                    onConfirm: () =>
                                      void runModerationAction(
                                        `${key}:hide`,
                                        {
                                          action: "hide",
                                          targetType: item.targetType,
                                          targetId: item.targetId,
                                        },
                                        "Contenido ocultado de Comunidad.",
                                      ),
                                  })
                                }
                              >
                                Ocultar
                              </Button>

                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={busy}
                                aria-label={`Restaurar ${kindLabel} de @${item.authorHandle}`}
                                onClick={() =>
                                  setPendingConfirm({
                                    title: `Restaurar ${kindLabel} de @${item.authorHandle}`,
                                    description:
                                      "El contenido volverá a mostrarse públicamente en Comunidad y se cerrarán sus reportes.",
                                    confirmLabel: "Restaurar contenido",
                                    tone: "brand",
                                    onConfirm: () =>
                                      void runModerationAction(
                                        `${key}:restore`,
                                        {
                                          action: "restore",
                                          targetType: item.targetType,
                                          targetId: item.targetId,
                                        },
                                        "Contenido restaurado en Comunidad.",
                                      ),
                                  })
                                }
                              >
                                Restaurar
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                aria-label={`Descartar reporte sobre @${item.authorHandle}`}
                                onClick={() =>
                                  setPendingConfirm({
                                    title: `Descartar reporte sobre @${item.authorHandle}`,
                                    description:
                                      "Se cerrarán los reportes pendientes sin modificar la visibilidad actual del contenido.",
                                    confirmLabel: "Descartar reporte",
                                    tone: "brand",
                                    onConfirm: () =>
                                      void runModerationAction(
                                        `${key}:dismiss`,
                                        {
                                          action: "dismiss",
                                          targetType: item.targetType,
                                          targetId: item.targetId,
                                        },
                                        "Reporte descartado.",
                                      ),
                                  })
                                }
                              >
                                Descartar
                              </Button>

                              <Button
                                variant="secondary"
                                tone={item.authorPaused ? "default" : "danger"}
                                size="sm"
                                disabled={busy}
                                aria-label={
                                  item.authorPaused
                                    ? `Quitar pausa en Comunidad a @${item.authorHandle}`
                                    : `Pausar a @${item.authorHandle} en Comunidad`
                                }
                                onClick={() =>
                                  setPendingConfirm({
                                    title: item.authorPaused
                                      ? `Quitar pausa en Comunidad a @${item.authorHandle}`
                                      : `Pausar a @${item.authorHandle} en Comunidad`,
                                    description: item.authorPaused
                                      ? "El socio podrá volver a publicar y comentar en Comunidad."
                                      : "El socio no podrá publicar ni comentar en Comunidad hasta que levantes la pausa.",
                                    confirmLabel: item.authorPaused
                                      ? "Quitar pausa"
                                      : "Pausar socio",
                                    tone: item.authorPaused ? "brand" : "danger",
                                    onConfirm: () =>
                                      void runModerationAction(
                                        `${key}:pause`,
                                        {
                                          action: item.authorPaused
                                            ? "unpause_user"
                                            : "pause_user",
                                          targetUserId: item.authorUserId,
                                        },
                                        item.authorPaused
                                          ? `@${item.authorHandle} puede volver a participar en Comunidad.`
                                          : `@${item.authorHandle} quedó en pausa en Comunidad.`,
                                      ),
                                  })
                                }
                              >
                                {item.authorPaused
                                  ? "Quitar pausa en Comunidad"
                                  : "Pausar a este socio en Comunidad"}
                              </Button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {moderation.hiddenItems.length > 0 ? (
                    <div className="pl-ta-stack-sm pl-ta-divider">
                      <strong style={{ fontSize: "0.875rem", color: "var(--pl-text-secondary)" }}>
                        Contenido oculto recientemente
                      </strong>
                      <ul className="pl-ta-mod-compact-list">
                        {moderation.hiddenItems.map((h) => {
                          const key = `hidden:${h.targetType}:${h.targetId}`;
                          const kindLabel =
                            h.targetType === "post" ? "publicación" : "comentario";
                          return (
                            <li key={key} className="pl-ta-mod-compact-row">
                              <div className="pl-ta-mod-compact-copy">
                                <strong>@{h.authorHandle}</strong>{" "}
                                <span style={{ color: "var(--pl-text-muted)" }}>
                                  ({kindLabel}):
                                </span>{" "}
                                <span>{h.body}</span>
                              </div>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={moderationBusyKey !== null}
                                aria-label={`Restaurar ${kindLabel} de @${h.authorHandle}`}
                                onClick={() =>
                                  setPendingConfirm({
                                    title: `Restaurar ${kindLabel} de @${h.authorHandle}`,
                                    description:
                                      "El contenido volverá a ser visible para la comunidad.",
                                    confirmLabel: "Restaurar",
                                    tone: "brand",
                                    onConfirm: () =>
                                      void runModerationAction(
                                        key,
                                        {
                                          action: "restore",
                                          targetType: h.targetType,
                                          targetId: h.targetId,
                                        },
                                        "Contenido restaurado en Comunidad.",
                                      ),
                                  })
                                }
                              >
                                Restaurar
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {moderation.pausedMembers.length > 0 ? (
                    <div className="pl-ta-stack-sm pl-ta-divider">
                      <strong style={{ fontSize: "0.875rem", color: "var(--pl-text-secondary)" }}>
                        Socios en pausa en Comunidad
                      </strong>
                      <ul className="pl-ta-mod-compact-list">
                        {moderation.pausedMembers.map((m) => {
                          const memberLabel = m.handle ? `@${m.handle}` : m.displayName;
                          return (
                            <li key={m.userId} className="pl-ta-mod-compact-row">
                              <div className="pl-ta-mod-compact-copy">
                                <strong>{m.displayName}</strong>{" "}
                                <span className="num" style={{ color: "var(--pl-text-muted)" }}>
                                  {m.handle ? `@${m.handle}` : m.email}
                                </span>
                              </div>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={moderationBusyKey !== null}
                                aria-label={`Quitar pausa en Comunidad a ${memberLabel}`}
                                onClick={() =>
                                  setPendingConfirm({
                                    title: `Quitar pausa a ${memberLabel}`,
                                    description:
                                      "El socio volverá a tener permisos para publicar y comentar en Comunidad.",
                                    confirmLabel: "Quitar pausa",
                                    tone: "brand",
                                    onConfirm: () =>
                                      void runModerationAction(
                                        `unpause:${m.userId}`,
                                        { action: "unpause_user", targetUserId: m.userId },
                                        `${memberLabel} puede volver a participar en Comunidad.`,
                                      ),
                                  })
                                }
                              >
                                Quitar pausa
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </SofascoreCard>

              <SofascoreCard
                title="Códigos de Tipsters Oficiales y Campañas"
                meta={<span className="num">{promoRows.length} activos</span>}
              >
                <div className="pl-ta-stack">
                  <p className="pl-ta-muted-text">
                    Cada creador recibe Pase PitchLab Ultra bonificado, 1 Pick abierto semanal y
                    25 % de comisión recurrente.
                  </p>

                  <form onSubmit={handleEmitCode} className="pl-ta-form-grid-inline">
                    <input
                      type="text"
                      maxLength={16}
                      aria-label="Nuevo código promocional de Tipster"
                      placeholder="NUEVO5"
                      value={newCreatorCode}
                      onChange={(e) => setNewCreatorCode(e.target.value.toUpperCase())}
                      className="pl-ta-input pl-ta-input-upper num"
                    />
                    <input
                      type="text"
                      maxLength={24}
                      aria-label="Handle del Tipster"
                      placeholder="@handle"
                      value={newCreatorHandle}
                      onChange={(e) => setNewCreatorHandle(e.target.value)}
                      className="pl-ta-input"
                    />
                    {accountsEnabled ? (
                      <input
                        type="email"
                        aria-label="Correo del Tipster"
                        placeholder="correo@tipster.com"
                        value={newCreatorEmail}
                        onChange={(e) => setNewCreatorEmail(e.target.value)}
                        className="pl-ta-input"
                      />
                    ) : null}
                    <Button type="submit" variant="primary" size="default">
                      <MaestroIcon name="plus" size={14} />
                      <span>Emitir código</span>
                    </Button>
                  </form>

                  <SofascoreTable
                    caption="Códigos promocionales de Tipsters oficiales y comisiones"
                    columns={promoColumns}
                    rows={promoRows}
                    rowKey={(row) => row.code}
                    density="compact"
                    emptyState={
                      <SofascoreEmptyState
                        title="Sin códigos de tipster registrados"
                        description="Emite un código promocional arriba para asignar 5 días gratis y comisión recurrente."
                      />
                    }
                  />
                </div>
              </SofascoreCard>
            </div>
          ) : null}
        </div>

        <ConfirmActionDialog
          open={pendingConfirm !== null}
          title={pendingConfirm?.title ?? ""}
          description={pendingConfirm?.description ?? ""}
          confirmLabel={pendingConfirm?.confirmLabel ?? "Confirmar"}
          tone={pendingConfirm?.tone ?? "danger"}
          onConfirm={() => {
            pendingConfirm?.onConfirm();
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
