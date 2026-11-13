import React, { useLayoutEffect } from "react";
import {
  AccountReferralsClubView,
  type AccountReferralsClubViewProps,
} from "./club/AccountReferralsClubView";
import {
  AdminPaymentsCouponsSection,
  type AdminPaymentsStoryOverride,
} from "./club/AdminPaymentsCouponsSection";
import type { ServerPlanPayload, TransferRequestItem } from "./club/account/PlanTab";
import { CanjearCouponView, type CanjearCouponViewProps } from "./components/CanjearCouponView";
import { ExpiredPassGate, type ExpiredPassGateProps } from "./components/ExpiredPassGate";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";

const EMPTY_DATASET = buildPlatformDataset([]);

const SAMPLE_BANK_CONFIGURED = {
  configured: true,
  bank: "STP / BBVA México",
  beneficiary: "PitchLab México S.A.P.I.",
  clabe: "000000000000000001",
  clabeMasked: "•••• •••• •••• 0001",
  instructions: "Usa exactamente la referencia PL-... como concepto de tu transferencia SPEI.",
  supportEmail: "soporte@pitchlab.mx",
};

const SAMPLE_BANK_UNCONFIGURED = {
  configured: false,
  bank: null,
  beneficiary: null,
  clabe: null,
  clabeMasked: null,
  instructions: null,
  supportEmail: "soporte@pitchlab.mx",
};

const SAMPLE_TRANSFER_PENDING: TransferRequestItem = {
  id: "tr-pending-1",
  planInterval: "monthly",
  amountCentavosMxn: 20_900,
  reportedAmountCentavosMxn: null,
  amountMismatch: false,
  referralDiscountApplied: true,
  referenceCode: "PL-BETA1-0482",
  originBank: null,
  receiptReference: null,
  payerName: null,
  transferDate: null,
  userNote: null,
  status: "pending_review",
  rejectionReason: null,
  reviewedAtIso: null,
  createdAtIso: "2026-11-10T18:30:00Z",
  updatedAtIso: "2026-11-10T18:30:00Z",
};

const SAMPLE_TRANSFER_RECEIPT_SENT: TransferRequestItem = {
  id: "tr-receipt-1",
  planInterval: "annual",
  amountCentavosMxn: 239_000,
  reportedAmountCentavosMxn: 239_000,
  amountMismatch: false,
  referralDiscountApplied: false,
  referenceCode: "PL-ANUAL-9914",
  originBank: "BBVA México",
  receiptReference: "SPEI-20261111-77412",
  payerName: "Carlos Méndez",
  transferDate: "2026-11-11",
  userNote: "Transferencia enviada a las 14:20 desde banca móvil.",
  status: "pending_review",
  rejectionReason: null,
  reviewedAtIso: null,
  createdAtIso: "2026-11-11T14:00:00Z",
  updatedAtIso: "2026-11-11T20:22:00Z",
};

const SAMPLE_TRANSFER_REJECTED: TransferRequestItem = {
  id: "tr-rej-1",
  planInterval: "monthly",
  amountCentavosMxn: 29_900,
  reportedAmountCentavosMxn: 25_000,
  amountMismatch: true,
  referralDiscountApplied: false,
  referenceCode: "PL-NOV-1120",
  originBank: "Nu México",
  receiptReference: "NU-88412",
  payerName: "Luis Ortega",
  transferDate: "2026-11-06",
  userNote: null,
  status: "rejected",
  rejectionReason: "No localizamos este folio en estado de cuenta y el monto reportado difiere.",
  reviewedAtIso: "2026-11-07T16:10:00Z",
  createdAtIso: "2026-11-06T15:00:00Z",
  updatedAtIso: "2026-11-07T16:10:00Z",
};

function makeServerPlan(overrides: Partial<ServerPlanPayload>): ServerPlanPayload {
  return {
    active: true,
    planState: "prueba",
    interval: "monthly",
    hasCard: false,
    cancelAtPeriodEnd: false,
    accessUntilIso: "2026-11-20T05:59:59Z",
    currentPeriodEndIso: null,
    memberSinceIso: "2026-11-01T12:00:00Z",
    trialDaysRemaining: 4,
    paidFriends: 1,
    earnedDays: 15,
    stripeConfigured: false,
    paymentMode: "transfer",
    accessSourceKind: "trial_m1_nocard",
    eligibleForReferralDiscount: true,
    quotedMonthlyCentavos: 20_900,
    quotedAnnualCentavos: 239_000,
    transferBank: SAMPLE_BANK_CONFIGURED,
    transferHistory: [],
    activePendingTransfer: null,
    ...overrides,
  };
}

function Beta1StoryFrame({
  theme = "dark",
  initialRole = "member",
  children,
}: {
  theme?: "dark" | "light";
  initialRole?: "visitor" | "member" | "admin";
  children: React.ReactNode;
}): React.JSX.Element {
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return (
    <div data-theme={theme}>
      <PlatformProvider
        dataset={EMPTY_DATASET}
        initialRole={initialRole}
        accountsEnabled={true}
        viewerVia="none"
        paymentMode="transfer"
      >
        {children}
      </PlatformProvider>
    </div>
  );
}

function renderPlanStory(
  theme: "dark" | "light",
  serverPlan: ServerPlanPayload,
  planOverride?: Partial<NonNullable<AccountReferralsClubViewProps["storyOverride"]>["plan"]>,
) {
  return (
    <Beta1StoryFrame theme={theme}>
      <AccountReferralsClubView
        initialTab="plan"
        initialServerPlan={serverPlan}
        storyOverride={{
          accountsEnabled: true,
          profile: {
            handle: "carlos_mx",
            displayName: "Carlos Méndez",
            email: "carlos@pitchlab.mx",
          },
          plan: {
            accountsEnabled: true,
            paymentMode: "transfer",
            serverPlan,
            ...planOverride,
          },
        }}
      />
    </Beta1StoryFrame>
  );
}

const ADMIN_OVERRIDE: AdminPaymentsStoryOverride = {
  accountsEnabled: true,
  transfers: [
    {
      id: "adm-tr-1",
      userId: "u-1",
      userEmail: "sofia_socio@pitchlab.mx",
      userHandle: "sofia_s",
      userDisplayName: "Sofía Salinas",
      planInterval: "monthly",
      amountCentavosMxn: 20_900,
      reportedAmountCentavosMxn: 25_000,
      amountMismatch: true,
      referralDiscountApplied: true,
      referenceCode: "PL-MISMATCH-209",
      originBank: "Santander México",
      receiptReference: "SANT-558291",
      payerName: "Sofía Salinas",
      transferDate: "2026-11-12",
      userNote: "Envié 250 por error, favor de revisar.",
      adminNotes: null,
      status: "pending_review",
      rejectionReason: null,
      reviewedAtIso: null,
      createdAtIso: "2026-11-12T10:15:00Z",
    },
    {
      id: "adm-tr-2",
      userId: "u-2",
      userEmail: "diego@pitchlab.mx",
      userHandle: "diego_mx",
      userDisplayName: "Diego Pérez",
      planInterval: "annual",
      amountCentavosMxn: 239_000,
      reportedAmountCentavosMxn: 239_000,
      amountMismatch: false,
      referralDiscountApplied: false,
      referenceCode: "PL-ANNUAL-441",
      originBank: "BBVA México",
      receiptReference: "BBVA-00921",
      payerName: "Diego Pérez",
      transferDate: "2026-11-11",
      userNote: null,
      adminNotes: "Verificado en estado de cuenta",
      status: "approved",
      rejectionReason: null,
      reviewedAtIso: "2026-11-11T19:00:00Z",
      createdAtIso: "2026-11-11T15:00:00Z",
    },
  ],
  members: [
    {
      id: "u-1",
      email: "carlos@pitchlab.mx",
      handle: "carlos_mx",
      displayName: "Carlos Méndez",
      isAmbassador: false,
      accessUntilIso: "2026-12-12T05:59:59Z",
      activeSourceKind: "transfer_monthly",
      grants: [
        {
          id: "g-1",
          sourceKind: "transfer_monthly",
          daysGranted: 30,
          startsAtIso: "2026-11-12T06:00:00Z",
          endsAtIso: "2026-12-12T05:59:59Z",
          revokedAtIso: null,
          revokeReason: null,
          note: "SPEI PL-9981",
        },
        {
          id: "g-2",
          sourceKind: "coupon_gift",
          daysGranted: 15,
          startsAtIso: "2026-10-15T06:00:00Z",
          endsAtIso: "2026-10-30T05:59:59Z",
          revokedAtIso: "2026-10-20T12:00:00Z",
          revokeReason: "Cupón de prueba revocado",
          note: "BETA15",
        },
      ],
    },
  ],
  coupons: [
    {
      id: "cp-1",
      code: "BETAMX30",
      days: 30,
      maxRedemptions: 50,
      redeemedCount: 14,
      expiresAtIso: "2026-12-31T23:59:59Z",
      active: true,
      note: "Campaña lanzamiento Beta 1.0",
      createdAtIso: "2026-11-01T10:00:00Z",
    },
    {
      id: "cp-2",
      code: "TORNEO7",
      days: 7,
      maxRedemptions: 10,
      redeemedCount: 10,
      expiresAtIso: null,
      active: false,
      note: "Agotado en dinámica",
      createdAtIso: "2026-10-18T10:00:00Z",
    },
  ],
  payouts: {
    totalsByTipster: [
      {
        tipsterUserId: "t-1",
        handle: "lupita_mx",
        displayName: "Lupita Picks",
        email: "lupita@pitchlab.mx",
        pendingClearanceCentavos: 12_900,
        payableCentavos: 45_150,
        paidOutCentavos: 64_500,
        payableCount: 2,
      },
    ],
    ledger: [
      {
        id: "led-1",
        tipsterUserId: "t-1",
        tipsterHandle: "lupita_mx",
        tipsterName: "Lupita Picks",
        tipsterEmail: "lupita@pitchlab.mx",
        stripeInvoiceId: "spei_ref_901",
        commissionCentavosMxn: 25_776,
        commissionBps: 2500,
        status: "payable",
        clearsAtIso: "2026-11-10T12:00:00Z",
        stripeTransferId: null,
        payoutNote: null,
        paidOutAtIso: null,
        createdAtIso: "2026-10-27T12:00:00Z",
      },
    ],
  },
};

export default {
  title: "PitchLab v4 / Beta 1.0 · SPEI, Cupones y Operación",
  parameters: {
    layout: "fullscreen",
  },
};

/* ---------- PlanTab · Estados SPEI ---------- */

export const PlanSpeiPendienteConClabeOscuro = {
  render: () =>
    renderPlanStory(
      "dark",
      makeServerPlan({
        activePendingTransfer: SAMPLE_TRANSFER_PENDING,
        transferHistory: [SAMPLE_TRANSFER_PENDING],
      }),
    ),
};

export const PlanSpeiPendienteConClabeClaro = {
  globals: { theme: "light" },
  render: () =>
    renderPlanStory(
      "light",
      makeServerPlan({
        activePendingTransfer: SAMPLE_TRANSFER_PENDING,
        transferHistory: [SAMPLE_TRANSFER_PENDING],
      }),
    ),
};

export const PlanSpeiSinClabeConfiguradaOscuro = {
  render: () =>
    renderPlanStory(
      "dark",
      makeServerPlan({
        transferBank: SAMPLE_BANK_UNCONFIGURED,
        activePendingTransfer: {
          ...SAMPLE_TRANSFER_PENDING,
          referenceCode: "PL-SOPORTE-109",
        },
        transferHistory: [SAMPLE_TRANSFER_PENDING],
      }),
    ),
};

export const PlanSpeiComprobanteEnviadoOscuro = {
  render: () =>
    renderPlanStory(
      "dark",
      makeServerPlan({
        planState: "mensual",
        interval: "annual",
        activePendingTransfer: SAMPLE_TRANSFER_RECEIPT_SENT,
        transferHistory: [SAMPLE_TRANSFER_RECEIPT_SENT],
      }),
    ),
};

export const PlanSpeiComprobanteEnviadoClaro = {
  globals: { theme: "light" },
  render: () =>
    renderPlanStory(
      "light",
      makeServerPlan({
        planState: "mensual",
        interval: "annual",
        activePendingTransfer: SAMPLE_TRANSFER_RECEIPT_SENT,
        transferHistory: [SAMPLE_TRANSFER_RECEIPT_SENT],
      }),
    ),
};

export const PlanSpeiRechazadaHistorialOscuro = {
  render: () =>
    renderPlanStory(
      "dark",
      makeServerPlan({
        transferHistory: [SAMPLE_TRANSFER_REJECTED],
      }),
    ),
};

export const PlanPaseVencidoOscuro = {
  render: () =>
    renderPlanStory(
      "dark",
      makeServerPlan({
        active: false,
        planState: "sin_renovacion",
        accessUntilIso: "2026-11-05T05:59:59Z",
        trialDaysRemaining: 0,
        transferHistory: [SAMPLE_TRANSFER_REJECTED],
      }),
    ),
};

/* ---------- ExpiredPassGate ---------- */

function ExpiredStory(props: ExpiredPassGateProps & { theme: "dark" | "light" }) {
  return (
    <Beta1StoryFrame theme={props.theme}>
      <ExpiredPassGate
        memberHandle={props.memberHandle}
        accessEndedIso={props.accessEndedIso}
        paymentMode="transfer"
        storyOverride={props.storyOverride}
      />
    </Beta1StoryFrame>
  );
}

export const PuertaPaseVencidoSpeiOscuro = {
  render: () => (
    <ExpiredStory
      theme="dark"
      memberHandle="carlos_mx"
      accessEndedIso="2026-11-08T06:00:00Z"
      storyOverride={{
        memberHandle: "carlos_mx",
        accessEndedIso: "2026-11-08T06:00:00Z",
        paymentMode: "transfer",
        hasAccountSession: true,
      }}
    />
  ),
};

export const PuertaPaseVencidoSpeiClaro = {
  globals: { theme: "light" },
  render: () => (
    <ExpiredStory
      theme="light"
      memberHandle="carlos_mx"
      accessEndedIso="2026-11-08T06:00:00Z"
      storyOverride={{
        memberHandle: "carlos_mx",
        accessEndedIso: "2026-11-08T06:00:00Z",
        paymentMode: "transfer",
        hasAccountSession: true,
      }}
    />
  ),
};

export const PuertaPaseVencidoCuponCanjeadoOscuro = {
  render: () => (
    <ExpiredStory
      theme="dark"
      memberHandle="carlos_mx"
      accessEndedIso="2026-11-08T06:00:00Z"
      storyOverride={{
        memberHandle: "carlos_mx",
        accessEndedIso: "2026-11-08T06:00:00Z",
        paymentMode: "transfer",
        hasAccountSession: true,
        redeemStatus: "redeemed",
        redeemDays: 30,
        redeemMessage: "Listo: sumamos 30 días de Pase PitchLab Ultra a tu cuenta.",
      }}
    />
  ),
};

/* ---------- CanjearCouponView ---------- */

function CanjearStory(props: CanjearCouponViewProps & { theme: "dark" | "light" }) {
  return (
    <Beta1StoryFrame
      theme={props.theme}
      initialRole={props.mode === "club" ? "member" : "visitor"}
    >
      <CanjearCouponView
        mode={props.mode}
        initialCode={props.initialCode}
        initialPreview={props.initialPreview}
        storyOverride={props.storyOverride}
      />
    </Beta1StoryFrame>
  );
}

export const CanjearPublicoValidoOscuro = {
  render: () => (
    <CanjearStory
      theme="dark"
      mode="public"
      initialCode="BETAMX30"
      storyOverride={{
        accountsEnabled: true,
        hasAccountSession: false,
        preview: {
          valid: true,
          coupon: {
            code: "BETAMX30",
            days: 30,
            expiresAtIso: "2026-12-31T23:59:59Z",
          },
        },
      }}
    />
  ),
};

export const CanjearPublicoValidoClaro = {
  globals: { theme: "light" },
  render: () => (
    <CanjearStory
      theme="light"
      mode="public"
      initialCode="BETAMX30"
      storyOverride={{
        accountsEnabled: true,
        hasAccountSession: false,
        preview: {
          valid: true,
          coupon: {
            code: "BETAMX30",
            days: 30,
            expiresAtIso: "2026-12-31T23:59:59Z",
          },
        },
      }}
    />
  ),
};

export const CanjearPublicoAgotadoOVencidoOscuro = {
  render: () => (
    <CanjearStory
      theme="dark"
      mode="public"
      initialCode="TORNEO7"
      storyOverride={{
        accountsEnabled: true,
        hasAccountSession: false,
        preview: {
          valid: false,
          reason: "agotado",
          error: "Este cupón ya alcanzó su límite máximo de canjes.",
          coupon: {
            code: "TORNEO7",
            days: 7,
            expiresAtIso: null,
          },
        },
      }}
    />
  ),
};

export const CanjearClubCanjeadoOscuro = {
  render: () => (
    <CanjearStory
      theme="dark"
      mode="club"
      initialCode="BETAMX30"
      storyOverride={{
        accountsEnabled: true,
        hasAccountSession: true,
        preview: {
          valid: true,
          coupon: {
            code: "BETAMX30",
            days: 30,
            expiresAtIso: "2026-12-31T23:59:59Z",
          },
        },
        redeemStatus: "redeemed",
        redeemDays: 30,
        redeemMessage: "Listo: sumamos 30 días de acceso a tu cuenta @carlos_mx.",
      }}
    />
  ),
};

export const CanjearClubCanjeadoClaro = {
  globals: { theme: "light" },
  render: () => (
    <CanjearStory
      theme="light"
      mode="club"
      initialCode="BETAMX30"
      storyOverride={{
        accountsEnabled: true,
        hasAccountSession: true,
        preview: {
          valid: true,
          coupon: {
            code: "BETAMX30",
            days: 30,
            expiresAtIso: "2026-12-31T23:59:59Z",
          },
        },
        redeemStatus: "redeemed",
        redeemDays: 30,
        redeemMessage: "Listo: sumamos 30 días de acceso a tu cuenta @carlos_mx.",
      }}
    />
  ),
};

/* ---------- AdminPaymentsCouponsSection ---------- */

function AdminOpsStory({
  theme,
  initialTab,
}: {
  theme: "dark" | "light";
  initialTab: AdminPaymentsStoryOverride["initialTab"];
}) {
  return (
    <Beta1StoryFrame theme={theme} initialRole="admin">
      <div className="max-w-5xl mx-auto p-4 sm:p-8">
        <AdminPaymentsCouponsSection
          storyOverride={{
            ...ADMIN_OVERRIDE,
            initialTab,
          }}
        />
      </div>
    </Beta1StoryFrame>
  );
}

export const AdminSpeiConDiferenciaOscuro = {
  render: () => <AdminOpsStory theme="dark" initialTab="transfers" />,
};

export const AdminSpeiConDiferenciaClaro = {
  globals: { theme: "light" },
  render: () => <AdminOpsStory theme="light" initialTab="transfers" />,
};

export const AdminSociosVigenciasOscuro = {
  render: () => <AdminOpsStory theme="dark" initialTab="members" />,
};

export const AdminCuponesOscuro = {
  render: () => <AdminOpsStory theme="dark" initialTab="coupons" />,
};

export const AdminLiquidacionesTipstersOscuro = {
  render: () => <AdminOpsStory theme="dark" initialTab="payouts" />,
};

export const AdminLiquidacionesTipstersClaro = {
  globals: { theme: "light" },
  render: () => <AdminOpsStory theme="light" initialTab="payouts" />,
};
