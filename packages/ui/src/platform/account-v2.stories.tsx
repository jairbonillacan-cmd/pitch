import React, { useLayoutEffect } from "react";
import {
  AccountReferralsClubView,
  type AccountReferralsClubViewProps,
} from "./club/AccountReferralsClubView";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";

const EMPTY_DATASET = buildPlatformDataset([]);

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
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return (
    <div data-theme={theme}>
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

export default {
  title: "PitchLab v4 / Mi cuenta (CUENTA-2)",
  parameters: {
    layout: "fullscreen",
  },
};

/* ---------- Fase A: Invitar amigos ---------- */

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

/* ---------- Fase C: Mi plan (3 estados + sin renovación) ---------- */

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

/* ---------- Fase D: Preferencias ---------- */

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
            initialPrefs: { showMxnBalance: true, unitMxn: 250 },
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
            initialPrefs: { themeMode: "light", showMxnBalance: true, unitMxn: 250 },
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
            initialPrefs: { themeMode: "light" },
          },
        },
      }}
    />
  ),
};

/* ---------- Facturación CFDI ---------- */

export const FacturacionSinCuentasOscuro = {
  render: () => (
    <AccountStoryFrame
      theme="dark"
      accountsEnabled={false}
      viewProps={{ initialTab: "cfdi" }}
    />
  ),
};

export const FacturacionConCuentasClaro = {
  globals: { theme: "light" },
  render: () => (
    <AccountStoryFrame
      theme="light"
      accountsEnabled={true}
      viewProps={{ initialTab: "cfdi" }}
    />
  ),
};
