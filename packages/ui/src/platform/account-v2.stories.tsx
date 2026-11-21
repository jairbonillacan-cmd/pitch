import React from "react";
import {
  AccountReferralsClubView,
  type AccountReferralsClubViewProps,
} from "./club/AccountReferralsClubView";
import { BillingTab } from "./club/account/BillingTab";
import { type ServerPlanPayload } from "./club/account/PlanTab";
import { type AccountSavedView } from "./club/account/account-helpers";
import { CanjearCouponView, type CanjearCouponViewProps } from "./components/CanjearCouponView";
import { useSafeEffect } from "./hooks";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";

const EMPTY_DATASET = buildPlatformDataset([]);

const SAMPLE_SAVED_VIEWS: AccountSavedView[] = [
  {
    id: "view-liga-mx-ev",
    name: "Liga MX · EV+ alto",
    sport: "futbol",
    league: "all",
    band: "alta",
    kind: "all",
    sort: "ventaja",
    onlyPositiveEdge: true,
    minOddsStep: 0,
    maxOddsStep: 100,
    window: "today",
    pinToHomeHub: true,
  },
  {
    id: "view-nba-noche",
    name: "NBA · Noche",
    sport: "nba",
    league: "all",
    band: "all",
    kind: "all",
    sort: "p",
    onlyPositiveEdge: true,
    minOddsStep: 0,
    maxOddsStep: 100,
    window: "next48h",
    pinToHomeHub: false,
  },
];

const SAMPLE_SPEI_SERVER_PLAN: ServerPlanPayload = {
  active: false,
  planState: "prueba",
  interval: "monthly",
  hasCard: false,
  cancelAtPeriodEnd: false,
  accessUntilIso: null,
  currentPeriodEndIso: null,
  memberSinceIso: "2026-04-01T12:00:00.000Z",
  trialDaysRemaining: 4,
  paidFriends: 1,
  earnedDays: 7,
  stripeConfigured: false,
  paymentMode: "transfer",
  eligibleForReferralDiscount: true,
  quotedMonthlyCentavos: 24900,
  quotedAnnualCentavos: 299000,
  speiReferenceCode: "PL-JAIR-4821",
  transferBank: {
    configured: true,
    bank: "STP / Sistema de Pagos Electrónicos",
    beneficiary: "PitchLab México S.A. de C.V.",
    clabe: "646180110400000001",
    clabeMasked: "•••• •••• •••• 0001",
    instructions: "Incluye tu referencia exacta en el concepto SPEI.",
    supportEmail: "hola@pitchlab.mx",
  },
  transferHistory: [
    {
      id: "tr-demo-1",
      planInterval: "monthly",
      amountCentavosMxn: 24900,
      reportedAmountCentavosMxn: 24900,
      amountMismatch: false,
      referralDiscountApplied: true,
      referenceCode: "PL-JAIR-4821",
      originBank: "BBVA",
      receiptReference: "20261121SPEI009182",
      payerName: "Jair R.",
      transferDate: "2026-11-21",
      userNote: null,
      status: "pending_review",
      rejectionReason: null,
      reviewedAtIso: null,
      createdAtIso: "2026-11-21T16:15:00.000Z",
      updatedAtIso: "2026-11-21T16:15:00.000Z",
    },
  ],
  activePendingTransfer: {
    id: "tr-demo-1",
    planInterval: "monthly",
    amountCentavosMxn: 24900,
    reportedAmountCentavosMxn: 24900,
    amountMismatch: false,
    referralDiscountApplied: true,
    referenceCode: "PL-JAIR-4821",
    originBank: "BBVA",
    receiptReference: "20261121SPEI009182",
    payerName: "Jair R.",
    transferDate: "2026-11-21",
    userNote: null,
    status: "pending_review",
    rejectionReason: null,
    reviewedAtIso: null,
    createdAtIso: "2026-11-21T16:15:00.000Z",
    updatedAtIso: "2026-11-21T16:15:00.000Z",
  },
  latestApprovedTransfer: null,
};

function StoryThemeSync({ theme }: { theme: "dark" | "light" }): null {
  useSafeEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  return null;
}

function AccountStoryFrame({
  theme = "dark",
  accountsEnabled = false,
  allowRoleSimulation = false,
  viewProps,
}: {
  theme?: "dark" | "light";
  accountsEnabled?: boolean;
  allowRoleSimulation?: boolean;
  viewProps?: AccountReferralsClubViewProps;
}): React.JSX.Element {
  return (
    <div data-theme={theme} className="min-h-screen bg-[var(--pl-bg)] p-4 sm:p-6">
      <StoryThemeSync theme={theme} />
      <PlatformProvider
        dataset={EMPTY_DATASET}
        initialRole="member"
        accountsEnabled={accountsEnabled}
        allowRoleSimulation={allowRoleSimulation}
      >
        <AccountReferralsClubView {...viewProps} />
      </PlatformProvider>
    </div>
  );
}

function BillingStoryFrame({
  theme = "dark",
  accountsEnabled = false,
}: {
  theme?: "dark" | "light";
  accountsEnabled?: boolean;
}): React.JSX.Element {
  return (
    <div data-theme={theme} className="min-h-screen bg-[var(--pl-bg)] p-4 sm:p-6">
      <StoryThemeSync theme={theme} />
      <PlatformProvider
        dataset={EMPTY_DATASET}
        initialRole="member"
        accountsEnabled={accountsEnabled}
        allowRoleSimulation={false}
      >
        <div className="pl-acct">
          <BillingTab accountsEnabledOverride={accountsEnabled} />
        </div>
      </PlatformProvider>
    </div>
  );
}

function CanjearStoryFrame({
  theme = "dark",
  accountsEnabled = true,
  couponProps,
}: {
  theme?: "dark" | "light";
  accountsEnabled?: boolean;
  couponProps: CanjearCouponViewProps;
}): React.JSX.Element {
  return (
    <div data-theme={theme} className="min-h-screen bg-[var(--pl-bg)] p-4 sm:p-6">
      <StoryThemeSync theme={theme} />
      <PlatformProvider
        dataset={EMPTY_DATASET}
        initialRole="member"
        accountsEnabled={accountsEnabled}
        allowRoleSimulation={false}
      >
        <CanjearCouponView {...couponProps} />
      </PlatformProvider>
    </div>
  );
}

export default {
  title: "PitchLab v4 / Mi cuenta (CUENTA-2)",
  parameters: {
    layout: "fullscreen",
  },
};

export const InvitarSinCuentasOscuro = {
  render: () => (
    <AccountStoryFrame
      theme="dark"
      accountsEnabled={false}
      viewProps={{ initialTab: "referrals" }}
    />
  ),
};

export const InvitarSinCuentasClaro = {
  globals: { theme: "light" },
  render: () => (
    <AccountStoryFrame
      theme="light"
      accountsEnabled={false}
      viewProps={{ initialTab: "referrals" }}
    />
  ),
};

export const InvitarConCuentasOscuro = {
  render: () => (
    <AccountStoryFrame
      theme="dark"
      accountsEnabled={true}
      viewProps={{
        initialTab: "referrals",
        storyOverride: {
          accountsEnabled: true,
          profile: {
            handle: "carlos_mx",
            displayName: "Carlos Méndez",
            email: "carlos@pitchlab.mx",
          },
          invite: {
            accountsEnabled: true,
            referralCode: "CARLOS-9012",
            paidFriends: 3,
            pendingFriends: 1,
            loading: false,
          },
        },
      }}
    />
  ),
};

export const InvitarConCuentasClaro = {
  globals: { theme: "light" },
  render: () => (
    <AccountStoryFrame
      theme="light"
      accountsEnabled={true}
      viewProps={{
        initialTab: "referrals",
        storyOverride: {
          accountsEnabled: true,
          profile: {
            handle: "sofia_nfl",
            displayName: "Sofía Méndez",
            email: "sofia@pitchlab.mx",
            isTipster: true,
          },
          invite: {
            accountsEnabled: true,
            referralCode: "SOFIA-5501",
            paidFriends: 5,
            pendingFriends: 2,
            loading: false,
          },
        },
      }}
    />
  ),
};

export const MiPlanPruebaOscuro = {
  render: () => (
    <AccountStoryFrame
      theme="dark"
      accountsEnabled={false}
      viewProps={{
        initialTab: "plan",
        storyOverride: {
          accountsEnabled: false,
          plan: { accountsEnabled: false, planState: "prueba", paidFriends: 2 },
        },
      }}
    />
  ),
};

export const MiPlanPruebaClaro = {
  globals: { theme: "light" },
  render: () => (
    <AccountStoryFrame
      theme="light"
      accountsEnabled={false}
      viewProps={{
        initialTab: "plan",
        storyOverride: {
          accountsEnabled: false,
          plan: { accountsEnabled: false, planState: "prueba", paidFriends: 2 },
        },
      }}
    />
  ),
};

export const MiPlanMensualOscuro = {
  render: () => (
    <AccountStoryFrame
      theme="dark"
      accountsEnabled={true}
      viewProps={{
        initialTab: "plan",
        storyOverride: {
          accountsEnabled: true,
          profile: { handle: "jair", displayName: "Jair R.", email: "jair@pitchlab.mx" },
          plan: {
            accountsEnabled: true,
            planState: "mensual",
            paidFriends: 2,
          },
        },
      }}
    />
  ),
};

export const MiPlanMensualClaro = {
  globals: { theme: "light" },
  render: () => (
    <AccountStoryFrame
      theme="light"
      accountsEnabled={true}
      viewProps={{
        initialTab: "plan",
        storyOverride: {
          accountsEnabled: true,
          profile: { handle: "jair", displayName: "Jair R.", email: "jair@pitchlab.mx" },
          plan: {
            accountsEnabled: true,
            planState: "mensual",
            paidFriends: 2,
          },
        },
      }}
    />
  ),
};

export const MiPlanAnualOscuro = {
  render: () => (
    <AccountStoryFrame
      theme="dark"
      accountsEnabled={true}
      viewProps={{
        initialTab: "plan",
        storyOverride: {
          accountsEnabled: true,
          profile: { handle: "jair", displayName: "Jair R.", email: "jair@pitchlab.mx" },
          plan: {
            accountsEnabled: true,
            planState: "anual",
            paidFriends: 5,
          },
        },
      }}
    />
  ),
};

export const MiPlanAnualClaro = {
  globals: { theme: "light" },
  render: () => (
    <AccountStoryFrame
      theme="light"
      accountsEnabled={true}
      viewProps={{
        initialTab: "plan",
        storyOverride: {
          accountsEnabled: true,
          profile: { handle: "jair", displayName: "Jair R.", email: "jair@pitchlab.mx" },
          plan: {
            accountsEnabled: true,
            planState: "anual",
            paidFriends: 5,
          },
        },
      }}
    />
  ),
};

export const MiPlanSinRenovacionOscuro = {
  render: () => (
    <AccountStoryFrame
      theme="dark"
      accountsEnabled={true}
      viewProps={{
        initialTab: "plan",
        storyOverride: {
          accountsEnabled: true,
          profile: { handle: "jair", displayName: "Jair R.", email: "jair@pitchlab.mx" },
          plan: {
            accountsEnabled: true,
            planState: "sin_renovacion",
            paidFriends: 2,
          },
        },
      }}
    />
  ),
};

export const MiPlanSinRenovacionClaro = {
  globals: { theme: "light" },
  render: () => (
    <AccountStoryFrame
      theme="light"
      accountsEnabled={true}
      viewProps={{
        initialTab: "plan",
        storyOverride: {
          accountsEnabled: true,
          profile: { handle: "jair", displayName: "Jair R.", email: "jair@pitchlab.mx" },
          plan: {
            accountsEnabled: true,
            planState: "sin_renovacion",
            paidFriends: 2,
          },
        },
      }}
    />
  ),
};

export const MiPlanSpeiOscuro = {
  render: () => (
    <AccountStoryFrame
      theme="dark"
      accountsEnabled={true}
      viewProps={{
        initialTab: "plan",
        storyOverride: {
          accountsEnabled: true,
          profile: { handle: "jair", displayName: "Jair R.", email: "jair@pitchlab.mx" },
          plan: {
            accountsEnabled: true,
            planState: "prueba",
            paidFriends: 1,
            paymentMode: "transfer",
            serverPlan: SAMPLE_SPEI_SERVER_PLAN,
          },
        },
      }}
    />
  ),
};

export const MiPlanSpeiClaro = {
  globals: { theme: "light" },
  render: () => (
    <AccountStoryFrame
      theme="light"
      accountsEnabled={true}
      viewProps={{
        initialTab: "plan",
        storyOverride: {
          accountsEnabled: true,
          profile: { handle: "jair", displayName: "Jair R.", email: "jair@pitchlab.mx" },
          plan: {
            accountsEnabled: true,
            planState: "prueba",
            paidFriends: 1,
            paymentMode: "transfer",
            serverPlan: SAMPLE_SPEI_SERVER_PLAN,
          },
        },
      }}
    />
  ),
};

export const PreferenciasSinCuentasOscuro = {
  render: () => (
    <AccountStoryFrame
      theme="dark"
      accountsEnabled={false}
      viewProps={{
        initialTab: "prefs",
        storyOverride: {
          accountsEnabled: false,
          prefs: {
            accountsEnabled: false,
            initialPrefs: {
              showMxnBalance: true,
              unitMxn: 250,
              savedViews: SAMPLE_SAVED_VIEWS,
            },
          },
        },
      }}
    />
  ),
};

export const PreferenciasSinCuentasClaro = {
  globals: { theme: "light" },
  render: () => (
    <AccountStoryFrame
      theme="light"
      accountsEnabled={false}
      viewProps={{
        initialTab: "prefs",
        storyOverride: {
          accountsEnabled: false,
          prefs: {
            accountsEnabled: false,
            initialPrefs: {
              themeMode: "light",
              showMxnBalance: true,
              unitMxn: 250,
              savedViews: SAMPLE_SAVED_VIEWS,
            },
          },
        },
      }}
    />
  ),
};

export const PreferenciasConCuentasOscuro = {
  render: () => (
    <AccountStoryFrame
      theme="dark"
      accountsEnabled={true}
      viewProps={{
        initialTab: "prefs",
        storyOverride: {
          accountsEnabled: true,
          profile: { handle: "carlos_mx", displayName: "Carlos Méndez", email: "carlos@pitchlab.mx" },
          prefs: {
            accountsEnabled: true,
            email: "carlos@pitchlab.mx",
            visualStyle: "solid",
            initialPrefs: {
              timezone: "Europe/Madrid",
              preferredBooks: ["caliente", "bet365", "pinnacle"],
              savedViews: SAMPLE_SAVED_VIEWS,
              alerts: {
                valueAlerts: true,
                beforeMatch: true,
                pickSettled: false,
                billingReminder: true,
                weeklyDigest: false,
                monthlyRecord: false,
              },
            },
          },
        },
      }}
    />
  ),
};

export const PreferenciasConCuentasClaro = {
  globals: { theme: "light" },
  render: () => (
    <AccountStoryFrame
      theme="light"
      accountsEnabled={true}
      viewProps={{
        initialTab: "prefs",
        storyOverride: {
          accountsEnabled: true,
          profile: { handle: "carlos_mx", displayName: "Carlos Méndez", email: "carlos@pitchlab.mx" },
          prefs: {
            accountsEnabled: true,
            email: "carlos@pitchlab.mx",
            visualStyle: "solid",
            initialPrefs: {
              themeMode: "light",
              timezone: "America/New_York",
              preferredBooks: ["caliente", "bet365", "pinnacle"],
              savedViews: SAMPLE_SAVED_VIEWS,
              alerts: {
                valueAlerts: true,
                beforeMatch: true,
                pickSettled: false,
                billingReminder: true,
                weeklyDigest: false,
                monthlyRecord: false,
              },
            },
          },
        },
      }}
    />
  ),
};

export const FacturacionSinCuentasOscuro = {
  render: () => <BillingStoryFrame theme="dark" accountsEnabled={false} />,
};

export const FacturacionConCuentasClaro = {
  globals: { theme: "light" },
  render: () => <BillingStoryFrame theme="light" accountsEnabled={true} />,
};

export const CanjearCuponOscuro = {
  render: () => (
    <CanjearStoryFrame
      theme="dark"
      accountsEnabled={true}
      couponProps={{
        mode: "club",
        initialCode: "PL-ULTRA-30D",
        storyOverride: {
          accountsEnabled: true,
          hasAccountSession: true,
          preview: {
            valid: true,
            coupon: {
              code: "PL-ULTRA-30D",
              days: 30,
              maxRedemptions: 1,
              expiresAtIso: "2026-12-31T23:59:59.000Z",
              isTransferCoupon: true,
              isPersonal: true,
            },
          },
        },
      }}
    />
  ),
};

export const CanjearCuponClaro = {
  globals: { theme: "light" },
  render: () => (
    <CanjearStoryFrame
      theme="light"
      accountsEnabled={true}
      couponProps={{
        mode: "club",
        initialCode: "PL-ULTRA-30D",
        storyOverride: {
          accountsEnabled: true,
          hasAccountSession: true,
          preview: {
            valid: true,
            coupon: {
              code: "PL-ULTRA-30D",
              days: 30,
              maxRedemptions: 1,
              expiresAtIso: "2026-12-31T23:59:59.000Z",
              isTransferCoupon: false,
              isPersonal: false,
            },
          },
        },
      }}
    />
  ),
};

export const CanjearCuponCuentaDistintaOscuro = {
  render: () => (
    <CanjearStoryFrame
      theme="dark"
      accountsEnabled={true}
      couponProps={{
        mode: "club",
        initialCode: "PL-PRIVADO-99",
        storyOverride: {
          accountsEnabled: true,
          hasAccountSession: true,
          preview: {
            valid: false,
            reason: "cuenta_distinta",
            error: "Este cupón está reservado para otra cuenta.",
            coupon: null,
          },
        },
      }}
    />
  ),
};
