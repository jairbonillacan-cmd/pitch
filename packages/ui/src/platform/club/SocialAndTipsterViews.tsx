"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getLogoPath } from "@pitchlab/sports-assets";
import { formatOddsValue } from "../access-guard";
import { LeagueBadge } from "../../sports";
import { downloadTicketPng } from "../components/share-ticket-raster";
import {
  ExampleBadge,
  ExampleNotice,
  MaestroIcon,
  NoticeCard,
} from "../components/MaestroPrimitives";
import { PlSelect } from "../components/PlSelect";
import { TopLayerModalDialog } from "../components/PlatformOverlays";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome";
import {
  useJournalEntries,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import { shortDateLabel } from "./home/home-model";
import { TIPSTER_CREATORS } from "../spacetime-catalog";

export { SocialVipClubView } from "./CommunityClubView";

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
  if (parts.length >= 2) return `${parts[0]![0] ?? "P"}${parts[1]![0] ?? "L"}`.toUpperCase();
  const clean = text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return (clean.slice(0, 2) || "PL");
}

function ledgerStatusBadge(status: string): { label: string; pillClass: string } {
  if (status === "paid_out") return { label: "Pagada", pillClass: "pl-pill pl-pill--success" };
  if (status === "payable" || status === "processing_payout") {
    return { label: "Liberada por pagar", pillClass: "pl-pill pl-pill--accent" };
  }
  if (status === "voided") return { label: "Anulada", pillClass: "pl-pill pl-pill--danger" };
  return { label: "En ventana 14 días", pillClass: "pl-pill pl-pill--muted" };
}

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
  const [tipsterMe, setTipsterMe] = useState<TipsterMePayload | null>(null);
  const [tipsterMeLoaded, setTipsterMeLoaded] = useState<boolean>(false);

  useEffect(() => {
    if (!hasAccountSessionAuth || (viewerRole !== "tipster" && viewerRole !== "admin")) {
      setTipsterMe(null);
      setTipsterMeLoaded(false);
      return;
    }
    let cancelled = false;
    void fetch("/api/tipster/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json().catch(() => null)) as TipsterMePayload | null) : null))
      .then((data) => {
        if (cancelled) return;
        setTipsterMe(data);
        setTipsterMeLoaded(true);
      })
      .catch((err) => {
        void err;
        if (!cancelled) setTipsterMeLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hasAccountSessionAuth, viewerRole]);

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
            commissionPct: Number((realProfile.commissionBps / 100).toFixed(1)),
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

  // Alta de pagos con Stripe Connect (solo tipsters oficiales cuando Stripe Connect está activo).
  const handleSetupPayouts = async () => {
    setConnectBusy(true);
    try {
      const res = await fetch("/api/tipster/connect", { method: "POST", credentials: "same-origin" });
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
    const allSlots = selectedMatch.picks;
    return allSlots.filter((p) => p.id !== activePick?.id);
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
  // Momio real de casa o el que el tipster selló; null si no existe (no se inventa).
  const previewBook: number | null = isSpacetimeOrigin
    ? (activePick?.marketDecimal ?? null)
    : (personalJournalEntry?.userDecimal ?? null);
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

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/tipster">
        {!isRealTipster ? (
          <ExampleNotice>
            {hasAccountSessionAuth && tipsterMeLoaded
              ? "Vista de ejemplo del Portal Tipster. Tu cuenta aún no tiene un perfil de creador activo; para emitir códigos entra a Admin."
              : `Así funcionará el Portal Tipster. @${sofia.handle} es un perfil de ejemplo: sus unidades, ventaja y referidos son ficticios. El pick que muestra sí sale de nuestro modelo.`}
          </ExampleNotice>
        ) : null}
        {paymentMode !== "transfer" && connectNotice === "ready" ? (
          <NoticeCard
            icon="check"
            tone="success"
            badgeText="Pagos"
            title="Tu cuenta de Stripe Connect quedó conectada"
          >
            Tus datos fiscales y bancarios quedaron registrados. Las comisiones liberadas se
            depositarán en tu cuenta automáticamente.
          </NoticeCard>
        ) : paymentMode !== "transfer" && connectNotice === "retry" ? (
          <NoticeCard
            icon="calendar"
            tone="warning"
            badgeText="Pagos pendientes"
            title="Faltaron datos para completar tu alta de pagos"
            action={
              hasAccountSessionAuth && (viewerRole === "tipster" || viewerRole === "admin") ? (
                <button
                  type="button"
                  className="pl-btn-primary text-xs min-h-11 sm:min-h-9 px-3"
                  disabled={connectBusy}
                  onClick={() => void handleSetupPayouts()}
                >
                  Reintentar alta
                </button>
              ) : undefined
            }
          >
            Stripe cerró la sesión antes de completar la verificación. Puedes retomarla en
            cualquier momento.
          </NoticeCard>
        ) : null}
        {hasAccountSessionAuth && (viewerRole === "tipster" || viewerRole === "admin") ? (
          paymentMode === "transfer" ? (
            isRealTipster ? (
              <NoticeCard
                icon="receipt"
                tone="success"
                badgeText="Beta 1.0 · Liquidación por SPEI"
                title="Tus comisiones se liquidan por transferencia SPEI manual"
              >
                Tu {activeTipster.commissionPct} % se calcula sobre el ingreso neto después de
                IVA (16 %). Cada pago pasa 14 días en ventana de validación y, al liberarse, el
                equipo administrador registra el depósito SPEI y su referencia directamente en tu
                historial.
              </NoticeCard>
            ) : null
          ) : (
            <NoticeCard
              icon="gift"
              tone="success"
              badgeText="Pagos"
              title="Recibe tus comisiones con Stripe"
              action={
                <button
                  type="button"
                  className="pl-btn-primary text-xs min-h-11 sm:min-h-9 px-3"
                  disabled={connectBusy}
                  onClick={() => void handleSetupPayouts()}
                  data-connect-payouts=""
                >
                  {connectBusy ? "Abriendo…" : "Configurar pagos"}
                </button>
              }
            >
              Tu 25 % sobre el neto se libera 14 días después de cada cobro y se deposita
              automáticamente en tu cuenta. Stripe te pide tus datos y tu cuenta bancaria una sola vez.
            </NoticeCard>
          )
        ) : null}
        {allowRoleSimulation && viewerRole !== "tipster" && viewerRole !== "admin" ? (
          <NoticeCard
            icon="crown"
            tone="success"
            badgeText="Vista Previa · Programa de Creadores"
            title="Activa el rol Tipster para publicar tu Pick abierto semanal sin sellado"
            action={
              <button
                type="button"
                className="pl-btn-primary text-xs min-h-11 sm:min-h-9 px-3"
                onClick={() => {
                  setViewerRole("tipster");
                  pushToast("Modo Tipster Oficial (@sofia_nfl) activado.", "success");
                }}
              >
                Activar modo @sofia_nfl
              </button>
            }
          >
            <span>
              Como Tipster Oficial liberas 1 Pick abierto a la semana con tu código de 5 días
              gratis mientras los otros 4 picks del partido siguen protegidos.
            </span>
          </NoticeCard>
        ) : null}

        {/* Encabezado editorial + 4 KPIs planos */}
        <section className="glass-card glass-ring rounded-2xl p-4 sm:p-5 space-y-4 min-w-0">
          <div className="flex flex-wrap items-start sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
              <span
                className="w-12 h-12 rounded-full avatar-ring inline-flex items-center justify-center text-sm font-extrabold shrink-0"
                style={{
                  background: activeTipster.avatarGradVar,
                  color: "var(--share-card-fg)",
                }}
                aria-hidden="true"
              >
                {activeTipster.avatarInitials}
              </span>
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="m-0 text-xl sm:text-2xl font-extrabold tracking-tight">
                    Portal tipster (@{activeTipster.handle})
                  </h1>
                  {isRealTipster ? (
                    <span className="pl-pill pl-pill--success">
                      <MaestroIcon name="check" size={12} />
                      <span>
                        Oficial · Comisión <span className="num">{activeTipster.commissionPct} %</span>
                      </span>
                    </span>
                  ) : (
                    <>
                      <ExampleBadge />
                      <span
                        className="text-xs font-semibold num"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        Muestra ilustrativa · {sofia.verifiedUnits}
                      </span>
                    </>
                  )}
                </div>
                <p className="m-0 text-xs sm:text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                  Libera <strong>1 Pick abierto a la semana</strong> con branding oficial de
                  PitchLab y tu código promocional. Los otros 4 picks del partido permanecen
                  protegidos bajo suscripción.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="pl-btn-glass text-xs min-h-11 sm:min-h-9 max-w-full whitespace-normal sm:whitespace-nowrap text-left"
              onClick={() => setVisitorPreviewOpen(true)}
            >
              <MaestroIcon name="eye" size={14} />
              <span>Simular vista visitante (/p/{activeTipster.weeklyPickSlug})</span>
            </button>
          </div>

          <dl
            className="m-0 grid grid-cols-2 lg:grid-cols-4 rounded-xl overflow-hidden num"
            style={{
              background: "var(--pl-surface-elevated)",
              border: "1px solid var(--pl-border)",
            }}
          >
            <div
              className="p-3.5 sm:p-4 space-y-1 min-w-0 border-0 border-solid border-b lg:border-b-0"
              style={{ borderColor: "var(--pl-border)" }}
            >
              <dt className="text-xs font-medium" style={{ color: "var(--pl-text-muted)" }}>
                Código personal
              </dt>
              <dd className="m-0">
                <strong
                  className="block text-lg sm:text-xl font-extrabold break-words"
                  style={{ color: "var(--pl-brand)" }}
                >
                  {activeTipster.promoCode}
                </strong>
                <span className="block text-xs mt-0.5" style={{ color: "var(--pl-success)" }}>
                  {activeTipster.freeDays} días gratis de Pase Ultra
                </span>
              </dd>
            </div>

            <div
              className="p-3.5 sm:p-4 space-y-1 min-w-0 border-0 border-solid border-b border-l lg:border-b-0"
              style={{ borderColor: "var(--pl-border)" }}
            >
              <dt className="text-xs font-medium" style={{ color: "var(--pl-text-muted)" }}>
                {isRealTipster ? "Suscriptores activos" : "Referidos activos"}
              </dt>
              <dd className="m-0">
                <strong className="block text-lg sm:text-xl font-extrabold">
                  {isRealTipster
                    ? `${tipsterMe?.counts?.activePaying ?? 0} socios`
                    : `${sofia.activeReferrals} socios`}
                </strong>
                <span className="block text-xs mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
                  {isRealTipster
                    ? `${tipsterMe?.counts?.trial5d ?? 0} en prueba · ${tipsterMe?.counts?.totalAttributed ?? 0} totales`
                    : "de 64 pruebas iniciadas"}
                </span>
              </dd>
            </div>

            <div
              className="p-3.5 sm:p-4 space-y-1 min-w-0 border-0 border-solid lg:border-l"
              style={{ borderColor: "var(--pl-border)" }}
            >
              <dt className="text-xs font-medium" style={{ color: "var(--pl-text-muted)" }}>
                {isRealTipster ? "Liberado por cobrar" : `Comisión ${activeTipster.commissionPct} %`}
              </dt>
              <dd className="m-0">
                <strong
                  className="block text-lg sm:text-xl font-extrabold break-words"
                  style={{ color: "var(--pl-success)" }}
                >
                  {isRealTipster
                    ? formatMxnCentavos(tipsterMe?.totals?.payableCentavos ?? 0)
                    : `$${sofia.monthlyCommissionMxn.toLocaleString("es-MX")} MXN`}
                </strong>
                <span className="block text-xs mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
                  {isRealTipster
                    ? `14 días: ${formatMxnCentavos(tipsterMe?.totals?.pendingClearanceCentavos ?? 0)} · Pagado: ${formatMxnCentavos(tipsterMe?.totals?.paidOutCentavos ?? 0)}`
                    : "Recurrente + Pase Ultra $0"}
                </span>
              </dd>
            </div>

            <div
              className="p-3.5 sm:p-4 space-y-1 min-w-0 border-0 border-solid border-l"
              style={{ borderColor: "var(--pl-border)" }}
            >
              <dt className="text-xs font-medium" style={{ color: "var(--pl-text-muted)" }}>
                Pick abierto semanal
              </dt>
              <dd className="m-0">
                <strong className="block text-lg sm:text-xl font-extrabold">1 / 1 disp.</strong>
                <span className="block text-xs mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
                  Los otros 4 quedan bloqueados
                </span>
              </dd>
            </div>
          </dl>
        </section>

        {isRealTipster ? (
          <section className="glass-card glass-ring rounded-2xl p-4 sm:p-5 space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 id="tipster-ledger-title" className="m-0 text-base sm:text-lg font-extrabold">
                  Historial de comisiones (neto después de IVA 16 %)
                </h2>
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Cada pago atribuido a tu código se libera a los 14 días para liquidación SPEI.
                </p>
              </div>
              <span className="pl-pill pl-pill--success num">
                Total pagado: {formatMxnCentavos(tipsterMe?.totals?.paidOutCentavos ?? 0)}
              </span>
            </div>

            {(tipsterMe?.ledger?.length ?? 0) === 0 ? (
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Aún no hay comisiones registradas en tu cuenta. Cuando un referido active un pase de
                pago con tu código <strong>{activeTipster.promoCode}</strong>, cada movimiento
                aparecerá aquí.
              </p>
            ) : (
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-labelledby="tipster-ledger-title"
              >
                <table className="w-full min-w-[620px] text-left border-collapse text-xs num">
                  <thead>
                    <tr style={{ color: "var(--pl-text-muted)", borderBottom: "1px solid var(--pl-border)" }}>
                      <th scope="col" className="py-2 pr-3 font-bold">Fecha</th>
                      <th scope="col" className="py-2 pr-3 font-bold">Pago bruto</th>
                      <th scope="col" className="py-2 pr-3 font-bold">Neto post-IVA</th>
                      <th scope="col" className="py-2 pr-3 font-bold">Comisión</th>
                      <th scope="col" className="py-2 pr-3 font-bold">Estado</th>
                      <th scope="col" className="py-2 font-bold">Liberación / Nota SPEI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tipsterMe?.ledger ?? []).map((row) => {
                      const badge = ledgerStatusBadge(row.status);
                      return (
                        <tr
                          key={row.id}
                          style={{ borderBottom: "1px solid var(--pl-border)" }}
                        >
                          <td className="py-2.5 pr-3">
                            {new Date(row.createdAtIso).toLocaleDateString("es-MX", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </td>
                          <td className="py-2.5 pr-3">{formatMxnCentavos(row.grossPaidCentavosMxn)}</td>
                          <td className="py-2.5 pr-3">{formatMxnCentavos(row.netCommissionableCentavosMxn)}</td>
                          <td className="py-2.5 pr-3 font-extrabold" style={{ color: "var(--pl-success)" }}>
                            {formatMxnCentavos(row.commissionCentavosMxn)}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className={badge.pillClass}>{badge.label}</span>
                          </td>
                          <td className="py-2.5" style={{ color: "var(--pl-text-secondary)" }}>
                            {row.paidOutAtIso
                              ? `Pagado ${new Date(row.paidOutAtIso).toLocaleDateString("es-MX")}${row.payoutNote ? ` · ${row.payoutNote}` : ""}`
                              : `Libera ${new Date(row.clearsAtIso).toLocaleDateString("es-MX")}${row.payoutNote ? ` · ${row.payoutNote}` : ""}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
          {/* Izquierda (lg:col-span-7): Configurador plano editorial */}
          <section className="lg:col-span-7 glass-card glass-ring rounded-2xl p-4 sm:p-5 space-y-5 min-w-0">
            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="m-0 text-base sm:text-lg font-extrabold">
                  1. Origen de tu Pick abierto de la semana
                </h2>
                <div
                  className="seg-well seg-well--stack w-full"
                  role="group"
                  aria-label="Origen del pick semanal"
                >
                  <button
                    type="button"
                    className="seg-btn flex-1 justify-center text-xs min-h-11 sm:min-h-9"
                    aria-pressed={isSpacetimeOrigin}
                    onClick={() => setTipsterWeeklyPickOrigin("spacetime")}
                  >
                    <MaestroIcon name="cpu" size={14} />
                    <span>Pick Oficial Spacetime Suite</span>
                  </button>
                  <button
                    type="button"
                    className="seg-btn flex-1 justify-center text-xs min-h-11 sm:min-h-9"
                    aria-pressed={!isSpacetimeOrigin}
                    onClick={() => setTipsterWeeklyPickOrigin("bitacora")}
                  >
                    <MaestroIcon name="ticket" size={14} />
                    <span>
                      Pick Propio de mi Bitácora (<span className="num">{journal.length}</span>)
                    </span>
                  </button>
                </div>
              </div>

              {isSpacetimeOrigin ? (
                <>
                  <div className="space-y-2">
                    <label
                      id="tipster-match-select-label"
                      htmlFor="tipster-match-select"
                      className="block text-xs font-bold"
                      style={{ color: "var(--pl-text-secondary)" }}
                    >
                      2. Selecciona el partido de la jornada
                    </label>
                    <PlSelect
                      id="tipster-match-select"
                      ariaLabelledBy="tipster-match-select-label"
                      variant="glass"
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
                          icon: <LeagueBadge league={g.league} label={g.leagueLabel} size={18} />,
                        }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <span
                      className="block text-xs font-bold"
                      style={{ color: "var(--pl-text-secondary)" }}
                    >
                      3. Elige cuál de los <span className="num">{matchPicks.length || 5}</span> picks liberarás gratis (los otros permanecen cerrados)
                    </span>
                    <div
                      className="rounded-xl overflow-hidden"
                      style={{
                        background: "var(--pl-surface)",
                        border: "1px solid var(--pl-border)",
                      }}
                    >
                      {matchPicks.map((pk, idx) => {
                        const isSelected = pk.id === activePick?.id;
                        return (
                          <button
                            key={pk.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => setSelectedTipsterPickId(pk.id)}
                            className="w-full min-h-[52px] px-3.5 py-2.5 text-left flex items-center justify-between gap-3 cursor-pointer border-0 transition-colors"
                            style={{
                              background: isSelected
                                ? "var(--pl-surface-active)"
                                : "transparent",
                              color: "var(--pl-text)",
                              borderTop: idx > 0 ? "1px solid var(--pl-border)" : "none",
                              borderLeft: isSelected
                                ? "3px solid var(--pl-brand)"
                                : "3px solid transparent",
                            }}
                          >
                            <div className="min-w-0">
                              <span
                                className="block text-xs font-bold"
                                style={{ color: "var(--pl-brand)" }}
                              >
                                {pk.categoryLabel}
                              </span>
                              <strong className="block text-sm font-extrabold truncate">
                                {pk.label}
                              </strong>
                            </div>
                            <div className="text-right num text-xs shrink-0">
                              <div className="font-extrabold">
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
                <div
                  className="rounded-xl p-3.5 space-y-1.5"
                  style={{
                    background: "var(--pl-surface-elevated)",
                    border: "1px solid var(--pl-border)",
                  }}
                >
                  <span
                    className="block text-xs font-bold"
                    style={{ color: "var(--pl-accent)" }}
                  >
                    Tomado de tu Bitácora verificada pre-partido
                  </span>
                  <strong className="block text-base font-extrabold">
                    {previewSelectionLabel}
                  </strong>
                  <span
                    className="block text-xs num"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    {previewMatchTitle} · Cuota sellada{" "}
                    {formatOddsValue(previewBook ?? previewFair, oddsFormat)}
                  </span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="tipster-thesis-input"
                    className="block text-xs font-bold min-w-0"
                    style={{ color: "var(--pl-text-secondary)" }}
                  >
                    4. Tu tesis para redes sociales (/p/{activeTipster.weeklyPickSlug})
                  </label>
                  <span className="text-xs num shrink-0" style={{ color: "var(--pl-text-muted)" }}>
                    {thesis.length}/220
                  </span>
                </div>
                <textarea
                  id="tipster-thesis-input"
                  rows={3}
                  maxLength={220}
                  value={thesis}
                  onChange={(e) => setThesis(e.target.value)}
                  className="glass-input w-full min-w-0 p-3 text-base sm:text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  className="pl-btn-primary text-xs min-h-11 sm:min-h-9 whitespace-normal sm:whitespace-nowrap text-left"
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
                </button>

                <a
                  href={`/p/${activeTipster.weeklyPickSlug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    pushToast(`Abriendo vista pública /p/${activeTipster.weeklyPickSlug}...`, "default");
                    navigateTo(`/p/${activeTipster.weeklyPickSlug}`);
                  }}
                  className="pl-btn-glass text-xs min-h-11 sm:min-h-9"
                >
                  <span>Abrir /p/{activeTipster.weeklyPickSlug}</span>
                  <MaestroIcon name="arrowRight" size={13} />
                </a>
              </div>
            </div>
          </section>

          {/* Derecha (lg:col-span-5): Boleto compartible */}
          <aside className="lg:col-span-5 space-y-3 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-xs font-extrabold"
                style={{ color: "var(--pl-text-muted)" }}
              >
                Boleto para compartir
              </span>
              <div
                className="seg-well"
                role="group"
                aria-label="Relación de aspecto de vista previa"
              >
                <button
                  type="button"
                  className="seg-btn text-xs min-h-11 sm:min-h-9 px-3"
                  aria-pressed={previewRatio === "4:5"}
                  onClick={() => setPreviewRatio("4:5")}
                >
                  Post 4:5
                </button>
                <button
                  type="button"
                  className="seg-btn text-xs min-h-11 sm:min-h-9 px-3"
                  aria-pressed={previewRatio === "9:16"}
                  onClick={() => setPreviewRatio("9:16")}
                >
                  Story 9:16
                </button>
              </div>
            </div>

            <div
              ref={previewCardRef}
              className={`share-ticket-card glass-ring p-5 sm:p-6 flex flex-col justify-between transition-[transform,opacity,background-color,border-color] ${
                previewRatio === "9:16" ? "min-h-[468px]" : "min-h-[382px]"
              }`}
            >
              <div className="relative z-10 flex items-center justify-between gap-2">
                <img
                  src={getLogoPath("horizontal", "dark")}
                  alt="PitchLab"
                  width={108}
                  height={21}
                  loading="lazy"
                  decoding="async"
                />
                <span
                  className="text-xs font-extrabold px-2.5 py-0.5 rounded-md"
                  style={{
                    background: "var(--share-card-surface)",
                    color: "var(--share-card-success)",
                    border: "1px solid var(--share-card-border)",
                  }}
                >
                  PICK GRATIS SEMANAL
                </span>
              </div>

              <div className="relative z-10 space-y-3 my-4">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-9 h-9 rounded-full inline-flex items-center justify-center text-xs font-extrabold shrink-0"
                    style={{
                      background: activeTipster.avatarGradVar,
                      color: "var(--share-card-fg)",
                    }}
                    aria-hidden="true"
                  >
                    {activeTipster.avatarInitials}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold truncate">
                      {activeTipster.name} · @{activeTipster.handle}
                      {activeTipster.isExample ? " · Ejemplo" : ""}
                    </div>
                    <div
                      className="text-xs truncate"
                      style={{ color: "var(--share-card-accent)" }}
                    >
                      {isSpacetimeOrigin
                        ? `Respaldado por ${activePick?.engineName ?? "PitchLab Spacetime Suite v5.1"}`
                        : "Tesis propia auditada en Bitácora PitchLab"}
                    </div>
                  </div>
                </div>

                <div className="text-xs" style={{ color: "var(--share-card-muted)" }}>
                  {previewMatchTitle}
                </div>

                <div
                  className="rounded-xl p-3.5 space-y-1"
                  style={{
                    background: "var(--share-card-surface)",
                    border: "1px solid var(--share-card-border)",
                  }}
                >
                  <div className="text-lg sm:text-xl font-extrabold tracking-tight">
                    {previewSelectionLabel}
                  </div>
                  <div
                    className="text-xs num flex flex-wrap items-center justify-between gap-2 pt-0.5"
                    style={{ color: "var(--share-card-secondary)" }}
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
                  className="m-0 text-xs leading-relaxed"
                  style={{ color: "var(--share-card-secondary)" }}
                >
                  “{thesis}”
                </p>

                <div className="ticket-perf" />
              </div>

              <div
                className="relative z-10 rounded-xl p-3 flex items-center justify-between gap-2"
                style={{
                  background: "var(--share-card-surface)",
                  border: "1px solid var(--share-card-border)",
                }}
              >
                <div className="text-xs min-w-0">
                  <div className="font-extrabold">
                    Código {activeTipster.promoCode} · <span className="num">{activeTipster.freeDays}</span> días gratis
                  </div>
                  <div style={{ color: "var(--share-card-muted)" }}>
                    Desbloquea los otros 4 picks en pitchlab.mx
                  </div>
                </div>
                <span
                  className="num text-xs font-extrabold px-2 py-1 rounded shrink-0"
                  style={{
                    background: "var(--share-card-fg)",
                    color: "var(--share-card-bg)",
                  }}
                >
                  18+
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-11 sm:min-h-9 min-w-0"
                aria-label={`Copiar enlace público /p/${activeTipster.weeklyPickSlug}`}
                onClick={handleCopyPublicUrl}
              >
                <MaestroIcon name="copy" size={13} />
                <span className="truncate">Copiar enlace</span>
              </button>
              <button
                type="button"
                className="pl-btn-primary text-xs min-h-11 sm:min-h-9 min-w-0"
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
                <MaestroIcon name="download" size={13} />
                <span>Descargar PNG</span>
              </button>
            </div>
          </aside>
        </div>

        {/* Modal inline: Simulación exacta de cómo ve un visitante externo */}
        <TopLayerModalDialog
          open={visitorPreviewOpen}
          onClose={() => setVisitorPreviewOpen(false)}
          ariaLabelledBy="tipster-visitor-sim-title"
          maxWidth="34rem"
        >
          <div className="w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-bold"
                  style={{ color: "var(--pl-success)" }}
                >
                  <MaestroIcon name="eye" size={13} />
                  <span>Simulación de visitante externo</span>
                </span>
                <p
                  className="m-0 text-xs break-words"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  pitchlab.mx/p/{activeTipster.weeklyPickSlug}
                </p>
              </div>
              <button
                type="button"
                className="pl-btn-glass px-2.5 min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 shrink-0"
                aria-label="Cerrar simulación de visitante"
                onClick={() => setVisitorPreviewOpen(false)}
              >
                <MaestroIcon name="x" size={15} />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span
                className="w-11 h-11 rounded-full avatar-ring inline-flex items-center justify-center text-xs font-extrabold shrink-0"
                style={{
                  background: activeTipster.avatarGradVar,
                  color: "var(--share-card-fg)",
                }}
                aria-hidden="true"
              >
                {activeTipster.avatarInitials}
              </span>
              <div className="min-w-0">
                <h2 id="tipster-visitor-sim-title" className="m-0 text-base font-extrabold">
                  @{activeTipster.handle} liberó 1 Pick Gratis de este partido
                </h2>
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {previewMatchTitle} ·{" "}
                  {activePick?.engineName ?? "PitchLab Spacetime Suite v5.1"}
                </p>
              </div>
            </div>

            <div
              className="rounded-xl p-4 space-y-2"
              style={{
                background: "var(--pl-surface-elevated)",
                border: "1px solid var(--pl-border)",
              }}
            >
              <span
                className="inline-flex items-center gap-1.5 text-xs font-extrabold"
                style={{ color: "var(--pl-success)" }}
              >
                <MaestroIcon name="unlock" size={13} />
                <span>Pick abierto de la semana</span>
              </span>
              <div className="text-xl font-extrabold">
                {previewSelectionLabel}
              </div>
              <div className="num text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                Probabilidad Spacetime Suite:{" "}
                <strong style={{ color: "var(--pl-brand)" }}>
                  {(previewProb * 100).toFixed(1)} %
                </strong>{" "}
                · Cuota justa{" "}
                <strong>{formatOddsValue(previewFair, oddsFormat)}</strong>
              </div>
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                “{thesis}”
              </p>
            </div>

            <div className="space-y-2">
              <div
                className="text-xs font-bold num"
                style={{ color: "var(--pl-text-muted)" }}
              >
                Otros {Math.max(4, lockedSiblingPicks.length)} picks de este mismo partido (con Pase PitchLab Ultra):
              </div>
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  background: "var(--pl-surface)",
                  border: "1px solid var(--pl-border)",
                }}
              >
                {(lockedSiblingPicks.length > 0
                  ? lockedSiblingPicks.slice(0, 4)
                  : [
                      { id: "lk-1", categoryLabel: "Muy probable", engineName: "Tachyon v5.1" },
                      { id: "lk-2", categoryLabel: "Goles totales", engineName: "Singularity v5.1" },
                      { id: "lk-3", categoryLabel: "Lectura del partido", engineName: "Cortex IA" },
                      { id: "lk-4", categoryLabel: "Valor contra la casa", engineName: "Geodesic v2.0" },
                    ]
                ).map((lp, idx) => (
                  <div
                    key={lp.id}
                    className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    style={{
                      borderTop: idx > 0 ? "1px solid var(--pl-border)" : "none",
                    }}
                  >
                    <span
                      className="inline-flex items-center gap-1.5 font-bold"
                      style={{ color: "var(--pl-brand)" }}
                    >
                      <MaestroIcon name="lock" size={12} />
                      <span>{lp.categoryLabel}</span>
                    </span>
                    <span className="locked-redact font-extrabold">
                      RESERVADO PASE PITCHLAB ULTRA
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="pl-btn-primary w-full text-xs min-h-11 whitespace-normal text-center"
              onClick={() => {
                setVisitorPreviewOpen(false);
                navigateTo(`/signup?code=${activeTipster.promoCode}`);
              }}
            >
              <span>
                Canjear código {activeTipster.promoCode} · <span className="num">{activeTipster.freeDays}</span> días de Pase PitchLab Ultra gratis
              </span>
              <MaestroIcon name="arrowRight" size={14} />
            </button>
          </div>
        </TopLayerModalDialog>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
