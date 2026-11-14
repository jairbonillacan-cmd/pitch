import React from "react";
import { asLeagueId } from "@pitchlab/contracts";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import { AuthSurfaceV4 } from "./public/AuthAndOnboardingSurfaces";
import { LoginPreviewPanel } from "./public/LoginPreviewPanel";
import { LoginSurfaceV4 } from "./public/LoginSurfaceV4";
import { SignupSurfaceV4 } from "./public/SignupSurfaceV4";
import type { LandingHeroLeagueCard } from "./public/PublicSiteSections";

const EMPTY_DATASET = buildPlatformDataset([]);

const STORY_PRIMARY_CARD: LandingHeroLeagueCard = {
  league: asLeagueId("liga-mx"),
  leagueShort: "Liga MX",
  leagueLabel: "Liga MX",
  roundLabel: "Liga MX · J17",
  whenLabel: "Sáb 14 nov · 17:00",
  home: { slug: "queretaro", name: "Querétaro", note: "Local" },
  away: { slug: "monterrey", name: "Monterrey", note: "Visitante" },
  splitProbabilities: [0.28, 0.25, 0.47],
  splitLabels: ["Local", "Empate", "Visita"],
  mostProbable: {
    label: "Monterrey o empate",
    p: 0.723,
    fairAmerican: "\u2212261",
    fairDecimal: "1.38",
  },
  otherMarkets: [],
};

const STORY_SECONDARY_CARD: LandingHeroLeagueCard = {
  league: asLeagueId("nfl"),
  leagueShort: "NFL",
  leagueLabel: "NFL",
  roundLabel: "NFL · Semana 10",
  whenLabel: "Dom 15 nov · 12:00",
  home: { slug: "new-york-giants", name: "Giants", note: "Local" },
  away: { slug: "washington-commanders", name: "Washington", note: "Visitante" },
  splitProbabilities: [0.361, 0.639],
  splitLabels: ["Giants", "Washington"],
  mostProbable: {
    label: "Washington +7.5",
    p: 0.639,
    fairAmerican: "\u2212177",
    fairDecimal: "1.56",
  },
  otherMarkets: [],
};

function LoginStoryFrame({
  theme = "dark",
  accountsEnabled = true,
  children,
}: {
  theme?: "dark" | "light";
  accountsEnabled?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div data-theme={theme}>
      <PlatformProvider
        dataset={EMPTY_DATASET}
        initialRole="visitor"
        accountsEnabled={accountsEnabled}
      >
        {children}
      </PlatformProvider>
    </div>
  );
}

const PREVIEW_SLOT = (
  <LoginPreviewPanel
    primaryCard={STORY_PRIMARY_CARD}
    secondaryCard={STORY_SECONDARY_CARD}
  />
);

export default {
  title: "PitchLab v4 / Login Surface (LOGIN-2)",
  parameters: {
    layout: "fullscreen",
  },
};

export const CorreoOscuro = {
  render: () => (
    <LoginStoryFrame theme="dark">
      <AuthSurfaceV4 mode="login" previewSlot={PREVIEW_SLOT} />
    </LoginStoryFrame>
  ),
};

export const CorreoClaro = {
  render: () => (
    <LoginStoryFrame theme="light">
      <AuthSurfaceV4 mode="login" previewSlot={PREVIEW_SLOT} />
    </LoginStoryFrame>
  ),
};

export const RevisaTuCorreoOscuro = {
  render: () => (
    <LoginStoryFrame theme="dark">
      <LoginSurfaceV4
        previewSlot={PREVIEW_SLOT}
        initialStep="sent"
        initialEmail="ana@ejemplo.mx"
      />
    </LoginStoryFrame>
  ),
};

export const RevisaTuCorreoClaro = {
  render: () => (
    <LoginStoryFrame theme="light">
      <LoginSurfaceV4
        previewSlot={PREVIEW_SLOT}
        initialStep="sent"
        initialEmail="ana@ejemplo.mx"
      />
    </LoginStoryFrame>
  ),
};

export const ConInvitacionAplicada = {
  render: () => (
    <LoginStoryFrame theme="dark">
      <AuthSurfaceV4
        mode="login"
        initialPromoCode="SOFIA5"
        previewSlot={PREVIEW_SLOT}
      />
    </LoginStoryFrame>
  ),
};

export const ContrasenaTrasBandera = {
  render: () => (
    <LoginStoryFrame theme="dark">
      <LoginSurfaceV4
        previewSlot={PREVIEW_SLOT}
        passwordSignInEnabled
        initialStep="password"
      />
    </LoginStoryFrame>
  ),
};

export const SinVistaPrevia = {
  render: () => (
    <LoginStoryFrame theme="dark" accountsEnabled={false}>
      <AuthSurfaceV4 mode="login" previewSlot={null} />
    </LoginStoryFrame>
  ),
};

function ConfirmationStory({
  theme,
  mode,
  step,
}: {
  theme: "dark" | "light";
  mode: "login" | "signup";
  step: "confirmed" | "expired";
}) {
  return (
    <LoginStoryFrame theme={theme} accountsEnabled={false}>
      {mode === "login" ? (
        <LoginSurfaceV4 initialStep={step} previewSlot={PREVIEW_SLOT} />
      ) : (
        <SignupSurfaceV4 initialStep={step} />
      )}
    </LoginStoryFrame>
  );
}

export const CorreoConfirmadoOscuro = {
  render: () => <ConfirmationStory theme="dark" mode="login" step="confirmed" />,
};
export const CorreoConfirmadoClaro = {
  render: () => <ConfirmationStory theme="light" mode="login" step="confirmed" />,
};
export const EnlaceVencidoOscuro = {
  render: () => <ConfirmationStory theme="dark" mode="login" step="expired" />,
};
export const EnlaceVencidoClaro = {
  render: () => <ConfirmationStory theme="light" mode="login" step="expired" />,
};
export const RegistroConfirmadoOscuro = {
  render: () => <ConfirmationStory theme="dark" mode="signup" step="confirmed" />,
};
export const RegistroConfirmadoClaro = {
  render: () => <ConfirmationStory theme="light" mode="signup" step="confirmed" />,
};
export const RegistroVencidoOscuro = {
  render: () => <ConfirmationStory theme="dark" mode="signup" step="expired" />,
};
export const RegistroVencidoClaro = {
  render: () => <ConfirmationStory theme="light" mode="signup" step="expired" />,
};

function SignupStep2SuggestionsStory({ theme }: { theme: "dark" | "light" }) {
  return (
    <LoginStoryFrame theme={theme} accountsEnabled={false}>
      <SignupSurfaceV4
        initialStep="details"
        initialDisplayName="Ana López"
        initialEmail="ana.lopez@ejemplo.mx"
      />
    </LoginStoryFrame>
  );
}

export const RegistroPaso2SugerenciasOscuro = {
  render: () => <SignupStep2SuggestionsStory theme="dark" />,
};

export const RegistroPaso2SugerenciasClaro = {
  render: () => <SignupStep2SuggestionsStory theme="light" />,
};
