"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreKpiStrip,
  SofascoreTable,
  type SofascoreKpiItem,
  type SofascoreTableColumn,
} from "../../../components/ui/primitives";
import { CouponRedeemBox } from "../../components/CanjearCouponView";
import { ExampleBadge, MaestroIcon } from "../../components/MaestroPrimitives";
import { ConfirmActionDialog } from "../../components/PlatformOverlays";
import { ACCOUNT_TAB_EVENT } from "../../components/ShellChrome";
import { useAbortableJson, useSafeEffect } from "../../hooks";
import { sanitizeInternalHref, triggerHaptic } from "../../navigation-helpers";
import { usePlatformActions, usePlatformCore } from "../../platform-provider";
import {
  PREVIEW_SPEI_EVENT,
  readPreviewSpeiState,
  type PreviewSpeiState,
} from "../../preview-spei-store";
import {
  annualSavingsMxn,
  MEMBERSHIP_SPEC,
  referralEarnedDays,
  SPACETIME_METRICS_HEADLINE,
} from "../../spacetime-catalog";
import type { PaymentMode } from "../../types";
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
  couponExpiresAtIso?: string | null;
  couponRedeemedAtIso?: string | null;
  awaitingCouponRedemption?: boolean;
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
  speiReferenceCode?: string;
  transferBank?: TransferBankInfo;
  transferHistory?: TransferRequestItem[];
  activePendingTransfer?: TransferRequestItem | null;
  latestApprovedTransfer?: TransferRequestItem | null;
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

interface ExamplePaymentRow {
  readonly id: string;
  readonly date: string;
  readonly what: string;
  readonly amount: string;
  readonly hasInvoice: boolean;
}

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
  return <MaestroIcon name="check" size={18} className="pl-acct-plan-feat-icon" />;
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
    viewerRole,
    hasAccountSessionAuth,
    allowRoleSimulation,
    paymentMode: ctxPaymentMode,
    referralPaidFriends,
  } = usePlatformCore();
  const { pushToast } = usePlatformActions();

  const accountsEnabled = storyOverride?.accountsEnabled ?? hasAccountSessionAuth;
  const shouldFetchServerPlan = Boolean(
    hasAccountSessionAuth &&
      !storyOverride?.serverPlan &&
      !initialServerPlan &&
      !storyOverride?.planState,
  );

  const fetchedPlan = useAbortableJson<ServerPlanPayload>("/api/me/plan", {
    enabled: shouldFetchServerPlan,
    initialData: storyOverride?.serverPlan ?? initialServerPlan ?? null,
  });

  const [mutatedPlan, setMutatedPlan] = useState<ServerPlanPayload | null>(null);
  const [simPlanState, setSimPlanState] = useState<PlanStateOverride | null>(null);
  const [previewSpei, setPreviewSpei] = useState<PreviewSpeiState | null>(null);

  useSafeEffect(() => {
    if (accountsEnabled || storyOverride || typeof window === "undefined") return;
    const sync = () => setPreviewSpei(readPreviewSpeiState());
    sync();
    window.addEventListener(PREVIEW_SPEI_EVENT, sync);
    return () => window.removeEventListener(PREVIEW_SPEI_EVENT, sync);
  }, [accountsEnabled, storyOverride]);

  const serverPlan: ServerPlanPayload | null =
    mutatedPlan ?? storyOverride?.serverPlan ?? initialServerPlan ?? fetchedPlan.data ?? null;
  const loadingPlan = Boolean(shouldFetchServerPlan && fetchedPlan.loading && !serverPlan);

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
  const [confirmCancelTransferOpen, setConfirmCancelTransferOpen] = useState(false);
  const [portalNotice, setPortalNotice] = useState<string>("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const transferSectionRef = useRef<HTMLElement | null>(null);

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
      const res = await fetch("/api/me/plan", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as ServerPlanPayload;
      if (json) setMutatedPlan(json);
    } catch (err) {
      void err;
    }
  }, [hasAccountSessionAuth, storyOverride?.planState, storyOverride?.serverPlan]);

  useSafeEffect(() => {
    if (typeof window === "undefined") return;
    const handleUpdated = () => {
      void reloadServerPlan();
    };
    window.addEventListener("pitchlab:plan-updated", handleUpdated);
    return () => window.removeEventListener("pitchlab:plan-updated", handleUpdated);
  }, [reloadServerPlan]);

  const canExposeSpeiDetails =
    viewerRole !== "visitor" && (accountsEnabled || Boolean(storyOverride));
  const effectivePaymentMode: PaymentMode =
    storyOverride?.paymentMode ?? serverPlan?.paymentMode ?? ctxPaymentMode;
  const isTransferMode = effectivePaymentMode === "transfer";
  const activePending = canExposeSpeiDetails ? (serverPlan?.activePendingTransfer ?? null) : null;
  const transferHistory = canExposeSpeiDetails
    ? (serverPlan?.transferHistory ?? (!accountsEnabled ? (previewSpei?.requests ?? []) : []))
    : [];
  const transferBank: TransferBankInfo =
    canExposeSpeiDetails && serverPlan?.transferBank
      ? serverPlan.transferBank
      : {
          configured: false,
          bank: null,
          beneficiary: null,
          clabe: null,
          clabeMasked: null,
          instructions: null,
          supportEmail: "soporte@pitchlab.mx",
        };
  const visibleSpeiReference = canExposeSpeiDetails
    ? (serverPlan?.speiReferenceCode ?? null)
    : null;

  const hydratedPendingIdRef = useRef<string | null>(null);
  useSafeEffect(() => {
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

  const baseState: PlanStateOverride = useMemo(() => {
    if (simPlanState) return simPlanState;
    if (storyOverride?.planState) return storyOverride.planState;
    if (accountsEnabled && serverPlan) return serverPlan.planState;
    if (!accountsEnabled && previewSpei?.activeInterval) {
      return previewSpei.activeInterval === "annual" ? "anual" : "mensual";
    }
    return "prueba";
  }, [
    accountsEnabled,
    previewSpei?.activeInterval,
    serverPlan,
    simPlanState,
    storyOverride?.planState,
  ]);

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

  const selectedCycle: "mensual" | "anual" = cycleChoice ?? (isAnnual ? "anual" : "mensual");

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
  }, [
    accountsEnabled,
    isTrial,
    referralPaidFriends,
    serverPlan?.paidFriends,
    storyOverride?.paidFriends,
  ]);

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

  const exampleBaseCutIso = isAnnual ? "2027-11-11T12:00:00Z" : "2026-12-11T12:00:00Z";
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
        return { label: "Prueba finalizada", toneClass: "pl-acct-status-pill--warn" };
      }
      return {
        label: `Prueba · ${trialDaysLeft === 1 ? "queda 1 día" : `quedan ${trialDaysLeft} días`}`,
        toneClass: "pl-acct-status-pill--brand",
      };
    }
    if (isExpiredPass) {
      return { label: "Sin pase activo", toneClass: "pl-acct-status-pill--warn" };
    }
    if (isCancelled) {
      return { label: "Sin renovación", toneClass: "pl-acct-status-pill--warn" };
    }
    return { label: "Activo", toneClass: "pl-acct-status-pill--ok" };
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
  }, [
    accessEndDate,
    baseCutDate,
    earnedDays,
    isAnnual,
    isCancelled,
    isExpiredPass,
    isTransferMode,
    isTrial,
  ]);

  const kpiItems = useMemo<readonly SofascoreKpiItem[]>(() => {
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
          id: "plan",
          label: "Plan",
          value: `Prueba sin costo de ${trialTotalDays} días`,
          delta: "Sin tarjeta",
          tone: "default",
        },
        {
          id: "end",
          label: "Termina",
          value: accessEndDate,
          delta:
            trialDaysLeft > 0
              ? `En ${trialDaysLeft} ${trialDaysLeft === 1 ? "día" : "días"}`
              : "Periodo concluido",
          tone: "brand",
        },
        {
          id: "method",
          label: isTransferMode ? "Método de pago" : "Tarjeta",
          value: isTransferMode ? "Transferencia SPEI o cupón" : "Sin cobro automático",
          delta: isTransferMode
            ? "Sin cobro automático; validamos tu referencia"
            : "Elige mensual o anual si decides activar",
          tone: "default",
        },
        {
          id: "earned",
          label: "Días a favor",
          value: `+${earnedDays} días`,
          delta: daysNote,
          tone: earnedDays > 0 ? "positive" : "default",
        },
      ];
    }

    return [
      {
        id: "plan",
        label: "Plan",
        value: isAnnual ? `Anual · $${annualFormatted} MXN` : `Mensual · $${monthlyMxn} MXN`,
        delta: "IVA incluido",
        tone: "default",
      },
      {
        id: "cut",
        label: isCancelled || isTransferMode || isExpiredPass ? "Acceso hasta" : "Próximo cobro",
        value: accessEndDate,
        delta: isExpiredPass
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
          ? "negative"
          : isCancelled
            ? "default"
            : earnedDays > 0
              ? "positive"
              : "default",
      },
      {
        id: "method",
        label: isTransferMode ? "Método de pago" : "Tarjeta",
        value: isTransferMode
          ? "Transferencia SPEI"
          : accountsEnabled
            ? serverPlan?.hasCard
              ? "Registrada en Stripe"
              : "Sin tarjeta registrada"
            : "Visa ···· 4242",
        delta: isTransferMode
          ? "Activación manual sin tarjeta guardada"
          : accountsEnabled
            ? "Administrada por Stripe"
            : "Vence 08/29 · Ejemplo",
        tone: "default",
      },
      {
        id: "earned",
        label: "Días a favor",
        value: `+${earnedDays} días`,
        delta: daysNote,
        tone: earnedDays > 0 ? "positive" : "default",
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

  const examplePayments = useMemo<readonly ExamplePaymentRow[]>(() => {
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

  const transferHistoryColumns = useMemo<readonly SofascoreTableColumn<TransferRequestItem>[]>(
    () => [
      {
        key: "detail",
        header: "Movimiento",
        render: (item) => (
          <div className="pl-acct-payment-meta">
            <b className="num">{formatShortDateEs(item.createdAtIso, "Reciente")}</b>
            <span>
              {item.planInterval === "annual" ? "Pase anual" : "Pase mensual"} ·{" "}
              <span className="num">{item.referenceCode}</span>
            </span>
            {item.awaitingCouponRedemption ? (
              <span className="block text-xs pt-0.5 text-[var(--pl-brand)]">
                Revisa tu correo (noreply@pitchlab.mx) y canjea tu cupón en /canjear
              </span>
            ) : null}
            {item.status === "rejected" && item.rejectionReason ? (
              <span className="block text-xs pt-0.5 text-[var(--pl-danger)]">
                Motivo: {item.rejectionReason}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: "amount",
        header: "Monto",
        numeric: true,
        align: "end",
        render: (item) => (
          <b className="pl-acct-payment-amt num">{formatCentavosMxn(item.amountCentavosMxn)}</b>
        ),
      },
      {
        key: "status",
        header: "Estado",
        align: "end",
        render: (item) => {
          const meta = item.awaitingCouponRedemption
            ? { label: "Cupón enviado", pillClass: "pl-pill--info" }
            : item.status === "approved"
              ? { label: "Suscripción activa", pillClass: "pl-pill--success" }
              : TRANSFER_STATUS_META[item.status];
          return <span className={`pl-pill ${meta.pillClass}`}>{meta.label}</span>;
        },
      },
    ],
    [],
  );

  const examplePaymentColumns = useMemo<readonly SofascoreTableColumn<ExamplePaymentRow>[]>(
    () => [
      {
        key: "detail",
        header: "Movimiento",
        render: (payment) => (
          <div className="pl-acct-payment-meta">
            <b className="num">{payment.date}</b>
            <span>{payment.what}</span>
          </div>
        ),
      },
      {
        key: "amount",
        header: "Monto",
        numeric: true,
        align: "end",
        render: (payment) => <b className="pl-acct-payment-amt num">{payment.amount}</b>,
      },
      {
        key: "invoice",
        header: "Factura",
        align: "end",
        render: (payment) =>
          payment.hasInvoice && onOpenBilling ? (
            <Button type="button" variant="secondary" size="sm" onClick={handleGoBilling}>
              Factura
            </Button>
          ) : (
            <span className="pl-acct-payment-dash" aria-label="Sin factura">
              —
            </span>
          ),
      },
    ],
    [handleGoBilling, onOpenBilling],
  );

  const scrollToTransfer = useCallback(() => {
    if (transferSectionRef.current) {
      transferSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handleCopyText = useCallback(
    async (value: string, key: "clabe" | "ref", label: string) => {
      try {
        await navigator.clipboard.writeText(value);
        triggerHaptic(8);
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
            setMutatedPlan((prev) => {
              const base = prev ?? serverPlan;
              return base ? { ...base, activePendingTransfer: json.activePending } : base;
            });
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
          const created = json.request;
          setMutatedPlan((prev) => {
            const base = prev ?? serverPlan;
            if (!base) return base;
            return {
              ...base,
              activePendingTransfer: created,
              transferHistory: [
                created,
                ...(base.transferHistory ?? []).filter((item) => item.id !== created.id),
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
    [accountsEnabled, hasAccountSessionAuth, reloadServerPlan, scrollToTransfer, serverPlan],
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
        const parsedAmount = parseStrictFiniteNumber(trimmedPesos);
        if (parsedAmount === null || parsedAmount <= 0) {
          setTransferFeedback({
            kind: "error",
            text: "Escribe un monto transferido válido mayor a $0 MXN.",
          });
          return;
        }
        reportedAmountCentavosMxn = Math.round(parsedAmount * 100);
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
          const updatedReq = json.request;
          setMutatedPlan((prev) => {
            const base = prev ?? serverPlan;
            if (!base) return base;
            return {
              ...base,
              activePendingTransfer: updatedReq,
              transferHistory: (base.transferHistory ?? []).map((item) =>
                item.id === updatedReq.id ? updatedReq : item,
              ),
            };
          });
        }
        setTransferFeedback({
          kind: "ok",
          text: "Comprobante registrado. Al confirmar tu pago en consola recibirás un cupón de un solo uso desde noreply@pitchlab.mx para canjearlo en /canjear.",
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
      serverPlan,
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
        const safeCheckoutUrl = (() => {
          const internal = sanitizeInternalHref(json?.url);
          if (internal) return internal;
          if (typeof json?.url !== "string") return null;
          const trimmed = json.url.trim();
          if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
          try {
            const parsed = new URL(trimmed);
            const host = parsed.hostname.toLowerCase();
            if (
              parsed.protocol !== "https:" ||
              parsed.port !== "" ||
              parsed.username ||
              parsed.password ||
              !(host === "checkout.stripe.com" || host === "billing.stripe.com" || host.endsWith(".stripe.com"))
            ) {
              return null;
            }
            return parsed.toString();
          } catch (err) {
            void err;
            return null;
          }
        })();
        if (res.ok && safeCheckoutUrl && typeof window !== "undefined") {
          window.location.assign(safeCheckoutUrl);
          return;
        }
        setPortalNotice(
          !stripeConfigured
            ? "Disponible cuando se active el cobro."
            : (json?.error ?? "No se pudo abrir el pago."),
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
      accountsEnabled && !stripeConfigured ? "Disponible cuando se active el cobro." : "",
    );
    if (typeof window !== "undefined") {
      const reduced = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      });
    }
  }, [accountsEnabled, stripeConfigured]);

  const confirmReactivate = useCallback(() => {
    setCancelledLocal(false);
    setActiveDialog(null);
    setPortalNotice(
      stripeConfigured ? "Renovación reactivada." : "Disponible cuando se active el cobro.",
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
        <SofascoreCard as="section">
          <p className="pl-acct-generating" aria-live="polite">
            Cargando tu plan…
          </p>
        </SofascoreCard>
      </div>
    );
  }

  return (
    <div className="pl-acct-stack">
      {!accountsEnabled ? (
        <div className="pl-acct-example-notice">
          <div className="pl-acct-example-head">
            <span className="pl-acct-example-badge">
              <MaestroIcon name="eye" size={13} />
              <span>Ejemplo</span>
            </span>
            <strong className="pl-acct-example-title">Contenido de ejemplo</strong>
          </div>
          <p className="pl-acct-example-body">
            Estado, fechas e historial de muestra en modo de prueba. Los precios del Pase PitchLab
            Ultra son los vigentes.
          </p>
        </div>
      ) : null}

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
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-reactivate-plan=""
            onClick={() => setActiveDialog("reactivate")}
          >
            Reactivar renovación
          </Button>
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
            ¡Pago recibido! Estamos confirmando tu Pase PitchLab Ultra; en unos segundos verás tu
            suscripción activa.
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

      <div className="pl-acct-plan-hero">
        <section className="pl-acct-card-stage" aria-label="Tu pase">
          <div className="pl-acct-card-stage-top">
            <span className="pl-acct-card-stage-title">Tu pase</span>
            <span
              className={`pl-acct-status-pill num ${statusPill.toneClass}`}
              data-plan-status=""
            >
              <span aria-hidden="true" className="pl-acct-status-dot" />
              <span>{statusPill.label}</span>
            </span>
          </div>

          <button
            type="button"
            className={`pl-acct-cardbtn ${isCancelled ? "pl-acct-cardbtn--muted" : ""}`}
            onClick={() => setFlipped((prev) => !prev)}
          >
            <span className="sr-only">
              {`Pase PitchLab Ultra de ${identity.atHandle}. Voltear tarjeta`}
            </span>
            <LazyReferralCard3D
              code={passCode}
              bottomLeftLabel={identity.atHandle}
              backSubtitle="Pase PitchLab Ultra · Membresía personal"
              tierLabel={tierLabel}
              expired={isCancelled}
              flipped={flipped}
              onFlipChange={setFlipped}
              asDecorativeChild
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

        <SofascoreCard as="section" className="pl-acct-plan-summary">
          <div className="pl-acct-plan-summary-inner">
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

            <SofascoreKpiStrip items={kpiItems} className="pl-acct-plan-kpis" />

            <div className="pl-acct-plan-actions">
              {isTrial ? (
                <Button
                  type="button"
                  variant="primary"
                  disabled={checkoutBusy || transferBusy}
                  onClick={() => void handleActivateFromTrial(selectedCycle)}
                >
                  {checkoutBusy || transferBusy
                    ? "Procesando…"
                    : selectedCycle === "anual"
                      ? "Activar anual"
                      : "Activar mensual"}
                </Button>
              ) : isTransferMode ? (
                <Button
                  type="button"
                  variant="primary"
                  disabled={transferBusy}
                  onClick={scrollToTransfer}
                >
                  {activePending
                    ? "Ver transferencia pendiente"
                    : isExpiredPass
                      ? "Activar por transferencia SPEI"
                      : "Extender por transferencia SPEI"}
                </Button>
              ) : null}

              {!isTransferMode && isCancelled ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setActiveDialog("reactivate")}
                >
                  Reactivar renovación
                </Button>
              ) : null}

              {!isTransferMode && !isTrial && !isCancelled && !isAnnual ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    setCycleChoice("anual");
                    setActiveDialog("switch");
                  }}
                >
                  Cambiar a anual
                </Button>
              ) : null}

              {!isTransferMode && !isTrial ? (
                <Button type="button" variant="secondary" onClick={() => setActiveDialog("card")}>
                  Cambiar tarjeta
                </Button>
              ) : null}

              {!isTransferMode && !isTrial && !isCancelled ? (
                <Button
                  type="button"
                  variant="ghost"
                  tone="danger"
                  data-cancel-plan=""
                  onClick={() => setActiveDialog("cancel")}
                >
                  Cancelar renovación
                </Button>
              ) : null}

              <Button type="button" variant="secondary" onClick={scrollToTransfer}>
                <MaestroIcon name="ticket" size={14} />
                <span>Canjear cupón</span>
              </Button>
            </div>
          </div>
        </SofascoreCard>
      </div>

      <SofascoreCard
        id="pl-acct-ciclo"
        title="Mensual o anual"
        meta={
          isTransferMode
            ? "IVA incluido · SPEI sin cargo automático"
            : "IVA incluido · CFDI 4.0 en cada cobro"
        }
      >
        <div className="space-y-4">
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
                {isTransferMode
                  ? "30 días de pase completo sin renovación automática."
                  : "Cancelas cuando quieras."}
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
                  {!isTrial && isAnnual && !isExpiredPass
                    ? "Tu plan"
                    : `Ahorras $${savingsFormatted}`}
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
              <Button
                type="button"
                variant="primary"
                disabled={checkoutBusy || transferBusy}
                onClick={() => void handleActivateFromTrial(selectedCycle)}
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
              </Button>
            ) : cycleDiffersFromCurrent ? (
              <Button type="button" variant="primary" onClick={() => setActiveDialog("switch")}>
                {selectedCycle === "anual" ? "Cambiar a anual" : "Cambiar a mensual"}
              </Button>
            ) : null}
          </div>
        </div>
      </SofascoreCard>

      <section id="transfer" ref={transferSectionRef} aria-labelledby="pl-acct-spei-title">
        <SofascoreCard
          id="pl-acct-spei"
          title={
            isTransferMode
              ? "Activar o renovar por transferencia SPEI"
              : "Canjea un cupón de acceso"
          }
          meta={
            activePending ? (
              <span className="pl-pill pl-pill--warning">En revisión</span>
            ) : transferHistory.some((item) => item.awaitingCouponRedemption) ? (
              <span className="pl-pill pl-pill--info">Cupón enviado</span>
            ) : undefined
          }
        >
          <div className="space-y-5">
            <p className="m-0 text-xs text-[var(--pl-text-muted)]">
              {isTransferMode
                ? "Activa o renueva sin tarjeta con transferencia SPEI o canjea un cupón directo."
                : "Si recibiste un código promocional o regalo, súmalo a tu acceso actual."}
            </p>

            {isTransferMode ? (
              <ol className="pl-acct-steps" aria-label="Cómo activar por SPEI">
                <li>
                  <span className="pl-acct-step-num num">1</span>
                  <span>
                    <strong>Genera tu referencia</strong> y copia la CLABE.
                  </span>
                </li>
                <li>
                  <span className="pl-acct-step-num num">2</span>
                  <span>
                    <strong>Transfiere y reporta</strong> tu clave de rastreo.
                  </span>
                </li>
                <li>
                  <span className="pl-acct-step-num num">3</span>
                  <span>
                    <strong>Recibe tu cupón</strong> y actívalo en 1 toque.
                  </span>
                </li>
              </ol>
            ) : null}

            {transferHistory.some((item) => item.awaitingCouponRedemption) ? (
              <div
                role="status"
                aria-live="polite"
                className="rounded-xl border border-[var(--pl-pill-success-border)] bg-[var(--pl-surface-elevated)] p-3.5 text-xs space-y-1"
                data-plan-awaiting-redemption=""
              >
                <strong className="block text-sm font-extrabold text-[var(--pl-success)]">
                  Pago confirmado · Revisa tu correo para canjear tu cupón
                </strong>
                <p className="m-0 leading-relaxed text-[var(--pl-text-secondary)]">
                  Te enviamos un cupón personal de un solo uso (vigencia de 30 días) desde{" "}
                  <strong className="num">noreply@pitchlab.mx</strong>. Ingrésalo en la caja de
                  canje de abajo o en{" "}
                  <a href="/canjear" className="underline font-bold text-[var(--pl-brand)]">
                    /canjear
                  </a>{" "}
                  para activar tus días pagados.
                </p>
              </div>
            ) : null}

            {transferFeedback ? (
              <div
                role={transferFeedback.kind === "error" ? "alert" : "status"}
                aria-live="polite"
                className={`rounded-xl border p-3 text-xs font-semibold bg-[var(--pl-surface-elevated)] ${
                  transferFeedback.kind === "error"
                    ? "border-[var(--pl-pill-danger-border)] text-[var(--pl-danger)]"
                    : "border-[var(--pl-pill-success-border)] text-[var(--pl-success)]"
                }`}
              >
                {transferFeedback.text}
              </div>
            ) : null}

            {isTransferMode ? (
              !canExposeSpeiDetails ? (
                <div className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] p-4 text-xs text-[var(--pl-text-secondary)]">
                  Inicia sesión con tu cuenta para consultar los datos bancarios destino y tu
                  referencia única SPEI.
                </div>
              ) : activePending ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="pl-pill pl-pill--brand">
                        Paso 1 · Haz tu transferencia SPEI
                      </span>
                      <span className="text-xs font-semibold num text-[var(--pl-text-muted)]">
                        {activePending.planInterval === "annual"
                          ? "Plan anual (365 días)"
                          : "Plan mensual (30 días)"}
                        {activePending.referralDiscountApplied
                          ? " · Incluye 30 % dto. referido"
                          : ""}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-0.5">
                        <span className="text-[var(--pl-text-muted)]">Monto exacto</span>
                        <strong className="block text-lg font-extrabold num text-[var(--pl-text)]">
                          {formatCentavosMxn(activePending.amountCentavosMxn)}
                        </strong>
                      </div>

                      <div className="space-y-1 min-w-0">
                        <span className="text-[var(--pl-text-muted)]">
                          Concepto / Referencia única
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong
                            className="text-base font-extrabold tracking-wider num break-all text-[var(--pl-brand)]"
                            data-transfer-ref=""
                          >
                            {activePending.referenceCode}
                          </strong>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              void handleCopyText(
                                activePending.referenceCode,
                                "ref",
                                "Concepto SPEI",
                              )
                            }
                          >
                            <MaestroIcon name={copiedKey === "ref" ? "check" : "copy"} size={13} />
                            <span>{copiedKey === "ref" ? "Copiado" : "Copiar"}</span>
                          </Button>
                          <span className="sr-only" role="status" aria-live="polite">
                            {copiedKey === "ref" ? "Concepto SPEI copiado al portapapeles" : ""}
                          </span>
                        </div>
                      </div>
                    </div>

                    {transferBank.configured && transferBank.clabe ? (
                      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-3 border-t border-[var(--pl-border)] m-0">
                        <div className="min-w-0">
                          <dt className="text-[var(--pl-text-muted)]">Banco</dt>
                          <dd className="m-0 font-bold break-words text-[var(--pl-text)]">
                            {transferBank.bank}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[var(--pl-text-muted)]">Beneficiario</dt>
                          <dd className="m-0 font-bold break-words text-[var(--pl-text)]">
                            {transferBank.beneficiary}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[var(--pl-text-muted)]">CLABE interbancaria</dt>
                          <dd className="m-0 flex flex-wrap items-center gap-2 font-extrabold num">
                            <span className="break-all text-[var(--pl-text)]">
                              {transferBank.clabe}
                            </span>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                void handleCopyText(transferBank.clabe!, "clabe", "CLABE")
                              }
                            >
                              <MaestroIcon
                                name={copiedKey === "clabe" ? "check" : "copy"}
                                size={13}
                              />
                              <span>{copiedKey === "clabe" ? "Copiada" : "Copiar"}</span>
                            </Button>
                            <span className="sr-only" role="status" aria-live="polite">
                              {copiedKey === "clabe" ? "CLABE copiada al portapapeles" : ""}
                            </span>
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="m-0 text-xs leading-relaxed pt-1 text-[var(--pl-warning)]">
                        Los datos de CLABE están actualizándose en esta instancia. Escríbenos a{" "}
                        <strong>{transferBank.supportEmail}</strong> indicando tu referencia{" "}
                        <strong className="num">{activePending.referenceCode}</strong> para recibir
                        la CLABE al instante.
                      </p>
                    )}

                    {transferBank.instructions ? (
                      <p className="m-0 text-xs text-[var(--pl-text-muted)]">
                        {transferBank.instructions}
                      </p>
                    ) : null}
                  </div>

                  <form
                    onSubmit={handleSubmitReceipt}
                    noValidate
                    className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] p-4 space-y-3"
                    data-transfer-receipt-form=""
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="pl-pill pl-pill--info">
                        Paso 2 · Ya transferí (opcional pero agiliza)
                      </span>
                      {activePending.receiptReference || activePending.originBank ? (
                        <span className="pl-pill pl-pill--success">Comprobante enviado</span>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <label className="space-y-1 block min-w-0">
                        <span className="font-semibold text-[var(--pl-text-secondary)]">
                          Banco de origen
                        </span>
                        <input
                          type="text"
                          name="originBank"
                          maxLength={80}
                          placeholder="Ej. BBVA, Nu, Santander"
                          value={originBank}
                          onChange={(e) => setOriginBank(e.target.value)}
                          className="pl-acct-input"
                        />
                      </label>

                      <label className="space-y-1 block min-w-0">
                        <span className="font-semibold text-[var(--pl-text-secondary)]">
                          Monto transferido (MXN)
                        </span>
                        <input
                          type="text"
                          name="reportedPesos"
                          inputMode="decimal"
                          value={reportedPesos}
                          onChange={(e) => setReportedPesos(e.target.value)}
                          className="pl-acct-input num"
                        />
                      </label>

                      <label className="space-y-1 block min-w-0">
                        <span className="font-semibold text-[var(--pl-text-secondary)]">
                          Clave de rastreo o folio SPEI
                        </span>
                        <input
                          type="text"
                          name="receiptReference"
                          maxLength={120}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          placeholder="Folio de tu comprobante"
                          value={receiptReference}
                          onChange={(e) => setReceiptReference(e.target.value)}
                          className="pl-acct-input num"
                        />
                      </label>

                      <label className="space-y-1 block min-w-0">
                        <span className="font-semibold text-[var(--pl-text-secondary)]">
                          Nombre del titular que transfiere
                        </span>
                        <input
                          type="text"
                          name="payerName"
                          maxLength={120}
                          autoComplete="name"
                          placeholder="Como aparece en tu cuenta"
                          value={payerName}
                          onChange={(e) => setPayerName(e.target.value)}
                          className="pl-acct-input"
                        />
                      </label>

                      <label className="space-y-1 block min-w-0">
                        <span className="font-semibold text-[var(--pl-text-secondary)]">
                          Fecha de la transferencia
                        </span>
                        <input
                          type="date"
                          name="transferDate"
                          value={transferDate}
                          onChange={(e) => setTransferDate(e.target.value)}
                          className="pl-acct-input num"
                        />
                      </label>

                      <label className="space-y-1 block min-w-0">
                        <span className="font-semibold text-[var(--pl-text-secondary)]">
                          Nota opcional
                        </span>
                        <input
                          type="text"
                          name="userNote"
                          maxLength={280}
                          placeholder="Cualquier detalle para identificarla"
                          value={userNote}
                          onChange={(e) => setUserNote(e.target.value)}
                          className="pl-acct-input"
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                      <Button
                        type="button"
                        variant="secondary"
                        tone="danger"
                        disabled={transferBusy}
                        onClick={() => setConfirmCancelTransferOpen(true)}
                      >
                        Cancelar solicitud
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={transferBusy}
                        data-transfer-submit=""
                      >
                        {transferBusy
                          ? "Guardando…"
                          : activePending.receiptReference || activePending.originBank
                            ? "Actualizar comprobante"
                            : "Ya transferí · Enviar datos"}
                      </Button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 text-xs min-w-0">
                    <strong className="block text-sm font-extrabold text-[var(--pl-text)]">
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
                    <span className="text-[var(--pl-text-muted)]">
                      {visibleSpeiReference
                        ? `Tu referencia única permanente es ${visibleSpeiReference}. Registra tu transferencia para recibir tu cupón por correo.`
                        : "Usa tu referencia única ligada a tu cuenta para identificar tu transferencia y recibir tu cupón."}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={transferBusy}
                    onClick={() =>
                      void handleCreateTransfer(selectedCycle === "anual" ? "annual" : "monthly")
                    }
                    className="shrink-0"
                    data-create-transfer=""
                  >
                    {transferBusy ? "Preparando…" : "Ver cuenta SPEI y referencia"}
                  </Button>
                </div>
              )
            ) : null}

            <div className="pt-4 border-t border-[var(--pl-border)] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="m-0 text-sm font-extrabold text-[var(--pl-text)]">
                  ¿Tienes un cupón de acceso?
                </h3>
                <span className="text-xs text-[var(--pl-text-muted)]">
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
          </div>
        </SofascoreCard>
      </section>

      <div className="pl-acct-plan-bottom">
        <SofascoreCard id="pl-acct-incluye" title="Lo que incluye tu pase">
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
        </SofascoreCard>

        <SofascoreCard
          id="pl-acct-pagos"
          title="Historial de pagos"
          meta={!accountsEnabled ? <ExampleBadge /> : undefined}
        >
          <div className="space-y-3" data-transfer-history="">
            {accountsEnabled || transferHistory.length > 0 ? (
              transferHistory.length === 0 ? (
                <SofascoreEmptyState
                  title={
                    isTransferMode
                      ? "Aún no tienes transferencias ni cobros registrados."
                      : "Aún no tienes cobros registrados."
                  }
                />
              ) : (
                <SofascoreTable
                  caption="Historial de transferencias y pagos"
                  columns={transferHistoryColumns}
                  rows={transferHistory}
                  rowKey={(row) => row.id}
                  density="compact"
                />
              )
            ) : (
              <SofascoreTable
                caption="Historial de pagos de muestra"
                columns={examplePaymentColumns}
                rows={examplePayments}
                rowKey={(row) => row.id}
                density="compact"
              />
            )}

            {onOpenBilling ? (
              <Button type="button" variant="ghost" size="sm" onClick={handleGoBilling}>
                Datos de facturación
              </Button>
            ) : null}
          </div>
        </SofascoreCard>
      </div>

      <p className="pl-acct-legal-foot">
        {isTransferMode
          ? "En Beta 1.0 el pago se realiza por transferencia SPEI única sin cargos automáticos ni tarjeta guardada. Solo mayores de 18."
          : "El cobro lo procesa Stripe; PitchLab no guarda tu tarjeta. Si cancelas, conservas el acceso hasta el final del periodo pagado y tus días a favor. Solo mayores de 18."}
      </p>

      <ConfirmActionDialog
        open={activeDialog === "cancel"}
        title="¿Cancelar la renovación?"
        description={`Al cancelar no se te vuelve a cobrar. Conservas acceso completo hasta el ${accessEndDate}, tus +${earnedDays} días a favor y tu bitácora cerrada.`}
        cancelLabel="Cancelar"
        confirmLabel="Cancelar renovación"
        tone="danger"
        onConfirm={confirmCancel}
        onCancel={() => setActiveDialog(null)}
      />

      <ConfirmActionDialog
        open={activeDialog === "reactivate"}
        title="¿Reactivar la renovación?"
        description={`Tu pase seguirá activo sin interrupción después del ${accessEndDate}, respetando tus días a favor.`}
        cancelLabel="Cancelar"
        confirmLabel="Reactivar renovación"
        tone="brand"
        onConfirm={confirmReactivate}
        onCancel={() => setActiveDialog(null)}
      />

      <ConfirmActionDialog
        open={activeDialog === "card"}
        title="Cambiar tarjeta de pago"
        description="Stripe procesa y resguarda tu tarjeta. Desde el portal de cobro puedes reemplazarla sin perder días de tu pase."
        cancelLabel="Cancelar"
        confirmLabel="Continuar"
        tone="brand"
        onConfirm={confirmCardChange}
        onCancel={() => setActiveDialog(null)}
      />

      <ConfirmActionDialog
        open={activeDialog === "switch"}
        title={selectedCycle === "anual" ? "Cambiar a ciclo anual" : "Cambiar a ciclo mensual"}
        description={
          selectedCycle === "anual"
            ? `Cambiar no pierde días: aplica en el siguiente corte (${accessEndDate}). Pagarás $${annualFormatted} MXN al año (ahorras $${savingsFormatted} MXN frente al mensual).`
            : `Cambiar no pierde días: aplica en el siguiente corte (${accessEndDate}). Pagarás $${monthlyMxn} MXN al mes al terminar tu periodo actual.`
        }
        cancelLabel="Cancelar"
        confirmLabel="Confirmar cambio"
        tone="brand"
        onConfirm={confirmCycleSwitch}
        onCancel={() => setActiveDialog(null)}
      />

      <ConfirmActionDialog
        open={confirmCancelTransferOpen}
        title="¿Cancelar solicitud SPEI?"
        description="Se anulará tu referencia pendiente actual. Podrás generar una nueva referencia cuando quieras."
        cancelLabel="Cancelar"
        confirmLabel="Cancelar solicitud"
        tone="danger"
        onConfirm={() => {
          void handleCancelTransfer();
        }}
        onCancel={() => setConfirmCancelTransferOpen(false)}
      />

      {allowRoleSimulation ? (
        <aside className="pl-acct-simulator" aria-label="Simulador de estado del plan">
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
                className="pl-acct-seg-btn"
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
