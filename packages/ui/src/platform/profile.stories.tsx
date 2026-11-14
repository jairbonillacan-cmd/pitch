import React from "react";
import type { Meta } from "@storybook/react-vite";
import type { PublicMemberProfile } from "@pitchlab/contracts";
import { AnalystProfileClubView } from "./club/AnalystProfileClubView";
import { EditProfileDialog } from "./club/EditProfileDialog";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";

const meta = {
  title: "PitchLab v4 / Perfil de socio",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

const SAMPLE_AVATAR_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="rgb(24,58,132)"/><circle cx="64" cy="48" r="22" fill="rgb(235,242,255)"/><path d="M26 116c6-22 22-34 38-34s32 12 38 34" fill="rgb(235,242,255)"/></svg>',
)}`;

const member: PublicMemberProfile = {
  displayName: "Ana López",
  handle: "ana_analiza",
  bio: "Analizo Liga MX y fútbol inglés.",
  avatarUrl: null,
  xUsername: "ana_analiza",
  joinedAt: "2026-10-10T12:00:00Z",
  isTipster: false,
};

const dataset = buildPlatformDataset([]);

function EditorStory({ linked, withAvatar = false }: { linked: boolean; withAvatar?: boolean }) {
  return (
    <EditProfileDialog
      profile={{
        ...member,
        avatarUrl: withAvatar ? SAMPLE_AVATAR_URI : null,
        xUsername: linked ? member.xUsername : null,
      }}
      avatarEnabled={withAvatar}
      xEnabled={linked}
      initialOpen
      checkHandle={false}
      onChange={() => undefined}
    />
  );
}

function PublicProfileStory({ withAvatar = false }: { withAvatar?: boolean }) {
  return (
    <PlatformProvider dataset={dataset} initialRole="member">
      <AnalystProfileClubView
        handle={member.handle}
        memberProfile={{ ...member, avatarUrl: withAvatar ? SAMPLE_AVATAR_URI : null }}
        avatarEnabled={withAvatar}
      />
    </PlatformProvider>
  );
}

export const EditarPerfilOscuro = { globals: { theme: "dark" }, render: () => <EditorStory linked={false} /> };
export const EditarPerfilClaro = { globals: { theme: "light" }, render: () => <EditorStory linked={false} /> };
export const EditarPerfilConFotoOscuro = { globals: { theme: "dark" }, render: () => <EditorStory linked={false} withAvatar /> };
export const EditarPerfilConFotoClaro = { globals: { theme: "light" }, render: () => <EditorStory linked={false} withAvatar /> };
export const CuentaConectadaOscuro = { globals: { theme: "dark" }, render: () => <EditorStory linked /> };
export const CuentaConectadaClaro = { globals: { theme: "light" }, render: () => <EditorStory linked /> };
export const PerfilPublicoOscuro = { globals: { theme: "dark" }, render: () => <PublicProfileStory /> };
export const PerfilPublicoClaro = { globals: { theme: "light" }, render: () => <PublicProfileStory /> };
export const PerfilPublicoConFotoOscuro = { globals: { theme: "dark" }, render: () => <PublicProfileStory withAvatar /> };
export const PerfilPublicoConFotoClaro = { globals: { theme: "light" }, render: () => <PublicProfileStory withAvatar /> };
