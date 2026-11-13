"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CouponRedeemBox } from "../../components/CanjearCouponView";
import { ExampleBadge, ExampleNotice, MaestroIcon } from "../../components/MaestroPrimitives";
import { TopLayerModalDialog } from "../../components/PlatformOverlays";
import { ACCOUNT_TAB_EVENT } from "../../components/ShellChrome";
import { usePlatform } from "../../platform-provider";
import type { PaymentMode } from "../../types";
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

export interface TransferBankInfo {
  configured: boolean;
  bank: string | null;
  beneficiary: string | null;
  clabe: string | null;
  clabeMasked: string | null;
  instructions: string | null;
  supportEmail: string;
}

export interface TransferRequestItem {
  id: string;
  planInterval: "monthly" | "annual";
  amountCentavosMxn: number;
  reportedAmountCentavosMxn: number | null;
  amountMismatch: boolean;
  referralDiscountApplied: boolean;
  referenceCode: string;
  originBank: string | null;
  receiptReference: string | null;
  payerName: string | null;
  transferDate: string | null;
  userNote: string | null;
  status: "pending_review" | "approved" | "rejected" | "canceled";
  rejectionReason: string | null;
  reviewedAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

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
  paymentMode?: PaymentMode;
  accessSourceKind?: string | null;
  eligibleForReferralDiscount?: boolean;
  quotedMonthlyCentavos?: number;
  quotedAnnualCentavos?: number;
  transferBank?: TransferBankInfo;
  transferHistory?: TransferRequestItem[];
  activePendingTransfer?: TransferRequestItem | null;
}

export interface PlanTabStoryOverride {
  accountsEnabled?: boolean;
  planState?: PlanStateOverride;
  paidFriends?: number;
  stripeConfigured?: boolean;
  paymentMode?: PaymentMode;
  referralCode?: string | null;
  serverPlan?: ServerPlanPayload;
}

type PlanDialogKind = "cancel" | "reactivate" | "card" | "switch" | null;

const DAY_MS = 86_400_000;

const TRANSFER_STATUS_META: Record<
  TransferRequestItem["status"],
  { label: string; pillClass: string }
> = {
  pending_review: { label: "En revisión", pillClass: "pl-pill--warning" },
  approved: { label: "Aprobada", pillClass: "pl-pill--success" },
  rejected: { label: "Rechazada", pillClass: "pl-pill--danger" },
  canceled: { label: "Cancelada", pillClass: "" },
};

function formatCentavosMxn(centavos: number): string {
  const pesos = centavos / 100;
  return `$${pesos.toLocaleString("es-MX", {
    minimumFractionDigits: centavos % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} MXN`;
}

function todayIsoMexicoCity(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch (err) {
    void err;
    return "";
  }
}

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
  checkoutNotice = null,
  storyOverride,
  onOpenBilling,
}: {
  identity: SessionAccountIdentity;
  referralCode?: string | null;
  initialServerPlan?: ServerPlanPayload | null;
  checkoutNotice?: "success" | "cancelled" | null;
  storyOverride?: PlanTabStoryOverride;
  onOpenBilling?: () => void;
}): React.JSX.Element {
  const {
    accountsEnabled: ctxAccountsEnabled,
    hasAccountSessionAuth,
    allowRoleSimulation,
    paymentMode: ctxPaymentMode,
    pushToast,
    referralPaidFriends,
  } = usePlatform();

  const accountsEnabled = storyOverride?.accountsEnabled ?? hasAccountSessionAuth;
  const [simPlanState, setSimPlanState] = useState<PlanStateOverride | null>(null);

  const [serverPlan, setServerPlan] = useState<ServerPlanPayload | null>(
    storyOverride?.serverPlan ?? initialServerPlan ?? null,
  );
  const [loadingPlan, setLoadingPlan] = useState<boolean>(
    Boolean(
      hasAccountSessionAuth &&
        !storyOverride?.serverPlan &&
        !initialServerPlan &&
        !storyOverride?.planState,
    ),
  );
  const [flipped, setFlipped] = useState(false);
  const [cancelledLocal, setCancelledLocal] = useState<boolean | null>(null);
  const [switchedCycleLocal, setSwitchedCycleLocal] = useState<"mensual" | "anual" | null>(null);
  const [cycleChoice, setCycleChoice] = useState<"mensual" | "anual" | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search).get("plan");
    if (p === "annual" || p === "anual") return "anual";
    if (p === "monthly" || p === "mensual") return "mensual";
    return null;
  });
  const [activeDialog, setActiveDialog] = useState<PlanDialogKind>(null);
  const [portalNotice, setPortalNotice] = useState<string>("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const transferSectionRef = useRef<HTMLElement | null>(null);
  const dialogTitleId = useId();

  // Estado SPEI (Beta 1.0)
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<"clabe" | "ref" | null>(null);
  const [originBank, setOriginBank] = useState("");
  const [reportedPesos, setReportedPesos] = useState("");
  const [receiptReference, setReceiptReference] = useState("");
  const [payerName, setPayerName] = useState("");
  const [transferDate, setTransferDate] = useState(() => todayIsoMexicoCity());
  const [userNote, setUserNote] = useState("");

  const reloadServerPlan = useCallback(async () => {
    if (!hasAccountSessionAuth || storyOverride?.serverPlan || storyOverride?.planState) return;
    try {
      const res = await fetch("/api/me/plan", { credentials: "same-origin" });
      if (!res.ok) return;
      const json = (await res.json()) as ServerPlanPayload;
      if (json) setServerPlan(json);
    } catch (err) {
      void err;
    }
  }, [hasAccountSessionAuth, storyOverride?.planState, storyOverride?.serverPlan]);

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
    if (!hasAccountSessionAuth || storyOverride?.planState) {
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
  }, [hasAccountSessionAuth, initialServerPlan, storyOverride?.planState, storyOverride?.serverPlan]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleUpdated = () => {
      void reloadServerPlan();
    };
    window.addEventListener("pitchlab:plan-updated", handleUpdated);
    return () => window.removeEventListener("pitchlab:plan-updated", handleUpdated);
  }, [reloadServerPlan]);

  const effectivePaymentMode: PaymentMode =
    storyOverride?.paymentMode ?? serverPlan?.paymentMode ?? ctxPaymentMode;
  const isTransferMode = effectivePaymentMode === "transfer";
  const activePending = serverPlan?.activePendingTransfer ?? null;
  const transferHistory = serverPlan?.transferHistory ?? [];
  const transferBank = serverPlan?.transferBank ?? {
    configured: false,
    bank: null,
    beneficiary: null,
    clabe: null,
    clabeMasked: null,
    instructions: null,
    supportEmail: "soporte@pitchlab.mx",
  };

  // Solo hidratar al abrir una solicitud pendiente distinta para que una recarga en segundo plano no borre lo escrito.
  const hydratedPendingIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activePending) {
      hydratedPendingIdRef.current = null;
      return;
    }
    if (hydratedPendingIdRef.current === activePending.id) return;
    hydratedPendingIdRef.current = activePending.id;
    setOriginBank(activePending.originBank ?? "");
    const amtCentavos =
      activePending.reportedAmountCentavosMxn ?? activePending.amountCentavosMxn;
    setReportedPesos(amtCentavos > 0 ? String(Math.round(amtCentavos) / 100) : "");
    setReceiptReference(activePending.receiptReference ?? "");
    setPayerName(activePending.payerName ?? "");
    setTransferDate(activePending.transferDate ?? todayIsoMexicoCity());
    setUserNote(activePending.userNote ?? "");
  }, [activePending]);

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
  const isExpiredPass = Boolean(accountsEnabled && serverPlan && !serverPlan.active);
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
  const tierLabel = identity.isTipster ? "ULTRA · TIPSTER" : "ULTRA";

  const statusPill = useMemo(() => {
    if (isTrial) {
      if (isExpiredPass) {
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
    if (isExpiredPass) {
      return {
        label: "Sin pase activo",
        toneClass: "pl-acct-status-pill--warn",
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
  }, [isCancelled, isExpiredPass, isTrial, trialDaysLeft]);

  const headline = useMemo(() => {
    if (isTrial) {
      if (isExpiredPass) {
        return "Tu prueba sin costo terminó";
      }
      return `Te ${trialDaysLeft === 1 ? "queda 1 día" : `quedan ${trialDaysLeft} días`} de prueba`;
    }
    if (isExpiredPass) {
      return "Tu pase no está activo";
    }
    if (isCancelled) {
      return `Tienes acceso hasta el ${accessEndDate}`;
    }
    return isAnnual ? "Pase PitchLab Ultra anual" : "Pase PitchLab Ultra mensual";
  }, [accessEndDate, isAnnual, isCancelled, isExpiredPass, isTrial, trialDaysLeft]);

  const subline = useMemo(() => {
    if (isTrial) {
      return isTransferMode
        ? "Al terminar no hay cobro automático. Activa mensual o anual por transferencia SPEI o canjea un cupón; tu bitácora siempre se queda guardada."
        : "Al terminar no hay cobro automático. Activa mensual o anual para conservar el acceso completo; tu bitácora siempre se queda guardada.";
    }
    if (isExpiredPass) {
      return "Activa mensual o anual por transferencia SPEI o canjea un cupón abajo para recuperar tu acceso completo. Tu bitácora y picks siguen guardados.";
    }
    if (isCancelled) {
      return earnedDays > 0
        ? `No se te volverá a cobrar. Tus +${earnedDays} días a favor ya están sumados a esa fecha.`
        : "No se te volverá a cobrar. Tu bitácora se queda guardada.";
    }
    if (isTransferMode) {
      return earnedDays > 0
        ? `Tu acceso vence el ${accessEndDate} (ya incluye +${earnedDays} días a favor). Puedes extender 30 o 365 días por transferencia cuando quieras.`
        : `Tu pase está activo hasta el ${accessEndDate}. Te avisamos antes de vencer; sin cargos automáticos.`;
    }
    if (isAnnual) {
      return earnedDays > 0
        ? `Pagaste el año completo y tienes +${earnedDays} días a favor: tu próximo cobro se recorre al ${accessEndDate}.`
        : `Pagaste el año completo. Se renueva el ${baseCutDate} y te avisamos 7 días antes.`;
    }
    return earnedDays > 0
      ? `Tu cobro del ${baseCutDate} se recorre al ${accessEndDate} por tus +${earnedDays} días a favor. Te avisamos 3 días antes.`
      : `Se renueva el ${baseCutDate} y te avisamos 3 días antes.`;
  }, [accessEndDate, baseCutDate, earnedDays, isAnnual, isCancelled, isExpiredPass, isTransferMode, isTrial]);

  const facts = useMemo(() => {
    const daysNote =
      earnedDays === 0
        ? `Sumas +${bothRewardDays} días por cada amigo que pague`
        : isCancelled
          ? `Sumados a tu acceso hasta el ${accessEndDate}`
          : isTrial
            ? "Se suman al activar tu pase"
            : isTransferMode
              ? `Incluidos en tu acceso hasta el ${accessEndDate}`
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
          label: isTransferMode ? "Método de pago" : "Tarjeta",
          value: isTransferMode ? "Transferencia SPEI o cupón" : "Sin cobro automático",
          note: isTransferMode
            ? "Sin cobro automático; validamos tu referencia"
            : "Elige mensual o anual si decides activar",
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
        label: isCancelled || isTransferMode || isExpiredPass ? "Acceso hasta" : "Próximo cobro",
        value: accessEndDate,
        note: isExpiredPass
          ? "Vencido · renueva por SPEI o cupón"
          : isCancelled
            ? `Tienes acceso hasta ${accessEndDate}`
            : earnedDays > 0
              ? `Se recorrió +${earnedDays} días`
              : isTransferMode
                ? "Sin cargo automático"
                : isAnnual
                  ? `$${annualFormatted} MXN`
                  : `$${monthlyMxn} MXN`,
        tone: isExpiredPass
          ? ("warn" as const)
          : isCancelled
            ? ("muted" as const)
            : earnedDays > 0
              ? ("ok" as const)
              : ("muted" as const),
      },
      {
        label: isTransferMode ? "Método de pago" : "Tarjeta",
        value: isTransferMode
          ? "Transferencia SPEI"
          : accountsEnabled
            ? serverPlan?.hasCard
              ? "Registrada en Stripe"
              : "Sin tarjeta registrada"
            : "Visa ···· 4242",
        note: isTransferMode
          ? "Activación manual sin tarjeta guardada"
          : accountsEnabled
            ? "Administrada por Stripe"
            : "Vence 08/29 · Ejemplo",
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
    isExpiredPass,
    isTransferMode,
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
        detail: isTransferMode
          ? "Solicítala por correo a soporte@pitchlab.mx con tus datos fiscales"
          : "Automática en cada cobro",
      },
    ],
    [isTransferMode],
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

  const scrollToTransfer = useCallback(() => {
    if (transferSectionRef.current) {
      transferSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handleCopyText = useCallback(
    async (value: string, key: "clabe" | "ref", label: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopiedKey(key);
        pushToast(`${label} copiado`, "success");
        window.setTimeout(() => setCopiedKey(null), 2000);
      } catch (err) {
        void err;
        pushToast(`Copia manualmente: ${value}`, "default");
      }
    },
    [pushToast],
  );

  const handleCreateTransfer = useCallback(
    async (apiInterval: "monthly" | "annual") => {
      if (!accountsEnabled) {
        setTransferFeedback({
          kind: "ok",
          text: `Vista previa: en producción esto genera tu referencia única SPEI (${apiInterval === "annual" ? "anual" : "mensual"}).`,
        });
        scrollToTransfer();
        return;
      }
      if (!hasAccountSessionAuth) {
        setTransferFeedback({
          kind: "error",
          text: "Inicia sesión con tu cuenta de PitchLab para generar tu referencia SPEI.",
        });
        return;
      }
      setTransferBusy(true);
      setTransferFeedback(null);
      try {
        const res = await fetch("/api/me/transfers", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ planInterval: apiInterval }),
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          request?: TransferRequestItem;
          activePending?: TransferRequestItem | null;
          error?: string;
        } | null;

        if (!res.ok) {
          if (res.status === 409 && json?.activePending) {
            setServerPlan((prev) =>
              prev ? { ...prev, activePendingTransfer: json.activePending } : prev,
            );
            setTransferFeedback({
              kind: "ok",
              text: json.error ?? "Ya tienes una transferencia pendiente.",
            });
            scrollToTransfer();
            return;
          }
          setTransferFeedback({
            kind: "error",
            text: json?.error ?? "No se pudo generar la referencia SPEI.",
          });
          return;
        }

        if (json?.request) {
          setServerPlan((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              activePendingTransfer: json.request,
              transferHistory: [
                json.request!,
                ...(prev.transferHistory ?? []).filter((item) => item.id !== json.request!.id),
              ],
            };
          });
        }
        await reloadServerPlan();
        scrollToTransfer();
      } catch (err) {
        void err;
        setTransferFeedback({
          kind: "error",
          text: "No pudimos conectar para generar tu referencia SPEI.",
        });
      } finally {
        setTransferBusy(false);
      }
    },
    [accountsEnabled, hasAccountSessionAuth, reloadServerPlan, scrollToTransfer],
  );

  const handleSubmitReceipt = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!activePending) return;
      if (!accountsEnabled) {
        setTransferFeedback({
          kind: "ok",
          text: "Comprobante simulado en modo demostración.",
        });
        return;
      }
      if (!hasAccountSessionAuth) {
        setTransferFeedback({
          kind: "error",
          text: "Inicia sesión con tu cuenta de PitchLab para registrar tu comprobante.",
        });
        return;
      }
      const trimmedPesos = reportedPesos.trim().replace(/[$,\s]/g, "");
      let reportedAmountCentavosMxn: number | null = null;
      if (trimmedPesos.length > 0) {
        const num = Number(trimmedPesos);
        if (!Number.isFinite(num) || num <= 0) {
          setTransferFeedback({
            kind: "error",
            text: "Escribe un monto transferido válido mayor a $0 MXN.",
          });
          return;
        }
        reportedAmountCentavosMxn = Math.round(num * 100);
      }

      setTransferBusy(true);
      setTransferFeedback(null);
      try {
        const res = await fetch(`/api/me/transfers/${activePending.id}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            originBank: originBank.trim() || null,
            reportedAmountCentavosMxn,
            receiptReference: receiptReference.trim() || null,
            payerName: payerName.trim() || null,
            transferDate: transferDate.trim() || null,
            userNote: userNote.trim() || null,
          }),
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          request?: TransferRequestItem;
          error?: string;
        } | null;

        if (!res.ok || !json?.ok) {
          setTransferFeedback({
            kind: "error",
            text: json?.error ?? "No se pudo guardar tu comprobante.",
          });
          return;
        }

        if (json.request) {
          setServerPlan((prev) =>
            prev
              ? {
                  ...prev,
                  activePendingTransfer: json.request,
                  transferHistory: (prev.transferHistory ?? []).map((item) =>
                    item.id === json.request!.id ? json.request! : item,
                  ),
                }
              : prev,
          );
        }
        setTransferFeedback({
          kind: "ok",
          text: "Comprobante registrado. Validaremos tu transferencia pronto y recibirás tu recibo por correo.",
        });
        pushToast("Comprobante SPEI enviado", "success");
      } catch (err) {
        void err;
        setTransferFeedback({
          kind: "error",
          text: "Error de conexión al guardar tu comprobante.",
        });
      } finally {
        setTransferBusy(false);
      }
    },
    [
      accountsEnabled,
      activePending,
      hasAccountSessionAuth,
      originBank,
      payerName,
      pushToast,
      receiptReference,
      reportedPesos,
      transferDate,
      userNote,
    ],
  );

  const handleCancelTransfer = useCallback(async () => {
    if (!activePending || !hasAccountSessionAuth) return;
    setTransferBusy(true);
    setTransferFeedback(null);
    try {
      const res = await fetch(`/api/me/transfers/${activePending.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setTransferFeedback({
          kind: "error",
          text: json?.error ?? "No se pudo cancelar la solicitud.",
        });
        return;
      }
      setTransferFeedback({
        kind: "ok",
        text: "Solicitud cancelada. Ya puedes generar una nueva referencia cuando quieras.",
      });
      await reloadServerPlan();
    } catch (err) {
      void err;
      setTransferFeedback({
        kind: "error",
        text: "No pudimos cancelar la solicitud. Intenta de nuevo.",
      });
    } finally {
      setTransferBusy(false);
    }
  }, [activePending, hasAccountSessionAuth, reloadServerPlan]);

  const handleActivateFromTrial = useCallback(
    async (intervalChoice: "mensual" | "anual") => {
      const apiInterval = intervalChoice === "anual" ? "annual" : "monthly";
      setCycleChoice(intervalChoice);
      if (isTransferMode) {
        if (activePending) {
          scrollToTransfer();
          return;
        }
        await handleCreateTransfer(apiInterval);
        return;
      }
      if (!accountsEnabled) {
        setPortalNotice("Disponible cuando se active el cobro.");
        return;
      }
      if (!hasAccountSessionAuth) {
        setPortalNotice("Inicia sesión con tu cuenta para continuar con tu Pase PitchLab Ultra.");
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
    [
      accountsEnabled,
      activePending,
      handleCreateTransfer,
      hasAccountSessionAuth,
      isTransferMode,
      scrollToTransfer,
      stripeConfigured,
    ],
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
      ) : checkoutNotice === "success" ? (
        <div
          role="status"
          aria-live="polite"
          className="pl-acct-plan-banner pl-acct-plan-banner--info"
          data-plan-checkout-notice="success"
        >
          <span>
            ¡Pago recibido! Estamos confirmando tu Pase PitchLab Ultra; en unos segundos verás tu suscripción activa.
          </span>
        </div>
      ) : checkoutNotice === "cancelled" ? (
        <div
          role="status"
          aria-live="polite"
          className="pl-acct-plan-banner pl-acct-plan-banner--warn"
          data-plan-checkout-notice="cancelled"
        >
          <span>
            No se realizó ningún cargo. Puedes activar tu Pase PitchLab Ultra cuando quieras.
          </span>
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
                disabled={checkoutBusy || transferBusy}
                onClick={() => handleActivateFromTrial(selectedCycle)}
              >
                {checkoutBusy || transferBusy
                  ? "Procesando…"
                  : selectedCycle === "anual"
                    ? "Activar anual"
                    : "Activar mensual"}
              </button>
            ) : isTransferMode ? (
              <button
                type="button"
                className="pl-acct-btn pl-acct-btn--primary"
                disabled={transferBusy}
                onClick={scrollToTransfer}
              >
                {activePending
                  ? "Ver transferencia pendiente"
                  : isExpiredPass
                    ? "Activar por transferencia SPEI"
                    : "Extender por transferencia SPEI"}
              </button>
            ) : null}

            {!isTransferMode && isCancelled ? (
              <button
                type="button"
                className="pl-acct-btn pl-acct-btn--primary"
                onClick={() => setActiveDialog("reactivate")}
              >
                Reactivar renovación
              </button>
            ) : null}

            {!isTransferMode && !isTrial && !isCancelled && !isAnnual ? (
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

            {!isTransferMode && !isTrial ? (
              <button
                type="button"
                className="pl-acct-btn pl-acct-btn--ghost"
                onClick={() => setActiveDialog("card")}
              >
                Cambiar tarjeta
              </button>
            ) : null}

            {!isTransferMode && !isTrial && !isCancelled ? (
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
            {isTransferMode
              ? "IVA incluido · transferencia SPEI única (sin cargo automático)"
              : "IVA incluido · factura CFDI 4.0 en cada cobro"}
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
              {!isTrial && !isAnnual && !isExpiredPass ? (
                <span className="pl-acct-cycle-current">Tu plan</span>
              ) : null}
              {serverPlan?.eligibleForReferralDiscount ? (
                <span className="pl-pill pl-pill--success num">-30 % primer mes</span>
              ) : null}
            </span>
            <span className="pl-acct-cycle-price num">
              ${serverPlan?.eligibleForReferralDiscount ? firstMonthFriendMxn : monthlyMxn}{" "}
              <small>
                {serverPlan?.eligibleForReferralDiscount
                  ? `MXN primer mes (después $${monthlyMxn})`
                  : "MXN al mes"}
              </small>
            </span>
            <span className="pl-acct-cycle-note">
              {isTransferMode ? "30 días de pase completo sin renovación automática." : "Cancelas cuando quieras."}
            </span>
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
                {!isTrial && isAnnual && !isExpiredPass ? "Tu plan" : `Ahorras $${savingsFormatted}`}
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
            {isTransferMode
              ? selectedCycle === "anual"
                ? `Activas 365 días por $${annualFormatted} MXN con transferencia SPEI única.`
                : `Activas 30 días por $${
                    serverPlan?.eligibleForReferralDiscount ? firstMonthFriendMxn : monthlyMxn
                  } MXN con transferencia SPEI única.`
              : isTrial
                ? selectedCycle === "anual"
                  ? `Activas el año completo por $${annualFormatted} MXN hoy, con factura. Cambiar después no pierde días.`
                  : `Activas el ciclo mensual por $${monthlyMxn} MXN hoy, con factura. Cambiar después no pierde días.`
                : cycleDiffersFromCurrent
                  ? selectedCycle === "anual"
                    ? `Pasas a anual en tu siguiente corte (${accessEndDate}): pagas $${annualFormatted} MXN y no pierdes días.`
                    : `Vuelves a mensual al terminar tu año (${accessEndDate}). Cambiar no pierde días: aplica en el siguiente corte.`
                  : "Cambiar no pierde días: aplica en el siguiente corte."}
          </span>

          {isTrial || isTransferMode ? (
            <button
              type="button"
              className="pl-acct-btn pl-acct-btn--primary"
              disabled={checkoutBusy || transferBusy}
              onClick={() => handleActivateFromTrial(selectedCycle)}
            >
              {checkoutBusy || transferBusy
                ? "Generando…"
                : isTransferMode
                  ? activePending
                    ? "Ver solicitud SPEI"
                    : selectedCycle === "anual"
                      ? "Pagar anual por SPEI"
                      : "Pagar mensual por SPEI"
                  : selectedCycle === "anual"
                    ? "Activar anual"
                    : "Activar mensual"}
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

      {/* Panel de transferencia SPEI + Canje de cupón */}
      <section
        id="transfer"
        ref={transferSectionRef}
        className="pl-acct-card glass-card glass-ring space-y-5"
        aria-labelledby="pl-acct-spei-h"
      >
        <div className="pl-acct-row-between">
          <div>
            <h3 id="pl-acct-spei-h" className="pl-acct-h3">
              {isTransferMode
                ? "Activar o renovar por transferencia SPEI"
                : "Canjea un cupón de acceso"}
            </h3>
            <p className="m-0 text-xs pt-1" style={{ color: "var(--pl-text-muted)" }}>
              {isTransferMode
                ? "Paso 1: genera tu referencia y transfiere por SPEI. Paso 2: registra tu comprobante para activar tus días."
                : "Si recibiste un código promocional o regalo, súmalo a tu acceso actual."}
            </p>
          </div>
          {activePending ? (
            <span className="pl-pill pl-pill--warning">En revisión</span>
          ) : null}
        </div>

        {transferFeedback ? (
          <div
            role={transferFeedback.kind === "error" ? "alert" : "status"}
            aria-live="polite"
            className="glass-ring rounded-xl p-3 text-xs font-semibold"
            style={{
              background: "var(--pl-surface)",
              color:
                transferFeedback.kind === "error" ? "var(--pl-danger)" : "var(--pl-success)",
            }}
          >
            {transferFeedback.text}
          </div>
        ) : null}

        {isTransferMode ? (
          activePending ? (
            <div className="space-y-4">
              {/* Paso 1: Datos bancarios y referencia */}
              <div
                className="glass-ring rounded-2xl p-4 space-y-3"
                style={{ background: "var(--pl-surface)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="pl-pill pl-pill--brand">Paso 1 · Haz tu transferencia SPEI</span>
                  <span className="text-xs font-semibold num" style={{ color: "var(--pl-text-muted)" }}>
                    {activePending.planInterval === "annual" ? "Plan anual (365 días)" : "Plan mensual (30 días)"}
                    {activePending.referralDiscountApplied ? " · Incluye 30 % dto. referido" : ""}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-0.5">
                    <span style={{ color: "var(--pl-text-muted)" }}>Monto exacto</span>
                    <strong className="block text-lg font-extrabold num" style={{ color: "var(--pl-text)" }}>
                      {formatCentavosMxn(activePending.amountCentavosMxn)}
                    </strong>
                  </div>

                  <div className="space-y-1">
                    <span style={{ color: "var(--pl-text-muted)" }}>Concepto / Referencia única</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong
                        className="text-base font-extrabold tracking-wider num"
                        style={{ color: "var(--pl-brand)" }}
                        data-transfer-ref=""
                      >
                        {activePending.referenceCode}
                      </strong>
                      <button
                        type="button"
                        className="pl-acct-btn pl-acct-btn--ghost pl-acct-btn--xs"
                        onClick={() =>
                          void handleCopyText(activePending.referenceCode, "ref", "Concepto SPEI")
                        }
                      >
                        <MaestroIcon name="copy" size={12} />
                        <span>{copiedKey === "ref" ? "Copiado" : "Copiar"}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {transferBank.configured && transferBank.clabe ? (
                  <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2 hairline-t m-0">
                    <div>
                      <dt style={{ color: "var(--pl-text-muted)" }}>Banco</dt>
                      <dd className="m-0 font-bold" style={{ color: "var(--pl-text)" }}>
                        {transferBank.bank}
                      </dd>
                    </div>
                    <div>
                      <dt style={{ color: "var(--pl-text-muted)" }}>Beneficiario</dt>
                      <dd className="m-0 font-bold" style={{ color: "var(--pl-text)" }}>
                        {transferBank.beneficiary}
                      </dd>
                    </div>
                    <div>
                      <dt style={{ color: "var(--pl-text-muted)" }}>CLABE interbancaria</dt>
                      <dd className="m-0 flex flex-wrap items-center gap-2 font-extrabold num">
                        <span style={{ color: "var(--pl-text)" }}>{transferBank.clabe}</span>
                        <button
                          type="button"
                          className="pl-acct-btn pl-acct-btn--ghost pl-acct-btn--xs"
                          onClick={() =>
                            void handleCopyText(transferBank.clabe!, "clabe", "CLABE")
                          }
                        >
                          <MaestroIcon name="copy" size={12} />
                          <span>{copiedKey === "clabe" ? "Copiada" : "Copiar"}</span>
                        </button>
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="m-0 text-xs leading-relaxed pt-1" style={{ color: "var(--pl-warning)" }}>
                    Los datos de CLABE están actualizándose en esta instancia. Escríbenos a{" "}
                    <strong>{transferBank.supportEmail}</strong> indicando tu referencia{" "}
                    <strong className="num">{activePending.referenceCode}</strong> para recibir la CLABE al instante.
                  </p>
                )}

                {transferBank.instructions ? (
                  <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    {transferBank.instructions}
                  </p>
                ) : null}
              </div>

              {/* Paso 2: Ya transferí */}
              <form
                onSubmit={handleSubmitReceipt}
                noValidate
                className="glass-ring rounded-2xl p-4 space-y-3"
                style={{ background: "var(--pl-surface)" }}
                data-transfer-receipt-form=""
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="pl-pill pl-pill--info">Paso 2 · Ya transferí (opcional pero agiliza)</span>
                  {activePending.receiptReference || activePending.originBank ? (
                    <span className="pl-pill pl-pill--success">Comprobante enviado</span>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <label className="space-y-1 block">
                    <span className="font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
                      Banco de origen
                    </span>
                    <input
                      type="text"
                      maxLength={80}
                      placeholder="Ej. BBVA, Nu, Santander"
                      value={originBank}
                      onChange={(e) => setOriginBank(e.target.value)}
                      className="glass-input w-full min-h-[44px] px-3 text-base"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
                      Monto transferido (MXN)
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={reportedPesos}
                      onChange={(e) => setReportedPesos(e.target.value)}
                      className="glass-input w-full min-h-[44px] px-3 text-base num"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
                      Clave de rastreo o folio SPEI
                    </span>
                    <input
                      type="text"
                      maxLength={120}
                      placeholder="Folio de tu comprobante"
                      value={receiptReference}
                      onChange={(e) => setReceiptReference(e.target.value)}
                      className="glass-input w-full min-h-[44px] px-3 text-base num"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
                      Nombre del titular que transfiere
                    </span>
                    <input
                      type="text"
                      maxLength={120}
                      placeholder="Como aparece en tu cuenta"
                      value={payerName}
                      onChange={(e) => setPayerName(e.target.value)}
                      className="glass-input w-full min-h-[44px] px-3 text-base"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
                      Fecha de la transferencia
                    </span>
                    <input
                      type="date"
                      value={transferDate}
                      onChange={(e) => setTransferDate(e.target.value)}
                      className="glass-input w-full min-h-[44px] px-3 text-base num"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
                      Nota opcional
                    </span>
                    <input
                      type="text"
                      maxLength={280}
                      placeholder="Cualquier detalle para identificarla"
                      value={userNote}
                      onChange={(e) => setUserNote(e.target.value)}
                      className="glass-input w-full min-h-[44px] px-3 text-base"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={transferBusy}
                    onClick={() => void handleCancelTransfer()}
                    className="pl-acct-btn pl-acct-btn--ghost"
                  >
                    Cancelar solicitud
                  </button>
                  <button
                    type="submit"
                    disabled={transferBusy}
                    className="pl-acct-btn pl-acct-btn--primary"
                    data-transfer-submit=""
                  >
                    {transferBusy
                      ? "Guardando…"
                      : activePending.receiptReference || activePending.originBank
                        ? "Actualizar comprobante"
                        : "Ya transferí · Enviar datos"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div
              className="glass-ring rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{ background: "var(--pl-surface)" }}
            >
              <div className="space-y-1 text-xs">
                <strong className="block text-sm font-extrabold" style={{ color: "var(--pl-text)" }}>
                  {selectedCycle === "anual"
                    ? `Pase anual (365 días) · ${formatCentavosMxn(
                        serverPlan?.quotedAnnualCentavos ?? annualMxn * 100,
                      )}`
                    : `Pase mensual (30 días) · ${formatCentavosMxn(
                        serverPlan?.quotedMonthlyCentavos ??
                          (serverPlan?.eligibleForReferralDiscount
                            ? firstMonthFriendMxn * 100
                            : monthlyMxn * 100),
                      )}`}
                </strong>
                <span style={{ color: "var(--pl-text-muted)" }}>
                  Genera tu concepto único para identificar el pago rápido y sin errores.
                </span>
              </div>
              <button
                type="button"
                disabled={transferBusy}
                onClick={() =>
                  void handleCreateTransfer(selectedCycle === "anual" ? "annual" : "monthly")
                }
                className="pl-acct-btn pl-acct-btn--primary shrink-0"
                data-create-transfer=""
              >
                {transferBusy ? "Generando…" : "Generar referencia SPEI"}
              </button>
            </div>
          )
        ) : null}

        <div className="pt-2 hairline-t space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="m-0 text-sm font-extrabold" style={{ color: "var(--pl-text)" }}>
              ¿Tienes un cupón de acceso?
            </h4>
            <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Suma días directo a tu pase
            </span>
          </div>
          <CouponRedeemBox
            compact
            onRedeemed={() => {
              void reloadServerPlan();
            }}
          />
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
            transferHistory.length === 0 ? (
              <p className="pl-acct-empty-line">
                {isTransferMode
                  ? "Aún no tienes transferencias ni cobros registrados."
                  : "Aún no tienes cobros registrados."}
              </p>
            ) : (
              <ul className="pl-acct-payments" role="list" data-transfer-history="">
                {transferHistory.map((item) => {
                  const meta = TRANSFER_STATUS_META[item.status];
                  return (
                    <li key={item.id} className="pl-acct-payment-row">
                      <div className="pl-acct-payment-meta">
                        <b className="num">{formatShortDateEs(item.createdAtIso, "Reciente")}</b>
                        <span>
                          {item.planInterval === "annual" ? "Pase anual" : "Pase mensual"} ·{" "}
                          <span className="num">{item.referenceCode}</span>
                        </span>
                        {item.status === "rejected" && item.rejectionReason ? (
                          <span className="block text-xs pt-0.5" style={{ color: "var(--pl-danger)" }}>
                            Motivo: {item.rejectionReason}
                          </span>
                        ) : null}
                      </div>
                      <b className="pl-acct-payment-amt num">
                        {formatCentavosMxn(item.amountCentavosMxn)}
                      </b>
                      <span className={`pl-pill ${meta.pillClass}`}>{meta.label}</span>
                    </li>
                  );
                })}
              </ul>
            )
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
        {isTransferMode
          ? "En Beta 1.0 el pago se realiza por transferencia SPEI única sin cargos automáticos ni tarjeta guardada. Solo mayores de 18."
          : "El cobro lo procesa Stripe; PitchLab no guarda tu tarjeta. Si cancelas, conservas el acceso hasta el final del periodo pagado y tus días a favor. Solo mayores de 18."}
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
