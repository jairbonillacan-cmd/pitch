"use client";

import React, { useMemo, useRef, useState } from "react";
import { getLogoPath } from "@pitchlab/sports-assets";
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
import { LeagueBadge } from "../../sports";
import { formatOddsValue } from "../access-guard";
import {
  ExampleBadge,
  MaestroIcon,
  type MaestroIconName,
} from "../components/MaestroPrimitives";
import { PlSelect } from "../components/PlSelect";
import { TopLayerModalDialog } from "../components/PlatformOverlays";
import { downloadTicketPng } from "../components/share-ticket-raster";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { useAbortableJson } from "../hooks";
import {
  useJournalEntries,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import { TIPSTER_CREATORS } from "../spacetime-catalog";
import { shortDateLabel } from "./home/home-model";

export { SocialVipClubView } from "./CommunityClubView";

function TipsterEditorialNotice({
  icon,
  tone,
  badgeText,
  title,
  action,
  children,
}: {
  icon: MaestroIconName;
  tone: "warning" | "success" | "brand";
  badgeText: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="pl-ta-notice" data-tone={tone}>
      <div className="pl-ta-notice-head">
        <div className="pl-ta-notice-identity">
          <span className="pl-ta-badge" data-tone={tone}>
            <MaestroIcon name={icon} size={13} />
            <span>{badgeText}</span>
          </span>
          <strong className="pl-ta-notice-title">{title}</strong>
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className="pl-ta-notice-body">{children}</div>
    </div>
  );
}

interface TipsterMeLedgerRow {
  id: string;
  grossPaidCentavosMxn: number;
  vatCentavosMxn: number;
  gatewayFeeCentavosMxn: number;
  netCommissionableCentavosMxn: number;
  commissionBps: number;
  commissionCentavosMxn: number;
  status: string;
  clearsAtIso: string;
  payoutNote: string | null;
  paidOutAtIso: string | null;
  createdAtIso: string;
}

interface TipsterMePayload {
  isTipster: boolean;
  profile?: {
    userId: string;
    handle: string;
    displayName: string;
    specialty: string;
    promoCode: string;
    freeTrialDays: number;
    commissionBps: number;
    defaultWeeklySlug: string;
    payoutMethod: string;
    connectPayoutsEnabled: boolean;
    isActive: boolean;
  };
  counts?: {
    totalAttributed: number;
    trial5d: number;
    activePaying: number;
    churned: number;
  };
  totals?: {
    pendingClearanceCentavos: number;
    payableCentavos: number;
    paidOutCentavos: number;
  };
  ledger?: TipsterMeLedgerRow[];
}

function formatMxnCentavos(centavos: number): string {
  return `$${(centavos / 100).toLocaleString("es-MX", {
    minimumFractionDigits: centavos % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} MXN`;
}

function initialsFromText(text: string): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? "P"}${parts[1]![0] ?? "L"}`.toUpperCase();
  }
  const clean = text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return clean.slice(0, 2) || "PL";
}

function ledgerStatusBadge(status: string): {
  label: string;
  tone: "success" | "brand" | "danger" | "info";
} {
  if (status === "paid_out") return { label: "Pagada", tone: "success" };
  if (status === "payable" || status === "processing_payout") {
    return { label: "Liberada por pagar", tone: "brand" };
  }
  if (status === "voided") return { label: "Anulada", tone: "danger" };
  return { label: "En ventana 14 días", tone: "info" };
}

const RATIO_TABS: readonly SofascoreTabItem[] = [
  { id: "4:5", label: "Post 4:5" },
  { id: "9:16", label: "Story 9:16" },
];

export function TipsterPortalClubView({
  connectNotice = null,
}: {
  connectNotice?: "ready" | "retry" | null;
} = {}): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    allowRoleSimulation,
    oddsFormat,
    tipsterWeeklyPickOrigin,
    selectedTipsterPickId,
    accountsEnabled,
    hasAccountSessionAuth,
    paymentMode,
  } = usePlatformCore();
  const {
    setViewerRole,
    setTipsterWeeklyPickOrigin,
    setSelectedTipsterPickId,
    openShareTicket,
    navigateTo,
    pushToast,
  } = usePlatformActions();
  const journal = useJournalEntries();

  const sofia = TIPSTER_CREATORS[0]!;
  const [connectBusy, setConnectBusy] = useState<boolean>(false);

  const isRoleAuthorized = viewerRole === "tipster" || viewerRole === "admin";
  const isBlockedAccountMember = accountsEnabled && hasAccountSessionAuth && !isRoleAuthorized;
  const canFetchTipsterMe = hasAccountSessionAuth && isRoleAuthorized;

  const tipsterMeReq = useAbortableJson<TipsterMePayload>("/api/tipster/me?limit=40", {
    enabled: canFetchTipsterMe,
  });

  const tipsterMe = canFetchTipsterMe ? tipsterMeReq.data : null;
  const tipsterMeLoaded = canFetchTipsterMe && !tipsterMeReq.loading && (tipsterMe !== null || tipsterMeReq.error !== null);

  const realProfile = tipsterMe?.isTipster ? tipsterMe.profile ?? null : null;
  const isRealTipster = Boolean(realProfile);

  const activeTipster = useMemo(
    () =>
      realProfile
        ? {
            handle: realProfile.handle,
            name: realProfile.displayName,
            promoCode: realProfile.promoCode,
            freeDays: realProfile.freeTrialDays,
            weeklyPickSlug: realProfile.defaultWeeklySlug || "pick-semanal",
            avatarGradVar: sofia.avatarGradVar,
            avatarInitials: initialsFromText(realProfile.displayName || realProfile.handle),
            commissionPct: Math.round(realProfile.commissionBps / 10) / 10,
            isExample: false,
          }
        : {
            handle: sofia.handle,
            name: sofia.name,
            promoCode: sofia.promoCode,
            freeDays: sofia.freeDays,
            weeklyPickSlug: sofia.weeklyPickSlug,
            avatarGradVar: sofia.avatarGradVar,
            avatarInitials: sofia.avatarInitials,
            commissionPct: 25,
            isExample: true,
          },
    [realProfile, sofia],
  );

  const handleSetupPayouts = async () => {
    setConnectBusy(true);
    try {
      const res = await fetch("/api/tipster/connect", {
        method: "POST",
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && json.url) {
        window.location.assign(json.url);
        return;
      }
      pushToast(json.error ?? "No se pudo abrir el alta de pagos.", "warning");
    } catch (err) {
      void err;
      pushToast("Sin conexión. Intenta de nuevo.", "warning");
    } finally {
      setConnectBusy(false);
    }
  };

  const [thesis, setThesis] = useState<string>(sofia.weeklyPickThesis);
  const [previewRatio, setPreviewRatio] = useState<"4:5" | "9:16">("4:5");
  const previewCardRef = useRef<HTMLDivElement>(null);
  const [visitorPreviewOpen, setVisitorPreviewOpen] = useState<boolean>(false);

  const upcomingGames = useMemo(
    () => dataset.games.filter((g) => g.status !== "FT"),
    [dataset.games],
  );

  const [selectedMatchId, setSelectedMatchId] = useState<string>(
    () => upcomingGames[0]?.id ?? dataset.games[0]?.id ?? "",
  );

  const selectedMatch = useMemo(
    () =>
      upcomingGames.find((g) => g.id === selectedMatchId) ??
      upcomingGames[0] ??
      dataset.games[0],
    [dataset.games, selectedMatchId, upcomingGames],
  );

  const matchPicks = useMemo(
    () => (selectedMatch?.picks ?? []).filter((p) => !p.isRedacted),
    [selectedMatch],
  );

  const activePick = useMemo(() => {
    const inMatch = matchPicks.find((p) => p.id === selectedTipsterPickId);
    if (inMatch) return inMatch;
    if (matchPicks[0]) return matchPicks[0];
    for (const g of upcomingGames) {
      const firstOpen = g.picks.find((p) => !p.isRedacted);
      if (firstOpen) return firstOpen;
    }
    return dataset.games[0]?.picks[0];
  }, [dataset.games, matchPicks, selectedTipsterPickId, upcomingGames]);

  const lockedSiblingPicks = useMemo(() => {
    if (!selectedMatch) return [];
    return selectedMatch.picks.filter((p) => p.id !== activePick?.id);
  }, [activePick?.id, selectedMatch]);

  const personalJournalEntry = journal[0];
  const isSpacetimeOrigin = tipsterWeeklyPickOrigin === "spacetime";

  const previewMatchTitle = isSpacetimeOrigin
    ? activePick?.matchLabel ?? "Partido Estelar"
    : personalJournalEntry?.matchLabel ?? activePick?.matchLabel ?? "Partido Estelar";

  const previewSelectionLabel = isSpacetimeOrigin
    ? activePick?.label ?? "Pick principal"
    : personalJournalEntry?.pickLabel ?? activePick?.label ?? "Pick principal";

  const previewProb = isSpacetimeOrigin ? activePick?.p ?? 0.62 : 0.61;
  const previewFair = isSpacetimeOrigin
    ? activePick?.fairDecimal ?? 1.62
    : personalJournalEntry?.fairDecimal ?? 1.64;
  const previewBook: number | null = isSpacetimeOrigin
    ? activePick?.marketDecimal ?? null
    : personalJournalEntry?.userDecimal ?? null;
  const previewOddsText =
    previewBook === null
      ? `Justa ${formatOddsValue(previewFair, oddsFormat)}`
      : `Justa ${formatOddsValue(previewFair, oddsFormat)} · Momio ${formatOddsValue(previewBook, oddsFormat)}`;

  const handleCopyPublicUrl = () => {
    const url = `https://pitchlab.mx/p/${activeTipster.weeklyPickSlug}?code=${activeTipster.promoCode}`;
    try {
      void navigator.clipboard?.writeText(url);
    } catch (err) {
      void err;
    }
    pushToast(
      `Enlace público /p/${activeTipster.weeklyPickSlug}?code=${activeTipster.promoCode} copiado.`,
      "success",
    );
  };

  const kpiItems = useMemo<readonly SofascoreKpiItem[]>(
    () => [
      {
        id: "promo-code",
        label: "Código personal",
        value: activeTipster.promoCode,
        delta: `${activeTipster.freeDays} días gratis`,
        tone: "brand",
      },
      {
        id: "referrals",
        label: isRealTipster ? "Suscriptores activos" : "Referidos activos",
        value: isRealTipster
          ? `${tipsterMe?.counts?.activePaying ?? 0} socios`
          : `${sofia.activeReferrals} socios`,
        delta: isRealTipster
          ? `${tipsterMe?.counts?.trial5d ?? 0} prueba · ${tipsterMe?.counts?.totalAttributed ?? 0} tot.`
          : "de 64 pruebas",
      },
      {
        id: "commission",
        label: isRealTipster ? "Liberado por cobrar" : `Comisión ${activeTipster.commissionPct} %`,
        value: isRealTipster
          ? formatMxnCentavos(tipsterMe?.totals?.payableCentavos ?? 0)
          : `$${sofia.monthlyCommissionMxn.toLocaleString("es-MX")} MXN`,
        delta: isRealTipster
          ? `14d: ${formatMxnCentavos(tipsterMe?.totals?.pendingClearanceCentavos ?? 0)}`
          : "Recurrente",
        tone: "positive",
      },
      {
        id: "weekly-pick",
        label: "Pick abierto semanal",
        value: "1 / 1 disp.",
        delta: "4 bloqueados",
      },
    ],
    [
      activeTipster.commissionPct,
      activeTipster.freeDays,
      activeTipster.promoCode,
      isRealTipster,
      sofia.activeReferrals,
      sofia.monthlyCommissionMxn,
      tipsterMe?.counts?.activePaying,
      tipsterMe?.counts?.totalAttributed,
      tipsterMe?.counts?.trial5d,
      tipsterMe?.totals?.payableCentavos,
      tipsterMe?.totals?.pendingClearanceCentavos,
    ],
  );

  const originTabs = useMemo<readonly SofascoreTabItem[]>(
    () => [
      { id: "spacetime", label: "Pick Oficial Spacetime" },
      { id: "bitacora", label: "Pick de mi Bitácora", count: journal.length },
    ],
    [journal.length],
  );

  const ledgerColumns = useMemo<readonly SofascoreTableColumn<TipsterMeLedgerRow>[]>(
    () => [
      {
        key: "createdAt",
        header: "Fecha",
        sticky: true,
        numeric: true,
        render: (row) =>
          new Date(row.createdAtIso).toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "short",
          }),
      },
      {
        key: "gross",
        header: "Pago bruto",
        align: "end",
        numeric: true,
        render: (row) => formatMxnCentavos(row.grossPaidCentavosMxn),
      },
      {
        key: "net",
        header: "Neto post-IVA",
        align: "end",
        numeric: true,
        render: (row) => formatMxnCentavos(row.netCommissionableCentavosMxn),
      },
      {
        key: "commission",
        header: "Comisión",
        align: "end",
        numeric: true,
        render: (row) => (
          <strong style={{ color: "var(--pl-success)" }}>
            {formatMxnCentavos(row.commissionCentavosMxn)}
          </strong>
        ),
      },
      {
        key: "status",
        header: "Estado",
        render: (row) => {
          const badge = ledgerStatusBadge(row.status);
          return (
            <span className="pl-ta-badge" data-tone={badge.tone}>
              {badge.label}
            </span>
          );
        },
      },
      {
        key: "payoutNote",
        header: "Liberación / Nota SPEI",
        render: (row) => (
          <span className="pl-ta-muted-text">
            {row.paidOutAtIso
              ? `Pagado ${new Date(row.paidOutAtIso).toLocaleDateString("es-MX")}${row.payoutNote ? ` · ${row.payoutNote}` : ""}`
              : `Libera ${new Date(row.clearsAtIso).toLocaleDateString("es-MX")}${row.payoutNote ? ` · ${row.payoutNote}` : ""}`}
          </span>
        ),
      },
    ],
    [],
  );

  if (isBlockedAccountMember) {
    return (
      <AtmosphereStage>
        <ClubWorkspaceShell activePath="/app/tipster">
          <div className="pl-ta-page">
            <SofascoreEmptyState
              title="Acceso exclusivo para Tipsters oficiales"
              description="Esta sección está habilitada únicamente para creadores aprobados del programa PitchLab."
              actionLabel="Volver a Inicio"
              onAction={() => navigateTo("/app")}
            />
          </div>
        </ClubWorkspaceShell>
      </AtmosphereStage>
    );
  }

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/tipster">
        <div className="pl-ta-page">
          {!isRealTipster ? (
            <TipsterEditorialNotice
              icon="eye"
              tone="warning"
              badgeText="Ejemplo"
              title="Contenido de ejemplo"
            >
              {hasAccountSessionAuth && tipsterMeLoaded
                ? "Vista de ejemplo del Portal Tipster. Tu cuenta aún no tiene un perfil de creador activo; para emitir códigos entra a Admin."
                : `Así funcionará el Portal Tipster. @${sofia.handle} es un perfil de ejemplo: sus unidades, ventaja y referidos son ficticios. El pick que muestra sí sale de nuestro modelo.`}
            </TipsterEditorialNotice>
          ) : null}

          {paymentMode !== "transfer" && connectNotice === "ready" ? (
            <TipsterEditorialNotice
              icon="check"
              tone="success"
              badgeText="Pagos"
              title="Tu cuenta de Stripe Connect quedó conectada"
            >
              Tus datos fiscales y bancarios quedaron registrados de forma cifrada en Stripe. Las
              comisiones liberadas se depositarán automáticamente.
            </TipsterEditorialNotice>
          ) : paymentMode !== "transfer" && connectNotice === "retry" ? (
            <TipsterEditorialNotice
              icon="calendar"
              tone="warning"
              badgeText="Pagos pendientes"
              title="Faltaron datos para completar tu alta de pagos"
              action={
                canFetchTipsterMe ? (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={connectBusy}
                    onClick={() => void handleSetupPayouts()}
                  >
                    Reintentar alta
                  </Button>
                ) : undefined
              }
            >
              Stripe cerró la sesión antes de completar la verificación. Puedes retomarla en
              cualquier momento.
            </TipsterEditorialNotice>
          ) : null}

          {canFetchTipsterMe ? (
            paymentMode === "transfer" ? (
              isRealTipster ? (
                <TipsterEditorialNotice
                  icon="receipt"
                  tone="success"
                  badgeText="Liquidación por SPEI"
                  title="Tus comisiones se liquidan por transferencia SPEI verificada"
                >
                  Tu {activeTipster.commissionPct} % se calcula sobre el ingreso neto después de
                  IVA (16 %). Cada pago pasa 14 días en ventana de validación y, al liberarse, el
                  equipo registra el folio SPEI directamente en tu historial sin exponer datos
                  bancarios en pantalla.
                </TipsterEditorialNotice>
              ) : null
            ) : (
              <TipsterEditorialNotice
                icon="gift"
                tone="success"
                badgeText="Pagos"
                title="Recibe tus comisiones con Stripe Connect"
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={connectBusy}
                    onClick={() => void handleSetupPayouts()}
                    data-connect-payouts=""
                  >
                    {connectBusy ? "Abriendo…" : "Configurar pagos"}
                  </Button>
                }
              >
                Tu {activeTipster.commissionPct} % sobre el neto se libera 14 días después de cada
                cobro y se deposita automáticamente sin almacenar tu cuenta bancaria en claro.
              </TipsterEditorialNotice>
            )
          ) : null}

          {allowRoleSimulation && !isRoleAuthorized ? (
            <TipsterEditorialNotice
              icon="crown"
              tone="success"
              badgeText="Vista Previa · Programa de Creadores"
              title="Activa el rol Tipster para publicar tu Pick abierto semanal"
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setViewerRole("tipster");
                    pushToast("Modo Tipster Oficial (@sofia_nfl) activado.", "success");
                  }}
                >
                  Activar modo @sofia_nfl
                </Button>
              }
            >
              <span>
                Como Tipster Oficial liberas 1 Pick abierto a la semana con tu código de 5 días
                gratis mientras los otros 4 picks del partido siguen protegidos.
              </span>
            </TipsterEditorialNotice>
          ) : null}

          <header className="pl-ta-header">
            <div className="pl-ta-header-identity">
              <span
                className="pl-ta-avatar"
                style={{
                  background: activeTipster.avatarGradVar,
                  color: "var(--share-card-fg)",
                }}
                aria-hidden="true"
              >
                {activeTipster.avatarInitials}
              </span>
              <div className="pl-ta-header-copy">
                <div className="pl-ta-header-title-row">
                  <h1 className="pl-ta-title">Portal tipster (@{activeTipster.handle})</h1>
                  {isRealTipster ? (
                    <span className="pl-ta-badge num" data-tone="success">
                      <MaestroIcon name="check" size={12} />
                      <span>Oficial · Comisión {activeTipster.commissionPct} %</span>
                    </span>
                  ) : (
                    <>
                      <ExampleBadge />
                      <span className="pl-ta-muted-text num">
                        Muestra ilustrativa · {sofia.verifiedUnits}
                      </span>
                    </>
                  )}
                </div>
                <p className="pl-ta-subtitle">
                  Libera <strong>1 Pick abierto a la semana</strong> con branding oficial de
                  PitchLab y tu código promocional. Los otros 4 picks del partido permanecen
                  protegidos bajo suscripción.
                </p>
              </div>
            </div>

            <div className="pl-ta-header-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setVisitorPreviewOpen(true)}
              >
                <MaestroIcon name="eye" size={14} />
                <span>Simular vista visitante (/p/{activeTipster.weeklyPickSlug})</span>
              </Button>
            </div>
          </header>

          <SofascoreKpiStrip items={kpiItems} />

          {isRealTipster ? (
            <SofascoreCard
              title="Historial de comisiones (neto después de IVA 16 %)"
              meta={
                <span className="pl-ta-badge num" data-tone="success">
                  Pagado: {formatMxnCentavos(tipsterMe?.totals?.paidOutCentavos ?? 0)}
                </span>
              }
            >
              <div className="pl-ta-stack">
                <p className="pl-ta-muted-text">
                  Cada pago atribuido a tu código se libera a los 14 días para liquidación SPEI o
                  Stripe Connect (máximo 40 movimientos recientes).
                </p>
                <SofascoreTable
                  caption="Historial de comisiones del tipster"
                  columns={ledgerColumns}
                  rows={tipsterMe?.ledger ?? []}
                  rowKey={(row) => row.id}
                  density="compact"
                  emptyState={
                    <SofascoreEmptyState
                      title="Aún no hay comisiones registradas"
                      description={`Cuando un referido active un pase de pago con tu código ${activeTipster.promoCode}, cada movimiento aparecerá aquí.`}
                    />
                  }
                />
              </div>
            </SofascoreCard>
          ) : null}

          <div className="pl-ta-tipster-grid">
            <SofascoreCard title="Configurador de Pick abierto semanal">
              <div className="pl-ta-stack">
                <div className="pl-ta-stack-sm">
                  <span className="pl-ta-label">1. Origen de tu Pick abierto de la semana</span>
                  <SofascoreTabs
                    items={originTabs}
                    value={isSpacetimeOrigin ? "spacetime" : "bitacora"}
                    onChange={(next) => {
                      setTipsterWeeklyPickOrigin(next === "bitacora" ? "bitacora" : "spacetime");
                    }}
                    variant="segmented"
                    ariaLabel="Origen del pick semanal"
                  />
                </div>

                {isSpacetimeOrigin ? (
                  <>
                    <div className="pl-ta-stack-sm">
                      <label
                        id="tipster-match-select-label"
                        htmlFor="tipster-match-select"
                        className="pl-ta-label"
                      >
                        2. Selecciona el partido de la jornada
                      </label>
                      <PlSelect
                        id="tipster-match-select"
                        ariaLabelledBy="tipster-match-select-label"
                        variant="field"
                        size="lg"
                        fullWidth
                        popoverWidth="trigger"
                        value={selectedMatch?.id ?? ""}
                        onChange={(nextGameId) => {
                          setSelectedMatchId(nextGameId);
                          const nextGame = upcomingGames.find((g) => g.id === nextGameId);
                          const firstPk = nextGame?.picks.find((p) => !p.isRedacted);
                          if (firstPk) {
                            setSelectedTipsterPickId(firstPk.id);
                          }
                        }}
                        options={(upcomingGames.length > 0 ? upcomingGames : dataset.games)
                          .slice(0, 12)
                          .map((g) => ({
                            value: g.id,
                            label: `${g.home.shortName} vs ${g.away.shortName}`,
                            description: `${g.leagueLabel} · ${shortDateLabel(g.dayId)} · ${g.kickoffLocal}`,
                            triggerLabel: `${g.leagueLabel} · ${g.home.shortName} vs ${g.away.shortName} (${shortDateLabel(g.dayId)} · ${g.kickoffLocal})`,
                            textValue: `${g.leagueLabel} · ${g.home.shortName} vs ${g.away.shortName} (${shortDateLabel(g.dayId)} · ${g.kickoffLocal})`,
                            icon: (
                              <LeagueBadge league={g.league} label={g.leagueLabel} size={18} />
                            ),
                          }))}
                      />
                    </div>

                    <div className="pl-ta-stack-sm">
                      <span className="pl-ta-label">
                        3. Elige cuál de los{" "}
                        <span className="num">{matchPicks.length || 5}</span> picks liberarás
                        gratis (los otros permanecen cerrados)
                      </span>
                      <div className="pl-ta-pick-list">
                        {matchPicks.map((pk) => {
                          const isSelected = pk.id === activePick?.id;
                          return (
                            <button
                              key={pk.id}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => setSelectedTipsterPickId(pk.id)}
                              className="pl-ta-pick-option"
                            >
                              <div className="pl-ta-header-copy">
                                <span
                                  style={{
                                    fontSize: "0.75rem",
                                    fontWeight: 750,
                                    color: "var(--pl-brand)",
                                  }}
                                >
                                  {pk.categoryLabel}
                                </span>
                                <strong style={{ fontSize: "0.875rem", fontWeight: 750 }}>
                                  {pk.label}
                                </strong>
                              </div>
                              <div className="num" style={{ textAlign: "end", fontSize: "0.78rem" }}>
                                <div style={{ fontWeight: 800 }}>
                                  {(pk.p * 100).toFixed(1)} %
                                </div>
                                <div style={{ color: "var(--pl-text-muted)" }}>
                                  Justa {formatOddsValue(pk.fairDecimal, oddsFormat)}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="pl-ta-item-card">
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 750,
                        color: "var(--pl-brand)",
                      }}
                    >
                      Tomado de tu Bitácora verificada pre-partido
                    </span>
                    <strong style={{ fontSize: "1rem", fontWeight: 800 }}>
                      {previewSelectionLabel}
                    </strong>
                    <span className="pl-ta-muted-text num">
                      {previewMatchTitle} · Cuota sellada{" "}
                      {formatOddsValue(previewBook ?? previewFair, oddsFormat)}
                    </span>
                  </div>
                )}

                <div className="pl-ta-stack-sm">
                  <div className="pl-ta-row">
                    <label htmlFor="tipster-thesis-input" className="pl-ta-label">
                      4. Tu tesis para redes sociales (/p/{activeTipster.weeklyPickSlug})
                    </label>
                    <span className="pl-ta-muted-text num">{thesis.length}/220</span>
                  </div>
                  <textarea
                    id="tipster-thesis-input"
                    rows={3}
                    maxLength={220}
                    value={thesis}
                    onChange={(e) => setThesis(e.target.value)}
                    className="pl-ta-textarea"
                  />
                </div>

                <div className="pl-ta-row-start">
                  <Button
                    variant="primary"
                    size="default"
                    onClick={() => {
                      if (!activePick) return;
                      if (!hasAccountSessionAuth && viewerRole === "member") {
                        setViewerRole("tipster");
                      }
                      openShareTicket({
                        kind: "tipster",
                        title: previewMatchTitle,
                        subtitle: `Tipster Oficial @${activeTipster.handle} · ${activePick.leagueLabel}`,
                        leagueLabel: activePick.leagueLabel,
                        pickLabel: previewSelectionLabel,
                        probability: previewProb,
                        fairDecimal: previewFair,
                        marketDecimal: previewBook ?? previewFair,
                        units: activePick.suggestedUnits,
                        gameStatus: "NS",
                        promoCode: activeTipster.promoCode,
                        tipsterHandle: activeTipster.handle,
                        pickSlug: activeTipster.weeklyPickSlug,
                        originBadge: isSpacetimeOrigin
                          ? "PICK OFICIAL PITCHLAB"
                          : "PICK SELLADO BITÁCORA TIPSTER",
                      });
                    }}
                  >
                    <MaestroIcon name="share" size={14} />
                    <span>Generar boleto 4:5 / 9:16 con mi código</span>
                  </Button>

                  <Button
                    variant="secondary"
                    size="default"
                    render={<a href={`/p/${activeTipster.weeklyPickSlug}`} />}
                    nativeButton={false}
                    onClick={(e) => {
                      e.preventDefault();
                      pushToast(
                        `Abriendo vista pública /p/${activeTipster.weeklyPickSlug}...`,
                        "default",
                      );
                      navigateTo(`/p/${activeTipster.weeklyPickSlug}`);
                    }}
                  >
                    <span>Abrir /p/{activeTipster.weeklyPickSlug}</span>
                    <MaestroIcon name="arrowRight" size={14} />
                  </Button>
                </div>
              </div>
            </SofascoreCard>

            <SofascoreCard
              as="article"
              title="Boleto para compartir"
              meta={
                <SofascoreTabs
                  items={RATIO_TABS}
                  value={previewRatio}
                  onChange={(next) => setPreviewRatio(next === "9:16" ? "9:16" : "4:5")}
                  variant="segmented"
                  ariaLabel="Relación de aspecto de vista previa"
                />
              }
            >
              <div className="pl-ta-stack">
                <div
                  ref={previewCardRef}
                  className="share-ticket-card pl-ta-ticket-preview"
                  data-ratio={previewRatio}
                >
                  <div className="pl-ta-row">
                    <img
                      src={getLogoPath("horizontal", "dark")}
                      alt="PitchLab"
                      width={108}
                      height={21}
                      loading="lazy"
                      decoding="async"
                    />
                    <span
                      className="pl-ta-badge"
                      style={{
                        background: "var(--share-card-surface)",
                        color: "var(--share-card-success)",
                        borderColor: "var(--share-card-border)",
                      }}
                    >
                      PICK GRATIS SEMANAL
                    </span>
                  </div>

                  <div className="pl-ta-stack" style={{ marginBlock: "14px" }}>
                    <div className="pl-ta-row-start">
                      <span
                        className="pl-ta-avatar pl-ta-avatar-sm"
                        style={{
                          background: activeTipster.avatarGradVar,
                          color: "var(--share-card-fg)",
                        }}
                        aria-hidden="true"
                      >
                        {activeTipster.avatarInitials}
                      </span>
                      <div className="pl-ta-header-copy">
                        <div style={{ fontSize: "0.78rem", fontWeight: 800 }}>
                          {activeTipster.name} · @{activeTipster.handle}
                          {activeTipster.isExample ? " · Ejemplo" : ""}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--share-card-accent)" }}>
                          {isSpacetimeOrigin
                            ? `Respaldado por ${activePick?.engineName ?? "PitchLab Spacetime Suite v5.1"}`
                            : "Tesis propia auditada en Bitácora PitchLab"}
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: "0.75rem", color: "var(--share-card-muted)" }}>
                      {previewMatchTitle}
                    </div>

                    <div className="pl-ta-ticket-box">
                      <div style={{ fontSize: "1.125rem", fontWeight: 850, letterSpacing: "-0.02em" }}>
                        {previewSelectionLabel}
                      </div>
                      <div
                        className="pl-ta-row num"
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--share-card-secondary)",
                          marginBlockStart: "4px",
                        }}
                      >
                        <span>
                          Prob.{" "}
                          <strong style={{ color: "var(--share-card-success)" }}>
                            {(previewProb * 100).toFixed(1)} %
                          </strong>{" "}
                          · Justa {formatOddsValue(previewFair, oddsFormat)}
                        </span>
                        {previewBook !== null ? (
                          <strong style={{ color: "var(--share-card-accent)" }}>
                            Momio {formatOddsValue(previewBook, oddsFormat)}
                          </strong>
                        ) : null}
                      </div>
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.78rem",
                        lineHeight: 1.5,
                        color: "var(--share-card-secondary)",
                      }}
                    >
                      “{thesis}”
                    </p>

                    <div className="ticket-perf" />
                  </div>

                  <div className="pl-ta-ticket-box pl-ta-row">
                    <div style={{ fontSize: "0.75rem", minInlineSize: 0 }}>
                      <div style={{ fontWeight: 800 }}>
                        Código {activeTipster.promoCode} ·{" "}
                        <span className="num">{activeTipster.freeDays}</span> días gratis
                      </div>
                      <div style={{ color: "var(--share-card-muted)" }}>
                        Desbloquea los otros 4 picks en pitchlab.mx
                      </div>
                    </div>
                    <span
                      className="num"
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: "var(--share-card-fg)",
                        color: "var(--share-card-bg)",
                        flexShrink: 0,
                      }}
                    >
                      18+
                    </span>
                  </div>
                </div>

                <div className="pl-ta-ticket-actions">
                  <Button
                    variant="secondary"
                    size="default"
                    aria-label={`Copiar enlace público /p/${activeTipster.weeklyPickSlug}`}
                    onClick={handleCopyPublicUrl}
                  >
                    <MaestroIcon name="copy" size={14} />
                    <span>Copiar enlace</span>
                  </Button>
                  <Button
                    variant="primary"
                    size="default"
                    onClick={() => {
                      const card = previewCardRef.current;
                      if (!card) return;
                      downloadTicketPng(
                        {
                          aspect: previewRatio,
                          leagueLabel: "PICK GRATIS SEMANAL",
                          title: `${activeTipster.name} · @${activeTipster.handle}`,
                          subtitle: previewMatchTitle,
                          badge: isSpacetimeOrigin
                            ? `Respaldado por ${activePick?.engineName ?? "PitchLab Spacetime Suite v5.1"}`
                            : "Tesis propia auditada en Bitácora PitchLab",
                          badgeTone: "success",
                          units: "",
                          mainLine: previewSelectionLabel,
                          detailLine: `Prob. ${(previewProb * 100).toFixed(1)} % · ${previewOddsText}`,
                          footerLine: `Código ${activeTipster.promoCode} · ${activeTipster.freeDays} días gratis`,
                          footerSub: "Desbloquea los demás picks en pitchlab.mx",
                          watermark: "18+",
                        },
                        card,
                        `pitchlab-${activeTipster.handle}-${previewRatio === "9:16" ? "9x16" : "4x5"}.png`,
                      ).then(
                        () =>
                          pushToast(
                            `Boleto ${previewRatio === "9:16" ? "1080×1920" : "1080×1350"} con código ${activeTipster.promoCode} descargado.`,
                            "success",
                          ),
                        () => pushToast("No se pudo generar la imagen del boleto.", "danger"),
                      );
                    }}
                  >
                    <MaestroIcon name="download" size={14} />
                    <span>Descargar PNG</span>
                  </Button>
                </div>
              </div>
            </SofascoreCard>
          </div>

          <TopLayerModalDialog
            open={visitorPreviewOpen}
            onClose={() => setVisitorPreviewOpen(false)}
            ariaLabelledBy="tipster-visitor-sim-title"
            maxWidth="34rem"
          >
            <div className="pl-ta-modal-body">
              <div className="pl-ta-row">
                <div className="pl-ta-header-copy">
                  <span className="pl-ta-badge" data-tone="success" style={{ alignSelf: "flex-start" }}>
                    <MaestroIcon name="eye" size={13} />
                    <span>Simulación de visitante externo</span>
                  </span>
                  <p className="pl-ta-muted-text pl-ta-break-any">
                    pitchlab.mx/p/{activeTipster.weeklyPickSlug}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Cerrar simulación de visitante"
                  onClick={() => setVisitorPreviewOpen(false)}
                >
                  <MaestroIcon name="x" size={15} />
                </Button>
              </div>

              <div className="pl-ta-row-start">
                <span
                  className="pl-ta-avatar"
                  style={{
                    background: activeTipster.avatarGradVar,
                    color: "var(--share-card-fg)",
                  }}
                  aria-hidden="true"
                >
                  {activeTipster.avatarInitials}
                </span>
                <div className="pl-ta-header-copy">
                  <h2 id="tipster-visitor-sim-title" className="pl-ta-modal-title">
                    @{activeTipster.handle} liberó 1 Pick Gratis de este partido
                  </h2>
                  <p className="pl-ta-muted-text">
                    {previewMatchTitle} ·{" "}
                    {activePick?.engineName ?? "PitchLab Spacetime Suite v5.1"}
                  </p>
                </div>
              </div>

              <div className="pl-ta-item-card">
                <span className="pl-ta-badge" data-tone="success" style={{ alignSelf: "flex-start" }}>
                  <MaestroIcon name="unlock" size={13} />
                  <span>Pick abierto de la semana</span>
                </span>
                <div style={{ fontSize: "1.125rem", fontWeight: 850 }}>
                  {previewSelectionLabel}
                </div>
                <div className="pl-ta-secondary-text num">
                  Probabilidad Spacetime Suite:{" "}
                  <strong style={{ color: "var(--pl-brand)" }}>
                    {(previewProb * 100).toFixed(1)} %
                  </strong>{" "}
                  · Cuota justa <strong>{formatOddsValue(previewFair, oddsFormat)}</strong>
                </div>
                <p className="pl-ta-muted-text">“{thesis}”</p>
              </div>

              <div className="pl-ta-stack-sm">
                <span className="pl-ta-label num">
                  Otros {Math.max(4, lockedSiblingPicks.length)} picks de este mismo partido (con
                  Pase PitchLab Ultra):
                </span>
                <div className="pl-ta-pick-list">
                  {(lockedSiblingPicks.length > 0
                    ? lockedSiblingPicks.slice(0, 4)
                    : [
                        { id: "lk-1", categoryLabel: "Muy probable" },
                        { id: "lk-2", categoryLabel: "Goles totales" },
                        { id: "lk-3", categoryLabel: "Lectura del partido" },
                        { id: "lk-4", categoryLabel: "Valor contra la casa" },
                      ]
                  ).map((lp) => (
                    <div key={lp.id} className="pl-ta-locked-row">
                      <span
                        className="pl-ta-row-start"
                        style={{ color: "var(--pl-brand)", fontWeight: 750, fontSize: "0.78rem" }}
                      >
                        <MaestroIcon name="lock" size={12} />
                        <span>{lp.categoryLabel}</span>
                      </span>
                      <span className="locked-redact" style={{ fontWeight: 800, fontSize: "0.72rem" }}>
                        RESERVADO PASE PITCHLAB ULTRA
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                variant="primary"
                size="default"
                onClick={() => {
                  setVisitorPreviewOpen(false);
                  navigateTo(`/signup?code=${activeTipster.promoCode}`);
                }}
              >
                <span>
                  Canjear código {activeTipster.promoCode} ·{" "}
                  <span className="num">{activeTipster.freeDays}</span> días gratis
                </span>
                <MaestroIcon name="arrowRight" size={14} />
              </Button>
            </div>
          </TopLayerModalDialog>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
