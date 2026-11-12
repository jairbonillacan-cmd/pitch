import React from "react";
import type { PublicMemberProfile } from "@pitchlab/contracts";
import { AnalystProfileClubView } from "./club/AnalystProfileClubView";
import { EditProfileDialog } from "./club/EditProfileDialog";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";

export default {
  title: "PitchLab v4 / Perfil de socio",
  parameters: { layout: "fullscreen" },
};

const member: PublicMemberProfile = {
  displayName: "Ana López",
  handle: "ana_analiza",
  bio: "Analizo Liga MX y fútbol inglés.",
  xUsername: "ana_analiza",
  joinedAt: "2026-10-10T12:00:00Z",
  isTipstar: false,
};

const dataset = buildPlatformDataset([]);

function EditorStory({ linked }: { linked: boolean }) {
  return (
    <EditProfileDialog
      profile={{ ...member, xUsername: linked ? member.xUsername : null }}
      xEnabled={linked}
      initialOpen
      checkHandle={false}
      onChange={() => undefined}
    />
  );
}

function PublicProfileStory() {
  return (
    <PlatformProvider dataset={dataset} initialRole="member">
      <AnalystProfileClubView handle={member.handle} memberProfile={member} />
    </PlatformProvider>
  );
}

export const EditarPerfilOscuro = { globals: { theme: "dark" }, render: () => <EditorStory linked={false} /> };
export const EditarPerfilClaro = { globals: { theme: "light" }, render: () => <EditorStory linked={false} /> };
export const CuentaConectadaOscuro = { globals: { theme: "dark" }, render: () => <EditorStory linked /> };
export const CuentaConectadaClaro = { globals: { theme: "light" }, render: () => <EditorStory linked /> };
export const PerfilPublicoOscuro = { globals: { theme: "dark" }, render: () => <PublicProfileStory /> };
export const PerfilPublicoClaro = { globals: { theme: "light" }, render: () => <PublicProfileStory /> };
