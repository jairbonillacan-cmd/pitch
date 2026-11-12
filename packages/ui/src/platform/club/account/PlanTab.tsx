"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ExampleBadge, ExampleNotice } from "../../components/MaestroPrimitives";
import { TopLayerModalDialog } from "../../components/PlatformOverlays";
import { ACCOUNT_TAB_EVENT } from "../../components/ShellChrome";
import { usePlatform } from "../../platform-provider";
import {
  annualSavingsMxn,
  MEMBERSHIP_SPEC,
  referralEarnedDays,
  SPACETIME_METRICS_HEADLINE,
} from "../../spacetime-catalog";
import {
  deriveExampleReferralCode,
  type SessionAccountIdentity,
} from "./account-helpers";
import { LazyReferralCard3D } from "./LazyReferralCard3D";

export type PlanStateOverride = "prueba" | "mensual" | "anual" | "sin_renovacion";

export interface ServerPlanPayload {
  active: boolean;
  planState: PlanStateOverride;
  interval: "monthly" | "annual";
  hasCard: boolean;
  cancelAtPeriodEnd: boolean;
  accessUntilIso: string | null;
  currentPeriodEndIso: string | null;
  memberSinceIso: string | null;
  trialDaysRemaining: number;
  paidFriends: number;
  earnedDays: number;
  stripeConfigured: boolean;
}

export interface PlanTabStoryOverride {
  accountsEnabled?: boolean;
  planState?: PlanStateOverride;
  paidFriends?: number;
  stripeConfigured?: boolean;
  referralCode?: string | null;
  serverPlan?: ServerPlanPayload;
}

type PlanDialogKind = "cancel" | "reactivate" | "card" | "switch" | null;

const DAY_MS = 86_400_000;

const SHORT_DATE_FMT = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatShortDateEs(iso: string | null | undefined, fallback: string): string {
  if (!iso) return fallback;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return fallback;
  return SHORT_DATE_FMT.format(new Date(ms)).replace(/\./g, "");
}

function addDaysIso(baseIso: string, days: number): string {
  const ms = Date.parse(baseIso);
  return new Date(ms + days * DAY_MS).toISOString();
}

function CheckIcon(): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="pl-acct-plan-feat-icon"
    >
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

export function PlanTab({
  identity,
  referralCode,
  initialServerPlan,
  storyOverride,
  onOpenBilling,
}: {
  identity: SessionAccountIdentity;
  referralCode?: string | null;
  initialServerPlan?: ServerPlanPayload | null;
  storyOverride?: PlanTabStoryOverride;
  onOpenBilling?: () => void;
}): React.JSX.Element {
  const {
    accountsEnabled: ctxAccountsEnabled,
    allowRoleSimulation,
    referralPaidFriends,
  } = usePlatform();

  const accountsEnabled = storyOverride?.accountsEnabled ?? ctxAccountsEnabled;
  const [simPlanState, setSimPlanState] = useState<PlanStateOverride | null>(null);

  const [serverPlan, setServerPlan] = useState<ServerPlanPayload | null>(
    storyOverride?.serverPlan ?? initialServerPlan ?? null,
  );
  const [loadingPlan, setLoadingPlan] = useState<boolean>(
    Boolean(
      accountsEnabled &&
        !storyOverride?.serverPlan &&
        !initialServerPlan &&
        !storyOverride?.planState,
    ),
  );
  const [flipped, setFlipped] = useState(false);
  const [cancelledLocal, setCancelledLocal] = useState<boolean | null>(null);
  const [switchedCycleLocal, setSwitchedCycleLocal] = useState<"mensual" | "anual" | null>(null);
  const [cycleChoice, setCycleChoice] = useState<"mensual" | "anual" | null>(null);
  const [activeDialog, setActiveDialog] = useState<PlanDialogKind>(null);
  const [portalNotice, setPortalNotice] = useState<string>("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const dialogTitleId = useId();

  useEffect(() => {
    if (storyOverride?.serverPlan) {
      setServerPlan(storyOverride.serverPlan);
      setLoadingPlan(false);
      return;
    }
    if (initialServerPlan) {
      setServerPlan(initialServerPlan);
      setLoadingPlan(false);
      return;
    }
    if (!accountsEnabled || storyOverride?.planState) {
      setLoadingPlan(false);
      return;
    }
    let cancelled = false;
    setLoadingPlan(true);
    fetch("/api/me/plan", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as ServerPlanPayload;
      })
      .then((json) => {
        if (cancelled) return;
        if (json) setServerPlan(json);
      })
      .catch((err) => {
        void err;
      })
      .finally(() => {
        if (!cancelled) setLoadingPlan(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountsEnabled, initialServerPlan, storyOverride?.planState, storyOverride?.serverPlan]);

  // Sin cuentas, el estado predeterminado es «prueba» (§4), salvo override de Storybook o simulador.
  const baseState: PlanStateOverride = useMemo(() => {
    if (simPlanState) return simPlanState;
    if (storyOverride?.planState) return storyOverride.planState;
    if (accountsEnabled && serverPlan) return serverPlan.planState;
    return "prueba";
  }, [accountsEnabled, serverPlan, simPlanState, storyOverride?.planState]);

  const stripeConfigured =
    storyOverride?.stripeConfigured ?? serverPlan?.stripeConfigured ?? false;

  const isTrial = baseState === "prueba";
  const isAnnual = useMemo(() => {
    if (switchedCycleLocal) return switchedCycleLocal === "anual";
    if (baseState === "anual") return true;
    if (accountsEnabled && serverPlan) return serverPlan.interval === "annual";
    return false;
  }, [accountsEnabled, baseState, serverPlan, switchedCycleLocal]);

  const isCancelled = useMemo(() => {
    if (isTrial) return false;
    if (cancelledLocal !== null) return cancelledLocal;
    return baseState === "sin_renovacion" || Boolean(serverPlan?.cancelAtPeriodEnd);
  }, [baseState, cancelledLocal, isTrial, serverPlan?.cancelAtPeriodEnd]);

  const selectedCycle: "mensual" | "anual" =
    cycleChoice ?? (isAnnual ? "anual" : "mensual");

  const paidFriends = useMemo(() => {
    if (typeof storyOverride?.paidFriends === "number") {
      return Math.max(0, storyOverride.paidFriends);
    }
    if (accountsEnabled) {
      return Math.max(0, serverPlan?.paidFriends ?? 0);
    }
    if (isTrial) {
      return Math.max(0, referralPaidFriends);
    }
    return 2 + Math.max(0, referralPaidFriends);
  }, [accountsEnabled, isTrial, referralPaidFriends, serverPlan?.paidFriends, storyOverride?.paidFriends]);

  const earnedDays = useMemo(
    () =>
      accountsEnabled && serverPlan && typeof storyOverride?.paidFriends !== "number"
        ? serverPlan.earnedDays
        : referralEarnedDays(paidFriends),
    [accountsEnabled, paidFriends, serverPlan, storyOverride?.paidFriends],
  );

  const trialDaysLeft = useMemo(() => {
    if (accountsEnabled && serverPlan) {
      return serverPlan.trialDaysRemaining;
    }
    return 4;
  }, [accountsEnabled, serverPlan]);

  // Fechas: con cuentas salen de accessUntil() y currentPeriodEnd; sin cuentas son las del lienzo marcadas «Ejemplo».
  const exampleBaseCutIso = isAnnual
    ? "2027-11-11T12:00:00Z"
    : "2026-12-11T12:00:00Z";
  const exampleShiftedIso = addDaysIso(exampleBaseCutIso, earnedDays);

  const baseCutDate = accountsEnabled
    ? formatShortDateEs(
        serverPlan?.currentPeriodEndIso ?? serverPlan?.accessUntilIso,
        "Sin fecha programada",
      )
    : formatShortDateEs(exampleBaseCutIso, "11 dic 2026");

  const accessEndDate = accountsEnabled
    ? formatShortDateEs(
        serverPlan?.accessUntilIso ?? serverPlan?.currentPeriodEndIso,
        "Sin fecha activa",
      )
    : isTrial
      ? formatShortDateEs(addDaysIso("2026-11-15T12:00:00Z", earnedDays), "15 nov 2026")
      : formatShortDateEs(exampleShiftedIso, "10 ene 2027");

  const monthlyMxn = MEMBERSHIP_SPEC.monthlyMxn;
  const annualMxn = MEMBERSHIP_SPEC.annualMxn;
  const annualEqMxn = MEMBERSHIP_SPEC.annualMonthlyEquivalentMxn;
  const firstMonthFriendMxn = MEMBERSHIP_SPEC.referralFriendFirstMonthMxn;
  const bothRewardDays = MEMBERSHIP_SPEC.referralBothRewardDays;
  const trialTotalDays = MEMBERSHIP_SPEC.referralTrialDays;
  const annualSavings = useMemo(() => annualSavingsMxn(), []);
  const annualFormatted = annualMxn.toLocaleString("es-MX");
  const savingsFormatted = annualSavings.toLocaleString("es-MX");

  const passCode = useMemo(() => {
    if (storyOverride?.referralCode) return storyOverride.referralCode;
    if (accountsEnabled) {
      return referralCode ?? "ULTRA";
    }
    return deriveExampleReferralCode(identity.cleanHandle);
  }, [accountsEnabled, identity.cleanHandle, referralCode, storyOverride?.referralCode]);
  const tierLabel = identity.isTipstar ? "ULTRA · TIPSTAR" : "ULTRA";

  const statusPill = useMemo(() => {
    if (isTrial) {
      if (accountsEnabled && serverPlan && !serverPlan.active) {
        return {
          label: "Prueba finalizada",
          toneClass: "pl-acct-status-pill--warn",
        };
      }
      return {
        label: `Prueba · ${trialDaysLeft === 1 ? "queda 1 día" : `quedan ${trialDaysLeft} días`}`,
        toneClass: "pl-acct-status-pill--brand",
      };
    }
    if (isCancelled) {
      return {
        label: "Sin renovación",
        toneClass: "pl-acct-status-pill--warn",
      };
    }
    return {
      label: "Activo",
      toneClass: "pl-acct-status-pill--ok",
    };
  }, [accountsEnabled, isCancelled, isTrial, serverPlan, trialDaysLeft]);

  const headline = useMemo(() => {
    if (isTrial) {
      if (accountsEnabled && serverPlan && !serverPlan.active) {
        return "Tu prueba sin costo terminó";
      }
      return `Te ${trialDaysLeft === 1 ? "queda 1 día" : `quedan ${trialDaysLeft} días`} de prueba`;
    }
    if (isCancelled) {
      return `Tienes acceso hasta el ${accessEndDate}`;
    }
    return isAnnual ? "Pase PitchLab Ultra anual" : "Pase PitchLab Ultra mensual";
  }, [accessEndDate, accountsEnabled, isAnnual, isCancelled, isTrial, serverPlan, trialDaysLeft]);

  const subline = useMemo(() => {
    if (isTrial) {
      return "Al terminar no hay cobro automático. Activa mensual o anual para conservar el acceso completo; tu bitácora siempre se queda guardada.";
    }
    if (isCancelled) {
      return earnedDays > 0
        ? `No se te volverá a cobrar. Tus +${earnedDays} días a favor ya están sumados a esa fecha.`
        : "No se te volverá a cobrar. Tu bitácora se queda guardada.";
    }
    if (isAnnual) {
      return earnedDays > 0
        ? `Pagaste el año completo y tienes +${earnedDays} días a favor: tu próximo cobro se recorre al ${accessEndDate}.`
        : `Pagaste el año completo. Se renueva el ${baseCutDate} y te avisamos 7 días antes.`;
    }
    return earnedDays > 0
      ? `Tu cobro del ${baseCutDate} se recorre al ${accessEndDate} por tus +${earnedDays} días a favor. Te avisamos 3 días antes.`
      : `Se renueva el ${baseCutDate} y te avisamos 3 días antes.`;
  }, [accessEndDate, baseCutDate, earnedDays, isAnnual, isCancelled, isTrial]);

  const facts = useMemo(() => {
    const daysNote =
      earnedDays === 0
        ? `Sumas +${bothRewardDays} días por cada amigo que pague`
        : isCancelled
          ? `Sumados a tu acceso hasta el ${accessEndDate}`
          : isTrial
            ? "Se suman al activar tu pase"
            : `Tu próximo cobro se recorre al ${accessEndDate}`;

    if (isTrial) {
      return [
        {
          label: "Plan",
          value: `Prueba sin costo de ${trialTotalDays} días`,
          note: "Sin tarjeta",
          tone: "muted" as const,
        },
        {
          label: "Termina",
          value: accessEndDate,
          note:
            trialDaysLeft > 0
              ? `En ${trialDaysLeft} ${trialDaysLeft === 1 ? "día" : "días"}`
              : "Periodo concluido",
          tone: "warn" as const,
        },
        {
          label: "Tarjeta",
          value: "Sin cobro automático",
          note: "Elige mensual o anual si decides activar",
          tone: "muted" as const,
        },
        {
          label: "Días a favor",
          value: `+${earnedDays} días`,
          note: daysNote,
          tone: earnedDays > 0 ? ("ok" as const) : ("muted" as const),
        },
      ];
    }

    return [
      {
        label: "Plan",
        value: isAnnual
          ? `Anual · $${annualFormatted} MXN`
          : `Mensual · $${monthlyMxn} MXN`,
        note: "IVA incluido",
        tone: "muted" as const,
      },
      {
        label: isCancelled ? "Acceso hasta" : "Próximo cobro",
        value: accessEndDate,
        note: isCancelled
          ? `Tienes acceso hasta ${accessEndDate}`
          : earnedDays > 0
            ? `Se recorrió +${earnedDays} días`
            : isAnnual
              ? `$${annualFormatted} MXN`
              : `$${monthlyMxn} MXN`,
        tone: isCancelled
          ? ("muted" as const)
          : earnedDays > 0
            ? ("ok" as const)
            : ("muted" as const),
      },
      {
        label: "Tarjeta",
        value: accountsEnabled
          ? serverPlan?.hasCard
            ? "Registrada en Stripe"
            : "Sin tarjeta registrada"
          : "Visa ···· 4242",
        note: accountsEnabled ? "Administrada por Stripe" : "Vence 08/29 · Ejemplo",
        tone: "muted" as const,
      },
      {
        label: "Días a favor",
        value: `+${earnedDays} días`,
        note: daysNote,
        tone: earnedDays > 0 ? ("ok" as const) : ("muted" as const),
      },
    ];
  }, [
    accessEndDate,
    accountsEnabled,
    annualFormatted,
    bothRewardDays,
    earnedDays,
    isAnnual,
    isCancelled,
    isTrial,
    monthlyMxn,
    serverPlan?.hasCard,
    trialDaysLeft,
    trialTotalDays,
  ]);

  const features = useMemo(
    () => [
      {
        title: "Hasta 5 picks por partido",
        detail: `En las ${SPACETIME_METRICS_HEADLINE.activeLeaguesCount} ligas, con su probabilidad y momio justo`,
      },
      {
        title: "Armador de parlays",
        detail: "También del mismo partido, con probabilidad combinada",
      },
      {
        title: "Alertas de valor",
        detail: "Cuando un momio paga más que el justo en tus partidos",
      },
      {
        title: "Bitácora con récord",
        detail: "Saldo, cumplidos y ventaja contra el cierre",
      },
      {
        title: "Comunidad y ranking",
        detail: "Publica tus picks y sigue a otros socios",
      },
      {
        title: "Factura CFDI 4.0",
        detail: "Automática en cada cobro",
      },
    ],
    [],
  );

  const examplePayments = useMemo(() => {
    if (isTrial) {
      return [
        {
          id: "p-trial",
          date: "8 nov 2026",
          what: "Inicio de prueba sin tarjeta",
          amount: "$0",
          hasInvoice: false,
        },
      ];
    }
    if (isAnnual) {
      return [
        {
          id: "p-annual",
          date: "11 nov 2026",
          what: "Pase anual",
          amount: `$${annualFormatted}`,
          hasInvoice: true,
        },
        {
          id: "p-trial-a",
          date: "4 oct 2026",
          what: "Inicio de prueba",
          amount: "$0",
          hasInvoice: false,
        },
      ];
    }
    return [
      {
        id: "p-m2",
        date: "11 nov 2026",
        what: "Pase mensual",
        amount: `$${monthlyMxn}`,
        hasInvoice: true,
      },
      {
        id: "p-m1",
        date: "11 oct 2026",
        what: "Primer mes con invitación de @mariana_t",
        amount: `$${firstMonthFriendMxn}`,
        hasInvoice: true,
      },
      {
        id: "p-trial-m",
        date: "4 oct 2026",
        what: "Inicio de prueba",
        amount: "$0",
        hasInvoice: false,
      },
    ];
  }, [annualFormatted, firstMonthFriendMxn, isAnnual, isTrial, monthlyMxn]);

  const handleGoBilling = useCallback(() => {
    if (onOpenBilling) {
      onOpenBilling();
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ACCOUNT_TAB_EVENT, { detail: "cfdi" }));
    }
  }, [onOpenBilling]);

  const handleActivateFromTrial = useCallback(
    async (intervalChoice: "mensual" | "anual") => {
      const apiInterval = intervalChoice === "anual" ? "annual" : "monthly";
      if (!accountsEnabled) {
        setPortalNotice("Disponible cuando se active el cobro.");
        return;
      }
      setCheckoutBusy(true);
      setPortalNotice("");
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ interval: apiInterval }),
        });
        if (res.status === 503) {
          setPortalNotice("Disponible cuando se active el cobro.");
          return;
        }
        const json = (await res.json().catch(() => null)) as {
          url?: string;
          error?: string;
        } | null;
        if (res.ok && json?.url && typeof window !== "undefined") {
          window.location.assign(json.url);
          return;
        }
        setPortalNotice(
          !stripeConfigured
            ? "Disponible cuando se active el cobro."
            : json?.error ?? "No se pudo abrir el pago.",
        );
      } catch (err) {
        void err;
        setPortalNotice("Disponible cuando se active el cobro.");
      } finally {
        setCheckoutBusy(false);
      }
    },
    [accountsEnabled, stripeConfigured],
  );

  const confirmCancel = useCallback(() => {
    setCancelledLocal(true);
    setActiveDialog(null);
    setPortalNotice(
      accountsEnabled && !stripeConfigured
        ? "Disponible cuando se active el cobro."
        : "",
    );
    if (typeof window !== "undefined") {
      const reduced = Boolean(
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
      );
      window.requestAnimationFrame(() => {
        window.scrollTo({
          top: 0,
          behavior: reduced ? "auto" : "smooth",
        });
      });
    }
  }, [accountsEnabled, stripeConfigured]);

  const confirmReactivate = useCallback(() => {
    setCancelledLocal(false);
    setActiveDialog(null);
    setPortalNotice(
      stripeConfigured
        ? "Renovación reactivada."
        : "Disponible cuando se active el cobro.",
    );
  }, [stripeConfigured]);

  const confirmCardChange = useCallback(() => {
    setActiveDialog(null);
    setPortalNotice("Disponible cuando se active el cobro.");
  }, []);

  const confirmCycleSwitch = useCallback(() => {
    setSwitchedCycleLocal(selectedCycle);
    setActiveDialog(null);
    setPortalNotice(
      stripeConfigured
        ? "Listo. El cambio se aplica en tu siguiente corte."
        : "Disponible cuando se active el cobro.",
    );
  }, [selectedCycle, stripeConfigured]);

  const cycleDiffersFromCurrent =
    !isTrial && !isCancelled && selectedCycle !== (isAnnual ? "anual" : "mensual");

  if (accountsEnabled && loadingPlan) {
    return (
      <div className="pl-acct-stack">
        <section className="pl-acct-card glass-card glass-ring" aria-live="polite">
          <p className="pl-acct-generating">Cargando tu plan…</p>
        </section>
      </div>
    );
  }

  return (
    <div className="pl-acct-stack">
      {!accountsEnabled ? (
        <ExampleNotice>
          Estado, fechas e historial de muestra en modo de prueba. Los precios del Pase PitchLab Ultra son los vigentes.
        </ExampleNotice>
      ) : null}

      {/* Aviso superior de cancelación, reactivación o estado del cobro */}
      {isCancelled ? (
        <div
          ref={bannerRef}
          role="status"
          aria-live="polite"
          className="pl-acct-plan-banner pl-acct-plan-banner--warn"
          data-plan-cancelled-banner=""
        >
          <span>
            Cancelaste la renovación. Tienes acceso hasta el {accessEndDate}.
            {portalNotice ? ` ${portalNotice}` : ""}
          </span>
          <button
            type="button"
            className="pl-acct-btn pl-acct-btn--primary pl-acct-btn--sm"
            data-reactivate-plan=""
            onClick={() => setActiveDialog("reactivate")}
          >
            Reactivar renovación
          </button>
        </div>
      ) : portalNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="pl-acct-plan-banner pl-acct-plan-banner--info"
          data-plan-portal-notice=""
        >
          <span>{portalNotice}</span>
        </div>
      ) : null}

      {/* Hero: Tu pase 3D + Estado y 4 datos */}
      <div className="pl-acct-plan-hero">
        <section className="pl-acct-card-stage" aria-label="Tu pase">
          <div className="pl-acct-card-stage-top">
            <span className="pl-acct-card-stage-title">Tu pase</span>
            <span className={`pl-acct-status-pill num ${statusPill.toneClass}`} data-plan-status="">
              <span aria-hidden="true" className="pl-acct-status-dot" />
              <span>{statusPill.label}</span>
            </span>
          </div>

          <button
            type="button"
            className={`pl-acct-cardbtn ${isCancelled ? "pl-acct-cardbtn--muted" : ""}`}
            aria-label={`Pase PitchLab Ultra de ${identity.atHandle}. Voltear`}
            onClick={() => setFlipped((prev) => !prev)}
          >
            <LazyReferralCard3D
              code={passCode}
              bottomLeftLabel={identity.atHandle}
              tierLabel={tierLabel}
              expired={isCancelled}
              flipped={flipped}
              onFlipChange={setFlipped}
              asDecorativeChild
              themeOverride="dark"
            />
          </button>

          <span className="pl-acct-card-stage-hint">
            {isTrial
              ? "Tu pase se activa en cuanto eliges mensual o anual."
              : isCancelled
                ? `Tienes acceso hasta el ${accessEndDate}.`
                : `Pase PitchLab Ultra de ${identity.atHandle}`}
          </span>
        </section>

        <section
          className="pl-acct-card glass-card glass-ring pl-acct-plan-summary"
          aria-labelledby="pl-acct-plan-title"
        >
          <div className="pl-acct-plan-head">
            <div className="pl-acct-row-between">
              <span className="pl-acct-eyebrow">Mi plan</span>
              {!accountsEnabled ? <ExampleBadge /> : null}
            </div>
            <h2 id="pl-acct-plan-title" className="pl-acct-h2 pl-acct-h2--lg">
              {headline}
            </h2>
            <p className="pl-acct-subcopy">{subline}</p>
          </div>

          <dl className="pl-acct-plan-facts num">
            {facts.map((fact) => (
              <div key={fact.label} className="pl-acct-plan-fact">
                <dt>{fact.label}</dt>
                <dd>
                  <span>{fact.value}</span>
                  <span
                    className={`pl-acct-plan-fact-note pl-acct-plan-fact-note--${fact.tone}`}
                  >
                    {fact.note}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="pl-acct-plan-actions">
            {isTrial ? (
              <button
                type="button"
                className="pl-acct-btn pl-acct-btn--primary"
                disabled={checkoutBusy}
                onClick={() => handleActivateFromTrial(selectedCycle)}
              >
                {checkoutBusy
                  ? "Abriendo…"
                  : selectedCycle === "anual"
                    ? "Activar anual"
                    : "Activar mensual"}
              </button>
            ) : null}

            {isCancelled ? (
              <button
                type="button"
                className="pl-acct-btn pl-acct-btn--primary"
                onClick={() => setActiveDialog("reactivate")}
              >
                Reactivar renovación
              </button>
            ) : null}

            {!isTrial && !isCancelled && !isAnnual ? (
              <button
                type="button"
                className="pl-acct-btn pl-acct-btn--primary"
                onClick={() => {
                  setCycleChoice("anual");
                  setActiveDialog("switch");
                }}
              >
                Cambiar a anual
              </button>
            ) : null}

            {!isTrial ? (
              <button
                type="button"
                className="pl-acct-btn pl-acct-btn--ghost"
                onClick={() => setActiveDialog("card")}
              >
                Cambiar tarjeta
              </button>
            ) : null}

            {!isTrial && !isCancelled ? (
              <button
                type="button"
                className="pl-acct-link-btn"
                data-cancel-plan=""
                onClick={() => setActiveDialog("cancel")}
              >
                Cancelar renovación
              </button>
            ) : null}
          </div>
        </section>
      </div>

      {/* Mensual o anual */}
      <section
        className="pl-acct-card glass-card glass-ring"
        aria-labelledby="pl-acct-ciclo-h"
      >
        <div className="pl-acct-row-between">
          <h3 id="pl-acct-ciclo-h" className="pl-acct-h3">
            Mensual o anual
          </h3>
          <span className="pl-acct-muted-inline">
            IVA incluido · factura CFDI 4.0 en cada cobro
          </span>
        </div>

        <div className="pl-acct-cycle-grid" role="group" aria-label="Ciclo de cobro">
          <button
            type="button"
            className="pl-acct-cycle-opt"
            aria-pressed={selectedCycle === "mensual"}
            onClick={() => setCycleChoice("mensual")}
          >
            <span className="pl-acct-cycle-top">
              <span>Mensual</span>
              {!isTrial && !isAnnual ? (
                <span className="pl-acct-cycle-current">Tu plan</span>
              ) : null}
            </span>
            <span className="pl-acct-cycle-price num">
              ${monthlyMxn} <small>MXN al mes</small>
            </span>
            <span className="pl-acct-cycle-note">Cancelas cuando quieras.</span>
          </button>

          <button
            type="button"
            className="pl-acct-cycle-opt"
            aria-pressed={selectedCycle === "anual"}
            onClick={() => setCycleChoice("anual")}
          >
            <span className="pl-acct-cycle-top">
              <span>Anual</span>
              <span className="pl-acct-cycle-save num">
                {!isTrial && isAnnual ? "Tu plan" : `Ahorras $${savingsFormatted}`}
              </span>
            </span>
            <span className="pl-acct-cycle-price num">
              ${annualFormatted} <small>MXN al año</small>
            </span>
            <span className="pl-acct-cycle-note num">
              ${annualEqMxn} al mes · ahorras ${savingsFormatted} al año frente al mensual.
            </span>
          </button>
        </div>

        <div className="pl-acct-cycle-foot">
          <span className="pl-acct-cycle-foot-copy">
            {isTrial
              ? selectedCycle === "anual"
                ? `Activas el año completo por $${annualFormatted} MXN hoy, con factura. Cambiar después no pierde días.`
                : `Activas el ciclo mensual por $${monthlyMxn} MXN hoy, con factura. Cambiar después no pierde días.`
              : cycleDiffersFromCurrent
                ? selectedCycle === "anual"
                  ? `Pasas a anual en tu siguiente corte (${accessEndDate}): pagas $${annualFormatted} MXN y no pierdes días.`
                  : `Vuelves a mensual al terminar tu año (${accessEndDate}). Cambiar no pierde días: aplica en el siguiente corte.`
                : "Cambiar no pierde días: aplica en el siguiente corte."}
          </span>

          {isTrial ? (
            <button
              type="button"
              className="pl-acct-btn pl-acct-btn--primary"
              disabled={checkoutBusy}
              onClick={() => handleActivateFromTrial(selectedCycle)}
            >
              {selectedCycle === "anual" ? "Activar anual" : "Activar mensual"}
            </button>
          ) : cycleDiffersFromCurrent ? (
            <button
              type="button"
              className="pl-acct-btn pl-acct-btn--primary"
              onClick={() => setActiveDialog("switch")}
            >
              {selectedCycle === "anual" ? "Cambiar a anual" : "Cambiar a mensual"}
            </button>
          ) : null}
        </div>
      </section>

      {/* Lo que incluye tu pase + Historial de pagos */}
      <div className="pl-acct-plan-bottom">
        <section
          className="pl-acct-card glass-card glass-ring"
          aria-labelledby="pl-acct-incluye-h"
        >
          <h3 id="pl-acct-incluye-h" className="pl-acct-h3">
            Lo que incluye tu pase
          </h3>
          <ul className="pl-acct-plan-features" role="list">
            {features.map((feat) => (
              <li key={feat.title} className="pl-acct-plan-feature">
                <CheckIcon />
                <div>
                  <b>{feat.title}</b>
                  <span>{feat.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="pl-acct-card glass-card glass-ring"
          aria-labelledby="pl-acct-pagos-h"
        >
          <div className="pl-acct-row-between">
            <h3 id="pl-acct-pagos-h" className="pl-acct-h3">
              Historial de pagos
            </h3>
            {!accountsEnabled ? <ExampleBadge /> : null}
          </div>

          {accountsEnabled ? (
            <p className="pl-acct-empty-line">
              Aún no tienes cobros registrados.
            </p>
          ) : (
            <ul className="pl-acct-payments" role="list">
              {examplePayments.map((payment) => (
                <li key={payment.id} className="pl-acct-payment-row">
                  <div className="pl-acct-payment-meta">
                    <b className="num">{payment.date}</b>
                    <span>{payment.what}</span>
                  </div>
                  <b className="pl-acct-payment-amt num">{payment.amount}</b>
                  {payment.hasInvoice ? (
                    <button
                      type="button"
                      className="pl-acct-btn pl-acct-btn--ghost pl-acct-btn--xs"
                      onClick={handleGoBilling}
                    >
                      Factura
                    </button>
                  ) : (
                    <span className="pl-acct-payment-dash" aria-label="Sin factura">
                      —
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="pl-acct-text-link"
            onClick={handleGoBilling}
          >
            Datos de facturación
          </button>
        </section>
      </div>

      <p className="pl-acct-legal-foot">
        El cobro lo procesa Stripe; PitchLab no guarda tu tarjeta. Si cancelas, conservas el acceso hasta el final del periodo pagado y tus días a favor. Solo mayores de 18.
      </p>

      {/* Diálogo modal nativo (TopLayerModalDialog) */}
      <TopLayerModalDialog
        open={activeDialog !== null}
        onClose={() => setActiveDialog(null)}
        ariaLabelledBy={dialogTitleId}
        maxWidth="28rem"
      >
        {activeDialog === "cancel" ? (
          <div className="pl-acct-dialog-body">
            <h3 id={dialogTitleId} className="pl-acct-h3">
              ¿Cancelar la renovación?
            </h3>
            <p className="pl-acct-dialog-copy">
              Al cancelar no se te vuelve a cobrar y conservas todo lo tuyo:
            </p>
            <ul className="pl-acct-dialog-list" role="list">
              <li>
                Acceso completo a PitchLab Ultra hasta el <strong>{accessEndDate}</strong>.
              </li>
              <li>
                Tus <strong className="num">+{earnedDays} días a favor</strong> sumados a esa fecha.
              </li>
              <li>Tu bitácora y tus picks cerrados guardados.</li>
            </ul>
            <div className="pl-acct-dialog-actions">
              <button
                type="button"
                autoFocus
                className="pl-acct-btn pl-acct-btn--primary"
                onClick={() => setActiveDialog(null)}
              >
                Mantener mi pase
              </button>
              <button
                type="button"
                className="pl-acct-btn pl-acct-btn--danger"
                data-confirm-cancel=""
                onClick={confirmCancel}
              >
                Cancelar renovación
              </button>
            </div>
          </div>
        ) : null}

        {activeDialog === "reactivate" ? (
          <div className="pl-acct-dialog-body">
            <h3 id={dialogTitleId} className="pl-acct-h3">
              ¿Reactivar la renovación?
            </h3>
            <p className="pl-acct-dialog-copy">
              Tu pase seguirá activo sin interrupción después del{" "}
              <strong>{accessEndDate}</strong>, respetando tus días a favor.
            </p>
            <div className="pl-acct-dialog-actions">
              <button
                type="button"
                autoFocus
                className="pl-acct-btn pl-acct-btn--ghost"
                onClick={() => setActiveDialog(null)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="pl-acct-btn pl-acct-btn--primary"
                data-confirm-reactivate=""
                onClick={confirmReactivate}
              >
                Reactivar renovación
              </button>
            </div>
          </div>
        ) : null}

        {activeDialog === "card" ? (
          <div className="pl-acct-dialog-body">
            <h3 id={dialogTitleId} className="pl-acct-h3">
              Cambiar tarjeta de pago
            </h3>
            <p className="pl-acct-dialog-copy">
              Stripe procesa y resguarda tu tarjeta. Desde el portal de cobro puedes reemplazarla sin perder días de tu pase.
            </p>
            <div className="pl-acct-dialog-actions">
              <button
                type="button"
                autoFocus
                className="pl-acct-btn pl-acct-btn--ghost"
                onClick={() => setActiveDialog(null)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="pl-acct-btn pl-acct-btn--primary"
                data-confirm-card=""
                onClick={confirmCardChange}
              >
                Continuar
              </button>
            </div>
          </div>
        ) : null}

        {activeDialog === "switch" ? (
          <div className="pl-acct-dialog-body">
            <h3 id={dialogTitleId} className="pl-acct-h3">
              {selectedCycle === "anual" ? "Cambiar a ciclo anual" : "Cambiar a ciclo mensual"}
            </h3>
            <p className="pl-acct-dialog-copy">
              Cambiar no pierde días: aplica en el siguiente corte ({accessEndDate}).
              {selectedCycle === "anual"
                ? ` Pagarás $${annualFormatted} MXN al año (ahorras $${savingsFormatted} MXN frente al mensual).`
                : ` Pagarás $${monthlyMxn} MXN al mes al terminar tu periodo actual.`}
            </p>
            <div className="pl-acct-dialog-actions">
              <button
                type="button"
                autoFocus
                className="pl-acct-btn pl-acct-btn--ghost"
                onClick={() => setActiveDialog(null)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="pl-acct-btn pl-acct-btn--primary"
                data-confirm-switch=""
                onClick={confirmCycleSwitch}
              >
                Confirmar cambio
              </button>
            </div>
          </div>
        ) : null}
      </TopLayerModalDialog>

      {allowRoleSimulation ? (
        <aside
          className="pl-acct-simulator glass-card glass-ring"
          aria-label="Simulador de estado del plan"
        >
          <div className="pl-acct-simulator-copy">
            <span className="pl-acct-sim-badge">Simulador</span>
            <span>Vista previa de estado en desarrollo (no visible en producción).</span>
          </div>
          <div className="pl-acct-seg" role="group" aria-label="Estado simulado del plan">
            {(
              [
                { value: "prueba", label: "Prueba" },
                { value: "mensual", label: "Mensual" },
                { value: "anual", label: "Anual" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                data-sim-plan-state={opt.value}
                aria-pressed={baseState === opt.value}
                onClick={() => {
                  setSimPlanState(opt.value);
                  setCancelledLocal(null);
                  setSwitchedCycleLocal(null);
                  setPortalNotice("");
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
